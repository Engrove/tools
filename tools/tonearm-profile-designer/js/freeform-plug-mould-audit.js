// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Decide whether a lofted pattern can be withdrawn from a two-part mould along one pull axis.
 * Inputs: A closed freeform loft mesh and an optional pull axis, ray resolution and draft threshold.
 * Outputs: Undercut, draft and parting-line findings with a scoped status; no geometry mutation and no DOM access.
 * Safe edits: Ray resolution, reported findings, and additional pull-axis support.
 * Do not: Repair geometry here, infer a pull axis from an open mesh, or report a pass for an unclosed shell.
 * Verification: test/freeform-plug-mould-audit.test.cjs
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.FreeformPlugMouldAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const AXES = Object.freeze({ X: 0, Y: 1, Z: 2 });
    const DEFAULT_GRID = 48;
    const DEFAULT_MIN_DRAFT_DEG = 1.5;
    // Per-face probing is O(F^2); above this the audit falls back to the uniform grid alone and says so.
    const MAX_FACE_SAMPLES = 6000;
    const EPSILON = 1e-9;
    // A face within the draft threshold of the pull direction is a near-vertical wall. It touches the
    // line tangentially rather than entering or leaving the solid, and it is already graded by the draft
    // metric, so counting it as a crossing would report an undercut along every silhouette band.
    const tangentialFacingFor = draftDeg => Math.sin(Math.max(0, draftDeg) * Math.PI / 180);

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function round(value, digits) {
        const f = Math.pow(10, digits === undefined ? 6 : digits);
        return Math.round(Number(value) * f) / f;
    }

    function triangleOf(mesh, face) {
        const v = mesh.vertices;
        return [v[face[0]], v[face[1]], v[face[2]]];
    }

    /**
     * Counts how many times a line parallel to the pull axis crosses the surface. A pattern that leaves a
     * two-part mould crosses exactly twice everywhere: once into the solid, once out. A third crossing is
     * material that sits behind other material along the pull direction, which locks the mould.
     */
    function crossingsAlongAxis(mesh, faces, normals, u, v, uAxis, vAxis, pullKey, tangentialFacing) {
        // Crossings are counted by facing rather than by raw hit count. A face whose normal is
        // perpendicular to the pull axis is tangential to the line and contributes a grazing touch, not an
        // entry or an exit; counting those would report an undercut for every silhouette. A pattern that
        // leaves a two-part mould presents exactly one up-facing and one down-facing surface on every line.
        let up = 0, down = 0;
        for (let index = 0; index < faces.length; index++) {
            const normal = normals[index];
            if (!normal) continue;
            const facing = normal[pullKey];
            if (Math.abs(facing) <= tangentialFacing) continue;
            const t = triangleOf(mesh, faces[index]);
            const a = t[0], b = t[1], c = t[2];
            const au = a[uAxis] - u, av = a[vAxis] - v;
            const bu = b[uAxis] - u, bv = b[vAxis] - v;
            const cu = c[uAxis] - u, cv = c[vAxis] - v;
            const d1 = au * bv - av * bu;
            const d2 = bu * cv - bv * cu;
            const d3 = cu * av - cv * au;
            // Strict interior only. A sample that lands exactly on a shared edge lies in both adjacent
            // triangles and would be counted twice, which reads as an undercut that is not there.
            if (Math.abs(d1) < EPSILON || Math.abs(d2) < EPSILON || Math.abs(d3) < EPSILON) continue;
            const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
            const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
            if (hasNeg && hasPos) continue;
            if (facing > 0) up++; else down++;
        }
        return { up, down, total: up + down };
    }

    function normalOf(triangle) {
        const a = triangle[0], b = triangle[1], c = triangle[2];
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!(length > EPSILON)) return null;
        return { x: nx / length, y: ny / length, z: nz / length, area: length / 2 };
    }

    /**
     * Audits a closed loft mesh for two-part mould release along one axis. The mesh must be closed: an
     * open shell has no inside, so crossing counts carry no meaning and the audit refuses to grade it.
     */
    function auditDemouldability(mesh, options) {
        const opts = options || {};
        const axisName = String(opts.pullAxis || 'Z').toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(AXES, axisName)) {
            return { status: 'BLOCKER', findings: ['unsupported_pull_axis_' + axisName] };
        }
        const vertices = (mesh && mesh.vertices) || [];
        const faces = (mesh && mesh.faces) || [];
        if (!vertices.length || !faces.length) {
            return { status: 'BLOCKER', findings: ['empty_mesh'] };
        }
        if (mesh.validation && mesh.validation.closed === false) {
            return { status: 'BLOCKER', findings: ['mesh_not_closed'] };
        }

        const keys = ['x', 'y', 'z'];
        const pullKey = keys[AXES[axisName]];
        const uKey = keys[(AXES[axisName] + 1) % 3];
        const vKey = keys[(AXES[axisName] + 2) % 3];

        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        vertices.forEach(vertex => {
            uMin = Math.min(uMin, vertex[uKey]); uMax = Math.max(uMax, vertex[uKey]);
            vMin = Math.min(vMin, vertex[vKey]); vMax = Math.max(vMax, vertex[vKey]);
        });

        const grid = Math.max(8, Math.min(256, Math.round(finite(opts.gridResolution, DEFAULT_GRID))));
        // Sample points are the projected centroid of every triangle, plus a uniform grid. A blind grid
        // alone can step over a narrow overhang, and a missed undercut is the dangerous direction here:
        // it lets an operator print a pattern that locks in the cured mould. Probing every face guarantees
        // each surface patch is tested, independent of grid resolution.
        const samples = [];
        if (faces.length <= MAX_FACE_SAMPLES) {
            faces.forEach(face => {
                const t = triangleOf(mesh, face);
                if (!t[0] || !t[1] || !t[2]) return;
                samples.push([
                    (t[0][uKey] + t[1][uKey] + t[2][uKey]) / 3,
                    (t[0][vKey] + t[1][vKey] + t[2][vKey]) / 3
                ]);
            });
        }
        for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
                // Offset by half a cell so samples avoid the exact silhouette tangent of a symmetric section.
                samples.push([
                    uMin + (uMax - uMin) * (i + 0.5) / grid,
                    vMin + (vMax - vMin) * (j + 0.5) / grid
                ]);
            }
        }

        const minDraftDeg = Math.max(0, finite(opts.minDraftDeg, DEFAULT_MIN_DRAFT_DEG));
        const tangentialFacing = tangentialFacingFor(minDraftDeg);
        const faceNormals = faces.map(face => normalOf(triangleOf(mesh, face)));
        let raysInside = 0, undercutRays = 0, maxCrossings = 0;
        const undercutSamples = [];
        for (const sample of samples) {
            const hit = crossingsAlongAxis(mesh, faces, faceNormals, sample[0], sample[1], uKey, vKey, pullKey, tangentialFacing);
            if (hit.total === 0) continue;
            raysInside++;
            if (hit.total > maxCrossings) maxCrossings = hit.total;
            if (hit.up > 1 || hit.down > 1) {
                undercutRays++;
                if (undercutSamples.length < 12) {
                    undercutSamples.push({ [uKey]: round(sample[0], 4), [vKey]: round(sample[1], 4), upFacing: hit.up, downFacing: hit.down });
                }
            }
        }

        // Draft: a face whose normal is perpendicular to the pull axis is a vertical wall against the mould
        // and drags on release. A minimum draft angle is not reported, because every closed pattern has a
        // silhouette band where the draft is exactly zero by construction; the graded quantity is how much
        // surface area sits below the threshold.
        let lowDraftArea = 0, totalArea = 0;
        faces.forEach(face => {
            const normal = normalOf(triangleOf(mesh, face));
            if (!normal) return;
            totalArea += normal.area;
            const along = Math.abs(normal[pullKey]);
            const draftDeg = Math.asin(Math.min(1, Math.max(0, along))) * 180 / Math.PI;
            if (draftDeg < minDraftDeg) lowDraftArea += normal.area;
        });

        const lowDraftAreaFraction = totalArea > 0 ? lowDraftArea / totalArea : 0;
        const findings = [];
        if (undercutRays > 0) findings.push('undercut_relative_to_' + axisName + '_pull');
        if (lowDraftAreaFraction > 0.02) findings.push('low_draft_surface_area_fraction');

        return {
            schema: 'engrove-freeform-plug-mould-audit-v1',
            status: undercutRays > 0 ? 'BLOCKER' : (findings.length ? 'PARTIAL_PASS' : 'PASS_WITH_SCOPE'),
            pullAxis: axisName,
            partingPlaneNormal: axisName,
            gridResolution: grid,
            perFaceSampling: faces.length <= MAX_FACE_SAMPLES,
            raysThroughSolid: raysInside,
            undercutRayCount: undercutRays,
            maxSurfaceCrossings: maxCrossings,
            undercutSamples,
            twoPartMouldable: undercutRays === 0,
            minDraftDegThreshold: round(minDraftDeg, 6),
            lowDraftAreaFraction: round(lowDraftAreaFraction, 6),
            findings,
            claimBoundary: 'ray-sampled release check on the exported pattern mesh; not a mould-flow or tooling simulation'
        };
    }

    /**
     * Parting line for the audited pull axis: the extreme silhouette of the pattern at each sampled station
     * along its longest axis. These are the points a flat parting board must reach for a two-part mould.
     *
     * The station axis is chosen from the two axes perpendicular to the pull, longest first. It cannot be
     * the pull axis itself: walking stations along the pull direction would report the station coordinate
     * back as the parting height, which is why this is derived from the bounds rather than fixed to x.
     */
    function partingLine(mesh, options) {
        const opts = options || {};
        const axisName = String(opts.pullAxis || 'Z').toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(AXES, axisName)) return [];
        const keys = ['x', 'y', 'z'];
        const pullKey = keys[AXES[axisName]];
        const vertices = (mesh && mesh.vertices) || [];
        if (!vertices.length) return [];
        const across = keys.filter(key => key !== pullKey);
        const spanOf = key => {
            let low = Infinity, high = -Infinity;
            vertices.forEach(vertex => { low = Math.min(low, vertex[key]); high = Math.max(high, vertex[key]); });
            return high - low;
        };
        const stationKey = spanOf(across[0]) >= spanOf(across[1]) ? across[0] : across[1];
        const widthKey = across[0] === stationKey ? across[1] : across[0];
        let sMin = Infinity, sMax = -Infinity;
        vertices.forEach(vertex => { sMin = Math.min(sMin, vertex[stationKey]); sMax = Math.max(sMax, vertex[stationKey]); });
        const steps = Math.max(4, Math.min(128, Math.round(finite(opts.stations, 24))));
        const band = (sMax - sMin) / (steps * 2);
        const line = [];
        for (let i = 0; i < steps; i++) {
            const s = sMin + (sMax - sMin) * (i + 0.5) / steps;
            let wMin = Infinity, wMax = -Infinity, pAtMin = 0, pAtMax = 0;
            vertices.forEach(vertex => {
                if (Math.abs(vertex[stationKey] - s) > band) return;
                if (vertex[widthKey] < wMin) { wMin = vertex[widthKey]; pAtMin = vertex[pullKey]; }
                if (vertex[widthKey] > wMax) { wMax = vertex[widthKey]; pAtMax = vertex[pullKey]; }
            });
            if (!Number.isFinite(wMin) || !Number.isFinite(wMax)) continue;
            line.push({
                // The axis keys travel with every point so a consumer can place it in 3D without having to
                // re-derive which axis this call chose to walk.
                stationAxis: stationKey,
                widthAxis: widthKey,
                pullAxis: pullKey,
                stationMm: round(s, 4),
                minMm: round(wMin, 4),
                maxMm: round(wMax, 4),
                pullAtMinMm: round(pAtMin, 4),
                pullAtMaxMm: round(pAtMax, 4)
            });
        }
        return line;
    }

    return Object.freeze({
        auditDemouldability,
        partingLine
    });
});
