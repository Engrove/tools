/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-form-fidelity.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053D Freeform Cobra form-intent fidelity scoring.
// Local deterministic proxy only; no browser/WebGL/CAD/FEA/manufacturing claim.

(function(root) {
    'use strict';

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp01(value) {
        const n = finite(value, 0);
        return Math.max(0, Math.min(1, n));
    }

    function score100(value) {
        return Math.round(clamp01(value) * 1000) / 10;
    }

    function stateFrom(state, geometry) {
        return (state && state.freeformLoft) || state || (geometry && geometry.state) || {};
    }

    function ringsOf(state, geometry) {
        const s = stateFrom(state, geometry);
        return Array.isArray(s.rings) ? s.rings : [];
    }

    function pointsOf(state, geometry) {
        const s = stateFrom(state, geometry);
        return s.centerline && Array.isArray(s.centerline.points) ? s.centerline.points : [];
    }

    function featuresOf(state, geometry) {
        const s = stateFrom(state, geometry);
        return s.features || {};
    }

    function boundsOf(geometry) {
        if (geometry && geometry.bbox) return geometry.bbox;
        const vertices = geometry && geometry.mesh && Array.isArray(geometry.mesh.vertices) ? geometry.mesh.vertices : [];
        if (!vertices.length) return null;
        return vertices.reduce((acc, v) => ({
            minX: Math.min(acc.minX, finite(v.x, 0)),
            maxX: Math.max(acc.maxX, finite(v.x, 0)),
            minY: Math.min(acc.minY, finite(v.y, 0)),
            maxY: Math.max(acc.maxY, finite(v.y, 0)),
            minZ: Math.min(acc.minZ, finite(v.z, 0)),
            maxZ: Math.max(acc.maxZ, finite(v.z, 0))
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
    }

    function average(list, map) {
        const values = (list || []).map(map).filter(v => Number.isFinite(Number(v))).map(Number);
        if (!values.length) return 0;
        return values.reduce((a,b) => a + b, 0) / values.length;
    }

    function max(list, map) {
        const values = (list || []).map(map).filter(v => Number.isFinite(Number(v))).map(Number);
        return values.length ? Math.max.apply(null, values) : 0;
    }

    function pickRings(rings, lo, hi) {
        return (rings || []).filter(r => finite(r.s, 0) >= lo && finite(r.s, 0) <= hi);
    }

    function intentText(state, geometry, analysisTargets) {
        const s = stateFrom(state, geometry);
        return [
            s.designIntent,
            s.preset,
            analysisTargets && JSON.stringify(analysisTargets),
            s.targets && JSON.stringify(s.targets)
        ].filter(Boolean).join(' ').toLowerCase();
    }

    function hasCobraIntent(state, geometry, analysisTargets) {
        const txt = intentText(state, geometry, analysisTargets);
        return /(cobra|cfrp|carbon|monocoque|wing[-\s]?body|canopy|asymmetric|asymmetrisk)/i.test(txt);
    }

    function scoreLongLowProfile(state, geometry) {
        const b = boundsOf(geometry);
        if (!b) return 0;
        const length = Math.max(1, finite(b.maxX, 0) - finite(b.minX, 0));
        const height = Math.max(0, finite(b.maxZ, 0) - finite(b.minZ, 0));
        const ratio = height / length;
        // Full score for long/low profile at <= 0.055, zero at >= 0.16.
        return score100((0.16 - ratio) / (0.16 - 0.055));
    }

    function scoreAsymmetricWingBody(state, geometry) {
        const rings = ringsOf(state, geometry);
        const midRear = pickRings(rings, 0.28, 0.86);
        if (!midRear.length) return 0;
        const asym = average(midRear, r => Math.abs(finite(r.asymmetryY, 0)) + Math.abs(finite(r.asymmetryZ, 0)));
        const shapeBonus = midRear.some(r => /asymmetric|crescent|egg|wing|superellipse/i.test(String(r.shapeFamily || ''))) ? 0.25 : 0;
        const widthProgression = average(pickRings(rings, 0.28, 0.9), r => finite(r.widthMm, 0)) /
            Math.max(1, average(pickRings(rings, 0, 0.18), r => finite(r.widthMm, 0)));
        const wing = clamp01((widthProgression - 0.62) / 0.35);
        return score100((asym / 0.22) * 0.55 + shapeBonus + wing * 0.25);
    }

    function scoreFrontCanopy(state, geometry) {
        const rings = ringsOf(state, geometry);
        const front = pickRings(rings, 0, 0.18);
        if (!front.length) return 0;
        const flat = average(front, r => finite(r.bottomFlatness, 0));
        const canopy = max(front, r => finite(r.topRidgeHeightMm, 0));
        const lowFront = 1 - clamp01((average(front, r => finite(r.heightMm, 0)) - 4.5) / 6);
        const headshell = featuresOf(state, geometry).integratedHeadshell || {};
        const integratedBonus = headshell.enabled && headshell.integrated && headshell.detachable === false ? 0.2 : 0;
        return score100(flat * 0.35 + clamp01(canopy / 1.0) * 0.25 + lowFront * 0.2 + integratedBonus);
    }

    function scoreRearRootApex(state, geometry) {
        const rings = ringsOf(state, geometry);
        const rear = pickRings(rings, 0.66, 0.92);
        if (!rear.length) return 0;
        const crescent = rear.some(r => /crescent|asymmetric|egg|superellipse/i.test(String(r.shapeFamily || ''))) ? 0.3 : 0;
        const ridge = clamp01(max(rear, r => finite(r.topRidgeHeightMm, 0)) / 1.2);
        const wall = clamp01((average(rear, r => finite(r.wallThicknessMm, 0)) - 1.05) / 0.55);
        const rearPoint = pointsOf(state, geometry).find(p => /rear|terminal|root/i.test(String(p.id || '')));
        const apexZ = rearPoint ? clamp01((finite(rearPoint.z, 0) + 1) / 8) : 0.35;
        return score100(crescent + ridge * 0.25 + wall * 0.2 + apexZ * 0.25);
    }

    function scoreIntegratedHeadshellContinuity(state, geometry) {
        const f = featuresOf(state, geometry);
        const headshell = f.integratedHeadshell || {};
        const titanium = f.titaniumMountPlate || {};
        const slots = f.cartridgeSlots || {};
        let score = 0;
        if (headshell.enabled && headshell.integrated && headshell.detachable === false) score += 0.4;
        if (headshell.cartridgeDatumValid && headshell.headshellPlaneValid) score += 0.2;
        if (titanium.enabled && titanium.type === 'structural_laminated_interface_plate' && titanium.looseUndersidePlate === false) score += 0.25;
        if (slots.enabled && slots.slotGeometryValid) score += 0.15;
        return score100(score);
    }

    function scoreRearTerminalSeparation(state, geometry) {
        const f = featuresOf(state, geometry);
        const rear = f.rearTerminal || {};
        const cw = f.counterweightStack || {};
        let score = 0;
        if (rear.enabled && rear.separateFeature) score += 0.35;
        if (cw.enabled && cw.separateFeature && cw.fakeWithRingOrTail === false) score += 0.45;
        if (cw.separateRearTerminalAssembly) score += 0.2;
        return score100(score);
    }

    function scoreCenterlineNotGeneric(state, geometry) {
        const pts = pointsOf(state, geometry);
        if (pts.length < 4) return 0;
        const zRange = max(pts, p => finite(p.z, 0)) - Math.min.apply(null, pts.map(p => finite(p.z, 0)));
        const rearDrop = Math.abs(finite(pts[pts.length - 1].z, 0) - finite(pts[Math.max(0, pts.length - 2)].z, 0));
        const named = pts.some(p => /headshell|mid|rear|terminal|root/i.test(String(p.id || ''))) ? 0.3 : 0;
        return score100(clamp01(zRange / 6) * 0.45 + clamp01(rearDrop / 3) * 0.25 + named);
    }

    function classifyFormIntent(analysis) {
        const a = analysis || {};
        const hasIntent = !!a.cobraIntentDetected;
        const score = finite(a.cobraFormFidelityScore, 0);
        const lowLong = finite(a.lowLongProfileScore, 0);
        const rearSep = finite(a.rearTerminalSeparationScore, 0);
        const sub = [
            a.frontCanopyScore,
            a.rearRootApexScore,
            a.asymmetricWingBodyScore,
            a.lowLongProfileScore,
            a.integratedHeadshellContinuityScore,
            a.rearTerminalSeparationScore
        ].map(v => finite(v, 0));
        const weak = sub.filter(v => v < 45).length;
        // TD053E: explicit Cobra/CFRP/monocoque/wing-body intent is not allowed
        // to hide a low-long or rear-terminal miss behind ordinary PARTIAL_PASS.
        if (hasIntent && lowLong < 60) return 'FORM_INTENT_MISMATCH';
        if (hasIntent && rearSep < 60) return 'FORM_INTENT_MISMATCH';
        if (hasIntent && (score < 68 || weak >= 2)) return 'FORM_INTENT_MISMATCH';
        if (score >= 78 && weak === 0) return 'PASS_WITH_SCOPE';
        if (score >= 60 && weak <= 1) return 'PARTIAL_PASS';
        return hasIntent ? 'FORM_INTENT_MISMATCH' : 'PARTIAL_PASS';
    }

    function analyzeCobraFidelity(state, geometry, analysisTargets) {
        const lowLong = scoreLongLowProfile(state, geometry);
        const asym = scoreAsymmetricWingBody(state, geometry);
        const canopy = scoreFrontCanopy(state, geometry);
        const rearApex = scoreRearRootApex(state, geometry);
        const continuity = scoreIntegratedHeadshellContinuity(state, geometry);
        const rearSep = scoreRearTerminalSeparation(state, geometry);
        const nonGeneric = scoreCenterlineNotGeneric(state, geometry);
        const total = Math.round((
            lowLong * 0.16 +
            asym * 0.20 +
            canopy * 0.18 +
            rearApex * 0.16 +
            continuity * 0.16 +
            rearSep * 0.10 +
            nonGeneric * 0.04
        ) * 10) / 10;
        const result = {
            schema: 'td053d-freeform-cobra-fidelity-v1',
            cobraIntentDetected: hasCobraIntent(state, geometry, analysisTargets),
            cobraFormFidelityScore: total,
            frontCanopyScore: canopy,
            rearRootApexScore: rearApex,
            asymmetricWingBodyScore: asym,
            lowLongProfileScore: lowLong,
            integratedHeadshellContinuityScore: continuity,
            rearTerminalSeparationScore: rearSep,
            centerlineNonGenericScore: nonGeneric,
            status: 'PARTIAL_PASS',
            reasons: []
        };
        result.status = classifyFormIntent(result);
        result.acceptedActiveAllowed = result.status !== 'FORM_INTENT_MISMATCH' && !(result.cobraIntentDetected && lowLong < 60);
        result.blockers = [];
        if (result.status === 'FORM_INTENT_MISMATCH') {
            result.reasons.push('Cobra/CFRP/monocoque/wing-body intent detected but geometry lacks sufficient measurable Cobra form traits.');
        }
        if (lowLong < 60 && result.cobraIntentDetected) {
            const msg = 'Cobra intent detected but lowLongProfileScore=' + lowLong + ' below required 60';
            result.reasons.push(msg);
            if (lowLong < 40) result.blockers.push(msg + ' and below hard block threshold 40');
            else result.blockers.push(msg);
        }
        if (rearSep < 60 && result.cobraIntentDetected) {
            const msg = 'rearTerminalSeparationScore=' + rearSep + ' below required 60';
            result.reasons.push(msg);
            result.blockers.push(msg);
        }
        if (asym < 45) result.reasons.push('asymmetric wing-body score too low');
        if (canopy < 45) result.reasons.push('front canopy / headshell continuity score too low');
        if (rearApex < 45) result.reasons.push('rear root apex score too low');
        if (rearSep < 45) result.reasons.push('rear terminal separation score too low');
        if (!result.reasons.length) result.reasons.push('measurable Cobra form traits are present within local proxy scope');
        return result;
    }

    root.FreeformFormFidelity = Object.freeze({
        analyzeCobraFidelity,
        scoreLongLowProfile,
        scoreAsymmetricWingBody,
        scoreFrontCanopy,
        scoreRearRootApex,
        scoreIntegratedHeadshellContinuity,
        scoreRearTerminalSeparation,
        classifyFormIntent
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
