/**
 * AI-CODING NOTE:
 * Responsibility: Chromium smoke driving the five user-visible Trace to Plug steps against the built runtime.
 * Inputs: The built dist tree and a production-exported .engrove-trace-project package.
 * Outputs: Assertion failures or a scoped pass line; no repository mutation.
 * Safe edits: Additional assertions on what an operator can see and do.
 * Do not: Assert deployment, drive internals a control cannot reach, or ignore page errors.
 * Verification: node test/workflow-browser-smoke.mjs
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
const donorTest = join(toolRoot, '..', 'tonearm-profile-designer', 'test');
const helpers = require(join(donorTest, 'trace-project-package-fixtures.cjs'));
const { packageModel } = require(join(donorTest, 'trace-project-package-model.cjs'));
require(join(helpers.REPOSITORY_ROOT, 'tools', 'manual-trace', 'trace-project-package-production.js'));
const production = globalThis.EngroveTraceProjectPackageProduction;

const chrome = process.env.CHROME_PATH
    || ['/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
        .find(path => { try { return statSync(path).isFile(); } catch { return false; } });
assert.ok(chrome, 'Chromium/Chrome executable not found; set CHROME_PATH.');

// The importer fetches the merged contract schemas published beside the built runtime, so the smoke must
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

const temporary = await mkdtemp(join(tmpdir(), 'trace-to-plug-smoke-'));
const profile = join(temporary, 'profile');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

// The hub publishes each tool under /tools/<slug>/app/. Mirroring that layout is what makes the importer's
// relative schema fetch representative of production.
const APP_ROUTE = '/tools/trace-to-plug/app/';

function resolveRequest(pathname) {
    if (!pathname.startsWith(APP_ROUTE)) return null;
    const candidate = normalize(join(distRoot, pathname.slice(APP_ROUTE.length)));
    return candidate.startsWith(distRoot + sep) ? candidate : null;
}

const server = createServer(async (request, response) => {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    // The site root belongs to the hub, not to this tool. The browser asks for a favicon unprompted, so it
    // is answered here rather than allowed to appear as a page error the tool is responsible for.
    if (requested === '/favicon.ico') { response.writeHead(204).end(); return; }
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
const debugPort = 9960 + Math.floor(Math.random() * 300);
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
    // Every decision is set the way an operator sets it, through the control's own input event, so a
    // control the workflow never bound fails this smoke instead of passing it.
    const setControl = async (id, value, kind) => {
        const assignment = kind === 'checkbox' ? `node.checked = ${JSON.stringify(value)}` : `node.value = ${JSON.stringify(String(value))}`;
        await evaluate(`(() => { const node = document.getElementById(${JSON.stringify(id)}); ${assignment}; node.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    };
    // Geometry rebuilds are coalesced to one animation frame so a dragged slider cannot queue a backlog.
    // Waiting on the revision counter is what keeps this smoke from racing that frame.
    const setControlAndRebuild = async (id, value, kind) => {
        const before = await evaluate('window.traceToPlug.geometryRevision');
        await setControl(id, value, kind);
        await waitFor(`window.traceToPlug.geometryRevision > ${before}`, `a rebuild after setting ${id}`);
    };
    const statusText = () => evaluate('document.getElementById("status").textContent');

    await waitFor('Boolean(window.traceToPlug && window.PatternState && window.TraceProjectPackageImport)', 'the tool runtime to initialize');

    // ---- step 1: an empty tool, and a refusal that does not build geometry ----------------------------
    check(await evaluate('window.traceToPlug.state.loft === null'), 'the tool must open with no pattern');
    check(await evaluate('window.traceToPlug.geometry === null'), 'the tool must open with no geometry');
    check(await evaluate('document.getElementById("doExport").disabled') === true, 'export must be unavailable before there is a pattern');
    check(await evaluate('document.getElementById("tab-export").disabled') === true, 'a later step must not be reachable from an empty tool');
    check(await evaluate('document.getElementById("readSource").textContent') === 'nothing imported', 'the source readout must say nothing is imported');

    const selectPackage = base64 => `(() => {
        const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), c => c.charCodeAt(0));
        const file = new File([bytes], 'smoke.engrove-trace-project', { type: 'application/zip' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.getElementById('packageFile');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change'));
        return true;
    })()`;

    await evaluate(selectPackage(invalidBase64));
    const refusal = await waitFor('(() => { const el = document.getElementById("status"); return el.className.includes("status-error") ? el.textContent : ""; })()', 'a refusal for the tampered package');
    check(refusal.includes('Package refused'), 'a tampered package must be refused by name');
    check(refusal.includes('PACKAGE_'), 'the refusal must carry a stable diagnostic code, got ' + refusal);
    check(await evaluate('window.traceToPlug.state.loft === null'), 'a refused package must not produce a pattern');
    check(await evaluate('window.traceToPlug.geometry === null'), 'a refused package must not produce geometry');

    // ---- steps 1 and 2: a valid package imports and interprets ---------------------------------------
    await evaluate(selectPackage(validBase64));
    await waitFor('window.traceToPlug.state.loft !== null', 'the imported package to interpret');
    check((await statusText()).includes('Imported 2 geometric views') || await evaluate('document.getElementById("readViews").textContent') === '2', 'both package views must be imported');
    check(await evaluate('document.getElementById("readProject").textContent') === 'project-roundtrip', 'the project id must be shown');
    check(await evaluate('document.getElementById("readTracedLength").textContent') === '200.00 mm', 'the traced length must be shown, got ' + await evaluate('document.getElementById("readTracedLength").textContent'));
    check(await evaluate('document.getElementById("readLoftedLength").textContent') === '200.00 mm', 'the lofted length must match the traced length');
    check(await evaluate('document.getElementById("readClosed").textContent') === 'closed', 'the interpreted pattern must be a closed mesh');
    check(Number(await evaluate('document.getElementById("readTriangles").textContent')) > 100, 'the interpreted pattern must have a real triangle count');
    check(await evaluate('document.getElementById("panel-interpret").hidden') === false, 'a successful import must advance to the interpret step');

    // Section fullness is the operator's assumption, and it must reach every ring.
    await setControlAndRebuild('sectionFullness', 4.5);
    await waitFor('window.traceToPlug.state.loft && window.traceToPlug.state.loft.rings.every(r => r.superellipseExponent === 4.5)', 'the fullness to reach every ring');
    check(await evaluate('document.getElementById("outSectionFullness").textContent') === '4.50', 'the fullness readout must follow the control');
    const fullerVolume = await evaluate('window.PatternMesh.metrics(window.traceToPlug.geometry.mesh).volumeMm3');
    await setControlAndRebuild('sectionFullness', 2);
    await waitFor('window.traceToPlug.state.loft.rings.every(r => r.superellipseExponent === 2)', 'the fullness to fall back');
    const ellipseVolume = await evaluate('window.PatternMesh.metrics(window.traceToPlug.geometry.mesh).volumeMm3');
    check(fullerVolume > ellipseVolume, `a fuller section must enclose more material: ${fullerVolume} vs ${ellipseVolume}`);

    // A dragged slider fires an input event per pointer move. Each one must record its decision, but the
    // rebuilds behind them must collapse into one frame, or the pointer outruns a queue of loft rebuilds.
    const drag = await evaluate(`(() => {
        const before = window.traceToPlug.geometryRevision;
        const node = document.getElementById('sectionFullness');
        for (let step = 0; step < 20; step++) {
            node.value = String(2.5 + step * 0.05);
            node.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return { before, after: window.traceToPlug.geometryRevision, decision: window.traceToPlug.state.decisions.sectionFullness };
    })()`);
    check(drag.after === drag.before, 'a burst of slider events must not rebuild the loft synchronously');
    check(Math.abs(drag.decision - 3.45) < 1e-9, 'every slider event must still record its decision, got ' + drag.decision);
    await waitFor(`window.traceToPlug.geometryRevision === ${drag.before + 1}`, 'exactly one coalesced rebuild after the drag');
    check(await evaluate(`window.traceToPlug.geometryRevision === ${drag.before + 1}`), '20 slider events must collapse into a single rebuild');
    check(await evaluate('window.traceToPlug.state.loft.rings.every(r => Math.abs(r.superellipseExponent - 3.45) < 1e-9)'), 'the coalesced rebuild must apply the last dragged value');
    await setControlAndRebuild('sectionFullness', 2);

    // ---- step 3: the allowance scales the section and leaves the length alone ------------------------
    await evaluate('document.querySelector(\'[data-goto="compensate"]\').click()');
    check(await evaluate('document.getElementById("panel-compensate").hidden') === false, 'the compensate step must open from its own button');
    const before = await evaluate('(() => { const m = window.PatternMesh.metrics(window.traceToPlug.geometry.mesh); return { v: m.volumeMm3, x: m.bbox.lengthX, y: m.bbox.lengthY, z: m.bbox.lengthZ }; })()');
    await setControlAndRebuild('allowancePercent', 4);
    await waitFor('window.traceToPlug.state.decisions.allowancePercent === 4', 'the allowance to be recorded');
    const after = await evaluate('(() => { const m = window.PatternMesh.metrics(window.traceToPlug.geometry.mesh); return { v: m.volumeMm3, x: m.bbox.lengthX, y: m.bbox.lengthY, z: m.bbox.lengthZ }; })()');
    check(Math.abs(after.x - before.x) < 1e-6, `the allowance must not change the traced length: ${before.x} became ${after.x}`);
    check(Math.abs(after.y / before.y - 1.04) < 1e-3, `the allowance must scale the width by 4 %: ${before.y} became ${after.y}`);
    check(Math.abs(after.z / before.z - 1.04) < 1e-3, `the allowance must scale the height by 4 %: ${before.z} became ${after.z}`);
    check(after.v > before.v, 'a positive allowance must add material');
    check(await evaluate('document.getElementById("outAllowance").textContent') === '4.00 %', 'the allowance readout must follow the control');
    check((await evaluate('document.getElementById("readMass").textContent')).endsWith('g solid'), 'the printed mass estimate must be shown');

    // ---- step 4: the release check, and a changed decision that invalidates it -----------------------
    await evaluate('document.querySelector(\'[data-goto="verify"]\').click()');
    await evaluate('document.getElementById("doRelease").click()');
    await waitFor('window.traceToPlug.state.release !== null', 'the release check to run');
    check(await evaluate('window.traceToPlug.state.release.twoPartMouldable') === true, 'a traced prism must release along Z');
    check((await evaluate('document.getElementById("readRelease").textContent')).includes('releases along Z'), 'the verdict must be shown to the operator');
    check(await evaluate('document.getElementById("readUndercuts").textContent') === '0', 'the undercut count must be shown');
    check(Number((await evaluate('document.getElementById("readParting").textContent')).split(' ')[0]) > 0, 'the parting line must report its stations');

    // A verdict describing a shape the operator has since changed reads as a fresh result, so it is dropped.
    await setControl('pullAxis', 'Y');
    check(await evaluate('window.traceToPlug.state.release === null'), 'changing the pull axis must drop the stale release verdict');
    check(await evaluate('document.getElementById("readRelease").textContent') === 'not checked', 'the dropped verdict must read as unchecked, not as a pass');
    // The parting line describes the same mesh as the verdict, so it has to go with it; otherwise it keeps
    // drawing itself over a shape it was never measured on.
    check(await evaluate('!window.traceToPlug.state.partingLine'), 'changing the pull axis must drop the stale parting line');
    check(await evaluate('document.getElementById("readParting").textContent') === '—', 'the dropped parting line must read as absent');
    await setControl('pullAxis', 'Z');
    await evaluate('document.getElementById("doRelease").click()');
    await waitFor('window.traceToPlug.state.release !== null', 'the release check to re-run');

    // ---- step 4: splitting for a short build volume ---------------------------------------------------
    check(await evaluate('document.getElementById("doSplit").disabled') === true, 'the cut action must be unavailable until the operator asks for a cut');
    await setControl('splitEnabled', true, 'checkbox');
    check(await evaluate('document.getElementById("doSplit").disabled') === false, 'enabling the cut must make the action available');
    await evaluate('document.getElementById("doSplit").click()');
    await waitFor('window.traceToPlug.halves !== null', 'the pattern to split');
    const halves = await evaluate(`(() => {
        const h = window.traceToPlug.halves;
        const a = window.PatternMesh.exportable(h.partA), b = window.PatternMesh.exportable(h.partB);
        return { aOk: a.ok, bOk: b.ok, aReasons: a.reasons, bReasons: b.reasons, pin: h.registration, atMm: h.atMm };
    })()`);
    check(halves.aOk === true, 'the boss half must pass the export gate: ' + halves.aReasons.join(' '));
    check(halves.bOk === true, 'the socket half must pass the export gate: ' + halves.bReasons.join(' '));
    check(halves.pin && halves.pin.radiusMm > 0, 'the keyed peg must be sized rather than left at zero');
    check(Math.abs(halves.atMm - 100) < 1, 'a 50 % cut on a 200 mm pattern must land near the middle, got ' + halves.atMm);
    check((await evaluate('document.getElementById("readHalves").textContent')).includes('two closed halves'), 'the split result must be shown');
    check((await evaluate('document.getElementById("readPin").textContent')).includes('mm radius'), 'the peg size must be shown');

    // Re-cutting elsewhere must not leave the previous halves on screen.
    await setControl('splitPositionPercent', 35);
    check(await evaluate('window.traceToPlug.halves === null'), 'moving the cut must drop the stale halves');
    check(await evaluate('document.getElementById("readHalves").textContent') === 'not split yet', 'the dropped halves must read as not split yet');
    await evaluate('document.getElementById("doSplit").click()');
    await waitFor('window.traceToPlug.halves !== null', 'the pattern to re-split');
    check(Math.abs(await evaluate('window.traceToPlug.halves.atMm') - 70) < 1, 'a 35 % cut must move the cut plane');

    // ---- step 5: export writes real STL bytes through the same gate ----------------------------------
    await evaluate('document.querySelector(\'[data-goto="export"]\').click()');
    check(await evaluate('document.getElementById("doExport").disabled') === false, 'export must be available once a pattern exists');
    const written = await evaluate(`(() => {
        const captured = [];
        const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = blob => { captured.push(blob); return 'blob:captured-' + captured.length; };
        HTMLAnchorElement.prototype.click = function() { captured[captured.length - 1].name = this.download; };
        document.getElementById('doExport').click();
        URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick;
        return Promise.all(captured.map(async blob => ({ name: blob.name, size: blob.size, type: blob.type })));
    })()`);
    check(written.length === 3, 'exporting a split pattern with the record sheet must write three files, got ' + JSON.stringify(written.map(f => f.name)));
    check(written.filter(file => file.name.endsWith('.stl')).length === 2, 'both halves must be written as STL');
    check(written.some(file => file.name.endsWith('_record.md')), 'the record sheet must be written beside the halves');
    check(written.every(file => file.size > 500), 'every written file must carry real content: ' + JSON.stringify(written));

    const recordText = await evaluate(`(() => {
        const record = window.PatternState.decisionRecord(window.traceToPlug.state);
        const metrics = window.PatternMesh.metrics(window.traceToPlug.geometry.mesh);
        return window.PatternRecord.renderMarkdown(record, metrics, { aiProposals: window.traceToPlug.aiProposals });
    })()`);
    check(recordText.includes('4.00 % on every section, length unchanged'), 'the record sheet must state the allowance the operator set');
    check(recordText.includes('releases along this axis'), 'the record sheet must carry the release verdict');
    check(recordText.includes('| Section fullness (superellipse exponent) | 2.00 | operator |'), 'the record sheet must attribute the fullness to the operator');
    check(!recordText.includes('undefined') && !recordText.includes('NaN'), 'the record sheet must not print undefined or NaN');

    // ---- the AI handoff refuses before it applies ------------------------------------------------------
    await evaluate('document.getElementById("openAI").click()');
    check(await evaluate('document.getElementById("aiModal").open') === true, 'the AI modal must open');
    const prompt = await evaluate('document.getElementById("aiPrompt").value');
    check(prompt.includes('engrove-trace-to-plug-ai-response-v1'), 'the prompt must state the response schema');
    check(prompt.includes('"tracedLengthMm": 200'), 'the prompt must carry the measured pattern, got a prompt without the traced length');
    check(prompt.includes('sectionFullness') && prompt.includes('allowancePercent'), 'the prompt must list the writable decisions');
    check(!prompt.includes('"vertices"') && !prompt.includes('"faces"'), 'the prompt must not carry the trace geometry itself');

    const paste = async payload => {
        await evaluate(`(() => { document.getElementById('aiResponse').value = ${JSON.stringify(payload)}; return true; })()`);
        await evaluate('document.getElementById("aiApply").click()');
    };

    await paste(JSON.stringify({ schema: 'engrove-trace-to-plug-ai-response-v1', decisions: { sectionFullness: 99 } }));
    check(await evaluate('document.getElementById("aiModal").open') === true, 'a refused response must leave the modal open');
    const diagnostics = await evaluate('document.getElementById("aiDiagnostics").textContent');
    check(diagnostics.includes('AI_FIELD_RANGE'), 'an out-of-range proposal must be refused by name, got ' + diagnostics);
    check(diagnostics.includes('Nothing was applied'), 'the operator must be told nothing was applied');
    check(await evaluate('window.traceToPlug.state.decisions.sectionFullness') === 2, 'a refused response must not change a decision');

    await paste(JSON.stringify({ schema: 'engrove-trace-to-plug-ai-response-v1', decisions: { centerline: [] } }));
    check((await evaluate('document.getElementById("aiDiagnostics").textContent')).includes('AI_FIELD_NOT_WRITABLE'), 'a proposal outside the contract must be refused by name');
    check(await evaluate('window.traceToPlug.aiProposals.length') === 0, 'a refused response must not be recorded as an accepted proposal');

    await paste(JSON.stringify({ schema: 'engrove-trace-to-plug-ai-response-v1', reasoning: 'a laid-up tube reads fuller', decisions: { sectionFullness: 3.4, allowancePercent: 1.5 } }));
    await waitFor('document.getElementById("aiModal").open === false', 'the modal to close on an accepted response');
    check(await evaluate('window.traceToPlug.state.decisions.sectionFullness') === 3.4, 'an accepted response must change the decision');
    check(await evaluate('document.getElementById("sectionFullness").value') === '3.4', 'an accepted response must move the control the operator sees');
    check(await evaluate('document.getElementById("outAllowance").textContent') === '1.50 %', 'an accepted response must move the allowance readout');
    await waitFor('window.traceToPlug.state.loft.rings.every(r => r.superellipseExponent === 3.4)', 'an accepted response to reach the geometry');
    check(await evaluate('window.traceToPlug.state.release === null'), 'an accepted response that changes the shape must drop the stale release verdict');
    check(await evaluate('!window.traceToPlug.state.partingLine'), 'an accepted response that changes the shape must drop the stale parting line');
    check(await evaluate('window.traceToPlug.halves === null'), 'an accepted response that changes the shape must drop the stale halves');
    check(await evaluate('window.traceToPlug.aiProposals.length') === 1, 'an accepted response must be recorded for the record sheet');
    check((await evaluate(`window.PatternRecord.renderMarkdown(window.PatternState.decisionRecord(window.traceToPlug.state), null, { aiProposals: window.traceToPlug.aiProposals })`))
        .includes('a laid-up tube reads fuller'), 'the accepted proposal must reach the record sheet');

    // ---- nothing broke along the way -------------------------------------------------------------------
    const pageErrors = page.events.filter(event => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
        .map(event => event.params.entry.text);
    check(pageErrors.length === 0, 'the workflow must run without page errors: ' + JSON.stringify(pageErrors));
    const exceptions = page.events.filter(event => event.method === 'Runtime.exceptionThrown')
        .map(event => event.params.exceptionDetails.text);
    check(exceptions.length === 0, 'the workflow must run without uncaught exceptions: ' + JSON.stringify(exceptions));

    page.close();
    browser.close();
    console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'workflow-browser-smoke', assertions, scope: 'headless Chromium against the built dist tree; not a deployment check' }, null, 2));
} finally {
    // Chromium writes its profile down asynchronously, so the directory is still busy the instant the
    // process is signalled. Wait for the exit, then retry the removal rather than racing it.
    const exited = new Promise(resolveExit => { if (child.exitCode !== null) resolveExit(); else child.once('exit', resolveExit); });
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(wait => setTimeout(wait, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await new Promise(done => server.close(done));
    for (let attempt = 0; attempt < 3; attempt++) {
        try { await rm(temporary, { recursive: true, force: true }); break; } catch (error) { if (attempt === 2) throw error; await new Promise(wait => setTimeout(wait, 100)); }
    }
}
