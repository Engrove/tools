/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-rings.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 AI Vibe 3D Freeform abstract ring/section model.
// Rings are abstract station form objects, not tube-only sections.

(function(root) {
    'use strict';

    const RING_SCHEMA = 'tonearm-designer-freeform-rings-v1';
    const SHAPE_FAMILIES = Object.freeze([
        'circle',
        'ellipse',
        'superellipse',
        'rounded_rectangle',
        'sharp_polygon',
        'triangle',
        'trapezoid',
        'asymmetric_egg',
        'flat_bottom_headshell',
        'crescent',
        'custom_bezier_loop',
        'custom_polar_profile'
    ]);
    const RING_LIMITS = Object.freeze({
        s: { min: 0, max: 1 },
        widthMm: { min: 3, max: 45 },
        heightMm: { min: 2, max: 35 },
        wallThicknessMm: { min: 0.6, max: 3.0 },
        rotationDeg: { min: -180, max: 180 },
        tiltDeg: { min: -45, max: 45 },
        cornerSharpness: { min: 0, max: 1 },
        superellipseExponent: { min: 0.35, max: 8 },
        asymmetryY: { min: -1, max: 1 },
        asymmetryZ: { min: -1, max: 1 },
        topRidgeHeightMm: { min: 0, max: 5 },
        bottomFlatness: { min: 0, max: 1 },
        crescentCutDepth: { min: 0, max: 0.85 },
        controlPointsCount: { min: 4, max: 32 },
        stationCount: { min: 4, max: 64 }
    });

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round(value, digits) {
        const f = Math.pow(10, digits || 6);
        return Math.round(Number(value) * f) / f;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function defaultRing(overrides) {
        const base = {
            id: 'ring_mid_01',
            s: 0.45,
            shapeFamily: 'custom_bezier_loop',
            widthMm: 14.5,
            heightMm: 8.2,
            wallThicknessMm: 1.45,
            rotationDeg: 2,
            tiltDeg: 0,
            cornerSharpness: 0.4,
            superellipseExponent: 2.6,
            asymmetryY: 0.08,
            asymmetryZ: 0.18,
            topRidgeHeightMm: 1.2,
            bottomFlatness: 0.2,
            crescentCutDepth: 0,
            controlPoints: []
        };
        return Object.assign(base, overrides || {});
    }

    function defaultRings() {
        return [
            defaultRing({ id: 'ring_headshell_flat', s: 0.00, shapeFamily: 'flat_bottom_headshell', widthMm: 18, heightMm: 5.4, wallThicknessMm: 1.2, bottomFlatness: 0.85, topRidgeHeightMm: 0.4 }),
            defaultRing({ id: 'ring_front_triangle_transition', s: 0.14, shapeFamily: 'triangle', widthMm: 17, heightMm: 6.4, wallThicknessMm: 1.25, rotationDeg: 0, topRidgeHeightMm: 0.8 }),
            defaultRing({ id: 'ring_low_cobra_01', s: 0.34, shapeFamily: 'superellipse', widthMm: 14.2, heightMm: 7.8, wallThicknessMm: 1.3, superellipseExponent: 2.8, topRidgeHeightMm: 1.4 }),
            defaultRing({ id: 'ring_mid_01', s: 0.52, shapeFamily: 'asymmetric_egg', widthMm: 12.2, heightMm: 7.2, wallThicknessMm: 1.35, asymmetryY: 0.08, asymmetryZ: 0.18, topRidgeHeightMm: 1.0 }),
            defaultRing({ id: 'ring_rear_crescent', s: 0.78, shapeFamily: 'crescent', widthMm: 13.4, heightMm: 7.0, wallThicknessMm: 1.35, crescentCutDepth: 0.26, topRidgeHeightMm: 0.8 }),
            defaultRing({ id: 'ring_rear_terminal_round', s: 1.00, shapeFamily: 'circle', widthMm: 10.0, heightMm: 10.0, wallThicknessMm: 1.5, topRidgeHeightMm: 0 })
        ];
    }

    function straightLTRings() {
        return [
            defaultRing({ id: 'lt_headshell_flat', s: 0.00, shapeFamily: 'flat_bottom_headshell', widthMm: 15.5, heightMm: 4.8, wallThicknessMm: 1.05, bottomFlatness: 0.9 }),
            defaultRing({ id: 'lt_front_ellipse', s: 0.18, shapeFamily: 'ellipse', widthMm: 10.6, heightMm: 5.2, wallThicknessMm: 0.9 }),
            defaultRing({ id: 'lt_mid_superellipse', s: 0.42, shapeFamily: 'superellipse', widthMm: 9.0, heightMm: 4.8, wallThicknessMm: 0.85, superellipseExponent: 2.2 }),
            defaultRing({ id: 'lt_mid_ellipse', s: 0.64, shapeFamily: 'ellipse', widthMm: 8.4, heightMm: 4.6, wallThicknessMm: 0.85 }),
            defaultRing({ id: 'lt_rear_ellipse', s: 0.86, shapeFamily: 'ellipse', widthMm: 9.2, heightMm: 5.2, wallThicknessMm: 0.95 }),
            defaultRing({ id: 'lt_terminal_circle', s: 1.00, shapeFamily: 'circle', widthMm: 9.8, heightMm: 9.8, wallThicknessMm: 1.1 })
        ];
    }

    function sideBentHeadshellRings() {
        const rings = defaultRings();
        rings[0] = defaultRing({ id: 'side_bent_flat_bottom_headshell', s: 0.00, shapeFamily: 'flat_bottom_headshell', widthMm: 20, heightMm: 5.2, wallThicknessMm: 1.2, rotationDeg: -12, bottomFlatness: 0.92 });
        rings[1] = defaultRing({ id: 'side_bent_trapezoid_mount', s: 0.09, shapeFamily: 'trapezoid', widthMm: 19, heightMm: 6.0, wallThicknessMm: 1.2, asymmetryY: -0.12, rotationDeg: -10 });
        rings[2] = defaultRing({ id: 'side_bent_triangle_transition', s: 0.17, shapeFamily: 'triangle', widthMm: 17, heightMm: 6.7, wallThicknessMm: 1.25, rotationDeg: -6 });
        return rings;
    }

    function presets() {
        return {
            long_low_cobra_monocoque: defaultRings(),
            straight_low_mass_lt_arm: straightLTRings(),
            integrated_side_bent_headshell: sideBentHeadshellRings()
        };
    }

    function sanitizeControlPoints(points) {
        const raw = Array.isArray(points) ? points.slice(0, RING_LIMITS.controlPointsCount.max) : [];
        return raw.map((p, i) => ({
            y: round(clamp(finite(p && p.y, Math.cos(i)), -1.5, 1.5), 6),
            z: round(clamp(finite(p && p.z, Math.sin(i)), -1.5, 1.5), 6),
            r: p && p.r !== undefined ? round(clamp(finite(p.r, 1), 0, 2), 6) : undefined
        }));
    }

    function sanitizeRing(ring, index) {
        const src = ring || {};
        const shape = SHAPE_FAMILIES.indexOf(src.shapeFamily) !== -1 ? src.shapeFamily : 'ellipse';
        const out = {
            id: String(src.id || ('ring_' + String(index).padStart(2, '0'))),
            s: round(clamp(finite(src.s, index / 8), RING_LIMITS.s.min, RING_LIMITS.s.max), 6),
            shapeFamily: shape,
            widthMm: round(clamp(finite(src.widthMm, 12), RING_LIMITS.widthMm.min, RING_LIMITS.widthMm.max), 6),
            heightMm: round(clamp(finite(src.heightMm, 6), RING_LIMITS.heightMm.min, RING_LIMITS.heightMm.max), 6),
            wallThicknessMm: round(clamp(finite(src.wallThicknessMm, 1.2), RING_LIMITS.wallThicknessMm.min, RING_LIMITS.wallThicknessMm.max), 6),
            rotationDeg: round(clamp(finite(src.rotationDeg, 0), RING_LIMITS.rotationDeg.min, RING_LIMITS.rotationDeg.max), 6),
            tiltDeg: round(clamp(finite(src.tiltDeg, 0), RING_LIMITS.tiltDeg.min, RING_LIMITS.tiltDeg.max), 6),
            cornerSharpness: round(clamp(finite(src.cornerSharpness, 0.3), RING_LIMITS.cornerSharpness.min, RING_LIMITS.cornerSharpness.max), 6),
            superellipseExponent: round(clamp(finite(src.superellipseExponent, 2), RING_LIMITS.superellipseExponent.min, RING_LIMITS.superellipseExponent.max), 6),
            asymmetryY: round(clamp(finite(src.asymmetryY, 0), RING_LIMITS.asymmetryY.min, RING_LIMITS.asymmetryY.max), 6),
            asymmetryZ: round(clamp(finite(src.asymmetryZ, 0), RING_LIMITS.asymmetryZ.min, RING_LIMITS.asymmetryZ.max), 6),
            topRidgeHeightMm: round(clamp(finite(src.topRidgeHeightMm, 0), RING_LIMITS.topRidgeHeightMm.min, RING_LIMITS.topRidgeHeightMm.max), 6),
            bottomFlatness: round(clamp(finite(src.bottomFlatness, 0), RING_LIMITS.bottomFlatness.min, RING_LIMITS.bottomFlatness.max), 6),
            crescentCutDepth: round(clamp(finite(src.crescentCutDepth, 0), RING_LIMITS.crescentCutDepth.min, RING_LIMITS.crescentCutDepth.max), 6),
            controlPoints: sanitizeControlPoints(src.controlPoints)
        };
        if (out.wallThicknessMm * 2 >= Math.min(out.widthMm, out.heightMm)) out.wallThicknessMm = round(Math.max(0.6, Math.min(out.widthMm, out.heightMm) * 0.35), 6);
        return out;
    }

    function sanitizeRings(rings) {
        const raw = Array.isArray(rings) && rings.length ? rings : defaultRings();
        const count = clamp(raw.length, RING_LIMITS.stationCount.min, RING_LIMITS.stationCount.max);
        let out = raw.slice(0, count).map(sanitizeRing).sort((a, b) => a.s - b.s);
        if (out.length < RING_LIMITS.stationCount.min) out = defaultRings();
        if (out[0].s > 0) out.unshift(sanitizeRing(Object.assign({}, out[0], { id: out[0].id + '_start', s: 0 }), 0));
        if (out[out.length - 1].s < 1) out.push(sanitizeRing(Object.assign({}, out[out.length - 1], { id: out[out.length - 1].id + '_end', s: 1 }), out.length));
        return out.sort((a, b) => a.s - b.s);
    }

    function applyRingPatch(current, patch) {
        const base = sanitizeRings(current || defaultRings());
        if (!patch || typeof patch !== 'object') return base;
        const byId = {};
        base.forEach(r => { byId[r.id] = clone(r); });
        if (Array.isArray(patch.rings)) {
            patch.rings.forEach((r, i) => {
                const id = String(r && r.id ? r.id : ('ring_patch_' + i));
                byId[id] = Object.assign({}, byId[id] || {}, r, { id });
            });
        }
        if (Array.isArray(patch.removeRingIds)) {
            patch.removeRingIds.forEach(id => { if (String(id) !== 'ring_headshell_flat' && String(id) !== 'ring_rear_terminal_round') delete byId[String(id)]; });
        }
        return sanitizeRings(Object.keys(byId).map(id => byId[id]));
    }

    function rotatePoint(p, deg) {
        const a = finite(deg, 0) * Math.PI / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return { y: p.y * c - p.z * s, z: p.y * s + p.z * c };
    }

    function ellipsePoint(theta) {
        return { y: Math.cos(theta), z: Math.sin(theta) };
    }

    function superellipsePoint(theta, exponent) {
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const e = Math.max(0.35, finite(exponent, 2));
        return {
            y: Math.sign(c) * Math.pow(Math.abs(c), 2 / e),
            z: Math.sign(s) * Math.pow(Math.abs(s), 2 / e)
        };
    }

    function polygonPoint(sides, theta, phase) {
        const n = Math.max(3, Math.round(sides));
        const a = theta + (phase || 0);
        const sector = 2 * Math.PI / n;
        const local = ((a + Math.PI / n) % sector) - Math.PI / n;
        const radius = Math.cos(Math.PI / n) / Math.max(0.1, Math.cos(local));
        return { y: radius * Math.cos(a), z: radius * Math.sin(a) };
    }

    function trapezoidPoint(theta) {
        // Convex hull interpolation over normalized points, clockwise.
        const pts = [
            { y: -1.0, z: -0.82 },
            { y: 1.0, z: -0.82 },
            { y: 0.64, z: 0.90 },
            { y: -0.64, z: 0.90 }
        ];
        return polylineLoopPoint(pts, theta);
    }

    function roundedRectanglePoint(theta, sharpness) {
        const p = superellipsePoint(theta, 2 + 6 * clamp(finite(sharpness, 0.4), 0, 1));
        return { y: p.y, z: p.z };
    }

    function flatBottomPoint(theta, bottomFlatness) {
        const p = roundedRectanglePoint(theta, 0.45);
        const flat = clamp(finite(bottomFlatness, 0.8), 0, 1);
        const bottom = -0.70 - 0.20 * flat;
        if (p.z < bottom) p.z = bottom;
        return p;
    }

    function crescentPoint(theta, depth) {
        const d = clamp(finite(depth, 0.35), 0, 0.85);
        const p = ellipsePoint(theta);
        const cut = 1 - d * (0.55 + 0.45 * Math.cos(theta));
        if (p.y > 0) p.y *= cut;
        p.z += d * 0.15 * Math.sin(theta);
        return p;
    }

    function eggPoint(theta, ay, az) {
        const p = ellipsePoint(theta);
        const topBias = 1 + clamp(finite(az, 0.15), -1, 1) * (p.z > 0 ? 0.18 : -0.08);
        const sideBias = 1 + clamp(finite(ay, 0.1), -1, 1) * p.y * 0.25;
        return { y: p.y * sideBias, z: p.z * topBias };
    }

    function polylineLoopPoint(pts, theta) {
        if (!pts || pts.length < 3) return ellipsePoint(theta);
        const u = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
        const scaled = u * pts.length;
        const i0 = Math.floor(scaled) % pts.length;
        const i1 = (i0 + 1) % pts.length;
        const t = scaled - Math.floor(scaled);
        return {
            y: pts[i0].y + (pts[i1].y - pts[i0].y) * t,
            z: pts[i0].z + (pts[i1].z - pts[i0].z) * t
        };
    }

    function cubicBezier(a, b, c, d, t) {
        const u = 1 - t;
        return {
            y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y,
            z: u*u*u*a.z + 3*u*u*t*b.z + 3*u*t*t*c.z + t*t*t*d.z
        };
    }

    function bezierLoopPoint(points, theta) {
        const pts = points && points.length >= 4 ? points : [
            { y: -1, z: 0 }, { y: -0.4, z: 0.9 }, { y: 0.55, z: 1.05 }, { y: 1, z: 0 },
            { y: 0.55, z: -0.88 }, { y: -0.45, z: -0.78 }
        ];
        const u = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
        const segCount = pts.length;
        const scaled = u * segCount;
        const i = Math.floor(scaled) % segCount;
        const t = scaled - Math.floor(scaled);
        const p0 = pts[(i - 1 + segCount) % segCount];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % segCount];
        const p3 = pts[(i + 2) % segCount];
        // Catmull-derived Bezier controls keep a smooth closed loop from abstract controls.
        const b1 = { y: p1.y + (p2.y - p0.y) / 6, z: p1.z + (p2.z - p0.z) / 6 };
        const b2 = { y: p2.y - (p3.y - p1.y) / 6, z: p2.z - (p3.z - p1.z) / 6 };
        return cubicBezier(p1, b1, b2, p2, t);
    }

    function polarProfilePoint(points, theta) {
        const cps = points && points.length >= 4 ? points : [
            { r: 1.00 }, { r: 0.88 }, { r: 1.08 }, { r: 0.94 }, { r: 1.0 }, { r: 0.92 }
        ];
        const u = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
        const scaled = u * cps.length;
        const i0 = Math.floor(scaled) % cps.length;
        const i1 = (i0 + 1) % cps.length;
        const t = scaled - Math.floor(scaled);
        const r0 = finite(cps[i0].r, Math.sqrt(cps[i0].y*cps[i0].y + cps[i0].z*cps[i0].z) || 1);
        const r1 = finite(cps[i1].r, Math.sqrt(cps[i1].y*cps[i1].y + cps[i1].z*cps[i1].z) || 1);
        const r = r0 + (r1 - r0) * t;
        return { y: r * Math.cos(theta), z: r * Math.sin(theta) };
    }

    function baseShapePoint(ring, theta) {
        switch (ring.shapeFamily) {
            case 'circle': return ellipsePoint(theta);
            case 'ellipse': return ellipsePoint(theta);
            case 'superellipse': return superellipsePoint(theta, ring.superellipseExponent);
            case 'rounded_rectangle': return roundedRectanglePoint(theta, ring.cornerSharpness);
            case 'sharp_polygon': return polygonPoint(4, theta, Math.PI / 4);
            case 'triangle': return polygonPoint(3, theta, -Math.PI / 2);
            case 'trapezoid': return trapezoidPoint(theta);
            case 'asymmetric_egg': return eggPoint(theta, ring.asymmetryY, ring.asymmetryZ);
            case 'flat_bottom_headshell': return flatBottomPoint(theta, ring.bottomFlatness);
            case 'crescent': return crescentPoint(theta, ring.crescentCutDepth || 0.35);
            case 'custom_bezier_loop': return bezierLoopPoint(ring.controlPoints, theta);
            case 'custom_polar_profile': return polarProfilePoint(ring.controlPoints, theta);
            default: return ellipsePoint(theta);
        }
    }

    function generateRingPoints(ringInput, segmentCount) {
        const ring = sanitizeRing(ringInput || defaultRing(), 0);
        const n = Math.max(8, Math.min(128, Math.round(finite(segmentCount, 32))));
        const pts = [];
        for (let i = 0; i < n; i++) {
            const theta = (i / n) * Math.PI * 2;
            let p = baseShapePoint(ring, theta);
            p.y += ring.asymmetryY * 0.08 * Math.sin(theta);
            p.z += ring.asymmetryZ * 0.08 * Math.cos(theta);
            if (p.z > 0 && ring.topRidgeHeightMm > 0) p.z += (ring.topRidgeHeightMm / Math.max(1, ring.heightMm)) * Math.pow(Math.sin(theta), 2);
            p = rotatePoint({ y: p.y * ring.widthMm / 2, z: p.z * ring.heightMm / 2 }, ring.rotationDeg);
            pts.push({ y: round(p.y, 6), z: round(p.z, 6) });
        }
        return pts;
    }

    function interpolateRing(ringsInput, s) {
        const rings = sanitizeRings(ringsInput || defaultRings());
        const u = clamp(finite(s, 0), 0, 1);
        if (u <= rings[0].s) return clone(rings[0]);
        for (let i = 0; i < rings.length - 1; i++) {
            const a = rings[i];
            const b = rings[i + 1];
            if (u <= b.s || i === rings.length - 2) {
                const t = clamp((u - a.s) / Math.max(1e-9, b.s - a.s), 0, 1);
                const out = {};
                Object.keys(a).forEach(k => { out[k] = clone(a[k]); });
                out.id = a.id + '_to_' + b.id + '_' + round(u, 3);
                out.s = round(u, 6);
                out.shapeFamily = t < 0.5 ? a.shapeFamily : b.shapeFamily;
                ['widthMm','heightMm','wallThicknessMm','rotationDeg','tiltDeg','cornerSharpness','superellipseExponent','asymmetryY','asymmetryZ','topRidgeHeightMm','bottomFlatness','crescentCutDepth'].forEach(k => {
                    out[k] = round(finite(a[k], 0) + (finite(b[k], 0) - finite(a[k], 0)) * t, 6);
                });
                out.controlPoints = t < 0.5 ? clone(a.controlPoints || []) : clone(b.controlPoints || []);
                return sanitizeRing(out, i);
            }
        }
        return clone(rings[rings.length - 1]);
    }

    root.FreeformRings = Object.freeze({
        schema: RING_SCHEMA,
        shapeFamilies: SHAPE_FAMILIES.slice(),
        limits: RING_LIMITS,
        defaultRing,
        defaultRings,
        presets,
        sanitizeRing,
        sanitizeRings,
        applyRingPatch,
        generateRingPoints,
        interpolateRing
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
