/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F lt-geometry.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/lt-geometry.js
 * TD026 preview-only Engrove LT mechanism diagnostics.
 *
 * Mechanics:
 * - Engrove LT is treated as a Thales-like articulated tangency mechanism.
 * - It is not a linear-tracking arm, radial carriage or air-bearing slider.
 * - P1-P2H is a pivoted link arm.
 * - P2H/P2V are separate mechanical functions; in this planar preview they
 *   share the same solved assembly coordinate so the tangent equation is
 *   physically consistent.
 * - P3 is computed from the P2H horizontal carrier, not from the arm tube.
 * - STATOR_TRACK is a stationary ferritic path preview derived from the P3 locus.
 *
 * No core mesh/render2d/render3d/session schema changes are made here.
 */
(function() {
    const LT_GEOMETRY_PREVIEW_VERSION = 'TD026-source-svg-display-preview-diagnostics-1';
    const DEFAULT_GROOVE_RADII_MM = [60.325, 95.0, 146.05];
    const DEFAULT_ACTIVE_RADIUS_MM = 95.0;

    const SOURCE_P1_RADIUS_MM = 267.8743922064967;
    const SOURCE_P1_ANGLE_DEG = -25.142;
    const SOURCE_DEFAULT_PIVOT_SPINDLE_MM = 214.0;
    const SOURCE_LINK_LENGTH_MM = 42.3;
    const SOURCE_ARM_TUBE_LENGTH_MM = 237.1;
    const SOURCE_P3_HOLDER_LENGTH_MM = 50.0;
    const DEFAULT_STATOR_GAP_MM = 1.5;
    const DEFAULT_STATOR_CURVATURE = 0.42;
    const DEFAULT_HOLDER_ANGLE_OFFSET_DEG = -80;

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function round(value, digits) {
        const factor = Math.pow(10, digits == null ? 3 : digits);
        return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
    }

    function point3(x, y, z) {
        return { x: round(x, 3), y: round(y, 3), z: round(z || 0, 3) };
    }

    function clonePoint2(p) {
        return { x: round(p.x, 3), y: round(p.y, 3) };
    }

    function length2(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    }

    function normalize2(v) {
        const len = length2(v);
        if (!Number.isFinite(len) || len <= 1e-9) return { x: 1, y: 0 };
        return { x: v.x / len, y: v.y / len };
    }

    function dot2(a, b) {
        return a.x * b.x + a.y * b.y;
    }

    function rotate2(v, deg) {
        const a = (Number(deg) || 0) * Math.PI / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
    }

    function pointOnAngle(origin, angleDeg, distance) {
        const a = angleDeg * Math.PI / 180;
        return {
            x: origin.x + Math.cos(a) * distance,
            y: origin.y + Math.sin(a) * distance
        };
    }

    function angleDeg(v) {
        return Math.atan2(v.y, v.x) * 180 / Math.PI;
    }

    function normalizeDeg(deg) {
        let d = finite(deg, 0) % 360;
        if (d < 0) d += 360;
        return d;
    }

    function sourceSvgDegFromMath(deg) {
        return normalizeDeg(-deg);
    }

    function numberFromSource(source, key, fallback) {
        if (source && Object.prototype.hasOwnProperty.call(source, key)) {
            return finite(source[key], fallback);
        }
        return fallback;
    }

    function getInputSnapshot(source) {
        const s = source || (typeof state !== 'undefined' ? state : {});
        const lengthFallback = (typeof LENGTH !== 'undefined' && Number.isFinite(Number(LENGTH))) ? Number(LENGTH) : 281;
        const fullLength = numberFromSource(s, 'fullLength', lengthFallback);
        const pivotSpindle = numberFromSource(s, 'pivotSpindle', SOURCE_DEFAULT_PIVOT_SPINDLE_MM);
        const apex = numberFromSource(s, 'apex', 231);
        const pivotOffsetX = numberFromSource(s, 'pivotOffsetX', 0);
        const pivotOffsetY = numberFromSource(s, 'pivotOffsetY', 0);
        const pivotOffsetZ = numberFromSource(s, 'pivotOffsetZ', 0);
        const cartX = numberFromSource(s, 'cartX', 10);
        const nomStylusX = numberFromSource(s, 'nomStylusX', 10);
        const cartMode = s && s.cartMode ? String(s.cartMode) : 'g1042';

        return {
            fullLength,
            pivotSpindle,
            apex,
            pivotOffsetX,
            pivotOffsetY,
            pivotOffsetZ,
            cartX,
            nomStylusX,
            cartMode,
            sourceKind: source ? 'explicit' : 'global_state'
        };
    }

    function optionNumber(options, key, fallback) {
        if (options && Object.prototype.hasOwnProperty.call(options, key)) {
            return finite(options[key], fallback);
        }
        return fallback;
    }

    function circleIntersections(c0, r0, c1, r1) {
        const dx = c1.x - c0.x;
        const dy = c1.y - c0.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(d) || d < 1e-9) return [];
        if (d > r0 + r1 + 1e-9 || d < Math.abs(r0 - r1) - 1e-9) return [];

        const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
        const h2 = r0 * r0 - a * a;
        if (h2 < -1e-9) return [];
        const h = Math.sqrt(Math.max(0, h2));
        const xm = c0.x + a * dx / d;
        const ym = c0.y + a * dy / d;
        const rx = -dy / d * h;
        const ry = dx / d * h;

        return [
            { x: xm + rx, y: ym + ry },
            { x: xm - rx, y: ym - ry }
        ];
    }

    function tangentPointsFromExternalPoint(p, radius) {
        const d2 = p.x * p.x + p.y * p.y;
        const d = Math.sqrt(d2);
        if (!Number.isFinite(d) || d <= radius + 1e-9) return [];
        const a = radius * radius / d2;
        const b = radius * Math.sqrt(Math.max(0, d2 - radius * radius)) / d2;
        return [
            { x: a * p.x - b * p.y, y: a * p.y + b * p.x },
            { x: a * p.x + b * p.y, y: a * p.y - b * p.x }
        ];
    }

    function chooseLowerPoint(points) {
        if (!points || !points.length) return null;
        return points.slice().sort((a, b) => {
            if (Math.abs(a.y - b.y) > 1e-9) return a.y - b.y;
            return a.x - b.x;
        })[0];
    }

    function buildDerivedDimensions(snapshot, options) {
        const fullLength = snapshot.fullLength;
        const p1Distance = clamp(
            SOURCE_P1_RADIUS_MM + (snapshot.pivotSpindle - SOURCE_DEFAULT_PIVOT_SPINDLE_MM) * 0.75,
            180,
            360
        );
        const p1Nominal = pointOnAngle({ x: 0, y: 0 }, SOURCE_P1_ANGLE_DEG, p1Distance);
        const p1Base = {
            x: p1Nominal.x + snapshot.pivotOffsetX * 0.35,
            y: p1Nominal.y + snapshot.pivotOffsetY * 0.35
        };

        const linkLength = clamp(optionNumber(options, 'ltP1P2LinkLength', SOURCE_LINK_LENGTH_MM), 25, 140);
        const armTubeLength = clamp(optionNumber(options, 'ltArmTubeLength', snapshot.apex + 6.1 || SOURCE_ARM_TUBE_LENGTH_MM), 140, 310);
        const p3Holder = clamp(optionNumber(options, 'ltP3HolderLength', SOURCE_P3_HOLDER_LENGTH_MM), 18, 90);
        const gap = clamp(optionNumber(options, 'ltStatorGap', DEFAULT_STATOR_GAP_MM), 0.5, 6);
        const curvature = clamp(optionNumber(options, 'ltStatorCurvature', DEFAULT_STATOR_CURVATURE), 0, 1);
        const holderAngleOffsetDeg = clamp(optionNumber(options, 'ltHolderAngleOffsetDeg', DEFAULT_HOLDER_ANGLE_OFFSET_DEG), -140, -20);

        return {
            fullLength: round(fullLength, 3),
            envelopeHalfWidth: round(Math.max(10, Math.min(28, fullLength * 0.055)), 3),
            p1PositionRelativeToLP1: point3(p1Base.x, p1Base.y, 0),
            linkArmP1P2Length: round(linkLength, 3),
            armTubeLength: round(armTubeLength, 3),
            p3HolderArmLength: round(p3Holder, 3),
            statorGapPreview: round(gap, 3),
            statorCurvatureProxy: round(curvature, 3),
            holderAngleOffsetDeg: round(holderAngleOffsetDeg, 3),
            p1Base: point3(p1Base.x, p1Base.y, 0)
        };
    }

    function validateInputs(snapshot) {
        const errors = [];
        const warnings = [];
        if (!Number.isFinite(snapshot.fullLength)) errors.push('fullLength is not finite.');
        if (snapshot.fullLength < 180 || snapshot.fullLength > 380) errors.push('fullLength outside TD026 preview range 180–380 mm.');
        if (!Number.isFinite(snapshot.pivotSpindle)) errors.push('pivotSpindle is not finite.');
        if (snapshot.pivotSpindle < 120 || snapshot.pivotSpindle > 350) warnings.push('pivotSpindle is outside normal articulated preview comfort range.');
        return { errors, warnings };
    }

    function failStation(radius, dims, status, message) {
        const p1 = dims && dims.p1Base ? dims.p1Base : { x: 0, y: 0 };
        return {
            grooveRadiusMm: round(radius, 3),
            LP1: point3(0, 0, 0),
            N1: point3(0, 0, 0),
            P1: point3(p1.x, p1.y, 0),
            P2H: point3(p1.x, p1.y, 0),
            P2V: point3(p1.x, p1.y, 0),
            P3: point3(p1.x, p1.y, 0),
            STATOR_TRACK: point3(p1.x, p1.y, 0),
            p3StatorTrackGapMm: dims ? round(dims.statorGapPreview, 3) : 0,
            linkArmP1P2HLengthMm: dims ? round(dims.linkArmP1P2Length, 3) : 0,
            armTubeP2VN1LengthMm: dims ? round(dims.armTubeLength, 3) : 0,
            p2hP3HolderLengthMm: dims ? round(dims.p3HolderArmLength, 3) : 0,
            p1LinkAngleDeg: null,
            p1LinkAngleMathDeg: null,
            tonearmAngleDeg: null,
            tonearmAngleMathDeg: null,
            swingArmAngleDeg: null,
            sourceSvgLinkAngleDeg: null,
            sourceSvgTonearmAngleDeg: null,
            tangencyStatus: status || 'failed',
            tangencySolved: false,
            solved: false,
            status: status || 'failed',
            statusMessage: message || 'No valid articulated tangent solution.',
            tangencyFormula: 'error = abs(90° - angle_between((N1-LP1), (N1-P2V)))',
            tangencyAngleDeg: null,
            unsolvedTangencyResidualDeg: null,
            tangentErrorDeg: null,
            tangentConditionDot: null,
            residuals: { grooveMm: null, tangentDot: null },
            iterations: 0,
            valid: false
        };
    }

    function solveAtRadius(params, radius) {
        const dims = params && params.derivedDimensions ? params.derivedDimensions : params;
        const r = finite(radius, NaN);
        if (!Number.isFinite(r) || r <= 0) return failStation(r, dims, 'out_of_range', 'Invalid groove radius.');

        const lp1 = { x: 0, y: 0 };
        const p1 = { x: dims.p1Base.x, y: dims.p1Base.y };
        const L12 = finite(dims.linkArmP1P2Length, SOURCE_LINK_LENGTH_MM);
        const L2N = finite(dims.armTubeLength, SOURCE_ARM_TUBE_LENGTH_MM);
        const L23 = finite(dims.p3HolderArmLength, SOURCE_P3_HOLDER_LENGTH_MM);

        // With the planar P2 assembly coordinate, tangency is solved by placing
        // P2 on the intersection of:
        // 1) circle(P1, L12)
        // 2) circle(LP1, sqrt(r^2 + L2N^2))
        // Then N1 is the lower tangent point from P2 to circle(LP1, r).
        const p2DistanceFromLP1 = Math.sqrt(r * r + L2N * L2N);
        const p2Candidates = circleIntersections(lp1, p2DistanceFromLP1, p1, L12);
        const p2h = chooseLowerPoint(p2Candidates);
        if (!p2h) {
            return failStation(r, dims, 'failed_no_link_intersection', 'No P1-P2H link intersection for this radius and lengths.');
        }

        const nCandidates = tangentPointsFromExternalPoint(p2h, r);
        const n1 = chooseLowerPoint(nCandidates);
        if (!n1) {
            return failStation(r, dims, 'failed_no_tangent_point', 'No tangent point from P2 assembly to groove radius.');
        }

        // P2V is functionally separate but shares the planar solved assembly
        // coordinate in this 2D solver so the displayed formula is exact.
        const p2v = { x: p2h.x, y: p2h.y };
        const linkVector = { x: p2h.x - p1.x, y: p2h.y - p1.y };
        const linkDir = normalize2(linkVector);
        const armVector = { x: n1.x - p2v.x, y: n1.y - p2v.y };
        const armDir = normalize2(armVector);

        const holderDir = normalize2(rotate2(linkDir, dims.holderAngleOffsetDeg));
        const p3 = {
            x: p2h.x + holderDir.x * L23,
            y: p2h.y + holderDir.y * L23
        };

        const statorNormal = normalize2(rotate2(holderDir, 85 - dims.statorCurvatureProxy * 35));
        const statorPoint = {
            x: p3.x + statorNormal.x * dims.statorGapPreview,
            y: p3.y + statorNormal.y * dims.statorGapPreview
        };

        const radiusVector = normalize2({ x: n1.x - lp1.x, y: n1.y - lp1.y });
        const tangentDotRaw = dot2(radiusVector, armDir);
        const tangentAngleDeg = Math.acos(Math.max(-1, Math.min(1, tangentDotRaw))) * 180 / Math.PI;
        const tangencyErrorDeg = Math.abs(90 - tangentAngleDeg);
        const tangentConditionDot = dot2({ x: n1.x - lp1.x, y: n1.y - lp1.y }, { x: n1.x - p2v.x, y: n1.y - p2v.y });
        const grooveResidualMm = Math.abs(length2({ x: n1.x, y: n1.y }) - r);
        const linkLengthActual = length2(linkVector);
        const armLengthActual = length2(armVector);

        const linkMathAngle = angleDeg(linkVector);
        const armMathAngle = angleDeg(armVector);
        const sourceSvgLinkAngle = sourceSvgDegFromMath(linkMathAngle);
        const sourceSvgGlobalArmAngle = sourceSvgDegFromMath(armMathAngle);
        const sourceSvgTonearmAngle = normalizeDeg(sourceSvgGlobalArmAngle - sourceSvgLinkAngle);

        const solved = Number.isFinite(tangencyErrorDeg) && tangencyErrorDeg <= 0.25 && grooveResidualMm <= 0.01;
        return {
            grooveRadiusMm: round(r, 3),
            LP1: point3(lp1.x, lp1.y, 0),
            N1: point3(n1.x, n1.y, 0),
            P1: point3(p1.x, p1.y, 0),
            P2H: point3(p2h.x, p2h.y, 0),
            P2V: point3(p2v.x, p2v.y, 0),
            P3: point3(p3.x, p3.y, 0),
            STATOR_TRACK: point3(statorPoint.x, statorPoint.y, 0),
            p3StatorTrackGapMm: round(dims.statorGapPreview, 3),
            linkArmP1P2HLengthMm: round(linkLengthActual, 3),
            armTubeP2VN1LengthMm: round(armLengthActual, 3),
            p2hP3HolderLengthMm: round(L23, 3),
            p1LinkAngleDeg: round(sourceSvgLinkAngle, 6),
            p1LinkAngleMathDeg: round(linkMathAngle, 6),
            tonearmAngleDeg: round(sourceSvgTonearmAngle, 6),
            tonearmAngleMathDeg: round(armMathAngle, 6),
            swingArmAngleDeg: round(sourceSvgLinkAngle, 6),
            sourceSvgLinkAngleDeg: round(sourceSvgLinkAngle, 6),
            sourceSvgTonearmAngleDeg: round(sourceSvgTonearmAngle, 6),
            sourceSvgGlobalTonearmAngleDeg: round(sourceSvgGlobalArmAngle, 6),
            tangencyStatus: solved ? 'solved' : 'improved_preview',
            tangencySolved: solved,
            solved,
            status: solved ? 'solved' : 'improved',
            statusMessage: solved ? 'Solved articulated tangency at this radius.' : 'Improved preview, but residual exceeds solved tolerance.',
            tangencyFormula: 'error = abs(90° - angle_between((N1-LP1), (N1-P2V)))',
            tangencyAngleDeg: round(tangentAngleDeg, 9),
            unsolvedTangencyResidualDeg: solved ? null : round(tangencyErrorDeg, 9),
            tangentErrorDeg: round(tangencyErrorDeg, 9),
            tangentConditionDot: round(tangentConditionDot, 9),
            residuals: {
                grooveMm: round(grooveResidualMm, 9),
                linkMm: round(Math.abs(linkLengthActual - L12), 9),
                armMm: round(Math.abs(armLengthActual - L2N), 9),
                tangentDot: round(tangentDotRaw, 12)
            },
            iterations: 1,
            valid: solved
        };
    }

    function computeErrorSummary(stations) {
        const values = (stations || [])
            .map(s => Number(s.tangentErrorDeg))
            .filter(Number.isFinite);
        if (!values.length) return { maxAbsDeg: null, rmsDeg: null };
        const maxAbsDeg = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        const rmsDeg = Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
        return { maxAbsDeg: round(maxAbsDeg, 9), rmsDeg: round(rmsDeg, 9) };
    }

    function solveSweep(params, radii) {
        const dims = params && params.derivedDimensions ? params.derivedDimensions : params;
        const list = (Array.isArray(radii) && radii.length ? radii : DEFAULT_GROOVE_RADII_MM)
            .map(r => finite(r, DEFAULT_ACTIVE_RADIUS_MM))
            .filter((r, index, arr) => arr.findIndex(v => Math.abs(Number(v) - Number(r)) < 0.001) === index)
            .sort((a, b) => Number(a) - Number(b));

        const points = list.map(r => solveAtRadius(dims, r));
        const summary = computeErrorSummary(points);
        const solvedCount = points.filter(p => p.solved).length;
        const failedCount = points.filter(p => !p.solved).length;
        return {
            radii: list,
            points,
            p3Locus: points.filter(p => p.P3 && p.status !== 'failed').map(p => p.P3),
            statorTrackLocus: points.filter(p => p.STATOR_TRACK && p.status !== 'failed').map(p => p.STATOR_TRACK),
            maxAbsTangencyErrorDeg: summary.maxAbsDeg,
            rmsTangencyErrorDeg: summary.rmsDeg,
            solvedCount,
            failedCount,
            status: failedCount === 0 ? 'solved' : solvedCount > 0 ? 'partial' : 'failed',
            previewOnly: true
        };
    }

    function buildFullLengthEnvelope(activeStation, dims) {
        if (!activeStation) return null;
        const n1 = activeStation.N1;
        const towardRear = normalize2({
            x: activeStation.P2V.x - n1.x,
            y: activeStation.P2V.y - n1.y
        });
        const rearEnd = point3(n1.x + towardRear.x * dims.fullLength, n1.y + towardRear.y * dims.fullLength, 0);
        return {
            affects: 'LT mechanism modal preview/envelope/rear reference only',
            coreMeshRewriteImplemented: false,
            frontReference: clonePoint2(n1),
            rearEnd,
            lengthMm: round(dims.fullLength, 3),
            halfWidthMm: dims.envelopeHalfWidth,
            note: 'FullLength affects the articulated LT preview/envelope only; core mesh rewrite is not implemented yet.'
        };
    }

    function buildPreview(inputState, options) {
        const snapshot = getInputSnapshot(inputState);
        const validation = validateInputs(snapshot);
        const opts = options || {};
        const dims = buildDerivedDimensions(snapshot, opts);

        const activeRadius = optionNumber(opts, 'activeRadius', DEFAULT_ACTIVE_RADIUS_MM);
        const baseRadii = (Array.isArray(opts.grooveRadii) && opts.grooveRadii.length)
            ? opts.grooveRadii.slice()
            : DEFAULT_GROOVE_RADII_MM.slice();
        const radii = baseRadii.concat([activeRadius])
            .filter((r, index, arr) => arr.findIndex(v => Math.abs(Number(v) - Number(r)) < 0.001) === index)
            .sort((a, b) => Number(a) - Number(b));

        const sweep = solveSweep(dims, radii);
        const activeStation = solveAtRadius(dims, activeRadius);

        const preview = {
            version: LT_GEOMETRY_PREVIEW_VERSION,
            previewOnly: true,
            mutatesMainModel: false,
            implementedCoreGeometry: false,
            visualTargetRef: 'Schroeder_LT_v1.0.svg direct source SVG; TD026 does not drive physical SVG length binding',
            sourceRef: 'Engrove_LT_System_Definition_v3_10_3',
            contextId: 'PMTTP_v1',
            contextVersion: '3.10.3',
            mechanismType: 'Thales-like articulated tangency mechanism diagnostics; source-SVG binding disabled pending verification',
            linearTrackingAssumptionsRemoved: true,
            notLinearTracking: 'Engrove LT is not linear tracking in the proper sense: no linear air-bearing arm, no radial carriage and no pickup transport rail.',
            fullLengthDefinition: 'Physical design-envelope length from N1/stylus reference to rearEnd along the model main X extent; not effective length, pivot-to-spindle, P2V-N1 arm-tube length, P1-P2H link length, cartridge setback or apex position.',
            coordinateFrame: 'Top-view articulated solver: LP1/record on the left, N1 on the groove radius, P1 fixed to the right, P1-P2H link arm, P2H/P2V compact assembly, P2V-N1 arm tube, P3 on separate P2H-carried holder, STATOR_TRACK stationary near P3.',
            correctedP2P3Mechanics: {
                p2Horizontal: 'P2H is the horizontal pivot / side-motion carrier for the planar tangency mechanism.',
                p2Vertical: 'P2V is the vertical pivot for arm/arm-tube warp/vertical motion. In this 2D tangency solver it shares the P2 assembly coordinate with P2H.',
                p3Follower: 'P3 is the magnet/follower on a separate holder carried by P2H.',
                statorTrack: 'STATOR_TRACK is a stationary ferritic path/profile near P3; it is not a pickup carriage or a transport track.',
                warpIsolation: 'Vertical arm-tube motion such as warp must not change the preview magnet gap to STATOR_TRACK.',
                forbidden: 'Do not model P3 as mounted on the vertically moving arm tube and do not draw P2-P3 as an arm-tube rear stub.'
            },
            inputs: {
                fullLength: round(snapshot.fullLength, 3),
                pivotSpindle: round(snapshot.pivotSpindle, 3),
                apex: round(snapshot.apex, 3),
                cartMode: snapshot.cartMode
            },
            params: {
                fullLength: round(snapshot.fullLength, 3),
                p1Placement: round(snapshot.pivotSpindle, 3),
                linkLengthP1P2H: round(dims.linkArmP1P2Length, 3),
                armTubeLengthP2VN1: round(dims.armTubeLength, 3),
                holderLengthP2HP3: round(dims.p3HolderArmLength, 3),
                p3TrackGap: round(dims.statorGapPreview, 3),
                statorTrackCurvature: round(dims.statorCurvatureProxy, 3),
                holderAngleOffset: round(dims.holderAngleOffsetDeg, 3)
            },
            derivedDimensions: dims,
            fullLengthEnvelope: null,
            warnings: validation.warnings.slice(),
            errors: validation.errors.slice(),
            valid: validation.errors.length === 0 && activeStation.solved,
            solverStatus: validation.errors.length ? 'failed_validation' : activeStation.status,
            failSafeNoMutation: true,
            pointsByRadius: sweep.points,
            activeStation,
            solution: activeStation,
            sweep,
            statorTrackPreview: {
                canonicalTerm: 'STATOR_TRACK',
                stationary: true,
                ferriticPath: true,
                status: 'preview_fitted_from_P3_locus',
                points: sweep.statorTrackLocus
            },
            tangentErrorSummary: { maxAbsDeg: sweep.maxAbsTangencyErrorDeg, rmsDeg: sweep.rmsTangencyErrorDeg },
            formulas: {
                tangentCondition: 'dot(normalize(N1-LP1), normalize(N1-P2V)) = 0',
                tangencyError: 'error = abs(90° - angle_between((N1-LP1), (N1-P2V)))',
                solveAtRadius: 'P2H is solved from circle(P1,L12) ∩ circle(LP1,sqrt(radius^2+L2N^2)); N1 is the lower tangent point from P2V/P2H to circle(LP1,radius).',
                solveSweep: 'solveAtRadius is evaluated at inner/mid/outer/current radii; P3/STATOR_TRACK preview loci are derived from the solved P2H carrier.'
            }
        };

        preview.fullLengthEnvelope = buildFullLengthEnvelope(preview.activeStation, dims);
        if (validation.errors.length) {
            preview.valid = false;
            preview.solverStatus = 'failed_validation';
        }
        if (sweep.failedCount > 0) {
            preview.warnings.push('One or more radii failed to solve; failed values are not shown as solved tangency error.');
        }
        return preview;
    }

    function td(value, unit) {
        if (value === null || typeof value === 'undefined') return 'n/a';
        return String(value) + (unit || '');
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatPreviewHTML(preview) {
        if (!preview) preview = buildPreview();
        const statusClass = preview.valid ? 'ok' : 'warn';
        const stationRows = (preview.pointsByRadius || []).map(st => {
            const label = st.solved ? st.tangentErrorDeg + '°' : (st.unsolvedTangencyResidualDeg == null ? 'not solved' : st.unsolvedTangencyResidualDeg + '° residual');
            return [
                '<tr>',
                '<td>' + escapeHTML(st.grooveRadiusMm) + '</td>',
                '<td>' + escapeHTML(st.status) + '</td>',
                '<td>' + escapeHTML(label) + '</td>',
                '<td>' + escapeHTML(st.linkArmP1P2HLengthMm) + '</td>',
                '<td>' + escapeHTML(st.armTubeP2VN1LengthMm) + '</td>',
                '<td>' + escapeHTML(st.P2H.x + ', ' + st.P2H.y) + '</td>',
                '<td>' + escapeHTML(st.P3.x + ', ' + st.P3.y) + '</td>',
                '<td>' + escapeHTML(st.STATOR_TRACK.x + ', ' + st.STATOR_TRACK.y) + '</td>',
                '</tr>'
            ].join('');
        }).join('');

        const warnings = (preview.errors || []).concat(preview.warnings || []);
        return [
            '<div class="lt-preview-status ' + statusClass + '">' + escapeHTML(preview.solverStatus) + '</div>',
            '<div class="lt-preview-definition"><strong>TD026:</strong> source-SVG display restored. Preview diagnostics remain separate from verified SVG binding.</div>',
            '<div class="lt-preview-definition"><strong>Mechanics:</strong> Engrove LT is modeled as a Thales-like articulated tangency mechanism, not linear tracking in the proper sense.</div>',
            '<div class="lt-preview-definition"><strong>fullLength:</strong> ' + escapeHTML(preview.fullLengthDefinition) + '</div>',
            '<div class="lt-preview-grid">',
            '<div><strong>Full Length</strong><span>' + escapeHTML(td(preview.inputs.fullLength, ' mm')) + '</span></div>',
            '<div><strong>P1</strong><span>fixed primary pivot</span></div>',
            '<div><strong>P2H</strong><span>horizontal side-motion carrier</span></div>',
            '<div><strong>P2V</strong><span>vertical arm-tube pivot; shares planar solve coordinate</span></div>',
            '<div><strong>P3</strong><span>magnet follower on separate P2H holder</span></div>',
            '<div><strong>STATOR_TRACK</strong><span>stationary ferritic path/profile</span></div>',
            '</div>',
            '<div class="lt-preview-summary">Tangency solver max/rms: ' + escapeHTML(td(preview.tangentErrorSummary.maxAbsDeg, '°')) + ' / ' + escapeHTML(td(preview.tangentErrorSummary.rmsDeg, '°')) + '. Solver is preview-only and does not mutate the core mesh.</div>',
            '<table class="lt-preview-table"><thead><tr><th>r mm</th><th>status</th><th>tangency</th><th>P1-P2H</th><th>P2V-N1</th><th>P2H x,y</th><th>P3 x,y</th><th>STATOR_TRACK x,y</th></tr></thead><tbody>' + stationRows + '</tbody></table>',
            warnings.length ? '<div class="lt-preview-warning">' + escapeHTML(warnings.join(' ')) + '</div>' : ''
        ].join('');
    }

    function buildPromptSummary(inputState) {
        const preview = buildPreview(inputState);
        return {
            version: preview.version,
            previewOnly: preview.previewOnly,
            mutatesMainModel: preview.mutatesMainModel,
            mechanismType: preview.mechanismType,
            linearTrackingAssumptionsRemoved: preview.linearTrackingAssumptionsRemoved,
            notLinearTracking: preview.notLinearTracking,
            visualizerLocation: 'separate_LT_Mechanism_modal_not_AI_Modal',
            fullLengthDefinition: preview.fullLengthDefinition,
            fullLengthWritable: false,
            solverStatus: preview.solverStatus,
            tangencyStatus: preview.activeStation ? preview.activeStation.status : 'not_available',
            tangentErrorSummary: {
                status: preview.sweep ? preview.sweep.status : 'not_available',
                maxAbsTangencyErrorDeg: preview.tangentErrorSummary.maxAbsDeg,
                rmsTangencyErrorDeg: preview.tangentErrorSummary.rmsDeg,
                note: 'Only use tangencyErrorDeg as solved when station.status is solved. Do not invent solved geometry outside the solver status.'
            },
            activeSolution: preview.solution,
            sweep: preview.sweep,
            statorTrackPreviewStatus: preview.statorTrackPreview.points.length ? preview.statorTrackPreview.status : 'not_available',
            statorTrackPreviewPoints: preview.statorTrackPreview.points,
            fullLengthEnvelope: preview.fullLengthEnvelope,
            correctedP2P3Mechanics: preview.correctedP2P3Mechanics,
            formulas: preview.formulas,
            safeUse: [
                'TD026 restores direct source-SVG display; preview diagnostics are not verified source-SVG binding.',
                'Auto Fix is disabled in TD026 pending verified solver/source-SVG binding.',
                'Do not interpret Engrove LT as a linear tracking arm or a radial carriage.',
                'Do not invent solver results beyond the reported solverStatus/activeSolution.',
                'Do not write new solver/debug/modal fields to the delta.',
                'The animated mechanism SVG is in the separate LT Mechanism modal, not in AI Modal.',
                'If the user requests true full LT core mesh generation, return an empty valid delta unless known AI-writable fields are sufficient.'
            ],
            errors: preview.errors,
            warnings: preview.warnings
        };
    }

    function makeDimsFromParams(params) {
        return {
            p1Base: (params && params.p1Base) || point3(0, 0, 0),
            linkArmP1P2Length: finite(params && params.linkArmP1P2Length, SOURCE_LINK_LENGTH_MM),
            armTubeLength: finite(params && params.armTubeLength, SOURCE_ARM_TUBE_LENGTH_MM),
            p3HolderArmLength: finite(params && params.p3HolderArmLength, SOURCE_P3_HOLDER_LENGTH_MM),
            statorGapPreview: finite(params && params.statorGapPreview, DEFAULT_STATOR_GAP_MM),
            statorCurvatureProxy: finite(params && params.statorCurvatureProxy, DEFAULT_STATOR_CURVATURE),
            holderAngleOffsetDeg: finite(params && params.holderAngleOffsetDeg, DEFAULT_HOLDER_ANGLE_OFFSET_DEG),
            fullLength: finite(params && params.fullLength, 281),
            envelopeHalfWidth: finite(params && params.envelopeHalfWidth, 15)
        };
    }

    function autoFixParams(baseDims, radii) {
        const dims = makeDimsFromParams(baseDims || {});
        const start = solveSweep(dims, radii);
        const startScore = (start.failedCount * 1000) + finite(start.maxAbsTangencyErrorDeg, 999);
        let bestDims = dims;
        let best = start;
        let bestScore = startScore;
        const link0 = dims.linkArmP1P2Length;
        const arm0 = dims.armTubeLength;
        const linkSteps = [-12, -8, -4, 0, 4, 8, 12];
        const armSteps = [-20, -12, -6, 0, 6, 12, 20];
        let iterations = 0;

        linkSteps.forEach(dl => {
            armSteps.forEach(da => {
                iterations += 1;
                const candidate = Object.assign({}, dims, {
                    linkArmP1P2Length: clamp(link0 + dl, 25, 140),
                    armTubeLength: clamp(arm0 + da, 140, 310)
                });
                const sweep = solveSweep(candidate, radii);
                const score = (sweep.failedCount * 1000) + finite(sweep.maxAbsTangencyErrorDeg, 999);
                if (score < bestScore) {
                    bestScore = score;
                    best = sweep;
                    bestDims = candidate;
                }
            });
        });

        const improved = bestScore < startScore - 1e-6;
        return {
            status: improved ? 'improved' : start.status === 'solved' ? 'already_solved' : 'no_improvement',
            before: {
                maxAbsTangencyErrorDeg: start.maxAbsTangencyErrorDeg,
                rmsTangencyErrorDeg: start.rmsTangencyErrorDeg,
                solvedCount: start.solvedCount,
                failedCount: start.failedCount
            },
            after: {
                maxAbsTangencyErrorDeg: best.maxAbsTangencyErrorDeg,
                rmsTangencyErrorDeg: best.rmsTangencyErrorDeg,
                solvedCount: best.solvedCount,
                failedCount: best.failedCount
            },
            params: bestDims,
            changedPreviewOnly: improved ? ['linkLengthP1P2H', 'armTubeLengthP2VN1'] : [],
            iterations,
            failSafeKeptPrevious: !improved && start.status !== 'solved',
            previewOnly: true
        };
    }

    window.LTGeometry = Object.freeze({
        version: LT_GEOMETRY_PREVIEW_VERSION,
        defaultGrooveRadii: DEFAULT_GROOVE_RADII_MM.slice(),
        defaultActiveRadius: DEFAULT_ACTIVE_RADIUS_MM,
        solveAtRadius,
        solveSweep,
        autoFixParams,
        buildPreview,
        formatPreviewHTML,
        buildPromptSummary
    });
})();
