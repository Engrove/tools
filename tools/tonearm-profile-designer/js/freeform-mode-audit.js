/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-mode-audit.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053F Freeform geometry-mode / render-export-report source audit.
// Local state/source audit only; no browser/WebGL/STL/CAD/FEA/manufacturing claim.

(function(root) {
    'use strict';

    function hasFreeformLoft(state) {
        return !!(state && (
            (state.freeformLoftActive && state.freeformLoftActive.centerline && Array.isArray(state.freeformLoftActive.rings)) ||
            (state.freeformLoftPreview && state.freeformLoftPreview.centerline && Array.isArray(state.freeformLoftPreview.rings)) ||
            (state.freeformLoft && state.freeformLoft.centerline && Array.isArray(state.freeformLoft.rings))
        ));
    }

    function hasAcceptedActive(state) {
        return !!(state && state.freeformLoftActive && state.freeformLoftActive.centerline && Array.isArray(state.freeformLoftActive.rings));
    }

    function auditGeometryMode(state, renderSource, exportSource, reportSource, extra) {
        const s = state || root.state || {};
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.buildGeometryModeAudit === 'function') {
            return root.FreeformLiveStateBinding.buildGeometryModeAudit(s, Object.assign({
                renderGeometrySource: renderSource,
                exportGeometrySource: exportSource,
                reportGeometrySource: reportSource,
                stlSource: extra && extra.stlSource
            }, extra || {}));
        }
        const stateMode = s.geometryMode === 'freeform' ? 'freeform' : 'parametric';
        const active = hasAcceptedActive(s);
        const freeformPresent = hasFreeformLoft(s);
        const renderGeometrySource = renderSource || (stateMode === 'freeform' && active ? 'freeformLoftKernel' : 'parametricGeometry');
        const exportGeometrySource = exportSource || (stateMode === 'freeform' && active ? 'freeformLoftKernel' : 'parametricMesh');
        const reportGeometrySource = reportSource || (stateMode === 'freeform' && active ? 'freeformPhysicalAnalysis' : 'legacyParametricPhysics');
        const stlSource = (extra && extra.stlSource) || exportGeometrySource;
        const silentFallbackDetected = !!(stateMode === 'freeform' && active && (
            renderGeometrySource !== 'freeformLoftKernel' ||
            exportGeometrySource !== 'freeformLoftKernel' ||
            reportGeometrySource !== 'freeformPhysicalAnalysis' ||
            stlSource !== 'freeformLoftKernel'
        ));
        const modeMismatch = !!(stateMode !== 'freeform' && freeformPresent) || silentFallbackDetected;
        return {
            schema: 'td053f-freeform-mode-audit-v1',
            stateGeometryMode: stateMode,
            stateRole: active ? 'active' : (s.freeformLoftPreview ? 'preview' : 'parametric'),
            reportSubject: active ? 'accepted active freeform' : (s.freeformLoftPreview ? 'preview/quarantine freeform' : 'parametric'),
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

    function forceFreeformMode(state) {
        const s = state || root.state || {};
        s.geometryMode = 'freeform';
        return s;
    }

    root.FreeformModeAudit = Object.freeze({
        auditGeometryMode,
        forceFreeformMode,
        hasFreeformLoft,
        hasAcceptedActive
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
