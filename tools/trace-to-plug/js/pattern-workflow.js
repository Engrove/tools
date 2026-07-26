// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Drive the five Trace to Plug steps, binding every operator decision to the pattern the exporter writes.
 * Inputs: DOM controls, the imported package, the geometry kernel, and validated AI proposals.
 * Outputs: Rendered state, downloads, and the decision record; all geometry comes from PatternState.
 * Safe edits: Additional controls that record a decision and invalidate what they change.
 * Do not: Show or export a result derived from decisions the operator has since changed.
 * Verification: test/workflow-browser-smoke.mjs
 */
(function(root) {
    'use strict';

    const PACKAGE_EXTENSION = '.engrove-trace-project';
    const STEPS = Object.freeze(['import', 'interpret', 'compensate', 'verify', 'export']);

    function byId(id) {
        return root.document.getElementById(id);
    }

    function text(id, value) {
        const node = byId(id);
        if (node) node.textContent = value;
    }

    function mm(value, digits) {
        return Number.isFinite(Number(value)) ? Number(value).toFixed(digits === undefined ? 2 : digits) : '—';
    }

    function start() {
        const state = root.PatternState.createState();
        const kernel = root.FreeformLoftKernel;
        const adapter = root.ManualTrace3DAdapter;
        const mould = root.FreeformPlugMouldAudit;
        const splitter = root.FreeformPatternSplit;
        const meshTools = root.PatternMesh;

        let viewer = null;
        let geometry = null;      // the pattern mesh currently shown, allowance included
        let halves = null;        // the split result, or null when the pattern is exported whole
        let reachedStep = 'import';
        let geometryRevision = 0; // increments on every successful rebuild, so a caller can await one
        const aiProposals = [];

        // ---- status -------------------------------------------------------------------------------

        function setStatus(kind, message) {
            const node = byId('status');
            if (!node) return;
            node.className = 'status status-' + kind;
            node.textContent = message;
        }

        /**
         * The single place that drops what a changed shape invalidates. The verdict, the parting line and
         * the halves all describe one particular mesh, so they are cleared together: a parting line left
         * over from a shape the operator has since changed still draws itself over the new one.
         */
        function dropVerification() {
            state.release = null;
            state.partingLine = null;
            halves = null;
        }

        /**
         * Everything downstream of a changed decision is dropped rather than left on screen. A release
         * verdict or a split that describes a shape the operator has since changed is worse than none:
         * it reads as a fresh result.
         */
        function invalidateFrom(step) {
            const index = STEPS.indexOf(step);
            if (index <= STEPS.indexOf('interpret')) state.loft = null;
            if (index <= STEPS.indexOf('compensate')) geometry = null;
            if (index <= STEPS.indexOf('verify')) dropVerification();
            if (STEPS.indexOf(reachedStep) >= index) reachedStep = STEPS[Math.max(0, index - 1)];
            renderAll();
        }

        // ---- step 1: import -----------------------------------------------------------------------

        async function importPackage(file) {
            if (!file) return;
            const lower = String(file.name || '').toLowerCase();
            if (!lower.endsWith(PACKAGE_EXTENSION)) {
                setStatus('error', 'Choose a ' + PACKAGE_EXTENSION + ' package. Loose trace files do not carry the view bindings this tool needs.');
                return;
            }
            const limit = root.TraceProjectPackageReader ? root.TraceProjectPackageReader.DEFAULT_LIMITS.maxArchiveBytes : 0;
            if (!limit || file.size > limit) {
                setStatus('error', file.name + ' is ' + file.size + ' bytes; the package limit is ' + limit + '.');
                return;
            }
            setStatus('busy', 'Reading ' + file.name + '…');
            try {
                const result = await root.TraceProjectPackageImport.importPackageBytes(new Uint8Array(await file.arrayBuffer()), { fileName: file.name });
                if (!result.ok) {
                    setStatus('error', 'Package refused: ' + result.diagnostics.map(item => item.code + (item.path ? ' @ ' + item.path : '')).join(' | '));
                    return;
                }
                state.source = { fileName: file.name, projectId: result.projectId, traceIds: result.traceIds, packageSha256: result.packageSha256 };
                state.views = result.normalizedDescriptor.views;
                state.warnings = result.warnings || [];
                invalidateFrom('interpret');
                reachedStep = 'import';
                setStatus('ok', 'Imported ' + state.views.length + ' geometric views from ' + file.name + '.');
                goTo('interpret');
                interpret();
            } catch (error) {
                setStatus('error', 'Package could not be read: ' + (error && error.message ? error.message : String(error)));
            }
        }

        // ---- step 2: interpret --------------------------------------------------------------------

        function interpret() {
            const result = root.PatternState.interpret(state, kernel, adapter);
            if (!result.ok) {
                geometry = null;
                setStatus('error', 'The views could not be interpreted: ' + result.error);
                renderAll();
                return false;
            }
            reachedStep = 'interpret';
            rebuildGeometry();
            return true;
        }

        // ---- steps 3 and 4: the pattern the exporter will write ------------------------------------

        function rebuildGeometry() {
            if (!state.loft) { geometry = null; renderAll(); return false; }
            const built = root.PatternState.patternGeometry(state, kernel);
            if (!built.ok) {
                geometry = null;
                setStatus('error', 'The pattern could not be built: ' + built.error);
                renderAll();
                return false;
            }
            geometry = built.geometry;
            dropVerification();
            geometryRevision++;
            if (STEPS.indexOf(reachedStep) < STEPS.indexOf('compensate')) reachedStep = 'compensate';
            renderAll();
            return true;
        }

        /**
         * A dragged slider fires an input event per pointer move, and one loft rebuild costs far more than
         * a frame. Stale results are dropped immediately so nothing on screen outlives the decision that
         * produced it, but the rebuild itself is coalesced to at most one per frame. Without this the
         * pointer outruns a queue of rebuilds and the control feels detached from the model.
         */
        let pendingRebuild = 0;
        let pendingReinterpret = false;
        function scheduleRebuild(reinterpret) {
            dropVerification();
            pendingReinterpret = pendingReinterpret || !!reinterpret;
            renderReadouts();
            if (pendingRebuild) return;
            pendingRebuild = root.requestAnimationFrame(() => {
                pendingRebuild = 0;
                const full = pendingReinterpret;
                pendingReinterpret = false;
                if (full) interpret();
                else rebuildGeometry();
            });
        }

        function runReleaseCheck() {
            if (!geometry) return;
            const axis = state.decisions.pullAxis;
            setStatus('busy', 'Checking release along ' + axis + '…');
            state.release = mould.auditDemouldability(geometry.mesh, { pullAxis: axis });
            state.partingLine = mould.partingLine(geometry.mesh, { pullAxis: axis, stations: 32 });
            reachedStep = state.release.twoPartMouldable ? 'verify' : 'compensate';
            setStatus(state.release.twoPartMouldable ? 'ok' : 'warn', state.release.twoPartMouldable
                ? 'The pattern releases from a two-part mould split across ' + axis + '.'
                : 'The pattern locks the mould along ' + axis + ': ' + state.release.undercutRayCount + ' sampled rays pass behind material.');
            renderAll();
        }

        function applySplit() {
            halves = null;
            if (!geometry || !state.decisions.splitEnabled) { renderAll(); return; }
            const box = geometry.bbox;
            const at = box.minX + box.length * (state.decisions.splitPositionPercent / 100);
            const result = splitter.splitPattern(geometry.mesh, {
                axis: 'X',
                at,
                clearanceMm: state.decisions.splitClearanceMm,
                registration: state.decisions.registrationEnabled
                    ? { radiusMm: state.decisions.pinRadiusMm || undefined, depthMm: state.decisions.pinDepthMm, clearanceMm: state.decisions.pinClearanceMm }
                    : null
            });
            if (!result.ok) {
                setStatus('error', 'The pattern could not be split: ' + result.error);
                renderAll();
                return;
            }
            halves = result;
            setStatus('ok', 'Split at ' + mm(at) + ' mm into two closed halves'
                + (state.decisions.registrationEnabled && result.registration ? ' with a ' + mm(result.registration.radiusMm) + ' mm keyed boss.' : '.'));
            renderAll();
        }

        // ---- step 5: export ------------------------------------------------------------------------

        function download(blob, filename) {
            const url = root.URL.createObjectURL(blob);
            const link = root.document.createElement('a');
            link.href = url;
            link.download = filename;
            root.document.body.appendChild(link);
            link.click();
            link.remove();
            root.setTimeout(() => root.URL.revokeObjectURL(url), 0);
        }

        function baseName() {
            const source = (state.source && state.source.fileName) || 'pattern';
            return source.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_') || 'pattern';
        }

        function writeMesh(mesh, filename, format) {
            const gate = meshTools.exportable(mesh);
            if (!gate.ok) {
                setStatus('error', 'Refused to write ' + filename + ': ' + gate.reasons.join(' '));
                return null;
            }
            if (format === 'stl_ascii') download(new Blob([meshTools.asciiSTL(mesh, { solidName: baseName() })], { type: 'model/stl' }), filename);
            else download(new Blob([meshTools.binarySTL(mesh, { header: 'Engrove Trace to Plug ' + baseName() })], { type: 'model/stl' }), filename);
            return gate.metrics;
        }

        function exportPattern() {
            if (!geometry) return;
            const format = byId('exportFormat').value;
            const suffix = format === 'stl_ascii' ? '.asc.stl' : '.stl';
            let written = null;
            if (halves) {
                const a = writeMesh(halves.partA, baseName() + '_half_a' + suffix, format);
                const b = a ? writeMesh(halves.partB, baseName() + '_half_b' + suffix, format) : null;
                if (!a || !b) return;
                written = a;
                setStatus('ok', 'Wrote both halves. Print them, key them together, then take the mould off the joined pattern.');
            } else {
                written = writeMesh(geometry.mesh, baseName() + '_pattern' + suffix, format);
                if (!written) return;
                setStatus('ok', 'Wrote the pattern.');
            }
            if (byId('exportRecord').checked) {
                const record = root.PatternState.decisionRecord(state);
                const markdown = root.PatternRecord.renderMarkdown(record, written, { aiProposals });
                download(new Blob([markdown], { type: 'text/markdown' }), baseName() + '_pattern_record.md');
            }
        }

        // ---- AI handoff ------------------------------------------------------------------------------

        function openAI() {
            const record = root.PatternState.decisionRecord(state);
            byId('aiPrompt').value = root.PatternAI.buildPrompt(record, byId('aiNotes').value);
            byId('aiDiagnostics').replaceChildren();
            byId('aiModal').showModal();
        }

        function applyAIResponse() {
            const result = root.PatternAI.validateResponse(byId('aiResponse').value);
            const host = byId('aiDiagnostics');
            host.replaceChildren();
            if (!result.ok) {
                // Named refusals, not a single "invalid response": an operator has to be able to see which
                // field the AI overstepped, and that nothing at all was applied.
                const heading = root.document.createElement('p');
                heading.className = 'ai-refused';
                heading.textContent = 'Nothing was applied. The response failed the contract:';
                const list = root.document.createElement('ul');
                result.diagnostics.forEach(item => {
                    const entry = root.document.createElement('li');
                    entry.textContent = item.code + (item.at ? ' (' + item.at + ')' : '') + ': ' + item.message;
                    list.appendChild(entry);
                });
                host.append(heading, list);
                return;
            }
            Object.keys(result.patch).forEach(field => { state.decisions[field] = result.patch[field]; });
            aiProposals.push({ changedFields: result.changedFields, reasoning: result.reasoning, assumptions: result.assumptions });
            syncControlsFromState();
            byId('aiModal').close();
            if (result.changedFields.length === 0) {
                setStatus('ok', 'The response proposed no change.');
                return;
            }
            const geometryFields = ['sectionFullness', 'allowancePercent'];
            if (result.changedFields.some(field => geometryFields.indexOf(field) >= 0)) {
                if (result.changedFields.indexOf('sectionFullness') >= 0) interpret();
                else rebuildGeometry();
            } else {
                invalidateFrom('verify');
            }
            setStatus('ok', 'Applied ' + result.changedFields.join(', ') + ' from the AI response.');
        }

        // ---- rendering --------------------------------------------------------------------------------

        function goTo(step) {
            if (STEPS.indexOf(step) > STEPS.indexOf(reachedStep) + 1) return;
            state.step = step;
            renderAll();
        }

        function renderSteps() {
            STEPS.forEach(step => {
                const panel = byId('panel-' + step);
                const tab = byId('tab-' + step);
                if (panel) panel.hidden = step !== state.step;
                if (!tab) return;
                tab.classList.toggle('is-active', step === state.step);
                tab.classList.toggle('is-done', STEPS.indexOf(step) <= STEPS.indexOf(reachedStep) && step !== state.step);
                tab.disabled = STEPS.indexOf(step) > STEPS.indexOf(reachedStep) + 1;
            });
        }

        function renderReadouts() {
            const provenance = (state.loft && state.loft.sourceProvenance) || {};
            const traced = provenance.commonLongitudinalSourceRangeMm || {};
            const lofted = provenance.loftedLongitudinalRangeMm || {};
            text('readSource', state.source ? state.source.fileName : 'nothing imported');
            text('readProject', state.source ? state.source.projectId : '—');
            text('readViews', state.views ? String(state.views.length) : '0');
            text('readTracedLength', mm(traced.translatedLength) + ' mm');
            text('readLoftedLength', mm(lofted.loftedLength) + ' mm');
            text('readRings', state.loft ? String(state.loft.rings.length) : '—');
            text('readInsets', String(Array.isArray(provenance.endStationInsets) ? provenance.endStationInsets.length : 0));

            const metrics = geometry ? meshTools.metrics(geometry.mesh) : null;
            text('readTriangles', metrics ? String(metrics.triangleCount) : '—');
            text('readClosed', metrics ? (metrics.closed ? 'closed' : 'OPEN') : '—');
            text('readVolume', metrics && metrics.volumeIsMeaningful ? mm(metrics.volumeMm3, 1) + ' mm³' : '—');
            text('readBbox', metrics && metrics.bbox
                ? mm(metrics.bbox.lengthX) + ' × ' + mm(metrics.bbox.lengthY) + ' × ' + mm(metrics.bbox.lengthZ) + ' mm'
                : '—');
            const density = Number(byId('printDensity') ? byId('printDensity').value : 1.24);
            const mass = geometry ? meshTools.estimatedMassGrams(geometry.mesh, density) : null;
            text('readMass', mass === null ? '—' : mass.toFixed(1) + ' g solid');

            const release = state.release;
            text('readRelease', release ? (release.twoPartMouldable ? 'releases along ' + release.pullAxis : 'locked along ' + release.pullAxis) : 'not checked');
            text('readUndercuts', release ? String(release.undercutRayCount) : '—');
            text('readDraft', release ? (release.lowDraftAreaFraction * 100).toFixed(2) + ' %' : '—');
            text('readParting', state.partingLine ? state.partingLine.length + ' stations' : '—');
            text('readHalves', halves ? 'two closed halves' : (state.decisions.splitEnabled ? 'not split yet' : 'exported whole'));
            text('readPin', halves && halves.registration ? mm(halves.registration.radiusMm) + ' mm radius, ' + mm(halves.registration.depthMm) + ' mm deep' : '—');

            const exportButton = byId('doExport');
            if (exportButton) exportButton.disabled = !geometry;
            const releaseButton = byId('doRelease');
            if (releaseButton) releaseButton.disabled = !geometry;
            const splitButton = byId('doSplit');
            if (splitButton) splitButton.disabled = !geometry || !state.decisions.splitEnabled;
        }

        function renderViewer() {
            if (!viewer) return;
            if (!geometry) { viewer.show(null); return; }
            const shown = halves ? { vertices: halves.partA.vertices.concat(halves.partB.vertices), faces: [] } : geometry.mesh;
            if (halves) {
                // Both halves are drawn in one pass so the operator sees the cut, the boss and the socket
                // in the same frame as the pattern they came from.
                const offset = halves.partA.vertices.length;
                shown.faces = halves.partA.faces.concat(halves.partB.faces.map(face => [face[0] + offset, face[1] + offset, face[2] + offset]));
            }
            viewer.show(shown, {
                partingLine: state.partingLine,
                pullAxis: state.decisions.pullAxis,
                undercutSamples: state.release ? state.release.undercutSamples : null
            });
        }

        function renderAll() {
            renderSteps();
            renderReadouts();
            renderViewer();
        }

        // ---- controls ------------------------------------------------------------------------------

        function syncControlsFromState() {
            const decisions = root.PatternState.sanitizeDecisions(state.decisions);
            state.decisions = decisions;
            const set = (id, value) => { const node = byId(id); if (node) { if (node.type === 'checkbox') node.checked = !!value; else node.value = String(value); } };
            set('stationCount', decisions.stationCount);
            set('sectionFullness', decisions.sectionFullness);
            set('allowancePercent', decisions.allowancePercent);
            set('pullAxis', decisions.pullAxis);
            set('splitEnabled', decisions.splitEnabled);
            set('splitPositionPercent', decisions.splitPositionPercent);
            set('splitClearanceMm', decisions.splitClearanceMm);
            set('registrationEnabled', decisions.registrationEnabled);
            set('pinRadiusMm', decisions.pinRadiusMm);
            set('pinDepthMm', decisions.pinDepthMm);
            set('pinClearanceMm', decisions.pinClearanceMm);
            text('outSectionFullness', decisions.sectionFullness.toFixed(2));
            text('outAllowance', decisions.allowancePercent.toFixed(2) + ' %');
            text('outStationCount', String(decisions.stationCount));
            text('outSplitPosition', decisions.splitPositionPercent.toFixed(0) + ' %');
        }

        function bindDecision(id, field, kind, onChange) {
            const node = byId(id);
            if (!node) return;
            node.addEventListener('input', () => {
                state.decisions[field] = kind === 'boolean' ? node.checked : (kind === 'number' ? Number(node.value) : node.value);
                syncControlsFromState();
                onChange();
            });
        }

        function bind() {
            byId('packageFile').addEventListener('change', event => {
                importPackage(event.target.files && event.target.files[0]);
                event.target.value = '';
            });
            const drop = byId('dropZone');
            ['dragover', 'dragenter'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('is-hot'); }));
            ['dragleave', 'drop'].forEach(name => drop.addEventListener(name, () => drop.classList.remove('is-hot')));
            drop.addEventListener('drop', event => {
                event.preventDefault();
                importPackage(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
            });

            STEPS.forEach(step => {
                const tab = byId('tab-' + step);
                if (tab) tab.addEventListener('click', () => goTo(step));
            });
            root.document.querySelectorAll('[data-goto]').forEach(node => {
                node.addEventListener('click', () => goTo(node.getAttribute('data-goto')));
            });
            root.document.querySelectorAll('[data-frame]').forEach(node => {
                node.addEventListener('click', () => viewer && viewer.frame(node.getAttribute('data-frame')));
            });

            bindDecision('stationCount', 'stationCount', 'number', () => scheduleRebuild(true));
            bindDecision('sectionFullness', 'sectionFullness', 'number', () => scheduleRebuild(true));
            bindDecision('allowancePercent', 'allowancePercent', 'number', () => scheduleRebuild(false));
            bindDecision('pullAxis', 'pullAxis', 'string', () => invalidateFrom('verify'));
            bindDecision('splitEnabled', 'splitEnabled', 'boolean', () => { halves = null; renderAll(); });
            bindDecision('splitPositionPercent', 'splitPositionPercent', 'number', () => { halves = null; renderAll(); });
            bindDecision('splitClearanceMm', 'splitClearanceMm', 'number', () => { halves = null; renderAll(); });
            bindDecision('registrationEnabled', 'registrationEnabled', 'boolean', () => { halves = null; renderAll(); });
            bindDecision('pinRadiusMm', 'pinRadiusMm', 'number', () => { halves = null; renderAll(); });
            bindDecision('pinDepthMm', 'pinDepthMm', 'number', () => { halves = null; renderAll(); });
            bindDecision('pinClearanceMm', 'pinClearanceMm', 'number', () => { halves = null; renderAll(); });
            byId('printDensity').addEventListener('input', renderReadouts);

            byId('doRelease').addEventListener('click', runReleaseCheck);
            byId('doSplit').addEventListener('click', applySplit);
            byId('doExport').addEventListener('click', exportPattern);

            byId('openAI').addEventListener('click', openAI);
            byId('aiCopy').addEventListener('click', async () => {
                const field = byId('aiPrompt');
                field.select();
                try {
                    await root.navigator.clipboard.writeText(field.value);
                    byId('aiCopy').textContent = 'Copied';
                } catch (error) {
                    // Clipboard permission is not guaranteed. The text is already selected, so say what to
                    // do rather than reporting a copy that did not happen.
                    byId('aiCopy').textContent = 'Press Ctrl+C';
                }
                root.setTimeout(() => { byId('aiCopy').textContent = 'Copy prompt'; }, 2000);
            });
            byId('aiApply').addEventListener('click', applyAIResponse);
            byId('aiClose').addEventListener('click', () => byId('aiModal').close());

            root.addEventListener('resize', () => viewer && viewer.resize());
        }

        try {
            viewer = root.PatternViewer.createViewer(byId('viewport'));
        } catch (error) {
            setStatus('error', error.message + ' The workflow still runs; only the preview is unavailable.');
        }
        bind();
        syncControlsFromState();
        renderAll();
        setStatus('ok', 'Import an ' + PACKAGE_EXTENSION + ' package to begin.');

        // Exposed so the browser smoke can drive the same entry points the controls call, rather than
        // simulating the workflow beside it.
        return {
            state,
            steps: STEPS,
            importPackage,
            interpret,
            rebuildGeometry,
            runReleaseCheck,
            applySplit,
            exportPattern,
            applyAIResponse,
            goTo,
            get geometry() { return geometry; },
            get halves() { return halves; },
            get aiProposals() { return aiProposals; },
            get geometryRevision() { return geometryRevision; }
        };
    }

    root.PatternWorkflow = Object.freeze({ start, STEPS });
})(typeof globalThis !== 'undefined' ? globalThis : window);
