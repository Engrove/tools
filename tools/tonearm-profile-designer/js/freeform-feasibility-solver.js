/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-feasibility-solver.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053E Freeform feasibility solver and repair hint generator.
// Local deterministic proxy only; no browser/WebGL/CAD/FEA/manufacturing claim.

(function(root) {
    'use strict';

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function firstNumber() {
        for (let i = 0; i < arguments.length; i += 1) {
            const n = Number(arguments[i]);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return null;
    }

    function targetRange(value, lo, hi) {
        if (Array.isArray(value) && value.length >= 2) {
            const a = Number(value[0]), b = Number(value[1]);
            if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
        }
        const n = firstNumber(value);
        if (n) return [n, n];
        return [lo, hi];
    }

    function collectTargets(targets, analysisTargets) {
        if (root.FreeformTargetCompliance && typeof root.FreeformTargetCompliance.collectTargets === 'function') {
            return root.FreeformTargetCompliance.collectTargets(targets, analysisTargets);
        }
        const t = targets || {};
        const a = analysisTargets || {};
        return {
            massTargetG: firstNumber(t.massG, t.movingMassG, a.targetTotalMovingMassG, a.targetMassG),
            effectiveMassVerticalTargetG: firstNumber(t.effectiveMassVerticalG, t.effectiveMassG, a.targetEffectiveMassVerticalG, a.effectiveMassG),
            effectiveMassHorizontalTargetG: firstNumber(t.effectiveMassHorizontalG, t.effectiveMassG, a.targetEffectiveMassHorizontalG, a.effectiveMassG),
            lfResonanceRangeHz: targetRange(t.lfResonanceRangeHz || t.lfResonanceHz || a.targetLfResonanceRangeHz || a.targetVerticalResonanceHz, 8, 12),
            balanceResidualMaxGmm: firstNumber(t.counterweightBalanceResidualMaxGmm, t.balanceResidualMaxGmm, a.balanceResidualMaxGmm)
        };
    }

    function ratio(computed, target) {
        const c = finite(computed, 0), t = finite(target, 0);
        if (!(c > 0) || !(t > 0)) return null;
        return c / t;
    }

    function addHint(hints, metric, direction, computed, target, severity, extra) {
        hints.push(Object.assign({
            metric,
            direction,
            computed,
            target,
            severity: severity || 'WARN'
        }, extra || {}));
    }

    function generateRepairHints(analysis, targets, analysisTargets) {
        const a = analysis || {};
        const t = collectTargets(targets, analysisTargets);
        const hints = [];
        const mass = firstNumber(a.massG, a.movingMassG, a.mass && a.mass.totalMassG);
        const effV = firstNumber(a.effectiveMassVerticalG);
        const effH = firstNumber(a.effectiveMassHorizontalG, effV);
        const lfV = firstNumber(a.cartridgeArmResonanceVerticalHz, a.lfResonance && a.lfResonance.verticalHz);
        const lfH = firstNumber(a.cartridgeArmResonanceHorizontalHz, a.lfResonance && a.lfResonance.horizontalHz, lfV);
        const balance = Math.abs(finite(a.counterweightBalanceResidualGmm, 0));

        if (ratio(mass, t.massTargetG) > 1.8) {
            addHint(hints, 'mass', 'reduce_volume_or_density', mass, t.massTargetG, ratio(mass, t.massTargetG) > 3 ? 'BLOCKER' : 'WARN');
        }
        const effTarget = t.effectiveMassVerticalTargetG || t.effectiveMassHorizontalTargetG;
        if (ratio(effV, effTarget) > 2.0 || ratio(effH, effTarget) > 2.0) {
            addHint(hints, 'effectiveMass', 'move_mass_toward_pivot_or_reduce_body_mass', Math.max(finite(effV, 0), finite(effH, 0)), effTarget, Math.max(ratio(effV, effTarget) || 0, ratio(effH, effTarget) || 0) > 3 ? 'BLOCKER' : 'WARN');
        }
        const range = t.lfResonanceRangeHz || [8, 12];
        if ((lfV && (lfV < range[0] || lfV > range[1])) || (lfH && (lfH < range[0] || lfH > range[1]))) {
            addHint(hints, 'lfResonance', 'reduce_effective_mass_or_revise_compliance_target', Math.min(finite(lfV, Infinity), finite(lfH, Infinity)), null, 'BLOCKER', { targetRange: range });
        }
        if (t.balanceResidualMaxGmm && balance > t.balanceResidualMaxGmm) {
            addHint(hints, 'balance', 'move_com_toward_pivot_or_counterweight_once', balance, t.balanceResidualMaxGmm, balance > t.balanceResidualMaxGmm * 3 ? 'BLOCKER' : 'WARN');
        }
        if (!hints.length) {
            hints.push({ metric: 'all', direction: 'no deterministic repair needed', computed: null, target: null, severity: 'PASS_WITH_SCOPE' });
        }
        return hints;
    }

    function classifyInfeasible(analysis, targets, analysisTargets, state) {
        const a = analysis || {};
        const t = collectTargets(targets, analysisTargets);
        const mass = firstNumber(a.massG, a.movingMassG, a.mass && a.mass.totalMassG);
        const effV = firstNumber(a.effectiveMassVerticalG);
        const effH = firstNumber(a.effectiveMassHorizontalG, effV);
        const severeMass = ratio(mass, t.massTargetG) > 3;
        const severeEff = Math.max(ratio(effV, t.effectiveMassVerticalTargetG || t.effectiveMassHorizontalTargetG) || 0, ratio(effH, t.effectiveMassHorizontalTargetG || t.effectiveMassVerticalTargetG) || 0) > 3;
        const s = state || {};
        const fl = s.freeformLoftPreview || s.freeformLoftActive || s.freeformLoft || s;
        const rings = Array.isArray(fl.rings) ? fl.rings : [];
        const minWall = rings.length ? Math.min.apply(null, rings.map(r => finite(r.wallThicknessMm, Infinity)).filter(v => Number.isFinite(v))) : Infinity;
        const density = finite((fl.material && fl.material.densityGPerCm3) || (fl.analysisTargets && fl.analysisTargets.materialDensityGPerCm3), Infinity);
        const kernelCannotThinMuch = (minWall <= 0.65 || !Number.isFinite(minWall)) && (density <= 1.25 || !Number.isFinite(density));
        if (severeMass || severeEff) {
            return kernelCannotThinMuch
                ? 'INFEASIBLE_WITH_CURRENT_KERNEL'
                : 'SEVERE_TARGET_MISS_REPAIR_REQUIRED';
        }
        return 'FEASIBLE_OR_REPAIRABLE_WITHIN_KERNEL';
    }

    function proposeRepairPatch(state, analysis, targets, analysisTargets) {
        const hints = generateRepairHints(analysis, targets, analysisTargets);
        const patch = { ringPatch: { rings: [] }, featurePatch: {}, unsupportedAttributes: [] };
        const fl = (state && (state.freeformLoftPreview || state.freeformLoftActive || state.freeformLoft)) || state || {};
        (fl.rings || []).forEach(r => {
            patch.ringPatch.rings.push({
                id: r.id,
                widthMm: Math.max(4, finite(r.widthMm, 8) * 0.72),
                heightMm: Math.max(3, finite(r.heightMm, 5) * 0.72),
                wallThicknessMm: Math.max(0.65, finite(r.wallThicknessMm, 1.0) * 0.8)
            });
        });
        patch.featurePatch.counterweightStack = { enabled: false, reason: 'target repair: disable counterweightStack unless balance solver explicitly requires it' };
        patch.unsupportedAttributes.push('If target mass/effective-mass requires real hollow CFRP laminate beyond current solid/proxy kernel, return infeasible summary instead of fake deterministic success.');
        patch.repairHints = hints;
        return patch;
    }

    function analyzeFeasibility(state, analysis, targets, analysisTargets) {
        const hints = generateRepairHints(analysis || {}, targets || {}, analysisTargets || {});
        const classification = classifyInfeasible(analysis || {}, targets || {}, analysisTargets || {}, state || {});
        const blockerHints = hints.filter(h => h.severity === 'BLOCKER');
        const status = classification === 'INFEASIBLE_WITH_CURRENT_KERNEL' ? 'INFEASIBLE_WITH_CURRENT_KERNEL' :
            (blockerHints.length ? 'SEVERE_TARGET_MISS_REPAIR_REQUIRED' : 'FEASIBLE_OR_REPAIRABLE_WITHIN_KERNEL');
        return {
            schema: 'td053e-freeform-feasibility-v1',
            status,
            classification,
            repairHints: hints,
            proposedRepairPatch: proposeRepairPatch(state || {}, analysis || {}, targets || {}, analysisTargets || {}),
            summary: status === 'INFEASIBLE_WITH_CURRENT_KERNEL'
                ? 'Targets are not representable with the current solid/proxy writable kernel without hollow/ply laminate model support.'
                : (blockerHints.length ? 'Preview requires repair before accepted active design.' : 'No severe infeasibility detected within local proxy scope.')
        };
    }

    root.FreeformFeasibilitySolver = Object.freeze({
        analyzeFeasibility,
        generateRepairHints,
        proposeRepairPatch,
        classifyInfeasible,
        collectTargets
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
