/**
 * AI-CODING NOTE:
 * Responsibility: Prove the casting-pattern export panel controls are wired to the pattern backend in a real browser.
 * Inputs: The built dist tree and a synthetic trace-derived loft state created in the page.
 * Outputs: Assertion failures or a scoped machine-readable summary.
 * Safe edits: Additional matched accept/reject cases for the pattern panel.
 * Do not: Assert only the accepting direction, or treat a backend call as proof that a control reaches it.
 * Verification: CHROME_PATH=... node test/pattern-panel-browser-smoke.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const toolRoot = resolve(new URL('..', import.meta.url).pathname);
const appRoot = join(toolRoot, 'dist');
const chrome = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
        .find(candidate => { try { return statSync(candidate).isFile(); } catch { return false; } });
assert.ok(chrome, 'Chromium/Chrome executable not found; set CHROME_PATH.');

const profile = await mkdtemp(join(tmpdir(), 'tonearm-pattern-panel-'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
    try {
        const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const candidate = normalize(join(appRoot, requested === '/' ? '/index.html' : requested));
        if (!candidate.startsWith(appRoot + sep) && candidate !== join(appRoot, 'index.html')) { response.writeHead(403).end(); return; }
        const body = await readFile(candidate);
        response.writeHead(200, { 'content-type': mime[extname(candidate)] || 'application/octet-stream', 'cache-control': 'no-store' });
        response.end(body);
    } catch (error) {
        if (!response.headersSent) response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(String(error.message));
    }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const port = server.address().port;
const debugPort = 9350 + Math.floor(Math.random() * 200);
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

async function pollJson(url, options) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try { const response = await fetch(url, options); if (response.ok) return response.json(); } catch { /* browser not ready */ }
        await new Promise(wait => setTimeout(wait, 100));
    }
    throw new Error(`Timed out waiting for ${url}\n${stderr}`);
}
function socket(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve: ok, reject } = pending.get(message.id);
            pending.delete(message.id);
            message.error ? reject(new Error(message.error.message)) : ok(message.result);
        }
    };
    const ready = new Promise((ok, reject) => { ws.onopen = ok; ws.onerror = reject; });
    return { call: async (method, params = {}) => { await ready; const requestId = ++id; return new Promise((ok, reject) => { pending.set(requestId, { resolve: ok, reject }); ws.send(JSON.stringify({ id: requestId, method, params })); }); } };
}

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

