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
    // A registration feature must stay well inside the cut section or it would break through the wall.
    const MAX_FEATURE_RADIUS_FRACTION = 0.6;
    const DEFAULT_PIN_RADIUS_MM = 2;
    const DEFAULT_PIN_RADIUS_FRACTION = 0.4;
    const DEFAULT_PIN_DEPTH_MM = 4;
    const DEFAULT_PIN_CLEARANCE_MM = 0.15;
    // Chord flat as a fraction of the radius: keys the joint so the halves rejoin one way only.
    const DEFAULT_PIN_FLAT_FRACTION = 0.72;

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
     * Walks the unordered cut segments into a single ordered boundary loop. The plain cut face needs no
     * ordering, but a registration ring does: it pairs each boundary vertex with a point on the pin
     * profile, and that pairing is only meaningful along a consistent traversal.
     */
    function orderCutLoop(segments) {
        const key = point => point.x.toFixed(WELD_DECIMALS) + ',' + point.y.toFixed(WELD_DECIMALS) + ',' + point.z.toFixed(WELD_DECIMALS);
        const adjacency = new Map();
        const points = new Map();
        segments.forEach(segment => {
            const a = key(segment[0]), b = key(segment[1]);
            if (a === b) return;
            points.set(a, segment[0]); points.set(b, segment[1]);
            if (!adjacency.has(a)) adjacency.set(a, new Set());
            if (!adjacency.has(b)) adjacency.set(b, new Set());
            adjacency.get(a).add(b);
            adjacency.get(b).add(a);
        });
        if (!adjacency.size) return null;
        for (const [, neighbours] of adjacency) {
            // A single closed loop has exactly two neighbours everywhere. Anything else means the cut
            // produced branches or gaps, and a ring built across those would not be a surface.
            if (neighbours.size !== 2) return null;
        }
        const start = adjacency.keys().next().value;
        const loop = [start];
        let previous = null, current = start;
        for (let guard = 0; guard < adjacency.size + 1; guard++) {
            const next = [...adjacency.get(current)].find(candidate => candidate !== previous);
            if (next === undefined) return null;
            if (next === start) break;
            loop.push(next);
            previous = current;
            current = next;
        }
        if (loop.length !== adjacency.size) return null;
        return loop.map(id => points.get(id));
    }

    /**
     * Radius of the keyed pin profile at one angle. The profile is a circle with a single chord flat, so
     * the two halves can only be rejoined in one orientation; a plain circle would let them rotate and a
     * regular polygon would allow one alignment per side. Defining it radially keeps every profile point
     * at the same angle as its boundary partner, which is what makes the connecting ring a simple strip.
     */
    function keyedProfileRadius(angle, radius, flatFraction) {
        const cosine = Math.cos(angle);
        if (cosine <= 0) return radius;
        return Math.min(radius, radius * flatFraction / cosine);
    }

    /**
     * Measures the cut cross-section before either half is built, by intersecting every crossing edge with
     * the plane. Used to size a registration pin that fits the section rather than a fixed guess.
     */
    function cutSectionMetrics(mesh, axisKey, cut) {
        const points = [];
        (mesh.faces || []).forEach(face => {
            for (let i = 0; i < 3; i++) {
                const a = mesh.vertices[face[i]], b = mesh.vertices[face[(i + 1) % 3]];
                if (!a || !b) continue;
                const da = a[axisKey] - cut, db = b[axisKey] - cut;
                if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
                if (Math.abs(db - da) <= ON_PLANE) continue;
                points.push(lerpPoint(a, b, da / (da - db)));
            }
        });
        if (points.length < 3) return null;
        const [uKey, vKey] = ['x', 'y', 'z'].filter(key => key !== axisKey);
        let u = 0, v = 0;
        points.forEach(point => { u += point[uKey]; v += point[vKey]; });
        u /= points.length; v /= points.length;
        let inscribed = Infinity;
        points.forEach(point => {
            const du = point[uKey] - u, dv = point[vKey] - v;
            inscribed = Math.min(inscribed, Math.sqrt(du * du + dv * dv));
        });
        return { inscribedRadiusMm: inscribed };
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
        // Registration is opt-in: without it the cut faces stay flat and the operator aligns by hand.
        let registration = null;
        if (opts.registration) {
            // An unset radius is sized from the section itself: a fixed default would be refused on a slim
            // arm and be needlessly small on a thick one.
            const section = cutSectionMetrics(mesh, axisKey, cut);
            const suggested = section ? Math.min(DEFAULT_PIN_RADIUS_MM, section.inscribedRadiusMm * DEFAULT_PIN_RADIUS_FRACTION) : DEFAULT_PIN_RADIUS_MM;
            const requested = opts.registration.radiusMm;
            const radiusMm = Number(requested === undefined || requested === null || requested === '' || Number(requested) === 0 ? suggested : requested);
            const depthMm = Number(opts.registration.depthMm !== undefined ? opts.registration.depthMm : DEFAULT_PIN_DEPTH_MM);
            const clearanceMm = Number(opts.registration.clearanceMm !== undefined ? opts.registration.clearanceMm : DEFAULT_PIN_CLEARANCE_MM);
            const flatFraction = Number(opts.registration.flatFraction !== undefined ? opts.registration.flatFraction : DEFAULT_PIN_FLAT_FRACTION);
            if (!(radiusMm > 0) || !(depthMm > 0) || !(clearanceMm >= 0) || !(flatFraction > 0) || !(flatFraction < 1)) {
                return { ok: false, error: 'Registration needs a positive pin radius and depth, a non-negative fit clearance, and a flat fraction between 0 and 1.' };
            }
            if (depthMm + clearanceMm >= (max - min) * 0.5) {
                return { ok: false, error: 'A registration pin ' + round(depthMm, 3) + ' mm deep does not fit: each half is about ' + round((max - min) * 0.5, 3) + ' mm long on ' + axisName + '.' };
            }
            registration = { radiusMm, depthMm, clearanceMm, flatFraction, autoSized: requested === undefined || requested === null || requested === '' || Number(requested) === 0 };
        }

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

            /** Appends a triangle wound so its normal agrees with the requested direction. */
            const pushOriented = (triangle, desired) => {
                const normal = triangleNormal(triangle[0], triangle[1], triangle[2]);
                const ordered = (normal.x * desired.x + normal.y * desired.y + normal.z * desired.z) >= 0
                    ? triangle
                    : [triangle[0], triangle[2], triangle[1]];
                const ids = ordered.map(point => pool.add(point));
                if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) outFaces.push(ids);
            };

            if (!registration) {
                cutSegments.forEach(segment => {
                    const normal = triangleNormal(centre, segment[0], segment[1]);
                    const ordered = Math.sign(normal[axisKey]) === outwardSign ? segment : [segment[1], segment[0]];
                    const ids = [pool.add(centre), pool.add(ordered[0]), pool.add(ordered[1])];
                    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) outFaces.push(ids);
                });
            } else {
                const loop = orderCutLoop(cutSegments);
                if (!loop) return { ok: false, error: 'The cut boundary is not a single closed loop, so a registration feature cannot be fitted to it.' };

                // In-plane basis, and the smallest distance from the centre to the boundary. A feature is
                // only safe inside that inscribed radius, otherwise it would break through the outer wall.
                const [uKey, vKey] = ['x', 'y', 'z'].filter(k => k !== axisKey);
                let inscribed = Infinity;
                loop.forEach(point => {
                    const du = point[uKey] - centre[uKey], dv = point[vKey] - centre[vKey];
                    inscribed = Math.min(inscribed, Math.sqrt(du * du + dv * dv));
                });
                // The boss carries the nominal size; the socket is the same profile opened by the fit
                // clearance, so the printed pin can actually enter it.
                const featureRadius = registration.radiusMm + (keepPositive ? 0 : registration.clearanceMm);
                if (!(featureRadius > 0) || featureRadius > inscribed * MAX_FEATURE_RADIUS_FRACTION) {
                    return {
                        ok: false,
                        error: 'A registration pin of radius ' + round(registration.radiusMm, 3) + ' mm does not fit the cut section: the section is only '
                            + round(inscribed, 3) + ' mm from centre to wall, so the feature may not exceed '
                            + round(inscribed * MAX_FEATURE_RADIUS_FRACTION, 3) + ' mm. Move the split, or reduce the pin.'
                    };
                }
                // A boss stands out of the half, a socket is bored into it.
                const boss = keepPositive;
                const featureDepth = registration.depthMm + (boss ? 0 : registration.clearanceMm);
                const travel = boss ? outwardSign : -outwardSign;
                const at = (source, angle, radius, distance) => {
                    const point = { x: centre.x, y: centre.y, z: centre.z };
                    point[uKey] = centre[uKey] + Math.cos(angle) * radius;
                    point[vKey] = centre[vKey] + Math.sin(angle) * radius;
                    point[axisKey] = cut + travel * distance;
                    return point;
                };

                const angles = loop.map(point => Math.atan2(point[vKey] - centre[vKey], point[uKey] - centre[uKey]));
                const mouth = angles.map(angle => at(null, angle, keyedProfileRadius(angle, featureRadius, registration.flatFraction), 0));
                const far = angles.map(angle => at(null, angle, keyedProfileRadius(angle, featureRadius, registration.flatFraction), featureDepth));
                const capNormal = { x: 0, y: 0, z: 0 };
                capNormal[axisKey] = outwardSign;

                // Cut face becomes a ring between the boundary and the feature profile.
                for (let i = 0; i < loop.length; i++) {
                    const j = (i + 1) % loop.length;
                    pushOriented([loop[i], loop[j], mouth[j]], capNormal);
                    pushOriented([loop[i], mouth[j], mouth[i]], capNormal);
                }
                // Feature wall. A boss presents its outside to the world, a socket presents its inside.
                for (let i = 0; i < loop.length; i++) {
                    const j = (i + 1) % loop.length;
                    const radial = { x: 0, y: 0, z: 0 };
                    radial[uKey] = (mouth[i][uKey] + mouth[j][uKey]) / 2 - centre[uKey];
                    radial[vKey] = (mouth[i][vKey] + mouth[j][vKey]) / 2 - centre[vKey];
                    if (!boss) { radial[uKey] = -radial[uKey]; radial[vKey] = -radial[vKey]; }
                    pushOriented([mouth[i], mouth[j], far[j]], radial);
                    pushOriented([mouth[i], far[j], far[i]], radial);
                }
                // Far end: the top of a boss faces away from the half, the bottom of a socket faces back
                // towards its own mouth, which is the same direction either way.
                const farCentre = at(null, 0, 0, featureDepth);
                const endNormal = { x: 0, y: 0, z: 0 };
                endNormal[axisKey] = boss ? outwardSign : outwardSign;
                for (let i = 0; i < loop.length; i++) {
                    pushOriented([farCentre, far[i], far[(i + 1) % loop.length]], endNormal);
                }
            }

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
                    metadata: {
                        splitAxis: axisName,
                        splitAtMm: round(cut, 6),
                        clearanceMm: round(clearance, 6),
                        keepPositive,
                        registration: registration
                            ? { feature: keepPositive ? 'boss' : 'socket', radiusMm: round(registration.radiusMm, 6), depthMm: round(registration.depthMm, 6), clearanceMm: round(registration.clearanceMm, 6) }
                            : null
                    }
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
            registration: registration
                ? { radiusMm: round(registration.radiusMm, 6), depthMm: round(registration.depthMm, 6), clearanceMm: round(registration.clearanceMm, 6), autoSized: registration.autoSized, bossOn: 'partA', socketOn: 'partB' }
                : null,
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
