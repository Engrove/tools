// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Cut a closed freeform loft pattern into two printable halves across one axis and cap both cut faces.
 * Inputs: A closed loft mesh, a cut position on the chosen axis, and an optional clearance.
 * Outputs: Two closed meshes plus the cut-face metrics; no geometry is repaired and no DOM is touched.
 * Safe edits: Cut-face capping, clearance handling, and reported metrics.
 * Do not: Cut an unclosed mesh, weld across the cut, or return a half whose cut face was left open.
 * Verification: test/freeform-pattern-split.test.cjs
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.FreeformPatternSplit = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const AXIS_KEYS = Object.freeze({ X: 'x', Y: 'y', Z: 'z' });
    const WELD_DECIMALS = 5;
    const ON_PLANE = 1e-7;

    function round(value, digits) {
        const f = Math.pow(10, digits === undefined ? 6 : digits);
        return Math.round(Number(value) * f) / f;
    }

    /** Accumulates vertices with coordinate welding so the two halves stay index-manifold. */
    function VertexPool() {
        this.vertices = [];
        this.index = new Map();
    }
    VertexPool.prototype.add = function(point) {
        const key = point.x.toFixed(WELD_DECIMALS) + ',' + point.y.toFixed(WELD_DECIMALS) + ',' + point.z.toFixed(WELD_DECIMALS);
        const existing = this.index.get(key);
        if (existing !== undefined) return existing;
        const id = this.vertices.length;
        this.vertices.push({ x: point.x, y: point.y, z: point.z });
        this.index.set(key, id);
        return id;
    };

    function lerpPoint(a, b, t) {
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }

    function triangleNormal(a, b, c) {
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx };
    }

    /**
     * Clips one triangle against the cut plane and appends the surviving pieces to the requested side.
     * Points exactly on the plane are treated as belonging to both sides, so no sliver is produced and
     * the cut boundary stays shared between the halves.
     */
    function clipTriangle(points, distances, keepPositive) {
        const inside = [];
        for (let i = 0; i < 3; i++) {
            const current = points[i], next = points[(i + 1) % 3];
            const dCurrent = distances[i], dNext = distances[(i + 1) % 3];
            const currentIn = keepPositive ? dCurrent >= -ON_PLANE : dCurrent <= ON_PLANE;
            const nextIn = keepPositive ? dNext >= -ON_PLANE : dNext <= ON_PLANE;
            if (currentIn) inside.push(current);
            if (currentIn !== nextIn && Math.abs(dNext - dCurrent) > ON_PLANE) {
                inside.push(lerpPoint(current, next, dCurrent / (dCurrent - dNext)));
            }
        }
        return inside;
    }

    function fanTriangles(polygon) {
        const output = [];
        for (let i = 1; i < polygon.length - 1; i++) output.push([polygon[0], polygon[i], polygon[i + 1]]);
        return output;
    }

    /**
     * Splits a closed pattern into two closed halves across one axis. Each half is capped by fanning the
     * cut boundary to its centroid: the cut segments are emitted once per half by the clipper, so the cap
     * needs no global loop ordering, only a consistent outward winding.
     */
    function splitPattern(mesh, options) {
        const opts = options || {};
        const axisName = String(opts.axis || 'X').toUpperCase();
        const axisKey = AXIS_KEYS[axisName];
        if (!axisKey) return { ok: false, error: 'Unsupported split axis ' + axisName + '.' };
        const vertices = (mesh && mesh.vertices) || [];
        const faces = (mesh && mesh.faces) || [];
        if (!vertices.length || !faces.length) return { ok: false, error: 'Split needs a mesh with geometry.' };
        if (mesh.validation && mesh.validation.closed === false) {
            return { ok: false, error: 'Split needs a closed pattern; the source mesh reports open boundary edges.' };
        }

        let min = Infinity, max = -Infinity;
        vertices.forEach(vertex => { min = Math.min(min, vertex[axisKey]); max = Math.max(max, vertex[axisKey]); });
        const cut = Number(opts.at !== undefined ? opts.at : (min + max) / 2);
        if (!Number.isFinite(cut) || cut <= min + ON_PLANE || cut >= max - ON_PLANE) {
            return { ok: false, error: 'Split position ' + cut + ' must lie strictly inside the pattern extent ' + round(min, 3) + '–' + round(max, 3) + ' mm on ' + axisName + '.' };
        }
        // A positive clearance shrinks each half away from the cut plane so the printed parts do not
        // interfere when they are rejoined. It is reported, never applied silently.
        const clearance = Math.max(0, Number(opts.clearanceMm) || 0);

        const halves = [true, false].map(keepPositive => {
            const pool = new VertexPool();
            const outFaces = [];
            const cutSegments = [];
            const shift = keepPositive ? clearance / 2 : -clearance / 2;

            faces.forEach(face => {
                const points = [vertices[face[0]], vertices[face[1]], vertices[face[2]]];
                if (!points[0] || !points[1] || !points[2]) return;
                const distances = points.map(point => point[axisKey] - cut);
                const polygon = clipTriangle(points, distances, keepPositive);
                if (polygon.length < 3) return;
                fanTriangles(polygon).forEach(triangle => {
                    const ids = triangle.map(point => pool.add(point));
                    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) outFaces.push(ids);
                });
                // The clipped polygon's edge that lies on the plane is this triangle's contribution to the
                // cut boundary. Collect it now, while the winding of the surrounding surface is known.
                for (let i = 0; i < polygon.length; i++) {
                    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
                    if (Math.abs(a[axisKey] - cut) <= ON_PLANE && Math.abs(b[axisKey] - cut) <= ON_PLANE) {
                        cutSegments.push([a, b]);
                    }
                }
            });

            if (!cutSegments.length) return { ok: false, error: 'The cut plane did not intersect the pattern surface.' };

            let cx = 0, cy = 0, cz = 0, count = 0;
            cutSegments.forEach(segment => segment.forEach(point => { cx += point.x; cy += point.y; cz += point.z; count++; }));
            const centre = { x: cx / count, y: cy / count, z: cz / count };
            // Outward for the kept half points away from the retained material.
            const outwardSign = keepPositive ? -1 : 1;
            cutSegments.forEach(segment => {
                const normal = triangleNormal(centre, segment[0], segment[1]);
                const ordered = Math.sign(normal[axisKey]) === outwardSign ? segment : [segment[1], segment[0]];
                const ids = [pool.add(centre), pool.add(ordered[0]), pool.add(ordered[1])];
                if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) outFaces.push(ids);
            });

            if (shift !== 0) pool.vertices.forEach(vertex => { vertex[axisKey] += shift; });

            return {
                ok: true,
                mesh: {
                    schema: 'tonearm-designer-freeform-loft-mesh-v1',
                    generator: 'freeform pattern split',
                    units: 'mm',
                    vertices: pool.vertices,
                    faces: outFaces,
                    triangles: outFaces,
                    stations: [],
                    metadata: { splitAxis: axisName, splitAtMm: round(cut, 6), clearanceMm: round(clearance, 6), keepPositive }
                }
            };
        });

        const failed = halves.find(half => !half.ok);
        if (failed) return { ok: false, error: failed.error };

        return {
            ok: true,
            schema: 'engrove-freeform-pattern-split-v1',
            axis: axisName,
            atMm: round(cut, 6),
            clearanceMm: round(clearance, 6),
            extentMm: { min: round(min, 6), max: round(max, 6) },
            partA: halves[0].mesh,
            partB: halves[1].mesh
        };
    }

    /** Independent closure check so a caller can refuse a half that the cut left open. */
    function meshClosure(mesh) {
        const counts = new Map();
        let degenerate = 0;
        (mesh.faces || []).forEach(face => {
            if (face[0] === face[1] || face[1] === face[2] || face[0] === face[2]) { degenerate++; return; }
            for (let i = 0; i < 3; i++) {
                const a = face[i], b = face[(i + 1) % 3];
                const key = a < b ? a + ':' + b : b + ':' + a;
                counts.set(key, (counts.get(key) || 0) + 1);
            }
        });
        let boundary = 0, nonManifold = 0;
        counts.forEach(value => { if (value === 1) boundary++; else if (value > 2) nonManifold++; });
        return {
            closed: boundary === 0 && nonManifold === 0,
            boundaryEdgeCount: boundary,
            nonManifoldEdgeCount: nonManifold,
            degenerateFaceCount: degenerate,
            vertexCount: (mesh.vertices || []).length,
            faceCount: (mesh.faces || []).length
        };
    }

    return Object.freeze({ splitPattern, meshClosure });
});
