/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-acceptance-gates.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053E Freeform acceptance gates.
// Local deterministic source gate only; no browser/WebGL/CAD/FEA/manufacturing claim.

(function(root) {
    'use strict';

    function list(value) {
        return Array.isArray(value) ? value : (value ? [String(value)] : []);
    }

    function weakCobraReasons(cobra) {
        const c = cobra || {};
        const reasons = [];
        if (c.lowLongProfileScore < 60) reasons.push('Cobra intent detected but lowLongProfileScore=' + c.lowLongProfileScore + ' below required 60');
        if (c.rearTerminalSeparationScore < 60) reasons.push('rearTerminalSeparationScore=' + c.rearTerminalSeparationScore + ' below required 60');
        if (c.asymmetricWingBodyScore < 45) reasons.push('asymmetricWingBodyScore=' + c.asymmetricWingBodyScore + ' weak for wing-body intent');
        return reasons.concat(list(c.blockers)).concat(list(c.reasons).filter(r => !/measurable Cobra form traits/.test(r)));
    }

    function evaluateAcceptance(analysisBundle, options) {
        const bundle = analysisBundle || {};
        const analysis = bundle.deterministicAnalysis || bundle.analysis || bundle;
        const target = bundle.targetCompliance || analysis.targetCompliance || {};
        const cobra = bundle.cobraFidelity || analysis.cobraFidelity || {};
        const feasibility = bundle.feasibility || bundle.freeformFeasibility || {};
        const blockers = [];
        const warnings = [];

        if (target.status === 'TARGET_FAIL' || target.overall === 'BLOCKER') {
            blockers.push('targetCompliance blocks accepted active design: ' + list(target.blockers || target.warnings).join('; '));
        }
        if (cobra.status === 'FORM_INTENT_MISMATCH') {
            blockers.push.apply(blockers, weakCobraReasons(cobra));
        }
        if (cobra.cobraIntentDetected && cobra.lowLongProfileScore < 40) {
            blockers.push('lowLongProfileScore=' + cobra.lowLongProfileScore + ' below hard block threshold 40');
        } else if (cobra.cobraIntentDetected && cobra.lowLongProfileScore < 60) {
            warnings.push('lowLongProfileScore=' + cobra.lowLongProfileScore + ' below preferred 60');
        }
        if (/^INFEASIBLE/.test(String(feasibility.status || feasibility.classification || ''))) {
            blockers.push(feasibility.summary || 'INFEASIBLE_WITH_CURRENT_KERNEL');
        } else if (/SEVERE_TARGET/.test(String(feasibility.status || ''))) {
            blockers.push('feasibility solver requires repair before acceptance');
        }

        const acceptedActiveAllowed = blockers.length === 0;
        return {
            schema: 'td053e-freeform-acceptance-gates-v1',
            acceptedActiveAllowed,
            operatorOverrideRequired: !acceptedActiveAllowed,
            targetComplianceStatus: target.status || target.overall || 'NOT_RUN',
            formFidelityStatus: cobra.status || 'NOT_RUN',
            feasibilityStatus: feasibility.status || feasibility.classification || 'NOT_RUN',
            blockers,
            warnings: warnings.concat(list(target.warnings)).concat(list(cobra.warnings))
        };
    }

    function canAcceptActive(analysisBundle) {
        return evaluateAcceptance(analysisBundle).acceptedActiveAllowed;
    }

    root.FreeformAcceptanceGates = Object.freeze({
        evaluateAcceptance,
        canAcceptActive,
        weakCobraReasons
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
