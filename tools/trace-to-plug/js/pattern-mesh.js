// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Measure and serialize a kernel pattern mesh without depending on a renderer.
 * Inputs: A kernel mesh of {vertices:[{x,y,z}], faces:[[a,b,c]]} and the units it was built in.
 * Outputs: Printable metrics and STL bytes or text; no DOM and no network access.
 * Safe edits: Additional derived metrics and additional serializers.
 * Do not: Serialize a mesh whose closure was not checked, or take geometry from a renderer object.
 * Verification: test/pattern-mesh.test.cjs
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PatternMesh = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const STL_HEADER_BYTES = 80;
    const STL_FACET_BYTES = 50;

    function triangles(mesh) {
        const vertices = (mesh && mesh.vertices) || [];
        const faces = (mesh && mesh.faces) || [];
        const out = [];
        for (let index = 0; index < faces.length; index++) {
            const face = faces[index];
            const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
            if (!a || !b || !c) continue;
            out.push([a, b, c]);
        }
        return out;
    }

    function normalOf(a, b, c) {
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        // A degenerate triangle has no direction to report. Zeroes are the STL convention for "derive it
        // from the winding", which is honest here: inventing a unit vector would hide the degeneracy.
        if (!(length > 0)) return { x: 0, y: 0, z: 0, area: 0 };
        return { x: nx / length, y: ny / length, z: nz / length, area: length / 2 };
    }

    /**
     * Closure from the topology itself. Every edge of a closed, manifold surface is shared by exactly two
     * triangles. This is computed rather than read off a flag, because the meshes reaching this module come
     * from two producers: the loft kernel sets `validation`, while a split half carries no such field, and
     * trusting the flag would let an open half through as closed.
     */
    function closure(mesh) {
        const counts = new Map();
        let degenerate = 0;
        const faces = (mesh && mesh.faces) || [];
        for (let index = 0; index < faces.length; index++) {
            const face = faces[index];
            if (face[0] === face[1] || face[1] === face[2] || face[0] === face[2]) { degenerate++; continue; }
            for (let corner = 0; corner < 3; corner++) {
                const a = face[corner], b = face[(corner + 1) % 3];
                const key = a < b ? a + ':' + b : b + ':' + a;
                counts.set(key, (counts.get(key) || 0) + 1);
            }
        }
        let boundary = 0, nonManifold = 0;
        counts.forEach(value => { if (value === 1) boundary++; else if (value > 2) nonManifold++; });
        return {
            closed: faces.length > 0 && boundary === 0 && nonManifold === 0,
            boundaryEdgeCount: boundary,
            nonManifoldEdgeCount: nonManifold,
            duplicateIndexFaceCount: degenerate
        };
    }

    /**
     * Signed volume by the divergence theorem over the closed surface. It is origin-independent only for a
     * closed, consistently wound surface, so `closed` is carried into the result and gates the volume: a
     * reader can see which of the two cases the number came from.
     */
    function metrics(mesh) {
        const tris = triangles(mesh);
        let volume = 0, area = 0, degenerate = 0;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let index = 0; index < tris.length; index++) {
            const a = tris[index][0], b = tris[index][1], c = tris[index][2];
            volume += (a.x * (b.y * c.z - c.y * b.z) - a.y * (b.x * c.z - c.x * b.z) + a.z * (b.x * c.y - c.x * b.y)) / 6;
            const normal = normalOf(a, b, c);
            area += normal.area;
            // Zero area, not a repeated index: three distinct but collinear vertices are just as unusable
            // to a slicer, and the index check alone would not catch them.
            if (!(normal.area > 0)) degenerate++;
            for (const point of tris[index]) {
                if (point.x < minX) minX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.z < minZ) minZ = point.z;
                if (point.x > maxX) maxX = point.x;
                if (point.y > maxY) maxY = point.y;
                if (point.z > maxZ) maxZ = point.z;
            }
        }
        const topology = closure(mesh);
        return {
            units: (mesh && mesh.units) || 'mm',
            closed: topology.closed,
            boundaryEdgeCount: topology.boundaryEdgeCount,
            nonManifoldEdgeCount: topology.nonManifoldEdgeCount,
            triangleCount: tris.length,
            degenerateTriangleCount: degenerate,
            surfaceAreaMm2: area,
            volumeMm3: volume,
            volumeIsMeaningful: topology.closed && degenerate === 0,
            bbox: tris.length
                ? { minX, minY, minZ, maxX, maxY, maxZ, lengthX: maxX - minX, lengthY: maxY - minY, lengthZ: maxZ - minZ }
                : null
        };
    }

    /** Rough printed mass, so an operator can sanity-check a pattern before committing filament to it. */
    function estimatedMassGrams(mesh, densityGramsPerCm3) {
        const measured = metrics(mesh);
        if (!measured.volumeIsMeaningful) return null;
        const density = Number(densityGramsPerCm3);
        if (!Number.isFinite(density) || density <= 0) return null;
        return (measured.volumeMm3 / 1000) * density;
    }

    function binarySTL(mesh, options) {
        const settings = options || {};
        const tris = triangles(mesh);
        const buffer = new ArrayBuffer(STL_HEADER_BYTES + 4 + tris.length * STL_FACET_BYTES);
        const view = new DataView(buffer);
        const header = String(settings.header || 'Engrove Trace to Plug pattern');
        for (let index = 0; index < STL_HEADER_BYTES; index++) {
            view.setUint8(index, index < header.length ? header.charCodeAt(index) & 0x7f : 0x20);
        }
        view.setUint32(STL_HEADER_BYTES, tris.length, true);
        let offset = STL_HEADER_BYTES + 4;
        for (let index = 0; index < tris.length; index++) {
            const a = tris[index][0], b = tris[index][1], c = tris[index][2];
            const normal = normalOf(a, b, c);
            view.setFloat32(offset, normal.x, true);
            view.setFloat32(offset + 4, normal.y, true);
            view.setFloat32(offset + 8, normal.z, true);
            const points = [a, b, c];
            for (let corner = 0; corner < 3; corner++) {
                const base = offset + 12 + corner * 12;
                view.setFloat32(base, points[corner].x, true);
                view.setFloat32(base + 4, points[corner].y, true);
                view.setFloat32(base + 8, points[corner].z, true);
            }
            view.setUint16(offset + 48, 0, true);
            offset += STL_FACET_BYTES;
        }
        return new Uint8Array(buffer);
    }

    function asciiSTL(mesh, options) {
        const settings = options || {};
        const name = String(settings.solidName || 'engrove_trace_to_plug_pattern').replace(/\s+/g, '_');
        const tris = triangles(mesh);
        const lines = ['solid ' + name];
        for (let index = 0; index < tris.length; index++) {
            const a = tris[index][0], b = tris[index][1], c = tris[index][2];
            const normal = normalOf(a, b, c);
            lines.push(' facet normal ' + normal.x.toExponential(6) + ' ' + normal.y.toExponential(6) + ' ' + normal.z.toExponential(6));
            lines.push('  outer loop');
            for (const point of [a, b, c]) {
                lines.push('   vertex ' + point.x.toFixed(6) + ' ' + point.y.toFixed(6) + ' ' + point.z.toFixed(6));
            }
            lines.push('  endloop');
            lines.push(' endfacet');
        }
        lines.push('endsolid ' + name);
        return lines.join('\n') + '\n';
    }

    /**
     * Refuses to serialize an unusable mesh. An open or degenerate pattern slices into something the
     * operator did not model, and a silent export is how that reaches a printer unnoticed.
     */
    function exportable(mesh) {
        const measured = metrics(mesh);
        const reasons = [];
        if (!measured.triangleCount) reasons.push('The pattern mesh has no triangles.');
        if (!measured.closed) {
            reasons.push('The pattern mesh is not closed: ' + measured.boundaryEdgeCount + ' open boundary edges and '
                + measured.nonManifoldEdgeCount + ' non-manifold edges.');
        }
        if (measured.degenerateTriangleCount > 0) reasons.push('The pattern mesh has ' + measured.degenerateTriangleCount + ' zero-area triangles.');
        if (measured.volumeIsMeaningful && measured.volumeMm3 <= 0) reasons.push('The pattern mesh encloses a non-positive volume; its faces are wound inside out.');
        return { ok: reasons.length === 0, reasons, metrics: measured };
    }

    return Object.freeze({ triangles, closure, metrics, estimatedMassGrams, binarySTL, asciiSTL, exportable });
});
