// SPDX-License-Identifier: 0BSD
// TD053F Freeform live browser state binding.
// Canonical browser-state bridge only; no CAD/FEA/manufacturing/deployment claim.
// AI-CODING NOTE: Accepted previews become explicit active designs; empty sessions retain no active Freeform object or parametric fallback.

(function(root) {
    'use strict';

    const FREEFORM = 'freeform';
    const PARAMETRIC = 'parametric';
    const FREEFORM_RENDER_SOURCE = 'freeformLoftKernel';
    const FREEFORM_EXPORT_SOURCE = 'freeformLoftKernel';
    const FREEFORM_REPORT_SOURCE = 'freeformPhysicalAnalysis';

    function clone(value) {
        return JSON.parse(JSON.stringify(value === undefined ? null : value));
    }

    function nowRevision(prefix) {
        if (root.FreeformApplyStateMachine && typeof root.FreeformApplyStateMachine.nowRevision === 'function') {
            return root.FreeformApplyStateMachine.nowRevision(prefix || 'rev');
        }
        return String(prefix || 'rev') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function lexicalState() {
        // config.js explicitly publishes the canonical lexical object. Avoid
        // Function/eval bridges: repository CSP blocks them and imported files
        // are untrusted input surfaces.
        return root.state || root.__tonearmCanonicalState || null;
    }

    function getCanonicalAppState(explicitState) {
        const s = explicitState || root.state || root.__tonearmCanonicalState || lexicalState() || {};
        if (!root.state) root.state = s;
        if (!root.__tonearmCanonicalState) root.__tonearmCanonicalState = s;
        return s;
    }

    function hasFreeformActive(state) {
        const s = getCanonicalAppState(state);
        return !!(s.freeformLoftActive && s.freeformLoftActive.centerline && Array.isArray(s.freeformLoftActive.rings));
    }

    function hasFreeformPreview(state) {
        const s = getCanonicalAppState(state);
        return !!(s.freeformLoftPreview && s.freeformLoftPreview.centerline && Array.isArray(s.freeformLoftPreview.rings));
    }

    function ensureCanonicalFreeformState(state) {
        const s = getCanonicalAppState(state);
        if (s.geometryMode !== FREEFORM && s.geometryMode !== PARAMETRIC) s.geometryMode = PARAMETRIC;
        if (!s.freeformLoftActive && s.freeformLoft && s.freeformLoft.centerline && Array.isArray(s.freeformLoft.rings)) {
            s.freeformLoftActive = clone(s.freeformLoft);
            s.freeformLoftActive.role = 'active';
            s.freeformLoftActive.revision = s.freeformLoftActive.revision || 'active-migrated';
        }
        if (s.freeformLoftActive) {
            s.freeformLoftActive.role = 'active';
            s.freeformLoftActive.revision = s.freeformLoftActive.revision || 'active-current';
            s.freeformLoft = clone(s.freeformLoftActive);
            s.freeformAcceptedActiveRevision = s.freeformLoftActive.revision;
        }
        if (s.freeformLoftPreview) {
            s.freeformLoftPreview.role = 'preview';
            s.freeformLoftPreview.revision = s.freeformLoftPreview.revision || 'preview-current';
        }
        if (!s.freeformApplyState) {
            s.freeformApplyState = {
                phase: 'EMPTY',
                schemaValid: false,
                geometryBuilt: false,
                targetComplianceStatus: 'NOT_RUN',
                formFidelityStatus: 'NOT_RUN',
                activeStateChanged: false,
                previewStateChanged: false,
                acceptedActiveRevision: s.freeformLoftActive && s.freeformLoftActive.revision || null,
                previewRevision: s.freeformLoftPreview && s.freeformLoftPreview.revision || null,
                lastErrorSummary: '',
                operatorOverrideRequired: false
            };
        }
        if (!s.freeformLastAcceptedAnalysis) s.freeformLastAcceptedAnalysis = null;
        if (!s.freeformLastPreviewAnalysis) s.freeformLastPreviewAnalysis = null;
        if (!s.freeformLastAnalysis) s.freeformLastAnalysis = s.freeformLastAcceptedAnalysis || null;
        s.geometryModeAudit = buildGeometryModeAudit(s, {
            renderGeometrySource: hasFreeformActive(s) && s.geometryMode === FREEFORM ? FREEFORM_RENDER_SOURCE : undefined,
            exportGeometrySource: hasFreeformActive(s) && s.geometryMode === FREEFORM ? FREEFORM_EXPORT_SOURCE : undefined,
            reportGeometrySource: hasFreeformActive(s) && s.geometryMode === FREEFORM ? FREEFORM_REPORT_SOURCE : undefined,
            stlSource: hasFreeformActive(s) && s.geometryMode === FREEFORM ? FREEFORM_EXPORT_SOURCE : undefined
        });
        return s;
    }

    function updateApplyState(state, patch) {
        const s = getCanonicalAppState(state);
        s.freeformApplyState = Object.assign({}, s.freeformApplyState || {}, patch || {});
        return s.freeformApplyState;
    }

    function setFreeformPreview(previewState, analysis, audit, state) {
        const s = ensureCanonicalFreeformState(state);
        const preview = clone(previewState || {});
        preview.role = 'preview';
        preview.revision = preview.revision || nowRevision('preview');
        s.freeformLoftPreview = preview;
        s.freeformLastPreviewAnalysis = clone(analysis || null);
        s.freeformPreviewRevision = preview.revision;
        updateApplyState(s, {
            phase: 'PREVIEW_READY',
            schemaValid: true,
            geometryBuilt: true,
            activeStateChanged: false,
            previewStateChanged: true,
            previewRevision: preview.revision,
            targetComplianceStatus: (analysis && analysis.targetCompliance && (analysis.targetCompliance.status || analysis.targetCompliance.overall)) || 'NOT_RUN',
            formFidelityStatus: (analysis && analysis.cobraFidelity && analysis.cobraFidelity.status) || 'NOT_RUN'
        });
        s.geometryModeAudit = buildGeometryModeAudit(s, audit || {});
        root.LAST_FREEFORM_LOFT_PREVIEW_STATE = clone(preview);
        root.LAST_FREEFORM_LOFT_PREVIEW_ANALYSIS = clone(s.freeformLastPreviewAnalysis);
        syncFreeformUiFromCanonicalState(s);
        return preview;
    }

    function acceptFreeformPreviewAsActive(options) {
        const opts = options || {};
        const s = ensureCanonicalFreeformState(opts.state);
        if (!s.freeformLoftPreview) {
            const reason = 'ACCEPT_BLOCKED — reason: no preview freeform state exists.';
            updateApplyState(s, {
                phase: 'ACCEPT_BLOCKED',
                activeStateChanged: false,
                operatorOverrideRequired: true,
                lastErrorSummary: reason
            });
            syncFreeformUiFromCanonicalState(s);
            return { ok: false, phase: 'ACCEPT_BLOCKED', reason, state: s.freeformApplyState };
        }
        const decision = opts.decision || {};
        const allowed = opts.override === true || decision.acceptedActiveAllowed !== false;
        if (!allowed) {
            const blockers = decision.blockers || decision.repairRequiredReasons || ['target/form/feasibility gate blocked active acceptance'];
            const reason = 'ACCEPT_BLOCKED — reason: ' + blockers.join('; ');
            updateApplyState(s, {
                phase: 'ACCEPT_BLOCKED',
                activeStateChanged: false,
                previewStateChanged: true,
                operatorOverrideRequired: true,
                lastErrorSummary: reason
            });
            syncFreeformUiFromCanonicalState(s);
            return { ok: false, phase: 'ACCEPT_BLOCKED', reason, errors: blockers, state: s.freeformApplyState };
        }
        const active = clone(s.freeformLoftPreview);
        active.role = 'active';
        active.revision = nowRevision('active');
        s.freeformLoftActive = active;
        s.freeformLoft = clone(active);
        s.freeformAcceptedActiveRevision = active.revision;
        s.geometryMode = FREEFORM;
        s.designLoaded = true;
        s.designSource = s.designSource || 'accepted_freeform_preview';
        s.freeformLastAcceptedAnalysis = clone(s.freeformLastPreviewAnalysis || opts.analysis || null);
        s.freeformLastAnalysis = clone(s.freeformLastAcceptedAnalysis || null);
        updateApplyState(s, {
            phase: 'ACCEPTED_ACTIVE',
            schemaValid: true,
            geometryBuilt: true,
            activeStateChanged: true,
            previewStateChanged: false,
            acceptedActiveRevision: active.revision,
            previewRevision: s.freeformLoftPreview && s.freeformLoftPreview.revision || null,
            operatorOverrideRequired: false,
            lastErrorSummary: ''
        });
        s.geometryModeAudit = buildGeometryModeAudit(s, {
            renderGeometrySource: FREEFORM_RENDER_SOURCE,
            exportGeometrySource: FREEFORM_EXPORT_SOURCE,
            reportGeometrySource: FREEFORM_REPORT_SOURCE,
            stlSource: FREEFORM_EXPORT_SOURCE,
            reportSubject: 'accepted active freeform',
            stateRole: 'active',
            modeMismatch: false
        });
        root.LAST_FREEFORM_LOFT_STATE = clone(s.freeformLoftActive);
        root.LAST_FREEFORM_LOFT_ACTIVE_STATE = clone(s.freeformLoftActive);
        root.LAST_FREEFORM_LOFT_ANALYSIS = clone(s.freeformLastAcceptedAnalysis);
        invalidateFreeformRenderExportCaches('accepted freeform preview as active');
        syncFreeformUiFromCanonicalState(s);
        return { ok: true, phase: 'ACCEPTED_ACTIVE', active: clone(active), state: s.freeformApplyState };
    }

    function rejectFreeformPreview(reason, state) {
        const s = ensureCanonicalFreeformState(state);
        if (s.freeformLoftPreview) {
            s.freeformLoftRejected = Object.assign({}, clone(s.freeformLoftPreview), {
                role: 'rejected',
                rejectedReason: reason || 'operator rejected preview'
            });
        }
        s.freeformLoftPreview = null;
        s.freeformLastPreviewAnalysis = null;
        updateApplyState(s, {
            phase: 'REJECTED',
            activeStateChanged: false,
            previewStateChanged: false,
            previewRevision: null,
            lastErrorSummary: reason || 'Preview rejected'
        });
        syncFreeformUiFromCanonicalState(s);
        return s.freeformLoftRejected || null;
    }

    function getFreeformRuntimeState(state) {
        const s = ensureCanonicalFreeformState(state);
        return {
            geometryMode: s.geometryMode,
            freeformLoftActive: s.freeformLoftActive || null,
            freeformLoftPreview: s.freeformLoftPreview || null,
            freeformLoftRejected: s.freeformLoftRejected || null,
            freeformApplyState: s.freeformApplyState || null,
            freeformLastAcceptedAnalysis: s.freeformLastAcceptedAnalysis || null,
            freeformLastPreviewAnalysis: s.freeformLastPreviewAnalysis || null,
            geometryModeAudit: s.geometryModeAudit || buildGeometryModeAudit(s, {})
        };
    }

    function getActiveGeometrySource(state) {
        const s = ensureCanonicalFreeformState(state);
        if (s.geometryMode === FREEFORM && hasFreeformActive(s)) return 'freeformLoftActive';
        if (s.geometryMode === FREEFORM && hasFreeformPreview(s)) return 'freeformLoftPreview';
        return 'parametricRuntime';
    }

    function invalidateFreeformRenderExportCaches(reason) {
        root.LAST_FREEFORM_RENDER_INVALIDATION_REASON = reason || 'freeform state changed';
        root.LAST_FREEFORM_RENDER_CACHE_REVISION = nowRevision('render-cache');
        root.LAST_FREEFORM_EXPORT_CACHE_REVISION = nowRevision('export-cache');
        if (root.RenderState && typeof root.RenderState.invalidate === 'function') {
            try { root.RenderState.invalidate(reason || 'freeform state changed'); } catch (err) {}
        }
    }

    function buildGeometryModeAudit(state, opts) {
        const s = getCanonicalAppState(state);
        const active = hasFreeformActive(s);
        const stateGeometryMode = s.geometryMode === FREEFORM ? FREEFORM : PARAMETRIC;
        const renderGeometrySource = opts && opts.renderGeometrySource || (stateGeometryMode === FREEFORM && active ? FREEFORM_RENDER_SOURCE : 'parametricGeometry');
        const exportGeometrySource = opts && opts.exportGeometrySource || (stateGeometryMode === FREEFORM && active ? FREEFORM_EXPORT_SOURCE : 'parametricMesh');
        const reportGeometrySource = opts && opts.reportGeometrySource || (stateGeometryMode === FREEFORM && active ? FREEFORM_REPORT_SOURCE : 'legacyParametricPhysics');
        const stlSource = opts && opts.stlSource || exportGeometrySource;
        const freeformPresent = !!(active || hasFreeformPreview(s) || s.freeformLoft);
        const silentFallbackDetected = !!(stateGeometryMode === FREEFORM && active && (
            renderGeometrySource !== FREEFORM_RENDER_SOURCE ||
            exportGeometrySource !== FREEFORM_EXPORT_SOURCE ||
            reportGeometrySource !== FREEFORM_REPORT_SOURCE ||
            stlSource !== FREEFORM_EXPORT_SOURCE
        ));
        const modeMismatch = !!((stateGeometryMode !== FREEFORM && freeformPresent) || silentFallbackDetected);
        return {
            schema: 'td053f-freeform-live-state-audit-v1',
            stateGeometryMode,
            stateRole: opts && opts.stateRole || (active ? 'active' : (hasFreeformPreview(s) ? 'preview' : 'parametric')),
            reportSubject: opts && opts.reportSubject || (active ? 'accepted active freeform' : (hasFreeformPreview(s) ? 'preview/quarantine freeform' : 'parametric')),
            freeformLoftPresent: freeformPresent,
            freeformLoftActivePresent: active,
            acceptedActiveRevision: s.freeformLoftActive && s.freeformLoftActive.revision || null,
            previewRevision: s.freeformLoftPreview && s.freeformLoftPreview.revision || null,
            applyPhase: s.freeformApplyState && s.freeformApplyState.phase || 'EMPTY',
            renderGeometrySource,
            exportGeometrySource,
            reportGeometrySource,
            stlSource,
            modeMismatch,
            silentFallbackDetected,
            fallbackReason: silentFallbackDetected ? 'accepted active freeform exists but export/render/report used parametric source' : null,
            status: modeMismatch ? 'BLOCKER' : 'PASS_WITH_SCOPE',
            warning: modeMismatch ? 'accepted active freeform/source mismatch or parametric fallback detected' : ''
        };
    }

    function sessionSnapshot(state) {
        const s = ensureCanonicalFreeformState(state);
        return {
            geometryMode: s.geometryMode,
            freeformLoft: s.freeformLoft ? clone(s.freeformLoft) : null,
            freeformLoftActive: s.freeformLoftActive ? clone(s.freeformLoftActive) : null,
            freeformLoftPreview: s.freeformLoftPreview ? clone(s.freeformLoftPreview) : null,
            freeformLoftRejected: s.freeformLoftRejected ? clone(s.freeformLoftRejected) : null,
            freeformApplyState: s.freeformApplyState ? clone(s.freeformApplyState) : null,
            freeformLastAnalysis: s.freeformLastAnalysis ? clone(s.freeformLastAnalysis) : null,
            freeformLastAcceptedAnalysis: s.freeformLastAcceptedAnalysis ? clone(s.freeformLastAcceptedAnalysis) : null,
            freeformLastPreviewAnalysis: s.freeformLastPreviewAnalysis ? clone(s.freeformLastPreviewAnalysis) : null,
            geometryModeAudit: buildGeometryModeAudit(s, s.geometryModeAudit || {})
        };
    }

    function syncFreeformUiFromCanonicalState(state) {
        const s = ensureCanonicalFreeformState(state);
        if (!root.document) return s;
        const apply = s.freeformApplyState || {};
        const audit = s.geometryModeAudit || buildGeometryModeAudit(s, {});
        const values = {
            '[data-freeform-active-revision="true"]': 'Active design revision: ' + (s.freeformLoftActive && s.freeformLoftActive.revision || 'none'),
            '[data-freeform-preview-revision="true"]': 'Preview design revision: ' + (s.freeformLoftPreview && s.freeformLoftPreview.revision || 'none'),
            '[data-freeform-rejected-payload="true"]': 'Last rejected payload: ' + (s.freeformLoftRejected && (s.freeformLoftRejected.payloadSummary || s.freeformLoftRejected.revision) || 'none'),
            '[data-freeform-validation-state="true"]': 'Validation state: ' + (apply.schemaValid ? 'SCHEMA_VALID' : (apply.phase || 'EMPTY')),
            '[data-freeform-apply-state="true"]': 'Apply state: ' + (apply.phase || 'EMPTY'),
            '[data-freeform-target-state="true"]': 'Target compliance: ' + (apply.targetComplianceStatus || 'NOT_RUN'),
            '[data-freeform-cobra-state="true"]': 'Cobra fidelity: ' + (apply.formFidelityStatus || 'NOT_RUN'),
            '[data-freeform-infeasibility-state="true"]': 'Infeasibility: ' + ((s.freeformLastPreviewAnalysis && s.freeformLastPreviewAnalysis.freeformFeasibility && s.freeformLastPreviewAnalysis.freeformFeasibility.status) || (s.freeformLastAcceptedAnalysis && s.freeformLastAcceptedAnalysis.freeformFeasibility && s.freeformLastAcceptedAnalysis.freeformFeasibility.status) || 'NOT_RUN')
        };
        Object.keys(values).forEach(selector => {
            Array.from(root.document.querySelectorAll(selector)).forEach(el => { el.textContent = values[selector]; });
        });
        const sourceEl = root.document.getElementById('freeformActiveSourceIndicator');
        if (sourceEl) {
            sourceEl.textContent = 'Active source: ' + getActiveGeometrySource(s) + ' / render=' + audit.renderGeometrySource + ' / export=' + audit.exportGeometrySource;
        }
        const acceptBtn = root.document.getElementById('freeformAcceptPreviewBtn');
        if (acceptBtn) {
            const phase = apply.phase || 'EMPTY';
            const blocked = phase === 'TARGET_FAIL_PREVIEW_ONLY' || phase === 'FORM_INTENT_MISMATCH_PREVIEW_ONLY' || phase === 'INFEASIBLE' || phase === 'ACCEPT_BLOCKED' || !s.freeformLoftPreview;
            acceptBtn.disabled = !!blocked;
            acceptBtn.setAttribute('data-accept-blocked', blocked ? 'true' : 'false');
        }
        const status = root.document.getElementById('freeformWorkbenchStatus');
        if (status) status.setAttribute('data-canonical-apply-phase', apply.phase || 'EMPTY');
        return s;
    }

    root.FreeformLiveStateBinding = Object.freeze({
        getCanonicalAppState,
        getFreeformRuntimeState,
        ensureCanonicalFreeformState,
        setFreeformPreview,
        acceptFreeformPreviewAsActive,
        rejectFreeformPreview,
        syncFreeformUiFromCanonicalState,
        invalidateFreeformRenderExportCaches,
        getActiveGeometrySource,
        buildGeometryModeAudit,
        sessionSnapshot
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
