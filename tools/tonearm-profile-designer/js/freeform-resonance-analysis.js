/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-resonance-analysis.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 freeform effective-mass and resonance proxy helpers.
// Deterministic local proxy; not FEA and not a measured resonance result.

(function(root) {
    'use strict';

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function round(value, digits) {
        const f = Math.pow(10, digits || 6);
        return Math.round(Number(value) * f) / f;
    }

    function resonanceHz(effectiveMassG, cartridgeMassG, complianceCu) {
        const m = Math.max(0, finite(effectiveMassG, 0) + finite(cartridgeMassG, 0));
        const c = finite(complianceCu, 0);
        if (!(m > 0) || !(c > 0)) return 0;
        return 1000 / (2 * Math.PI * Math.sqrt(m * c));
    }

    function targetStatus(hz, range) {
        const lo = range[0], hi = range[1];
        if (!(hz > 0)) return 'PARTIAL_PASS';
        if (hz >= lo && hz <= hi) return 'PASS';
        if (hz >= lo - 1.5 && hz <= hi + 1.5) return 'WARN';
        return 'FAIL';
    }

    function complianceFromState(state, warnings) {
        const targets = (state && (state.targets || state.analysisTargets)) || {};
        const cartridge = state && state.cartridge ? state.cartridge : {};
        const v = finite(targets.complianceVerticalCu, finite(targets.compliance10Hz, finite(cartridge.complianceVerticalCu, NaN)));
        const h = finite(targets.complianceHorizontalCu, finite(targets.compliance10Hz, finite(cartridge.complianceHorizontalCu, NaN)));
        let vertical = v;
        let horizontal = h;
        if (!Number.isFinite(vertical) && Number.isFinite(horizontal)) {
            vertical = horizontal;
            warnings.push('compliance_vertical_missing_used_horizontal');
        }
        if (!Number.isFinite(horizontal) && Number.isFinite(vertical)) {
            horizontal = vertical;
            warnings.push('compliance_horizontal_missing_used_vertical');
        }
        if (!Number.isFinite(vertical) && !Number.isFinite(horizontal)) {
            vertical = 12;
            horizontal = 12;
            warnings.push('missing_cartridge_compliance_used_default_12cu_partial_pass');
        }
        return { vertical, horizontal };
    }

    function cartridgeMassFromState(state, warnings) {
        const targets = (state && (state.targets || state.analysisTargets)) || {};
        const cartridge = state && state.cartridge ? state.cartridge : {};
        const mass = finite(targets.cartridgeMassG, finite(cartridge.massG, NaN));
        if (Number.isFinite(mass)) return mass;
        warnings.push('missing_cartridge_mass_used_default_7g_partial_pass');
        return 7;
    }

    function effectiveMassFromInertia(inertia, effectiveLengthMm) {
        const len2 = Math.pow(Math.max(1, finite(effectiveLengthMm, 237.05)), 2);
        const iyy = finite(inertia && (inertia.Iyy !== undefined ? inertia.Iyy : inertia.iyyGmm2), 0);
        const izz = finite(inertia && (inertia.Izz !== undefined ? inertia.Izz : inertia.izzGmm2), 0);
        return {
            verticalG: Math.max(0.001, iyy / len2),
            horizontalG: Math.max(0.001, izz / len2)
        };
    }

    function bendingAndTorsionProxies(stationAnalysis, totalMassG, centerlineLengthMm) {
        const stations = Array.isArray(stationAnalysis) ? stationAnalysis : [];
        const n = Math.max(1, stations.length);
        const avgEI = stations.reduce((s, r) => s + Math.min(finite(r.EIyyProxy, 0), finite(r.EIzzProxy, 0)), 0) / n;
        const avgGJ = stations.reduce((s, r) => s + finite(r.GJProxy, 0), 0) / n;
        const mass = Math.max(0.001, finite(totalMassG, 1));
        const lenM = Math.max(0.01, finite(centerlineLengthMm, 237.05) / 1000);
        // Very conservative beam-like proxies with unit-normalized constants; status labels identify these as not FEA.
        const firstBending = Math.max(1, Math.sqrt(Math.max(1, avgEI) / mass) / Math.pow(lenM * 1000, 0.65));
        const firstTorsion = Math.max(1, Math.sqrt(Math.max(1, avgGJ) / mass) / Math.pow(lenM * 1000, 0.55));
        return {
            firstBendingModeProxyHz: round(firstBending, 6),
            firstTorsionModeProxyHz: round(firstTorsion, 6),
            bendingProxyClaim: 'not_fea',
            torsionProxyClaim: 'not_fea',
            inputs: {
                averageEIProxy: round(avgEI, 6),
                averageGJProxy: round(avgGJ, 6),
                totalMassG: round(mass, 6),
                centerlineLengthMm: round(centerlineLengthMm, 6)
            }
        };
    }

    function analyzeResonanceAndModes(context) {
        const warnings = [];
        const state = (context && context.state) || {};
        const inertia = (context && context.inertiaTensorPivotGmm2) || {};
        const effectiveLengthMm = finite(context && context.effectiveLengthMm, 237.05);
        const eff = effectiveMassFromInertia(inertia, effectiveLengthMm);
        const compliance = complianceFromState(state, warnings);
        const cartridgeMassG = cartridgeMassFromState(state, warnings);
        const verticalHz = resonanceHz(eff.verticalG, cartridgeMassG, compliance.vertical);
        const horizontalHz = resonanceHz(eff.horizontalG, cartridgeMassG, compliance.horizontal);
        const range = [8, 12];
        const vStatus = targetStatus(verticalHz, range);
        const hStatus = targetStatus(horizontalHz, range);
        const mode = bendingAndTorsionProxies(context.stationAnalysis || [], context.totalMassG, context.centerlineLengthMm || effectiveLengthMm);
        const partial = warnings.length > 0;
        return {
            effectiveMassVerticalG: round(eff.verticalG, 6),
            effectiveMassHorizontalG: round(eff.horizontalG, 6),
            cartridgeArmResonanceVerticalHz: round(verticalHz, 6),
            cartridgeArmResonanceHorizontalHz: round(horizontalHz, 6),
            lfResonance: {
                verticalHz: round(verticalHz, 6),
                horizontalHz: round(horizontalHz, 6),
                targetRangeHz: range,
                status: partial ? 'PARTIAL_PASS' : ((vStatus === 'PASS' && hStatus === 'PASS') ? 'PASS' : (vStatus === 'FAIL' || hStatus === 'FAIL' ? 'FAIL' : 'WARN')),
                inputs: {
                    effectiveMassVerticalG: round(eff.verticalG, 6),
                    effectiveMassHorizontalG: round(eff.horizontalG, 6),
                    cartridgeMassG: round(cartridgeMassG, 6),
                    complianceVerticalCu: round(compliance.vertical, 6),
                    complianceHorizontalCu: round(compliance.horizontal, 6)
                },
                warning: partial ? 'missing_or_shared_cartridge_inputs_partial_pass' : null
            },
            firstBendingModeProxyHz: mode.firstBendingModeProxyHz,
            firstTorsionModeProxyHz: mode.firstTorsionModeProxyHz,
            bendingProxyClaim: mode.bendingProxyClaim,
            torsionProxyClaim: mode.torsionProxyClaim,
            headshellInterfaceModeProxyHz: round(mode.firstBendingModeProxyHz * 1.35, 6),
            counterweightAssemblyModeProxyHz: round(mode.firstTorsionModeProxyHz * 0.72, 6),
            warnings
        };
    }

    root.FreeformResonanceAnalysis = Object.freeze({
        resonanceHz,
        effectiveMassFromInertia,
        analyzeResonanceAndModes,
        bendingAndTorsionProxies
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
