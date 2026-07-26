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
    const packages = [];
    const PACKAGE_EXTENSION = '.engrove-trace-project';

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
        s.traceProjectPackageImport = null;
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

    function fail(message) {
        throw new Error(message);
    }

    function isProjectPackage(file) {
        return String(file.name || '').toLowerCase().endsWith(PACKAGE_EXTENSION);
    }

    /**
     * Reads one `.engrove-trace-project` container. The package extension selects the package importer
     * exclusively: a rejected package never falls back to the legacy JSON parser, because a legacy read
     * of package bytes would bypass the container, integrity and semantic gates.
     */
    async function parsePackageFile(file) {
        if (!root.TraceProjectPackageImport) fail('Trace project package importer is unavailable.');
        const limit = root.TraceProjectPackageReader ? root.TraceProjectPackageReader.DEFAULT_LIMITS.maxArchiveBytes : 0;
        if (!limit || file.size > limit) fail(file.name + ' exceeds the ' + limit + ' byte package limit.');
        const result = await root.TraceProjectPackageImport.importPackageBytes(new Uint8Array(await file.arrayBuffer()), { fileName: file.name });
        if (!result.ok) fail(file.name + ': ' + result.diagnostics.map(item => item.code + (item.path ? ' @ ' + item.path : '')).join(' | '));
        return result;
    }

    async function parseFile(file) {
        const text = await readFileText(file);
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
            return root.ManualTrace3DAdapter.parseSvgText(text, file.name, root.DOMParser);
        }
        return root.ManualTrace3DAdapter.parseJsonText(text, file.name);
    }

    function dropUnreferencedPackages() {
        const live = new Set(imported.map(entry => entry.packageSha256).filter(Boolean));
        for (let index = packages.length - 1; index >= 0; index--) {
            if (!live.has(packages[index].packageSha256)) packages.splice(index, 1);
        }
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
            // A package view carries a contract-declared viewType. Allowing an override would let the
            // operator contradict the validated container, so the control is read-only for packages.
            select.disabled = entry.trace.planeLocked === true;
            select.addEventListener('change', function() {
                if (entry.trace.planeLocked === true) return;
                entry.trace.planeOverride = select.value;
                entry.trace.plane = select.value;
                renderImports();
            });
            const plane = root.document.createElement('span');
            plane.className = 'manual-trace-plane';
            plane.textContent = entry.trace.planeLocked === true
                ? 'contract view: ' + entry.trace.detectedPlane
                : entry.trace.planeOverride ? 'operator override' : 'axes detected: ' + entry.trace.detectedPlane;
            const remove = root.document.createElement('button');
            remove.type = 'button';
            remove.className = 'manual-trace-remove';
            remove.textContent = 'Remove';
            remove.addEventListener('click', function() {
                imported.splice(index, 1);
                dropUnreferencedPackages();
                renderImports();
            });
            row.append(identity, select, plane, remove);
            host.appendChild(row);
        });
        const build = byId('manualTraceBuildBtn');
        if (build) build.disabled = !imported.some(entry => entry.trace.plane === 'top') || !imported.some(entry => entry.trace.plane === 'side');
        if (!imported.length) setStatus('info', 'Add calibrated Manual Trace top and side files.');
    }

    function describePackage(result) {
        const views = result.normalizedDescriptor.views.map(view => view.plane).join(' + ');
        const preserved = result.provenance.preservedFields.length;
        const ignoredCount = result.provenance.ignoredFields.length;
        const warnings = result.warnings.length ? '; ' + result.warnings.length + ' contract warning(s): ' + result.warnings.map(item => item.code).join(', ') : '';
        return 'project ' + result.projectId + ' · sha256 ' + result.packageSha256.slice(0, 12)
            + ' · views ' + views + ' · ' + result.traceIds.length + ' trace(s)'
            + ' · ' + preserved + ' field(s) preserved, ' + ignoredCount + ' reported as not used for geometry' + warnings;
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setStatus('info', 'Validating ' + files.length + ' Manual Trace file(s)…');
        const failures = [];
        const notes = [];
        for (const file of files) {
            try {
                if (isProjectPackage(file)) {
                    const result = await parsePackageFile(file);
                    packages.push(result);
                    result.normalizedDescriptor.views.forEach(trace => imported.push({ trace: trace, packageSha256: result.packageSha256 }));
                    notes.push(file.name + ': ' + describePackage(result));
                } else {
                    imported.push({ trace: await parseFile(file), packageSha256: null });
                }
            } catch (error) {
                failures.push(file.name + ': ' + (error && error.message ? error.message : String(error)));
            }
        }
        renderImports();
        if (failures.length) setStatus('error', failures.join(' | '));
        else if (notes.length) setStatus('success', notes.join(' | '));
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
            // Two silhouettes do not determine section fullness, so the exponent is an operator input
            // rather than a measurement. An empty field keeps the adapter's documented default.
            const exponentInput = byId('manualTraceSectionExponent');
            const base = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.defaultState === 'function'
                ? root.FreeformLoftKernel.defaultState('straight_low_mass_lt_arm')
                : {};
            const proposed = root.ManualTrace3DAdapter.buildFreeformState(imported.map(entry => entry.trace), {
                baseState: base,
                stationCount: stationInput ? Number(stationInput.value) : 14,
                superellipseExponent: exponentInput && exponentInput.value !== '' ? Number(exponentInput.value) : undefined
            });
            const sanitized = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.sanitizeState === 'function'
                ? root.FreeformLoftKernel.sanitizeState(proposed)
                : proposed;
            // Activation happens only after the kernel has accepted the proposal, so a rejected build
            // leaves the previously active design untouched.
            activate(packages.length ? 'engrove_trace_project_package' : 'engrove_manual_trace');
            sanitized.role = 'active';
            sanitized.revision = revision();
            s.geometryMode = 'freeform';
            s.freeformLoftActive = JSON.parse(JSON.stringify(sanitized));
            s.freeformLoft = JSON.parse(JSON.stringify(sanitized));
            s.freeformLoftPreview = null;
            s.freeformAcceptedActiveRevision = sanitized.revision;
            s.manualTraceImport = JSON.parse(JSON.stringify(sanitized.sourceProvenance || proposed.sourceProvenance));
            s.traceProjectPackageImport = packages.length
                ? JSON.parse(JSON.stringify(packages.map(entry => entry.provenance)))
                : null;
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
            packages.splice(0, packages.length);
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
        getImportedTraces: function() { return imported.map(entry => JSON.parse(JSON.stringify(entry.trace))); },
        getImportedPackages: function() { return packages.map(entry => JSON.parse(JSON.stringify(entry.provenance))); }
    });

    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', wire);
        else wire();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