try {
    const version = await pollJson(`http://127.0.0.1:${debugPort}/json/version`);
    assert.ok(version.webSocketDebuggerUrl, 'browser did not expose a debugger URL');
    const target = await pollJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/index.html`)}`, { method: 'PUT' });
    const page = socket(target.webSocketDebuggerUrl);
    await page.call('Runtime.enable');
    await new Promise(wait => setTimeout(wait, 4000));

    const evaluated = await page.call('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
            const out = {};
            try {
                DesignSession.activate('pattern_panel_smoke');
                state.designLoaded = true;
                state.geometryMode = 'freeform';
                state.freeformLoftActive = FreeformLoftKernel.defaultState('straight_low_mass_lt_arm');

                out.controls = ['plugCrossSectionScalePercent', 'plugSplitPositionPercent', 'plugMouldPullAxis', 'plugMouldAuditBtn',
                    'patternSplitRegistration', 'patternSplitPinRadius', 'patternSplitPinDepth', 'patternSplitPinClearance']
                    .every(id => !!document.getElementById(id));

                // Accepting direction: the default pattern releases along Z.
                document.getElementById('plugMouldPullAxis').value = 'Z';
                document.getElementById('plugMouldAuditBtn').click();
                out.releaseVerdict = document.getElementById('plugMouldAuditResult').textContent;

                // Rejecting direction: a rotated overhanging section must be refused in the panel.
                const undercut = JSON.parse(JSON.stringify(state.freeformLoftActive));
                const middle = Math.floor(undercut.rings.length / 2);
                undercut.rings[middle] = Object.assign({}, undercut.rings[middle], { rotationDeg: 75, widthMm: 22, heightMm: 5 });
                state.freeformLoftActive = FreeformLoftKernel.sanitizeState(undercut);
                document.getElementById('plugMouldAuditBtn').click();
                out.undercutVerdict = document.getElementById('plugMouldAuditResult').textContent;
                state.freeformLoftActive = FreeformLoftKernel.defaultState('straight_low_mass_lt_arm');

                // The split position control must reach the exported halves, not just application state.
                const position = document.getElementById('plugSplitPositionPercent');
                position.value = '30';
                position.dispatchEvent(new Event('change', { bubbles: true }));
                out.splitState = state.plugSplitPositionPercent;
                state.exportType = 'split_pattern_length';
                const halves = getFreeformPatternSplitGeometries(getFreeformLoftExportGeometry());
                out.splitApplied = halves.error ? ('ERROR ' + halves.error) : halves.partA.userData.patternSplitPositionPercent;

                // The registration checkbox must reach the exported halves in both positions.
                document.getElementById('patternSplitRegistration').checked = true;
                document.getElementById('patternSplitRegistration').dispatchEvent(new Event('change', { bubbles: true }));
                const pinnedHalves = getFreeformPatternSplitGeometries(getFreeformLoftExportGeometry());
                out.pinnedRegistration = pinnedHalves.error ? ('ERROR ' + pinnedHalves.error) : pinnedHalves.partA.userData.patternSplitRegistration;
                document.getElementById('patternSplitRegistration').checked = false;
                document.getElementById('patternSplitRegistration').dispatchEvent(new Event('change', { bubbles: true }));
                const plainHalves = getFreeformPatternSplitGeometries(getFreeformLoftExportGeometry());
                out.plainRegistration = plainHalves.error ? ('ERROR ' + plainHalves.error) : plainHalves.partA.userData.patternSplitRegistration;

                // The allowance control must reach the exported mesh.
                state.exportType = 'solid';
                const scale = document.getElementById('plugCrossSectionScalePercent');
                scale.value = '2'; scale.dispatchEvent(new Event('change', { bubbles: true }));
                out.scaleApplied = getFreeformLoftExportGeometry().userData.plugCrossSectionScale;

                out.report = TonearmReportExporter.buildMarkdownReport().includes('Casting pattern and trace provenance');
            } catch (error) { out.threw = String(error && error.stack || error).slice(0, 400); }
            return JSON.stringify(out);
        })()`
    });

    const result = JSON.parse(evaluated.result.value ?? '{}');
    check(!result.threw, 'the pattern panel must not throw: ' + (result.threw || ''));
    check(result.controls === true, 'every casting-pattern control must exist in the export panel');
    check(/Releases from a two-part mould along Z/.test(result.releaseVerdict || ''), 'the panel must report release for a releasable pattern: ' + result.releaseVerdict);
    check(/Does NOT release/.test(result.undercutVerdict || ''), 'the panel must refuse an undercut pattern: ' + result.undercutVerdict);
    check(result.splitState === 30, 'the split position control must reach application state');
    check(result.splitApplied === 30, 'the split position must reach the exported halves, got ' + result.splitApplied);
    check(Math.abs(Number(result.scaleApplied) - 1.02) < 1e-9, 'the allowance control must reach the exported mesh, got ' + result.scaleApplied);
    check(/"radiusMm"/.test(String(result.pinnedRegistration)), 'the registration checkbox must produce a pin on the exported halves, got ' + result.pinnedRegistration);
    check(result.plainRegistration === 'none', 'unchecking registration must produce plain cut faces, got ' + result.plainRegistration);
    check(result.report === true, 'the technical report must carry the casting pattern provenance section');

    console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'pattern-panel-browser-smoke', assertions, chrome }, null, 2));
} finally {
    child.kill();
    server.close();
}
