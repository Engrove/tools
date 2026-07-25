/**
 * AI-CODING NOTE:
 * Responsibility: Chromium smoke for the user-visible `.engrove-trace-project` import flow in Tonearm Profile Designer.
 * Inputs: The built dist tree, a production-exported package, and a tampered copy of the same bytes.
 * Outputs: Assertion failures or a scoped pass line; no repository mutation.
 * Safe edits: Additional user-visible assertions on status, active design, and mesh results.
 * Do not: Assert deployment, skip the invalid-package probe, or ignore page errors and CSP violations.
 * Verification: node test/trace-project-package-browser-smoke.mjs
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const toolRoot = resolve(new URL('..', import.meta.url).pathname);
const distRoot = join(toolRoot, 'dist');
const helpers = require('./trace-project-package-fixtures.cjs');
require(join(helpers.REPOSITORY_ROOT, 'tools', 'manual-trace', 'trace-project-package-production.js'));
const production = globalThis.EngroveTraceProjectPackageProduction;
const { packageModel } = require('./trace-project-package-model.cjs');

const chrome = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
        .find(path => { try { return statSync(path).isFile(); } catch { return false; } });
assert.ok(chrome, 'Chromium/Chrome executable not found; set CHROME_PATH.');

// The importer loads the merged contract schemas published beside the built runtime, so the smoke must
// exercise the built tree rather than the source directory.
if (!existsSync(join(distRoot, 'schema', 'trace-project-package', 'manifest.schema.json'))) {
    const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: toolRoot, encoding: 'utf8' });
    assert.equal(build.status, 0, `tool build failed before the smoke: ${build.stderr}`);
}

const built = await production.buildValidatedZipPackage(packageModel(), { schemas: helpers.schemas });
const validBase64 = Buffer.from(built.zipBytes).toString('base64');
const tampered = Uint8Array.from(built.zipBytes);
const marker = Buffer.from(tampered).indexOf(Buffer.from('"packageVersion": "1.0.0"', 'utf8'));
assert.ok(marker > 0, 'the manifest version must be locatable for the invalid-package probe');
tampered[marker + 20] = '9'.charCodeAt(0);
const invalidBase64 = Buffer.from(tampered).toString('base64');

const temporary = await mkdtemp(join(tmpdir(), 'tonearm-package-smoke-'));
const profile = join(temporary, 'profile');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// The hub publishes each tool under /tools/<slug>/app/ and owns the shared /styles.css at the site
// root. Mirroring that layout is what makes the importer's relative schema fetch representative.
const APP_ROUTE = '/tools/tonearm-profile-designer/app/';
const HUB_STYLESHEET = join(helpers.REPOSITORY_ROOT, 'src', 'styles.css');

function resolveRequest(pathname) {
    if (pathname === '/styles.css') return HUB_STYLESHEET;
    if (!pathname.startsWith(APP_ROUTE)) return null;
    const candidate = normalize(join(distRoot, pathname.slice(APP_ROUTE.length)));
    return candidate.startsWith(distRoot + sep) ? candidate : null;
}

const server = createServer(async (request, response) => {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = resolveRequest(requested);
    if (!candidate) { response.writeHead(404).end(); return; }
    try {
        const data = await readFile(candidate);
        response.writeHead(200, { 'content-type': mime[extname(candidate)] || 'application/octet-stream', 'cache-control': 'no-store' });
        response.end(data);
    } catch (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(String(error.message));
    }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const port = server.address().port;
const debugPort = 9640 + Math.floor(Math.random() * 300);
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

async function pollJson(url, options) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try { const response = await fetch(url, options); if (response.ok) return response.json(); } catch {}
        await new Promise(wait => setTimeout(wait, 100));
    }
    throw new Error(`Timed out waiting for ${url}\n${stderr}`);
}
function socket(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const handlers = pending.get(message.id);
            pending.delete(message.id);
            message.error ? handlers.reject(new Error(message.error.message)) : handlers.resolve(message.result);
        } else if (message.method) events.push(message);
    };
    const ready = new Promise((ok, reject) => { ws.onopen = ok; ws.onerror = reject; });
    return {
        ready,
        events,
        call: async (method, params = {}) => {
            await ready;
            const requestId = ++id;
            return new Promise((ok, reject) => { pending.set(requestId, { resolve: ok, reject }); ws.send(JSON.stringify({ id: requestId, method, params })); });
        },
        close: () => ws.close()
    };
}

let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions++; }

try {
    const version = await pollJson(`http://127.0.0.1:${debugPort}/json/version`);
    const browser = socket(version.webSocketDebuggerUrl);
    await browser.ready;
    const target = await pollJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}${APP_ROUTE}index.html`)}`, { method: 'PUT' });
    const page = socket(target.webSocketDebuggerUrl);
    await page.call('Runtime.enable');
    await page.call('Log.enable');
    await page.call('Page.enable');

    const evaluate = async expression => {
        const result = await page.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(`page evaluation failed: ${result.exceptionDetails.text} ${JSON.stringify(result.exceptionDetails.exception || {})}`);
        return result.result.value;
    };
    const waitFor = async (expression, label) => {
        const deadline = Date.now() + 20000;
        let last;
        while (Date.now() < deadline) {
            last = await evaluate(expression);
            if (last) return last;
            await new Promise(wait => setTimeout(wait, 100));
        }
        throw new Error(`Timed out waiting for ${label}; last value ${JSON.stringify(last)}\n${stderr}`);
    };

    await waitFor('Boolean(window.DesignSession && window.TraceProjectPackageImport && document.getElementById("manualTraceFiles"))', 'the tool runtime to initialize');
    check(await evaluate('document.getElementById("designSessionState").getAttribute("data-state")') === 'empty', 'the tool must open with no active design');
    check((await evaluate('document.getElementById("manualTraceFiles").getAttribute("accept")')).includes('.engrove-trace-project'), 'the file picker must accept the package extension');

    // The operator action is a real file selection followed by the change event the page listens for.
    const selectPackage = base64 => `(() => {
        const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), c => c.charCodeAt(0));
        const file = new File([bytes], 'smoke.engrove-trace-project', { type: 'application/zip' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.getElementById('manualTraceFiles');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change'));
        return true;
    })()`;

    await evaluate(selectPackage(validBase64));
    const status = await waitFor('(() => { const el = document.getElementById("manualTraceImportStatus"); return el && el.className.includes("success") ? el.textContent : ""; })()', 'a successful package import status');
    check(status.includes('project project-roundtrip'), 'the status must name the imported project');
    check(/sha256 [a-f0-9]{12}/.test(status), 'the status must show the package identity digest');
    check(status.includes('top') && status.includes('side'), 'the status must list the imported views');
    check(await evaluate('document.getElementById("manualTraceImportList").children.length') === 2, 'both package views must be listed');
    check(await evaluate('Array.from(document.querySelectorAll("#manualTraceImportList select")).every(el => el.disabled)') === true, 'a contract-declared view must not be operator-overridable');
    check(await evaluate('document.getElementById("manualTraceBuildBtn").disabled') === false, 'the build action must become available');
    check(await evaluate('document.getElementById("designSessionState").getAttribute("data-state")') === 'empty', 'validating a package must not activate a design on its own');

    await evaluate('document.getElementById("manualTraceBuildBtn").click()');
    await waitFor('document.getElementById("designSessionState").getAttribute("data-state") === "active"', 'the accepted-active design');
    const accepted = await evaluate(`(() => {
        const s = window.state;
        return {
            source: s.designSource,
            mode: s.geometryMode,
            rings: s.freeformLoftActive ? s.freeformLoftActive.rings.length : 0,
            revision: s.freeformLoftActive ? s.freeformLoftActive.revision : null,
            width: s.freeformLoftActive ? s.freeformLoftActive.rings[0].widthMm : null,
            height: s.freeformLoftActive ? s.freeformLoftActive.rings[0].heightMm : null,
            packageProvenance: Array.isArray(s.traceProjectPackageImport) ? s.traceProjectPackageImport.length : 0,
            packageSha: Array.isArray(s.traceProjectPackageImport) && s.traceProjectPackageImport[0] ? s.traceProjectPackageImport[0].packageSha256 : null
        };
    })()`);
    check(accepted.source === 'engrove_trace_project_package', 'the active design must record the package as its source');
    check(accepted.mode === 'freeform', 'the accepted package must activate the Freeform geometry mode');
    check(accepted.rings >= 4, 'the accepted loft must carry at least four rings');
    check(accepted.width === 20 && accepted.height === 10, 'the accepted loft must carry the calibrated section dimensions');
    check(accepted.packageProvenance === 1, 'package provenance must be stored in the session state');
    check(/^[a-f0-9]{64}$/.test(accepted.packageSha), 'stored provenance must carry the package identity');

    const mesh = await evaluate(`(() => {
        const geometry = window.FreeformLoftKernel.buildFreeformGeometry(window.state.freeformLoftActive, { stationCount: 12, segmentCount: 24 });
        return { vertices: geometry.mesh.vertices.length, faces: geometry.mesh.faces.length, length: geometry.bbox.length };
    })()`);
    check(mesh.vertices > 100 && mesh.faces > 100, 'the accepted package must render a real mesh');
    check(mesh.length === 200, 'the mesh must span the calibrated object length');

    // ---- an invalid package must report a stable code and leave the active design untouched ----
    await evaluate('document.getElementById("manualTraceClearBtn").click()');
    await evaluate(selectPackage(invalidBase64));
    const failure = await waitFor('(() => { const el = document.getElementById("manualTraceImportStatus"); return el && el.className.includes("error") ? el.textContent : ""; })()', 'a rejected package status');
    check(/PACKAGE_[A-Z_]+/.test(failure), 'the rejection must surface a stable PACKAGE_ diagnostic code');
    check(failure.includes('smoke.engrove-trace-project'), 'the rejection must name the rejected file');
    const afterFailure = await evaluate(`(() => {
        const s = window.state;
        return {
            state: document.getElementById('designSessionState').getAttribute('data-state'),
            revision: s.freeformLoftActive ? s.freeformLoftActive.revision : null,
            rings: s.freeformLoftActive ? s.freeformLoftActive.rings.length : 0,
            listed: document.getElementById('manualTraceImportList').children.length,
            buildDisabled: document.getElementById('manualTraceBuildBtn').disabled
        };
    })()`);
    check(afterFailure.state === 'active', 'a rejected package must not clear the previously accepted design');
    check(afterFailure.revision === accepted.revision, 'a rejected package must not change the accepted revision');
    check(afterFailure.rings === accepted.rings, 'a rejected package must not change the accepted geometry');
    check(afterFailure.listed === 0, 'a rejected package must contribute no import rows');
    check(afterFailure.buildDisabled === true, 'a rejected package must leave the build action unavailable');

    // ---- no page errors or CSP violations from the import flow ----
    const consoleErrors = page.events
        .filter(event => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
        .filter(event => !/\/favicon\.ico$/.test(event.params.entry.url || ''))
        .map(event => `${event.params.entry.text} (${event.params.entry.url || 'no url'})`);
    const exceptions = page.events
        .filter(event => event.method === 'Runtime.exceptionThrown')
        .map(event => event.params.exceptionDetails.text);
    const violations = consoleErrors.filter(text => /content security policy|csp/i.test(text));
    check(violations.length === 0, `no CSP violation may be reported: ${violations.join(' | ')}`);
    check(exceptions.length === 0, `no uncaught page exception may occur: ${exceptions.join(' | ')}`);
    check(consoleErrors.length === 0, `no console error may occur: ${consoleErrors.join(' | ')}`);

    console.log(JSON.stringify({
        status: 'PASS_WITH_SCOPE',
        test: 'trace-project-package-browser-smoke',
        assertions,
        chrome,
        vertices: mesh.vertices,
        faces: mesh.faces
    }, null, 2));
    page.close();
    browser.close();
} finally {
    const exited = new Promise(resolveExit => { if (child.exitCode !== null) resolveExit(); else child.once('exit', resolveExit); });
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(wait => setTimeout(wait, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await new Promise(close => server.close(close));
    for (let attempt = 0; attempt < 3; attempt++) {
        try { await rm(temporary, { recursive: true, force: true }); break; } catch (error) { if (attempt === 2) throw error; await new Promise(wait => setTimeout(wait, 100)); }
    }
}
