// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * AI-CODING NOTE:
 * Responsibility: Persist and restore the complete explicit design lifecycle, TD053F controls, accepted/preview Freeform state, and Manual Trace provenance.
 * Inputs: Canonical browser state, form controls, and untrusted operator-selected session JSON.
 * Outputs: User-triggered JSON download or validated state restoration.
 * Safe edits: Backward-compatible optional fields, validation, and post-load canonical synchronization.
 * Do not: Turn an empty saved session into default geometry or omit accepted-active source state.
 * Verification: upstream session harnesses, empty-session contract, and browser save/open smoke test.
 *
 * js/session.js
 * Session save / load module. Serializes every sidebar control, every
 * analysis-panel control and the compliance-estimate flag into a portable
 * JSON file, and restores them back into the DOM + runtime state.
 *
 * Public surface:
 *   window.Session.save(nameHint)       -> triggers a .json download
 *   window.Session.apply(dataObject)    -> restores a parsed session object
 *   window.Session.loadFromFile(File, onOk, onErr)
 *
 * Expected integration hooks (provided by ui.js; absence is tolerated):
 *   window.Session_isEstimatedC10()     -> boolean
 *   window.Session_setIsEstimatedC10(b) -> void
 */

const Session = {
    SCHEMA: 'tonearm-designer-session',
    SCHEMA_VERSION: 1,
    APP_VERSION: 'V28.8.0-Fas20-AIResponseApplyRuntime',

    SELECT_IDS: ['exportType', 'exportFormat', 'rearMode', 'material', 'cartMode', 'alignmentPreset', 'renderMode', 'manufacturingMode'],

    CHECKBOX_IDS: [
        'showRearCG', 'showNeutralLine', 'showTowerClearance', 'includeRearWeightDiscsInExport',
        'showRearWeights', 'showFineTrimScrew', 'showVerticalPivot', 'showTotalCOM', 'showRearCOM',
        'showCounterweightCOM', 'showCartridgeCOM', 'showInertiaAxes', 'showMeasureLines',
        'showForce', 'showMass', 'showLpTopPlane', 'stylusLockedToLP',
        'aiVibeSoftSliverPass', 'showInternalWireRoute', 'cobraArchitectureEnabled', 'enableCobraArchitecture', 'titaniumPlateEnabled', 'onshapeMetadataSidecar', 'onshapeStrictOneToOne'
    ],

    EXTRA_INPUT_IDS: ['splitClearance', 'targetEffectiveMass', 'targetLFResonance', 'targetVTF', 'targetFirstBendingMode', 'targetSlendernessMin', 'targetSlendernessMax',
        'meshSegments', 'meshStepX', 'draftMinDeg', 'rearSupportBridgeLength', 'rearSupportBridgeRadius',
        'rearSupportBridgeOverlap', 'canopyRidgeHeight', 'canopyRidgeWidthFraction', 'canopyRidgeSharpness',
        'wireRouteRadius', 'wireRouteYOffset', 'wireRouteZOffset',
        'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass',
        'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset',
        'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor',
        'aiVibePlugSurfaceOffset',
        'aiVibeSandingAllowance', 'aiVibeDraftDeg', 'aiVibeMouldFlangeWidth', 'aiVibeRegistrationPins',
        'aiVibeBoltHoles', 'aiVibeVentChannels', 'aiVibeShrinkagePercent', 'aiVibeMinTriangleHardFailArea',
        'onshapeUnitScale', 'onshapeChordToleranceMm'],

    collect: function(nameHint) {
        const data = {
            schema: this.SCHEMA,
            version: this.SCHEMA_VERSION,
            app: this.APP_VERSION,
            timestamp: new Date().toISOString(),
            name: (typeof nameHint === 'string') ? nameHint.trim() : '',
            inputs: {},
            selects: {},
            checkboxes: {},
            flags: {},
            designLoaded: !!(state && state.designLoaded === true),
            designSource: state && state.designSource ? String(state.designSource) : null,
            manualTraceImport: (state && state.manualTraceImport) ? JSON.parse(JSON.stringify(state.manualTraceImport)) : null,
            geometryMode: (state && state.geometryMode === 'freeform') ? 'freeform' : 'parametric',
            // TD053F: these fields are overwritten immediately below by the canonical live-state snapshot.
            freeformLoft: (state && state.freeformLoft) ? JSON.parse(JSON.stringify(state.freeformLoft)) : null,
            freeformLoftActive: (state && state.freeformLoftActive) ? JSON.parse(JSON.stringify(state.freeformLoftActive)) : null,
            freeformLoftPreview: (state && state.freeformLoftPreview) ? JSON.parse(JSON.stringify(state.freeformLoftPreview)) : null,
            freeformLoftRejected: (state && state.freeformLoftRejected) ? JSON.parse(JSON.stringify(state.freeformLoftRejected)) : null,
            freeformApplyState: (state && state.freeformApplyState) ? JSON.parse(JSON.stringify(state.freeformApplyState)) : null,
            freeformLastAnalysis: (state && state.freeformLastAnalysis) ? JSON.parse(JSON.stringify(state.freeformLastAnalysis)) : null,
            freeformLastAcceptedAnalysis: (state && state.freeformLastAcceptedAnalysis) ? JSON.parse(JSON.stringify(state.freeformLastAcceptedAnalysis)) : null,
            freeformLastPreviewAnalysis: (state && state.freeformLastPreviewAnalysis) ? JSON.parse(JSON.stringify(state.freeformLastPreviewAnalysis)) : null,
            geometryModeAudit: (window.FreeformModeAudit && typeof window.FreeformModeAudit.auditGeometryMode === 'function')
                ? window.FreeformModeAudit.auditGeometryMode(state || {}, null, null, null)
                : {
                    stateGeometryMode: (state && state.geometryMode === 'freeform') ? 'freeform' : 'parametric',
                    renderGeometrySource: (state && state.geometryMode === 'freeform') ? 'freeformLoftKernel' : 'parametricGeometry',
                    exportGeometrySource: (state && state.geometryMode === 'freeform') ? 'freeformLoftKernel' : 'parametricMesh',
                    reportGeometrySource: (state && state.geometryMode === 'freeform') ? 'freeformPhysicalAnalysis' : 'legacyParametricPhysics',
                    stlSource: (state && state.geometryMode === 'freeform') ? 'freeformLoftKernel' : 'parametricMesh',
                    modeMismatch: !!(state && state.geometryMode !== 'freeform' && (state.freeformLoft || state.freeformLoftActive)),
                    silentFallbackDetected: false,
                    status: (state && state.geometryMode !== 'freeform' && (state.freeformLoft || state.freeformLoftActive)) ? 'BLOCKER' : 'PASS_WITH_SCOPE'
                },
            cobraArchitecture: (window.CobraArchitecture && typeof window.CobraArchitecture.getCobraArchitecture === 'function')
                ? window.CobraArchitecture.getCobraArchitecture(state)
                : ((state && state.cobraArchitecture) ? JSON.parse(JSON.stringify(state.cobraArchitecture)) : { enabled: false })
        };
        if (window.FreeformLiveStateBinding && typeof window.FreeformLiveStateBinding.sessionSnapshot === 'function') {
            const freeformSnapshot = window.FreeformLiveStateBinding.sessionSnapshot(state);
            Object.assign(data, freeformSnapshot);
        }

        const rangeIds = (typeof inputs !== 'undefined' && Array.isArray(inputs))
            ? inputs.slice()
            : [];
        this.EXTRA_INPUT_IDS.forEach(id => { if (rangeIds.indexOf(id) === -1) rangeIds.push(id); });

        rangeIds.forEach(id => {
            if (id === 'pivotOffsetZ') return; // TD043: legacy alias is read but not persisted.
            const el = document.getElementById(id);
            if (!el) return;
            const v = parseFloat(el.value);
            if (Number.isFinite(v)) data.inputs[id] = (typeof sanitizeInputValue === 'function') ? sanitizeInputValue(id, v, 0) : v;
        });

        this.SELECT_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) data.selects[id] = el.value;
        });

        this.CHECKBOX_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) data.checkboxes[id] = !!el.checked;
        });

        if (typeof window.Session_isEstimatedC10 === 'function') {
            data.flags.isEstimatedC10 = !!window.Session_isEstimatedC10();
        }

        data.flags.selectedCartridge = {
            id: state.selectedCartridgeId || '',
            name: state.selectedCartridgeName || '',
            manufacturer: state.selectedCartridgeManufacturer || '',
            model: state.selectedCartridgeModel || '',
            type: state.selectedCartridgeType || '',
            mass_g: state.selectedCartridgeMassG,
            compliance_10hz_cu: state.selectedCartridgeCompliance10HzCu,
            compliance_10hz_estimated: !!state.selectedCartridgeComplianceEstimated,
            tracking_force_g: {
                min: state.selectedCartridgeTrackingForceMinG,
                max: state.selectedCartridgeTrackingForceMaxG,
                recommended: state.selectedCartridgeTrackingForceRecommendedG
            },
            stylus: state.selectedCartridgeStylus || '',
            cantilever: state.selectedCartridgeCantilever || '',
            output_mv: state.selectedCartridgeOutputMv
        };

        return data;
    },

    save: function(nameHint) {
        const data = this.collect(nameHint);
        const rawName = (nameHint && String(nameHint).trim()) ? String(nameHint).trim() : '';
        const sanitized = rawName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fname = (sanitized || 'tonearm_session_' + ts) + '.json';

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return fname;
    },

    apply: function(data) {
        if (!data || typeof data !== 'object') throw new Error('Invalid session: not an object.');
        if (data.schema !== this.SCHEMA) throw new Error('Invalid session: schema mismatch.');
        if (typeof data.version !== 'number' || data.version > this.SCHEMA_VERSION) {
            throw new Error('Unsupported session version: ' + String(data.version));
        }

        // Opening a legacy session is itself an explicit activation. New-format
        // sessions may deliberately persist an empty design with designLoaded=false.
        state.designLoaded = data.designLoaded === undefined ? true : data.designLoaded === true;
        state.designSource = state.designLoaded ? String(data.designSource || 'opened_session') : null;
        state.manualTraceImport = data.manualTraceImport && typeof data.manualTraceImport === 'object'
            ? JSON.parse(JSON.stringify(data.manualTraceImport))
            : null;

        const clampToElement = (el, v) => {
            let val = parseFloat(v);
            if (!Number.isFinite(val)) return null;
            const min = parseFloat(el.min);
            const max = parseFloat(el.max);
            if (Number.isFinite(min)) val = Math.max(min, val);
            if (Number.isFinite(max)) val = Math.min(max, val);
            return (typeof sanitizeInputValue === 'function') ? sanitizeInputValue(el.id, val, 0) : val;
        };

        const incomingInputs = Object.assign({}, (data.inputs && typeof data.inputs === 'object') ? data.inputs : {});
        // TD043: pivotOffsetZ → verticalPivotHeightAboveLP migration.
        // We migrate the value once at load. Both keys remain readable in legacy sessions.
        if (incomingInputs.pivotOffsetZ !== undefined && incomingInputs.verticalPivotHeightAboveLP === undefined) {
            incomingInputs.verticalPivotHeightAboveLP = incomingInputs.pivotOffsetZ;
            console.info('[TD043] Migrating pivotOffsetZ=' + incomingInputs.pivotOffsetZ +
                         ' to verticalPivotHeightAboveLP. Old field preserved for read but not persisted.');
        }
        const inputMap = incomingInputs;
        // TD042/TD043: read but do not persist meshSegments, meshStepX, draftMinDeg and pivotOffsetZ from legacy sessions.
        Object.keys(inputMap).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const val = clampToElement(el, inputMap[id]);
            if (val === null) return;
            el.value = val;
            const valEl = document.getElementById('val_' + id);
            if (valEl) valEl.innerText = el.value.toString();
        });

        const selMap = (data.selects && typeof data.selects === 'object') ? data.selects : {};
        Object.keys(selMap).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const want = selMap[id];
            if (Array.from(el.options).some(o => o.value === want)) {
                el.value = want;
            }
        });

        const cbMap = (data.checkboxes && typeof data.checkboxes === 'object') ? data.checkboxes : {};
        if (!('stylusLockedToLP' in cbMap)) {
            cbMap.stylusLockedToLP = true;
            state.stylusLockedToLP = true;
            if (typeof console !== 'undefined') {
                console.info('[TD044] Legacy session loaded; defaulting stylusLockedToLP=true to auto-correct stylus Z.');
            }
        }
        Object.keys(cbMap).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = !!cbMap[id];
        });

        const flags = (data.flags && typeof data.flags === 'object') ? data.flags : {};
        if (typeof window.Session_setIsEstimatedC10 === 'function') {
            window.Session_setIsEstimatedC10(!!flags.isEstimatedC10);
        }

        if (flags.selectedCartridge && typeof flags.selectedCartridge === 'object') {
            const sc = flags.selectedCartridge;
            state.selectedCartridgeId = sc.id || '';
            state.selectedCartridgeName = sc.name || [sc.manufacturer, sc.model].filter(Boolean).join(' ') || '';
            state.selectedCartridgeManufacturer = sc.manufacturer || '';
            state.selectedCartridgeModel = sc.model || '';
            state.selectedCartridgeType = sc.type || '';
            state.selectedCartridgeMassG = (typeof sanitizeInputValue === 'function') ? sanitizeInputValue('selectedCartridgeMassG', sc.mass_g, 0) : Math.max(0, Number(sc.mass_g));
            state.selectedCartridgeCompliance10HzCu = Number(sc.compliance_10hz_cu);
            state.selectedCartridgeComplianceEstimated = !!sc.compliance_10hz_estimated;
            state.cartridgeComplianceEstimated = !!sc.compliance_10hz_estimated;
            const tf = sc.tracking_force_g || {};
            state.selectedCartridgeTrackingForceMinG = Number(tf.min);
            state.selectedCartridgeTrackingForceMaxG = Number(tf.max);
            state.selectedCartridgeTrackingForceRecommendedG = Number(tf.recommended);
            state.selectedCartridgeStylus = sc.stylus || '';
            state.selectedCartridgeCantilever = sc.cantilever || '';
            state.selectedCartridgeOutputMv = Number(sc.output_mv);
        }


        // TD052B: restore freeform runtime state before rebuild/update hooks.
        if (data.geometryMode === 'freeform' || data.geometryMode === 'parametric') {
            state.geometryMode = data.geometryMode;
        } else if (!state.geometryMode) {
            state.geometryMode = 'parametric';
        }
        if (data.freeformLoftActive && typeof data.freeformLoftActive === 'object') {
            state.freeformLoftActive = (window.FreeformLoftKernel && typeof window.FreeformLoftKernel.sanitizeState === 'function')
                ? window.FreeformLoftKernel.sanitizeState(data.freeformLoftActive)
                : JSON.parse(JSON.stringify(data.freeformLoftActive));
            state.freeformLoftActive.role = 'active';
            state.freeformLoftActive.revision = state.freeformLoftActive.revision || 'active-loaded';
            state.freeformLoft = JSON.parse(JSON.stringify(state.freeformLoftActive));
            state.freeformAcceptedActiveRevision = state.freeformLoftActive.revision;
            window.LAST_FREEFORM_LOFT_ACTIVE_STATE = JSON.parse(JSON.stringify(state.freeformLoftActive));
            window.LAST_FREEFORM_LOFT_STATE = JSON.parse(JSON.stringify(state.freeformLoftActive));
        } else if (data.freeformLoft && typeof data.freeformLoft === 'object') {
            state.freeformLoft = (window.FreeformLoftKernel && typeof window.FreeformLoftKernel.sanitizeState === 'function')
                ? window.FreeformLoftKernel.sanitizeState(data.freeformLoft)
                : JSON.parse(JSON.stringify(data.freeformLoft));
            if (state.geometryMode === 'freeform') {
                state.freeformLoftActive = JSON.parse(JSON.stringify(state.freeformLoft));
                state.freeformLoftActive.role = 'active';
                state.freeformLoftActive.revision = state.freeformLoftActive.revision || 'active-loaded';
                state.freeformAcceptedActiveRevision = state.freeformLoftActive.revision;
            }
            window.LAST_FREEFORM_LOFT_STATE = JSON.parse(JSON.stringify(state.freeformLoft));
        }
        if (data.freeformLoftPreview && typeof data.freeformLoftPreview === 'object') {
            state.freeformLoftPreview = (window.FreeformLoftKernel && typeof window.FreeformLoftKernel.sanitizeState === 'function')
                ? window.FreeformLoftKernel.sanitizeState(data.freeformLoftPreview)
                : JSON.parse(JSON.stringify(data.freeformLoftPreview));
            state.freeformLoftPreview.role = 'preview';
            window.LAST_FREEFORM_LOFT_PREVIEW_STATE = JSON.parse(JSON.stringify(state.freeformLoftPreview));
        }
        if (data.freeformLoftRejected && typeof data.freeformLoftRejected === 'object') {
            state.freeformLoftRejected = JSON.parse(JSON.stringify(data.freeformLoftRejected));
        }
        if (data.freeformApplyState && typeof data.freeformApplyState === 'object') {
            state.freeformApplyState = JSON.parse(JSON.stringify(data.freeformApplyState));
        }
        if (data.freeformLastAcceptedAnalysis && typeof data.freeformLastAcceptedAnalysis === 'object') {
            state.freeformLastAcceptedAnalysis = JSON.parse(JSON.stringify(data.freeformLastAcceptedAnalysis));
        }
        if (data.freeformLastPreviewAnalysis && typeof data.freeformLastPreviewAnalysis === 'object') {
            state.freeformLastPreviewAnalysis = JSON.parse(JSON.stringify(data.freeformLastPreviewAnalysis));
        }
        if (data.freeformLastAnalysis && typeof data.freeformLastAnalysis === 'object') {
            state.freeformLastAnalysis = JSON.parse(JSON.stringify(data.freeformLastAnalysis));
        } else if (state.freeformLastAcceptedAnalysis) {
            state.freeformLastAnalysis = JSON.parse(JSON.stringify(state.freeformLastAcceptedAnalysis));
        }
        if (data.geometryMode === 'parametric' && (data.freeformLoft || data.freeformLoftActive)) {
            state.freeformModeMismatchWarning = 'BLOCKER: session loads geometryMode=parametric while freeformLoft/freeformLoftActive exists; report/export/render source must not be treated as freeform without explicit mode switch.';
        }
        if (window.FreeformLiveStateBinding && typeof window.FreeformLiveStateBinding.ensureCanonicalFreeformState === 'function') {
            window.FreeformLiveStateBinding.ensureCanonicalFreeformState(state);
        }
        if (window.FreeformModeAudit && typeof window.FreeformModeAudit.auditGeometryMode === 'function') {
            state.geometryModeAudit = window.FreeformModeAudit.auditGeometryMode(state || {}, null, null, null);
        }
        if (window.FreeformRuntimeIntegration) {
            if (typeof window.FreeformRuntimeIntegration.ensureState === 'function') window.FreeformRuntimeIntegration.ensureState(state);
            if (typeof window.FreeformRuntimeIntegration.renderEditorScaffolds === 'function') window.FreeformRuntimeIntegration.renderEditorScaffolds(state);
            if (typeof window.FreeformRuntimeIntegration.syncTabsFromState === 'function') window.FreeformRuntimeIntegration.syncTabsFromState(state);
            if (typeof window.FreeformRuntimeIntegration.syncModeIndicator === 'function') window.FreeformRuntimeIntegration.syncModeIndicator(state);
            if (typeof window.FreeformRuntimeIntegration.syncAnalysisPanel === 'function') window.FreeformRuntimeIntegration.syncAnalysisPanel(state);
            if (typeof window.FreeformRuntimeIntegration.syncApplyStatePanel === 'function') window.FreeformRuntimeIntegration.syncApplyStatePanel(state);
            if (state.freeformModeMismatchWarning && typeof window.FreeformRuntimeIntegration.setStatus === 'function') {
                window.FreeformRuntimeIntegration.setStatus('APPLY_BLOCKED', state.freeformModeMismatchWarning, [state.freeformModeMismatchWarning]);
            }
        }

        if (window.CobraArchitecture && typeof window.CobraArchitecture.normalizeCobraArchitecture === 'function') {
            state.cobraArchitecture = window.CobraArchitecture.normalizeCobraArchitecture(data.cobraArchitecture, { defaultEnabled: false });
            if (typeof sanitizeMassFieldsOnObject === 'function') sanitizeMassFieldsOnObject(state);
        } else if (data.cobraArchitecture && typeof data.cobraArchitecture === 'object') {
            state.cobraArchitecture = Object.assign({ enabled: false }, data.cobraArchitecture);
            if (typeof sanitizeMassFieldsOnObject === 'function') sanitizeMassFieldsOnObject(state);
        } else {
            state.cobraArchitecture = { enabled: false };
        }

        const cartModeEl = document.getElementById('cartMode');
        const cartMode = cartModeEl ? cartModeEl.value : 'g1042';
        const cartPropsEl = document.getElementById('cartProps');
        const customCartPropsEl = document.getElementById('customCartProps');
        const armOnlyPropsEl = document.getElementById('armOnlyProps');
        if (cartPropsEl) cartPropsEl.style.display = (cartMode !== 'none') ? 'block' : 'none';
        if (customCartPropsEl) customCartPropsEl.style.display = (cartMode === 'custom' || cartMode === 'selected') ? 'block' : 'none';
        if (armOnlyPropsEl) armOnlyPropsEl.style.display = (cartMode === 'none') ? 'block' : 'none';

        if (typeof syncComplianceUI === 'function') syncComplianceUI();
        if (typeof syncExportUI === 'function') syncExportUI();
        if (typeof syncRearModeUI === 'function') syncRearModeUI();
        if (typeof updateRearNeutralUI === 'function') updateRearNeutralUI();
        if (typeof updateState === 'function') updateState();
        if (window.DesignSession && typeof window.DesignSession.syncUi === 'function') window.DesignSession.syncUi();
        if (window.CartridgePicker && typeof window.CartridgePicker.syncSelectedSummary === 'function') window.CartridgePicker.syncSelectedSummary(state);

        const nameInput = document.getElementById('sessionName');
        if (nameInput && typeof data.name === 'string') nameInput.value = data.name;

        return true;
    },

    loadFromFile: function(file, onSuccess, onError) {
        if (!file) { if (onError) onError(new Error('No file selected.')); return; }
        const reader = new FileReader();
        reader.onload = function() {
            try {
                const data = JSON.parse(reader.result);
                Session.apply(data);
                if (onSuccess) onSuccess(data);
            } catch (err) {
                if (onError) onError(err);
            }
        };
        reader.onerror = function() {
            if (onError) onError(reader.error || new Error('File read failed.'));
        };
        reader.readAsText(file);
    }
};

