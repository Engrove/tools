/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F math.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function smoothStep(edge0, edge1, x) {
    if (Math.abs(edge1 - edge0) < 1e-9) return 0;
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function cubicBezierCoord(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function bezierPoint(seg, t) {
    return {
        x: cubicBezierCoord(seg[0][0], seg[1][0], seg[2][0], seg[3][0], t),
        y: cubicBezierCoord(seg[0][1], seg[1][1], seg[2][1], seg[3][1], t)
    };
}

function bezierYAtX(segments, x) {
    if (!segments || !segments.length) return 0;

    let seg = segments[segments.length - 1];
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const x0 = s[0][0];
        const x3 = s[3][0];
        if (x >= Math.min(x0, x3) - 1e-9 && x <= Math.max(x0, x3) + 1e-9) {
            seg = s;
            break;
        }
        if (x < x0) {
            seg = s;
            break;
        }
    }

    let lo = 0, hi = 1, mid = 0.5;
    for (let i = 0; i < 30; i++) {
        mid = 0.5 * (lo + hi);
        const p = bezierPoint(seg, mid);
        if (p.x < x) lo = mid;
        else hi = mid;
    }
    return bezierPoint(seg, mid).y;
}
