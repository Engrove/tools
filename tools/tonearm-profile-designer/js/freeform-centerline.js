/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-centerline.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 AI Vibe 3D Freeform Centerline model.
// Local source/package candidate only; no browser/runtime deployment claim.
// AI-CODING NOTE: Protected datums remain immutable to AI patches; validated Manual Trace imports may establish their initial bounded endpoint coordinates.

(function(root) {
    'use strict';

    const CENTERLINE_SCHEMA = 'tonearm-designer-freeform-centerline-v1';
    const CURVE_TYPE = 'catmull_rom';
    const POINT_LIMITS = Object.freeze({
        s: { min: 0, max: 1 },
        x: { min: -20, max: 280 },
        y: { min: -40, max: 40 },
        z: { min: -40, max: 40 },
        count: { min: 2, max: 32 }
    });
    const PROTECTED_DATUMS = Object.freeze([
        'stylus_front',
        'stylus_point',
        'pivot_reference',
        'pivot_point',
        'lp_plane',
        'lp_top_plane',
        'n1_p2_effective_length',
        'effective_length',
        'cartridge_datum',
        'headshell_plane'
    ]);

    const LOCKED_POINT_IDS = Object.freeze({
        stylus_front: true,
        stylus_point: true,
        pivot_reference: true,
        pivot_point: true
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

    function defaultCenterline() {
        return {
            schema: CENTERLINE_SCHEMA,
            curveType: CURVE_TYPE,
            protectedDatums: PROTECTED_DATUMS.slice(),
            points: [
                { id: 'stylus_front', s: 0, x: 0, y: 0, z: 0, locked: true },
                { id: 'headshell_interface', s: 0.14, x: 34, y: 0, z: 2.5 },
                { id: 'mid_armwand', s: 0.50, x: 125, y: 0, z: 6.5 },
                { id: 'rear_terminal', s: 0.90, x: 220, y: 0, z: 1.5 },
                { id: 'pivot_reference', s: 1, x: 237.05, y: 0, z: 0, locked: true }
            ]
        };
    }

    function straightLTCenterline() {
        const c = defaultCenterline();
        c.points = [
            { id: 'stylus_front', s: 0, x: 0, y: 0, z: 0, locked: true },
            { id: 'headshell_interface', s: 0.12, x: 28, y: 0, z: 1.2 },
            { id: 'mid_armwand', s: 0.50, x: 118, y: 0, z: 2.0 },
            { id: 'rear_terminal', s: 0.88, x: 208, y: 0, z: 1.2 },
            { id: 'pivot_reference', s: 1, x: 237.05, y: 0, z: 0, locked: true }
        ];
        return c;
    }

    function sideBentHeadshellCenterline() {
        const c = defaultCenterline();
        c.points = [
            { id: 'stylus_front', s: 0, x: 0, y: 0, z: 0, locked: true },
            { id: 'headshell_side_bend', s: 0.055, x: 15, y: -10, z: 0.7 },
            { id: 'headshell_interface', s: 0.14, x: 34, y: -14, z: 2.3 },
            { id: 'mid_armwand', s: 0.50, x: 125, y: -4, z: 5.8 },
            { id: 'rear_terminal', s: 0.90, x: 220, y: 0, z: 1.5 },
            { id: 'pivot_reference', s: 1, x: 237.05, y: 0, z: 0, locked: true }
        ];
        return c;
    }

    function presets() {
        return {
            long_low_cobra_monocoque: defaultCenterline(),
            straight_low_mass_lt_arm: straightLTCenterline(),
            integrated_side_bent_headshell: sideBentHeadshellCenterline()
        };
    }

    function isProtectedPointId(id) {
        return !!LOCKED_POINT_IDS[String(id || '')] || PROTECTED_DATUMS.indexOf(String(id || '')) !== -1;
    }

    function normalizePoint(point, index, referenceById) {
        const id = String(point && point.id ? point.id : ('p' + index));
        const ref = referenceById && referenceById[id];
        const locked = !!(point && point.locked) || !!(ref && ref.locked) || isProtectedPointId(id);
        const source = ref && locked ? Object.assign({}, point || {}, ref) : (point || {});
        return {
            id,
            s: round(clamp(finite(source.s, index), POINT_LIMITS.s.min, POINT_LIMITS.s.max), 6),
            x: round(clamp(finite(source.x, 0), POINT_LIMITS.x.min, POINT_LIMITS.x.max), 6),
            y: round(clamp(finite(source.y, 0), POINT_LIMITS.y.min, POINT_LIMITS.y.max), 6),
            z: round(clamp(finite(source.z, 0), POINT_LIMITS.z.min, POINT_LIMITS.z.max), 6),
            locked
        };
    }

    function referenceMap(centerline) {
        const map = {};
        (centerline && Array.isArray(centerline.points) ? centerline.points : defaultCenterline().points).forEach(p => {
            if (p && p.id) map[p.id] = p;
        });
        return map;
    }

    function sanitizeCenterline(value, options) {
        const manualTraceDatums = !!(value && value.datumPolicy === 'operator_validated_manual_trace');
        const base = (options && options.base) || (manualTraceDatums ? value : defaultCenterline());
        const ref = referenceMap(base);
        const raw = value && Array.isArray(value.points) ? value.points : base.points;
        const count = clamp(raw.length, POINT_LIMITS.count.min, POINT_LIMITS.count.max);
        const warnings = [];
        const points = raw.slice(0, count).map((point, index) => {
            const id = String(point && point.id ? point.id : ('p' + index));
            if (isProtectedPointId(id)) {
                const p = point || {};
                const r = ref[id];
                if (r && (Number(p.x) !== Number(r.x) || Number(p.y) !== Number(r.y) || Number(p.z) !== Number(r.z) || Number(p.s) !== Number(r.s))) {
                    warnings.push('protected datum retained: ' + id);
                }
            }
            return normalizePoint(point, index, ref);
        }).sort((a, b) => a.s - b.s);

        if (points.length < POINT_LIMITS.count.min) {
            defaultCenterline().points.forEach((point, index) => {
                if (points.length < POINT_LIMITS.count.min) points.push(normalizePoint(point, index, ref));
            });
        }

        // Preserve hard endpoints if a sparse patch omitted or reordered them.
        ['stylus_front', 'pivot_reference'].forEach(id => {
            const basePoint = ref[id] || referenceMap(defaultCenterline())[id];
            const existing = points.find(p => p.id === id);
            if (existing && basePoint) Object.assign(existing, normalizePoint(basePoint, 0, ref), { locked: true });
            else if (basePoint) points.push(normalizePoint(basePoint, points.length, ref));
        });

        points.sort((a, b) => a.s - b.s);
        return {
            schema: CENTERLINE_SCHEMA,
            curveType: CURVE_TYPE,
            points,
            protectedDatums: PROTECTED_DATUMS.slice(),
            datumPolicy: manualTraceDatums ? 'operator_validated_manual_trace' : 'standard_protected_datums',
            warnings
        };
    }

    function applyCenterlinePatch(current, patch) {
        const base = sanitizeCenterline(current || defaultCenterline());
        if (!patch || typeof patch !== 'object') return base;
        const byId = {};
        base.points.forEach(p => { byId[p.id] = clone(p); });
        if (Array.isArray(patch.points)) {
            patch.points.forEach((p, i) => {
                const id = String(p && p.id ? p.id : ('p' + i));
                const existing = byId[id] || { id, s: p && p.s !== undefined ? p.s : 0.5, x: 0, y: 0, z: 0 };
                if (isProtectedPointId(id)) {
                    byId[id] = Object.assign({}, existing, { locked: true });
                    return;
                }
                byId[id] = Object.assign({}, existing, p, { id });
            });
        }
        return sanitizeCenterline({ curveType: CURVE_TYPE, points: Object.keys(byId).map(id => byId[id]), datumPolicy: base.datumPolicy }, { base });
    }

    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return {
            x: round(0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3), 6),
            y: round(0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3), 6),
            z: round(0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2*p0.z - 5*p1.z + 4*p2.z - p3.z) * t2 + (-p0.z + 3*p1.z - 3*p2.z + p3.z) * t3), 6)
        };
    }

    function lerpPoint(a, b, t) {
        return {
            x: round(a.x + (b.x - a.x) * t, 6),
            y: round(a.y + (b.y - a.y) * t, 6),
            z: round(a.z + (b.z - a.z) * t, 6)
        };
    }

    function evaluate(centerline, s) {
        const c = sanitizeCenterline(centerline || defaultCenterline());
        const pts = c.points;
        const u = clamp(finite(s, 0), 0, 1);
        if (u <= pts[0].s) return { point: clone(pts[0]), tangent: tangentAt(c, u) };
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (u <= b.s || i === pts.length - 2) {
                const span = Math.max(1e-9, b.s - a.s);
                const t = clamp((u - a.s) / span, 0, 1);
                const p0 = pts[Math.max(0, i - 1)];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                const point = c.curveType === CURVE_TYPE ? catmullRom(p0, a, b, p3, t) : lerpPoint(a, b, t);
                return { point, tangent: tangentAt(c, u) };
            }
        }
        return { point: clone(pts[pts.length - 1]), tangent: tangentAt(c, u) };
    }

    function normalizeVec(v) {
        const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) || 1;
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    function tangentAt(centerline, s) {
        const eps = 0.002;
        const s0 = clamp(finite(s, 0) - eps, 0, 1);
        const s1 = clamp(finite(s, 0) + eps, 0, 1);
        const p0 = evaluatePointOnly(centerline, s0);
        const p1 = evaluatePointOnly(centerline, s1);
        return normalizeVec({ x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z });
    }

    function evaluatePointOnly(centerline, s) {
        const c = sanitizeCenterline(centerline || defaultCenterline());
        const pts = c.points;
        const u = clamp(finite(s, 0), 0, 1);
        if (u <= pts[0].s) return clone(pts[0]);
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (u <= b.s || i === pts.length - 2) {
                const t = clamp((u - a.s) / Math.max(1e-9, b.s - a.s), 0, 1);
                return c.curveType === CURVE_TYPE
                    ? catmullRom(pts[Math.max(0, i - 1)], a, b, pts[Math.min(pts.length - 1, i + 2)], t)
                    : lerpPoint(a, b, t);
            }
        }
        return clone(pts[pts.length - 1]);
    }

    function sample(centerline, count) {
        const n = Math.max(2, Math.min(128, Math.round(finite(count, 32))));
        const out = [];
        for (let i = 0; i < n; i++) out.push(Object.assign({ s: round(i / (n - 1), 6) }, evaluate(centerline, i / (n - 1))));
        return out;
    }

    root.FreeformCenterline = Object.freeze({
        schema: CENTERLINE_SCHEMA,
        curveType: CURVE_TYPE,
        limits: POINT_LIMITS,
        protectedDatums: PROTECTED_DATUMS.slice(),
        defaultCenterline,
        presets,
        isProtectedPointId,
        sanitizeCenterline,
        applyCenterlinePatch,
        evaluate,
        sample
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