(function initSessionUI() {
    function setStatus(kind, text) {
        const el = document.getElementById('sessionStatus');
        if (!el) return;
        el.className = 'session-status ' + (kind || '');
        el.textContent = text || '';
    }

    function scheduleClear(ms) {
        setTimeout(() => {
            const el = document.getElementById('sessionStatus');
            if (!el) return;
            el.textContent = '';
            el.className = 'session-status';
        }, ms);
    }

    function onSaveClick() {
        const nameInput = document.getElementById('sessionName');
        const nameHint = nameInput ? nameInput.value : '';
        try {
            const fname = Session.save(nameHint);
            setStatus('success', 'Saved: ' + fname);
            scheduleClear(6000);
        } catch (err) {
            setStatus('error', 'Save failed: ' + (err && err.message ? err.message : String(err)));
            scheduleClear(9000);
        }
    }

    function onOpenClick() {
        const fileInput = document.getElementById('sessionFileInput');
        if (!fileInput) return;
        fileInput.value = '';
        fileInput.click();
    }

    function onFileChosen(evt) {
        const file = evt.target.files && evt.target.files[0];
        if (!file) return;
        setStatus('info', 'Loading ' + file.name + '…');
        Session.loadFromFile(
            file,
            function(data) {
                const label = (data && data.name) ? (data.name + ' (' + file.name + ')') : file.name;
                setStatus('success', 'Loaded: ' + label);
                scheduleClear(8000);
            },
            function(err) {
                setStatus('error', 'Load failed: ' + (err && err.message ? err.message : String(err)));
                scheduleClear(10000);
            }
        );
    }

    function wire() {
        const saveBtn = document.getElementById('sessionSaveBtn');
        const openBtn = document.getElementById('sessionOpenBtn');
        const fileInput = document.getElementById('sessionFileInput');
        if (saveBtn) saveBtn.addEventListener('click', onSaveClick);
        if (openBtn) openBtn.addEventListener('click', onOpenClick);
        if (fileInput) fileInput.addEventListener('change', onFileChosen);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})();

window.Session = Session;
