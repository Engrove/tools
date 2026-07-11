// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Own the explicit empty/active design lifecycle and the desktop Manual Trace import user interface.
 * Inputs: Operator file selection, plane overrides, session/new/clear actions, and ManualTrace3DAdapter results.
 * Outputs: Canonical active state mutations followed by existing TD053F rebuild/render/session/export hooks.
 * Safe edits: Explicit operator actions, DOM-safe status rendering, and accepted-active Freeform binding.
 * Do not: Auto-create a model at startup, inject imported strings as HTML, or bypass adapter/kernel validation.
 * Verification: test/empty-session-contract.test.cjs, test/manual-trace-adapter.test.cjs, and browser smoke tests.
 */
(function(root) {
    'use strict';

    const imported = [];

    function byId(id) {
        return root.document ? root.document.getElementById(id) : null;
    }

    function canonicalState() {
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.getCanonicalAppState === 'function') {
            return root.FreeformLiveStateBinding.getCanonicalAppState(typeof state !== 'undefined' ? state : root.state);
        }
        return typeof state !== 'undefined' ? state : (root.state || {});
    }

    function setText(element, text) {
        if (element) element.textContent = String(text || '');
    }

    function setStatus(kind, text) {
        const element = byId('manualTraceImportStatus');
        if (!element) return;
        element.className = 'manual-trace-status ' + String(kind || 'info');
        setText(element, text);
    }

    function syncUi() {
        const s = canonicalState();
        const active = s.designLoaded === true;
        const overlay = byId('emptyDesignOverlay');
        if (overlay) overlay.hidden = active;
        const badge = byId('designSessionState');
        setText(badge, active ? 'ACTIVE · ' + String(s.designSource || s.geometryMode || 'design') : 'EMPTY · no active geometry');
        if (badge) badge.setAttribute('data-state', active ? 'active' : 'empty');
        ['exportModelBtn', 'export3dPngBtn', 'saveReportBtn', 'openSolverBtn'].forEach(id => {
            const element = byId(id);
            if (element) element.disabled = !active;
        });
    }

    function activate(source) {
        const s = canonicalState();
        s.designLoaded = true;
        s.designSource = String(source || 'operator_action');
        syncUi();
        return s;
    }

    function clearActiveDesign() {
        const s = canonicalState();
        s.designLoaded = false;
        s.designSource = null;
        s.geometryMode = 'parametric';
        s.freeformLoft = null;
        s.freeformLoftActive = null;
        s.freeformLoftPreview = null;
        s.freeformLoftRejected = null;
        s.freeformLastAnalysis = null;
        s.freeformLastAcceptedAnalysis = null;
        s.freeformLastPreviewAnalysis = null;
        s.manualTraceImport = null;
        if (root.FreeformApplyStateMachine && typeof root.FreeformApplyStateMachine.ensureState === 'function') {
            s.freeformApplyState = null;
            root.FreeformApplyStateMachine.ensureState(s);
        }
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.invalidateFreeformRenderExportCaches === 'function') {
            root.FreeformLiveStateBinding.invalidateFreeformRenderExportCaches('new empty design session');
        }
        if (typeof root.updateState === 'function') root.updateState();
        else if (typeof updateState === 'function') updateState();
        syncUi();
        setStatus('info', 'New empty session created. No geometry is active.');
        return s;
    }

    function createParametricDesign() {
        const s = activate('explicit_parametric_design');
        s.geometryMode = 'parametric';
        if (typeof root.updateState === 'function') root.updateState();
        else if (typeof updateState === 'function') updateState();
        setStatus('success', 'Parametric design activated from the existing TD053F controls.');
    }

    function readFileText(file) {
        if (!file) return Promise.reject(new Error('No file selected.'));
        if (file.size > root.ManualTrace3DAdapter.limits.maxFileBytes) return Promise.reject(new Error(file.name + ' exceeds the 5 MiB input limit.'));
        return file.text();
    }

    async function parseFile(file) {
        const text = await readFileText(file);
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
            return root.ManualTrace3DAdapter.parseSvgText(text, file.name, root.DOMParser);
        }
        return root.ManualTrace3DAdapter.parseJsonText(text, file.name);
    }

    function option(value, label, selected) {
        const element = root.document.createElement('option');
        element.value = value;
        element.textContent = label;
        element.selected = !!selected;
        return element;
    }

    function renderImports() {
        const host = byId('manualTraceImportList');
        if (!host) return;
        host.replaceChildren();
        imported.forEach((entry, index) => {
            const row = root.document.createElement('div');
            row.className = 'manual-trace-file';
            const identity = root.document.createElement('div');
            identity.className = 'manual-trace-file-identity';
            const name = root.document.createElement('strong');
            name.textContent = entry.trace.fileName;
            const detail = root.document.createElement('span');
            detail.textContent = entry.trace.geometrySchema + ' · ' + entry.trace.contourCount + ' contours · scale ' + entry.trace.unitPerPixel + ' mm/px';
            identity.append(name, detail);
            const select = root.document.createElement('select');
            select.setAttribute('aria-label', 'Orthographic plane for ' + entry.trace.fileName);
            select.append(
                option('top', 'Top · X–Y', entry.trace.plane === 'top'),
                option('side', 'Side · X–Z', entry.trace.plane === 'side'),
                option('front', 'Front · Y–Z', entry.trace.plane === 'front')
            );
            select.addEventListener('change', function() {
                entry.trace.planeOverride = select.value;
                entry.trace.plane = select.value;
                renderImports();
            });
            const plane = root.document.createElement('span');
            plane.className = 'manual-trace-plane';
            plane.textContent = entry.trace.planeOverride ? 'operator override' : 'axes detected: ' + entry.trace.detectedPlane;
            const remove = root.document.createElement('button');
            remove.type = 'button';
            remove.className = 'manual-trace-remove';
            remove.textContent = 'Remove';
            remove.addEventListener('click', function() {
                imported.splice(index, 1);
                renderImports();
            });
            row.append(identity, select, plane, remove);
            host.appendChild(row);
        });
        const build = byId('manualTraceBuildBtn');
        if (build) build.disabled = !imported.some(entry => entry.trace.plane === 'top') || !imported.some(entry => entry.trace.plane === 'side');
        if (!imported.length) setStatus('info', 'Add calibrated Manual Trace top and side files.');
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setStatus('info', 'Validating ' + files.length + ' Manual Trace file(s)…');
        const failures = [];
        for (const file of files) {
            try {
                const trace = await parseFile(file);
                imported.push({ trace });
            } catch (error) {
                failures.push(file.name + ': ' + (error && error.message ? error.message : String(error)));
            }
        }
        renderImports();
        if (failures.length) setStatus('error', failures.join(' | '));
        else setStatus('success', files.length + ' Manual Trace file(s) validated. Review plane assignments, then build.');
    }

    function revision() {
        if (root.FreeformApplyStateMachine && typeof root.FreeformApplyStateMachine.nowRevision === 'function') {
            return root.FreeformApplyStateMachine.nowRevision('active-trace');
        }
        return 'active-trace-' + Date.now().toString(36);
    }

    function buildFromImports() {
        if (!root.ManualTrace3DAdapter) return setStatus('error', 'Manual Trace adapter is unavailable.');
        try {
            const s = canonicalState();
            const stationInput = byId('manualTraceStationCount');
            const base = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.defaultState === 'function'
                ? root.FreeformLoftKernel.defaultState('straight_low_mass_lt_arm')
                : {};
            const proposed = root.ManualTrace3DAdapter.buildFreeformState(imported.map(entry => entry.trace), {
                baseState: base,
                stationCount: stationInput ? Number(stationInput.value) : 14
            });
            activate('engrove_manual_trace');
            const sanitized = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.sanitizeState === 'function'
                ? root.FreeformLoftKernel.sanitizeState(proposed)
                : proposed;
            sanitized.role = 'active';
            sanitized.revision = revision();
            s.geometryMode = 'freeform';
            s.freeformLoftActive = JSON.parse(JSON.stringify(sanitized));
            s.freeformLoft = JSON.parse(JSON.stringify(sanitized));
            s.freeformLoftPreview = null;
            s.freeformAcceptedActiveRevision = sanitized.revision;
            s.manualTraceImport = JSON.parse(JSON.stringify(sanitized.sourceProvenance || proposed.sourceProvenance));
            if (root.FreeformApplyStateMachine && typeof root.FreeformApplyStateMachine.ensureState === 'function') {
                root.FreeformApplyStateMachine.ensureState(s);
                s.freeformApplyState = Object.assign({}, s.freeformApplyState, {
                    phase: 'ACCEPTED_ACTIVE',
                    schemaValid: true,
                    geometryBuilt: true,
                    activeStateChanged: true,
                    previewStateChanged: false,
                    acceptedActiveRevision: sanitized.revision,
                    lastErrorSummary: ''
                });
            }
            if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.ensureCanonicalFreeformState === 'function') {
                root.FreeformLiveStateBinding.ensureCanonicalFreeformState(s);
                root.FreeformLiveStateBinding.invalidateFreeformRenderExportCaches('Manual Trace import accepted active');
            }
            if (root.FreeformRuntimeIntegration) {
                if (typeof root.FreeformRuntimeIntegration.renderEditorScaffolds === 'function') root.FreeformRuntimeIntegration.renderEditorScaffolds(s);
                if (typeof root.FreeformRuntimeIntegration.syncTabsFromState === 'function') root.FreeformRuntimeIntegration.syncTabsFromState(s);
                if (typeof root.FreeformRuntimeIntegration.syncModeIndicator === 'function') root.FreeformRuntimeIntegration.syncModeIndicator(s);
            }
            if (typeof root.updateState === 'function') root.updateState();
            else if (typeof updateState === 'function') updateState();
            syncUi();
            setStatus('success', 'Accepted active Manual Trace loft built from ' + imported.length + ' file(s), ' + sanitized.rings.length + ' stations.');
        } catch (error) {
            setStatus('error', (error && error.code ? error.code + ': ' : '') + (error && error.message ? error.message : String(error)));
        }
    }

    function wire() {
        const input = byId('manualTraceFiles');
        if (input) input.addEventListener('change', function() {
            addFiles(input.files).finally(function() { input.value = ''; });
        });
        const add = byId('manualTraceAddBtn');
        if (add && input) add.addEventListener('click', function() { input.click(); });
        const build = byId('manualTraceBuildBtn');
        if (build) build.addEventListener('click', buildFromImports);
        const clearInputs = byId('manualTraceClearBtn');
        if (clearInputs) clearInputs.addEventListener('click', function() {
            imported.splice(0, imported.length);
            renderImports();
        });
        ['newEmptySessionBtn', 'emptyOverlayNewBtn'].forEach(id => {
            const element = byId(id);
            if (element) element.addEventListener('click', clearActiveDesign);
        });
        ['createParametricBtn', 'emptyOverlayParametricBtn'].forEach(id => {
            const element = byId(id);
            if (element) element.addEventListener('click', createParametricDesign);
        });
        const openFromOverlay = byId('emptyOverlayOpenBtn');
        if (openFromOverlay) openFromOverlay.addEventListener('click', function() {
            const open = byId('sessionOpenBtn');
            if (open) open.click();
        });
        renderImports();
        syncUi();
    }

    root.DesignSession = Object.freeze({
        activate,
        clear: clearActiveDesign,
        createParametric: createParametricDesign,
        isActive: function() { return canonicalState().designLoaded === true; },
        syncUi,
        getImportedTraces: function() { return imported.map(entry => JSON.parse(JSON.stringify(entry.trace))); }
    });

    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', wire);
        else wire();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
