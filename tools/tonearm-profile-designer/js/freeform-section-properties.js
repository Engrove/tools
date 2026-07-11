/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-section-properties.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 freeform section-property helpers.
// Deterministic proxy section analysis for centerline/ring loft stations; not FEA.

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

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function shapeFactors(shapeFamily) {
        const key = String(shapeFamily || 'ellipse');
        const table = {
            circle: { area: Math.PI / 4, i: Math.PI / 64, j: Math.PI / 32 },
            ellipse: { area: Math.PI / 4, i: Math.PI / 64, j: Math.PI / 32 },
            superellipse: { area: 0.86, i: 0.062, j: 0.124 },
            rounded_rectangle: { area: 0.92, i: 0.074, j: 0.148 },
            sharp_polygon: { area: 0.74, i: 0.050, j: 0.100 },
            triangle: { area: 0.50, i: 0.028, j: 0.056 },
            trapezoid: { area: 0.62, i: 0.040, j: 0.080 },
            asymmetric_egg: { area: 0.78, i: 0.052, j: 0.104 },
            flat_bottom_headshell: { area: 0.82, i: 0.060, j: 0.120 },
            crescent: { area: 0.54, i: 0.032, j: 0.064 },
            custom_bezier_loop: { area: 0.72, i: 0.048, j: 0.096 },
            custom_polar_profile: { area: 0.72, i: 0.048, j: 0.096 }
        };
        return table[key] || table.ellipse;
    }

    function sectionPropertiesForRing(ring, material) {
        const r = ring || {};
        const densityGPerCm3 = finite(material && material.densityGPerCm3, 1.25);
        const eModulusGPa = finite(material && material.eModulusGPa, 70);
        const gModulusGPa = finite(material && material.gModulusGPa, 26);
        const w = clamp(r.widthMm, 0.1, 1000);
        const h = clamp(r.heightMm, 0.1, 1000);
        const t = clamp(r.wallThicknessMm, 0.01, Math.min(w, h) / 2);
        const wi = Math.max(0, w - 2 * t);
        const hi = Math.max(0, h - 2 * t);
        const sf = shapeFactors(r.shapeFamily);
        const outerArea = sf.area * w * h;
        const innerArea = sf.area * wi * hi;
        const area = Math.max(0.001, outerArea - innerArea);

        const outerIyy = sf.i * w * Math.pow(h, 3);
        const innerIyy = sf.i * wi * Math.pow(hi, 3);
        const outerIzz = sf.i * h * Math.pow(w, 3);
        const innerIzz = sf.i * hi * Math.pow(wi, 3);
        const iyy = Math.max(0.001, outerIyy - innerIyy);
        const izz = Math.max(0.001, outerIzz - innerIzz);
        const j = Math.max(0.001, sf.j * (iyy + izz));

        return {
            shapeFamily: String(r.shapeFamily || 'ellipse'),
            widthMm: round(w, 6),
            heightMm: round(h, 6),
            wallThicknessMm: round(t, 6),
            areaMm2: round(area, 6),
            IyyMm4: round(iyy, 6),
            IzzMm4: round(izz, 6),
            JApproxMm4: round(j, 6),
            EIyyProxy: round(iyy * eModulusGPa * 1000, 6),
            EIzzProxy: round(izz * eModulusGPa * 1000, 6),
            GJProxy: round(j * gModulusGPa * 1000, 6),
            densityGPerCm3: round(densityGPerCm3, 6),
            eModulusGPa: round(eModulusGPa, 6),
            gModulusGPa: round(gModulusGPa, 6),
            claim: 'deterministic_proxy_not_fea'
        };
    }

    function distance(a, b) {
        if (!a || !b) return 0;
        const dx = finite(a.x, 0) - finite(b.x, 0);
        const dy = finite(a.y, 0) - finite(b.y, 0);
        const dz = finite(a.z, 0) - finite(b.z, 0);
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }

    function tangentDelta(a, b) {
        if (!a || !b) return 0;
        const ax = finite(a.x, 1), ay = finite(a.y, 0), az = finite(a.z, 0);
        const bx = finite(b.x, 1), by = finite(b.y, 0), bz = finite(b.z, 0);
        return Math.sqrt(Math.pow(ax-bx,2) + Math.pow(ay-by,2) + Math.pow(az-bz,2));
    }

    function stationAnalysisFromGeometry(geometryObject, options) {
        const go = geometryObject || {};
        const mesh = go.mesh || {};
        const stations = Array.isArray(mesh.stations) ? mesh.stations : [];
        const material = options && options.material ? options.material : {};
        const out = [];
        let previous = null;
        stations.forEach((station, index) => {
            const center = station.center || { x: 0, y: 0, z: 0 };
            const ring = station.ring || {};
            const props = sectionPropertiesForRing(ring, material);
            const prevCenter = previous ? previous.center : null;
            const next = stations[Math.min(stations.length - 1, index + 1)];
            const nextCenter = next && next.center ? next.center : center;
            const localLength = Math.max(0.001, distance(prevCenter || center, nextCenter));
            const localVolumeMm3 = props.areaMm2 * localLength;
            const localMassG = localVolumeMm3 / 1000 * props.densityGPerCm3;
            const curvature = previous ? tangentDelta(previous.tangent, station.tangent) / Math.max(0.001, distance(previous.center, center)) : 0;
            const bendSeverity = Math.min(1, curvature * 100);
            const prevEI = previous && previous.EIzzProxy ? previous.EIzzProxy : props.EIzzProxy;
            const stiffnessDiscontinuity = Math.abs(props.EIzzProxy - prevEI) / Math.max(1, prevEI);
            const row = {
                s: round(finite(station.s, index / Math.max(1, stations.length - 1)), 6),
                x: round(center.x, 6),
                y: round(center.y, 6),
                z: round(center.z, 6),
                center: { x: round(center.x, 6), y: round(center.y, 6), z: round(center.z, 6) },
                shapeFamily: props.shapeFamily,
                areaMm2: props.areaMm2,
                IyyMm4: props.IyyMm4,
                IzzMm4: props.IzzMm4,
                JApproxMm4: props.JApproxMm4,
                wallThicknessMm: props.wallThicknessMm,
                localLengthMm: round(localLength, 6),
                localMassG: round(localMassG, 6),
                localStiffnessProxy: round(Math.min(props.EIyyProxy, props.EIzzProxy), 6),
                EIyyProxy: props.EIyyProxy,
                EIzzProxy: props.EIzzProxy,
                GJProxy: props.GJProxy,
                curvature: round(curvature, 9),
                bendSeverity: round(bendSeverity, 6),
                stiffnessDiscontinuityFromPrevious: round(stiffnessDiscontinuity, 6),
                stiffnessDiscontinuity: round(stiffnessDiscontinuity, 6),
                claim: 'deterministic_section_proxy_not_fea'
            };
            out.push(row);
            previous = Object.assign({}, row, { center, tangent: station.tangent || { x: 1, y: 0, z: 0 } });
        });
        return out;
    }

    function summarizeStationAnalysis(stations) {
        const arr = Array.isArray(stations) ? stations : [];
        const sums = arr.reduce((acc, s) => {
            acc.area += finite(s.areaMm2, 0);
            acc.mass += finite(s.localMassG, 0);
            acc.eiyy += finite(s.EIyyProxy, 0);
            acc.eizz += finite(s.EIzzProxy, 0);
            acc.gj += finite(s.GJProxy, 0);
            acc.minArea = Math.min(acc.minArea, finite(s.areaMm2, Infinity));
            acc.maxDiscontinuity = Math.max(acc.maxDiscontinuity, finite(s.stiffnessDiscontinuityFromPrevious, 0));
            return acc;
        }, { area: 0, mass: 0, eiyy: 0, eizz: 0, gj: 0, minArea: Infinity, maxDiscontinuity: 0 });
        const n = Math.max(1, arr.length);
        return {
            stationCount: arr.length,
            totalStationMassG: round(sums.mass, 6),
            averageAreaMm2: round(sums.area / n, 6),
            minAreaMm2: round(Number.isFinite(sums.minArea) ? sums.minArea : 0, 6),
            averageEIyyProxy: round(sums.eiyy / n, 6),
            averageEIzzProxy: round(sums.eizz / n, 6),
            averageGJProxy: round(sums.gj / n, 6),
            maxStiffnessDiscontinuity: round(sums.maxDiscontinuity, 6),
            claim: 'station_ring_proxy_not_fea'
        };
    }

    root.FreeformSectionProperties = Object.freeze({
        shapeFactors,
        sectionPropertiesForRing,
        stationAnalysisFromGeometry,
        summarizeStationAnalysis
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
