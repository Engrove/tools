/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-target-compliance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053D Freeform target compliance / physical sanity escalation.
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

    function rangeFrom(value, fallbackMin, fallbackMax) {
        if (Array.isArray(value) && value.length >= 2) {
            const a = Number(value[0]), b = Number(value[1]);
            if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a,b), Math.max(a,b)];
        }
        if (value && typeof value === 'object') {
            const min = firstNumber(value.min, value.minG, value.minHz, value.lower);
            const max = firstNumber(value.max, value.maxG, value.maxHz, value.upper);
            if (min !== null && max !== null) return [Math.min(min,max), Math.max(min,max)];
        }
        const n = firstNumber(value);
        if (n !== null) return [n, n];
        return [fallbackMin, fallbackMax];
    }

    function collectTargets(targets, analysisTargets) {
        const t = targets || {};
        const a = analysisTargets || {};
        const massTarget = firstNumber(
            t.massG, t.movingMassG, t.targetMassG, t.targetMovingMassG,
            a.massG, a.movingMassG, a.targetMassG, a.targetMovingMassG, a.targetBodyMassG, a.targetTotalMovingMassG
        );
        const effV = firstNumber(t.effectiveMassVerticalG, t.targetEffectiveMassVerticalG, t.effectiveMassG, t.targetEffectiveMassG, a.effectiveMassVerticalG, a.targetEffectiveMassVerticalG, a.effectiveMassG);
        const effH = firstNumber(t.effectiveMassHorizontalG, t.targetEffectiveMassHorizontalG, t.effectiveMassG, t.targetEffectiveMassG, a.effectiveMassHorizontalG, a.targetEffectiveMassHorizontalG, a.effectiveMassG);
        const resonanceRange = rangeFrom(t.lfResonanceRangeHz || t.targetLfResonanceRangeHz || t.lfResonanceHzRange || a.lfResonanceRangeHz || a.targetLfResonanceRangeHz, 8, 12);
        const resonanceCenter = firstNumber(t.lfResonanceHz, t.targetLFResonanceHz, t.targetLfResonanceHz, a.lfResonanceHz, a.targetLFResonanceHz, a.targetLfResonanceHz, a.targetVerticalResonanceHz, a.targetHorizontalResonanceHz);
        const balanceMax = firstNumber(t.counterweightBalanceResidualMaxGmm, t.balanceResidualMaxGmm, a.counterweightBalanceResidualMaxGmm, a.balanceResidualMaxGmm);
        return {
            massTargetG: massTarget,
            effectiveMassVerticalTargetG: effV,
            effectiveMassHorizontalTargetG: effH || effV,
            lfResonanceRangeHz: resonanceCenter ? [Math.max(0, resonanceCenter - 2), resonanceCenter + 2] : resonanceRange,
            balanceResidualMaxGmm: balanceMax
        };
    }

    function statusByRatio(computed, target, warnTol, failTol) {
        if (!(target > 0) || !(computed > 0)) return 'WARN';
        if (computed > target * failTol) return 'FAIL';
        if (computed > target * warnTol) return 'WARN';
        return 'PASS';
    }

    function statusByRange(value, range) {
        const lo = Number(range && range[0]), hi = Number(range && range[1]);
        if (!Number.isFinite(value) || !Number.isFinite(lo) || !Number.isFinite(hi)) return 'WARN';
        if (value < lo || value > hi) return 'FAIL';
        return 'PASS';
    }

    function maxAbs(v) {
        const n = Math.abs(Number(v));
        return Number.isFinite(n) ? n : 0;
    }

    function evaluateTargetCompliance(deterministicAnalysis, targets, analysisTargets) {
        const a = deterministicAnalysis || {};
        const t = collectTargets(targets, analysisTargets);
        const massComputed = firstNumber(a.massG, a.movingMassG, a.mass && a.mass.totalMassG);
        const effVComputed = firstNumber(a.effectiveMassVerticalG);
        const effHComputed = firstNumber(a.effectiveMassHorizontalG);
        const lfV = firstNumber(a.cartridgeArmResonanceVerticalHz, a.lfResonance && a.lfResonance.verticalHz);
        const lfH = firstNumber(a.cartridgeArmResonanceHorizontalHz, a.lfResonance && a.lfResonance.horizontalHz, lfV);
        const balance = maxAbs(a.counterweightBalanceResidualGmm);

        const mass = t.massTargetG ? statusByRatio(massComputed || 0, t.massTargetG, 1.25, 1.8) : 'WARN';
        const effectiveMassV = t.effectiveMassVerticalTargetG ? statusByRatio(effVComputed || 0, t.effectiveMassVerticalTargetG, 1.35, 2.7) : 'WARN';
        const effectiveMassH = t.effectiveMassHorizontalTargetG ? statusByRatio(effHComputed || 0, t.effectiveMassHorizontalTargetG, 1.35, 2.7) : effectiveMassV;
        const lfResonanceV = statusByRange(lfV, t.lfResonanceRangeHz || [8, 12]);
        const lfResonanceH = statusByRange(lfH, t.lfResonanceRangeHz || [8, 12]);
        let balanceStatus = 'WARN';
        if (t.balanceResidualMaxGmm) balanceStatus = balance > t.balanceResidualMaxGmm * 2 ? 'FAIL' : (balance > t.balanceResidualMaxGmm ? 'WARN' : 'PASS');

        const failCount = [mass, effectiveMassV, effectiveMassH, lfResonanceV, lfResonanceH, balanceStatus].filter(s => s === 'FAIL').length;
        const warnCount = [mass, effectiveMassV, effectiveMassH, lfResonanceV, lfResonanceH, balanceStatus].filter(s => s === 'WARN').length;
        const overall = failCount > 0 ? 'BLOCKER' : (warnCount > 0 ? 'PARTIAL_PASS' : 'PASS_WITH_SCOPE');

        const blockers = [];
        if (mass === 'FAIL') blockers.push('mass target failed: computed ' + massComputed + ' g vs target ' + t.massTargetG + ' g');
        if (effectiveMassV === 'FAIL' || effectiveMassH === 'FAIL') blockers.push('effective mass target failed: computed V/H ' + effVComputed + '/' + effHComputed + ' g vs target V/H ' + t.effectiveMassVerticalTargetG + '/' + t.effectiveMassHorizontalTargetG + ' g');
        if (lfResonanceV === 'FAIL' || lfResonanceH === 'FAIL') blockers.push('LF resonance target failed: computed V/H ' + lfV + '/' + lfH + ' Hz vs target range ' + (t.lfResonanceRangeHz || []).join('..') + ' Hz');
        if (balanceStatus === 'FAIL') blockers.push('balance residual target failed: ' + balance + ' gmm exceeds max ' + t.balanceResidualMaxGmm + ' gmm');

        return {
            schema: 'td053d-freeform-target-compliance-v1',
            targets: t,
            computed: {
                massG: massComputed,
                effectiveMassVerticalG: effVComputed,
                effectiveMassHorizontalG: effHComputed,
                lfResonanceVerticalHz: lfV,
                lfResonanceHorizontalHz: lfH,
                balanceResidualAbsGmm: balance
            },
            mass,
            effectiveMass: (effectiveMassV === 'FAIL' || effectiveMassH === 'FAIL') ? 'FAIL' : ((effectiveMassV === 'WARN' || effectiveMassH === 'WARN') ? 'WARN' : 'PASS'),
            lfResonance: (lfResonanceV === 'FAIL' || lfResonanceH === 'FAIL') ? 'FAIL' : 'PASS',
            balance: balanceStatus,
            overall,
            status: overall === 'BLOCKER' ? 'TARGET_FAIL' : overall,
            blockers,
            warnings: blockers.length ? blockers : (overall === 'PASS_WITH_SCOPE' ? ['deterministic proxy values are within supplied target compliance bounds'] : ['target compliance is partial because one or more targets are missing or warning-level'])
        };
    }

    root.FreeformTargetCompliance = Object.freeze({
        evaluateTargetCompliance,
        collectTargets
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
