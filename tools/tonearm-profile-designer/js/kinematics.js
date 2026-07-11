/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F kinematics.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

const Kinematics = {
    calculateAlignment: function(pivotSpindle, n1, n2) {
        function offsetForRadius(S, r, L) {
            const x = (S * S - L * L + r * r) / (2 * S);
            const y2 = r * r - x * x;
            if (y2 <= 0) return null;
            const y = Math.sqrt(y2);
            const tangent = Math.atan2(y, x) + Math.PI / 2;
            const armAngle = Math.atan2(y, x - S);
            let alpha = tangent - armAngle;
            while (alpha < 0) alpha += Math.PI * 2;
            while (alpha >= Math.PI * 2) alpha -= Math.PI * 2;
            if (alpha > Math.PI) alpha = Math.PI * 2 - alpha;
            return alpha;
        }

        let bestL = pivotSpindle + 15;
        let bestErr = Infinity;
        for (let L = pivotSpindle + 5; L <= pivotSpindle + 40; L += 0.01) {
            const a1 = offsetForRadius(pivotSpindle, n1, L);
            const a2 = offsetForRadius(pivotSpindle, n2, L);
            if (a1 == null || a2 == null) continue;
            const err = Math.abs(a1 - a2);
            if (err < bestErr) {
                bestErr = err;
                bestL = L;
            }
        }

        const alpha = offsetForRadius(pivotSpindle, n1, bestL);
        return {
            Leff: bestL,
            overhang: bestL - pivotSpindle,
            offsetDeg: alpha != null ? alpha * 180 / Math.PI : 0
        };
    }
};
