/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-apply-state-machine.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053E Freeform apply state machine.
// Local source/state guard only; no browser/WebGL/CAD/FEA/manufacturing claim.

(function(root) {
    'use strict';

    const PHASES = [
        'EMPTY',
        'PARSING',
        'PARSE_ERROR',
        'VALIDATING_SCHEMA',
        'VALIDATION_REJECTED',
        'SCHEMA_VALID',
        'APPLYING_PREVIEW',
        'PREVIEW_READY',
        'TARGET_CHECKING',
        'TARGET_FAIL_PREVIEW_ONLY',
        'FORM_INTENT_MISMATCH_PREVIEW_ONLY',
        'ACCEPTED_ACTIVE',
        'APPLY_BLOCKED',
        'APPLY_FAILED',
        'INFEASIBLE'
    ];

    function clone(value) {
        return JSON.parse(JSON.stringify(value === undefined ? null : value));
    }

    function nowRevision(prefix) {
        return String(prefix || 'rev') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function normalizePhase(phase) {
        return PHASES.indexOf(phase) >= 0 ? phase : 'EMPTY';
    }

    function ensureState(appState) {
        const s = appState || root.state || {};
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
                previewRevision: null,
                lastErrorSummary: '',
                operatorOverrideRequired: false
            };
        }
        if (!s.freeformAcceptedActiveRevision && s.freeformApplyState.acceptedActiveRevision) {
            s.freeformAcceptedActiveRevision = s.freeformApplyState.acceptedActiveRevision;
        }
        return s;
    }

    function current(appState) {
        return ensureState(appState).freeformApplyState;
    }

    function setPhase(appState, phase, patch) {
        const s = ensureState(appState);
        const prev = clone(s.freeformApplyState || {});
        s.freeformApplyState = Object.assign({}, prev, patch || {}, { phase: normalizePhase(phase) });
        return s.freeformApplyState;
    }

    function markParsing(appState) {
        return setPhase(appState, 'PARSING', {
            schemaValid: false,
            geometryBuilt: false,
            activeStateChanged: false,
            previewStateChanged: false,
            operatorOverrideRequired: false,
            lastErrorSummary: ''
        });
    }

    function markParseError(appState, errors) {
        return setPhase(appState, 'PARSE_ERROR', {
            schemaValid: false,
            geometryBuilt: false,
            activeStateChanged: false,
            previewStateChanged: false,
            lastErrorSummary: (errors || []).join('; ') || 'JSON parse error',
            operatorOverrideRequired: false
        });
    }

    function markSchemaValidation(appState) {
        return setPhase(appState, 'VALIDATING_SCHEMA', {
            schemaValid: false,
            geometryBuilt: false,
            activeStateChanged: false,
            previewStateChanged: false,
            lastErrorSummary: ''
        });
    }

    function markSchemaRejected(appState, payload, errors) {
        const s = ensureState(appState);
        s.freeformLoftRejected = {
            role: 'rejected',
            revision: nowRevision('rejected'),
            reason: 'SCHEMA_REJECTED',
            payloadSummary: payload && payload.name || payload && payload.schema || 'unknown',
            errors: clone(errors || [])
        };
        return setPhase(s, 'VALIDATION_REJECTED', {
            schemaValid: false,
            geometryBuilt: false,
            activeStateChanged: false,
            previewStateChanged: false,
            lastErrorSummary: (errors || []).join('; ') || 'Schema validation rejected payload; payload applicerades inte.',
            operatorOverrideRequired: false
        });
    }

    function markSchemaValid(appState) {
        return setPhase(appState, 'SCHEMA_VALID', {
            schemaValid: true,
            activeStateChanged: false,
            previewStateChanged: false,
            lastErrorSummary: ''
        });
    }

    function beginPreview(appState) {
        return setPhase(appState, 'APPLYING_PREVIEW', {
            schemaValid: true,
            geometryBuilt: false,
            activeStateChanged: false,
            previewStateChanged: false,
            operatorOverrideRequired: false
        });
    }

    function markPreview(appState, previewState, analysisBundle) {
        const s = ensureState(appState);
        const revision = nowRevision('preview');
        const preview = clone(previewState || {});
        preview.role = 'preview';
        preview.revision = revision;
        s.freeformLoftPreview = preview;
        s.freeformLastPreviewAnalysis = clone(analysisBundle || null);
        s.freeformLastAnalysis = clone(analysisBundle || null);
        return setPhase(s, 'PREVIEW_READY', {
            schemaValid: true,
            geometryBuilt: true,
            activeStateChanged: false,
            previewStateChanged: true,
            previewRevision: revision,
            targetComplianceStatus: 'NOT_RUN',
            formFidelityStatus: 'NOT_RUN',
            operatorOverrideRequired: false,
            lastErrorSummary: ''
        });
    }

    function classifyPreview(appState, analysis) {
        const s = ensureState(appState);
        const tc = analysis && (analysis.targetCompliance || analysis.deterministicAnalysis && analysis.deterministicAnalysis.targetCompliance);
        const cf = analysis && (analysis.cobraFidelity || analysis.deterministicAnalysis && analysis.deterministicAnalysis.cobraFidelity);
        const feasibility = analysis && (analysis.feasibility || analysis.freeformFeasibility);
        const targetStatus = tc && (tc.status || tc.overall) || 'NOT_RUN';
        const formStatus = cf && cf.status || 'NOT_RUN';
        const infeasible = feasibility && /^INFEASIBLE/.test(String(feasibility.status || feasibility.classification || ''));

        if (infeasible) {
            return setPhase(s, 'INFEASIBLE', {
                schemaValid: true,
                geometryBuilt: true,
                targetComplianceStatus: targetStatus,
                formFidelityStatus: formStatus,
                activeStateChanged: false,
                previewStateChanged: true,
                operatorOverrideRequired: true,
                lastErrorSummary: feasibility.summary || 'INFEASIBLE_WITH_CURRENT_KERNEL'
            });
        }
        if (targetStatus === 'TARGET_FAIL' || (tc && tc.overall === 'BLOCKER')) {
            return setPhase(s, 'TARGET_FAIL_PREVIEW_ONLY', {
                schemaValid: true,
                geometryBuilt: true,
                targetComplianceStatus: 'TARGET_FAIL',
                formFidelityStatus: formStatus,
                activeStateChanged: false,
                previewStateChanged: true,
                operatorOverrideRequired: true,
                lastErrorSummary: (tc && (tc.blockers || tc.warnings || []).join('; ')) || 'Target compliance failed; preview only.'
            });
        }
        if (formStatus === 'FORM_INTENT_MISMATCH') {
            return setPhase(s, 'FORM_INTENT_MISMATCH_PREVIEW_ONLY', {
                schemaValid: true,
                geometryBuilt: true,
                targetComplianceStatus: targetStatus,
                formFidelityStatus: formStatus,
                activeStateChanged: false,
                previewStateChanged: true,
                operatorOverrideRequired: true,
                lastErrorSummary: (cf && (cf.blockers || cf.reasons || []).join('; ')) || 'Form intent mismatch; preview only.'
            });
        }
        return setPhase(s, 'PREVIEW_READY', {
            schemaValid: true,
            geometryBuilt: true,
            targetComplianceStatus: targetStatus,
            formFidelityStatus: formStatus,
            activeStateChanged: false,
            previewStateChanged: true,
            operatorOverrideRequired: false,
            lastErrorSummary: ''
        });
    }

    function canAccept(appState, decision) {
        const phase = current(appState).phase;
        const blockedPhase = phase === 'TARGET_FAIL_PREVIEW_ONLY' || phase === 'FORM_INTENT_MISMATCH_PREVIEW_ONLY' || phase === 'INFEASIBLE' || phase === 'VALIDATION_REJECTED' || phase === 'APPLY_BLOCKED' || phase === 'APPLY_FAILED';
        if (blockedPhase) return false;
        if (decision && decision.acceptedActiveAllowed === false) return false;
        return !!(ensureState(appState).freeformLoftPreview);
    }

    function acceptPreviewAsActive(appState, decision, override) {
        const s = ensureState(appState);
        if (!canAccept(s, decision) && !override) {
            return {
                ok: false,
                state: setPhase(s, 'APPLY_BLOCKED', {
                    activeStateChanged: false,
                    operatorOverrideRequired: true,
                    lastErrorSummary: 'Accept preview as active blocked by target/form/infeasibility gate.'
                }),
                errors: ['Accept preview as active blocked by target/form/infeasibility gate.']
            };
        }
        const active = clone(s.freeformLoftPreview || {});
        active.role = 'active';
        active.revision = nowRevision('active');
        s.freeformLoftActive = active;
        s.freeformLoft = clone(active);
        s.freeformLastAcceptedAnalysis = clone(s.freeformLastPreviewAnalysis || null);
        s.freeformAcceptedActiveRevision = active.revision;
        return {
            ok: true,
            state: setPhase(s, 'ACCEPTED_ACTIVE', {
                schemaValid: true,
                geometryBuilt: true,
                activeStateChanged: true,
                previewStateChanged: false,
                acceptedActiveRevision: active.revision,
                previewRevision: s.freeformApplyState.previewRevision,
                operatorOverrideRequired: false,
                lastErrorSummary: ''
            }),
            active
        };
    }

    function rejectPreview(appState, reason) {
        const s = ensureState(appState);
        if (s.freeformLoftPreview) {
            s.freeformLoftRejected = Object.assign({}, clone(s.freeformLoftPreview), {
                role: 'rejected',
                rejectedReason: reason || 'operator rejected preview'
            });
        }
        s.freeformLoftPreview = null;
        s.freeformLastPreviewAnalysis = null;
        return setPhase(s, 'EMPTY', {
            activeStateChanged: false,
            previewStateChanged: false,
            previewRevision: null,
            lastErrorSummary: reason || ''
        });
    }

    root.FreeformApplyStateMachine = Object.freeze({
        PHASES: PHASES.slice(),
        ensureState,
        current,
        setPhase,
        markParsing,
        markParseError,
        markSchemaValidation,
        markSchemaRejected,
        markSchemaValid,
        beginPreview,
        markPreview,
        classifyPreview,
        canAccept,
        acceptPreviewAsActive,
        rejectPreview,
        nowRevision
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
