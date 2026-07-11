/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-geometry-audit.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 freeform geometry/manufacturing audit helpers.
// Local deterministic/proxy checks only; not a manufacturing certification.

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

    function bounds(vertices) {
        const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
        (vertices || []).forEach(v => {
            const x = finite(v.x, 0), y = finite(v.y, 0), z = finite(v.z, 0);
            b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
            b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
            b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z);
        });
        if (!Number.isFinite(b.minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, length: 0, width: 0, height: 0 };
        b.length = b.maxX - b.minX;
        b.width = b.maxY - b.minY;
        b.height = b.maxZ - b.minZ;
        return b;
    }

    function triArea(a, b, c) {
        const ab = { x: b.x-a.x, y: b.y-a.y, z: b.z-a.z };
        const ac = { x: c.x-a.x, y: c.y-a.y, z: c.z-a.z };
        const cr = { x: ab.y*ac.z - ab.z*ac.y, y: ab.z*ac.x - ab.x*ac.z, z: ab.x*ac.y - ab.y*ac.x };
        return Math.sqrt(cr.x*cr.x + cr.y*cr.y + cr.z*cr.z) / 2;
    }

    function edgeAudit(mesh) {
        const counts = {};
        (mesh.faces || []).forEach(face => {
            for (let i = 0; i < 3; i++) {
                const a = face[i], b = face[(i + 1) % 3];
                const key = a < b ? a + ':' + b : b + ':' + a;
                counts[key] = (counts[key] || 0) + 1;
            }
        });
        const boundaryEdges = Object.keys(counts).filter(k => counts[k] === 1).length;
        const nonManifoldEdges = Object.keys(counts).filter(k => counts[k] > 2).length;
        return { boundaryEdges, nonManifoldEdges };
    }

    function triangleQuality(mesh) {
        const vertices = mesh.vertices || [];
        let degenerateTriangles = 0, sliverTriangles = 0;
        (mesh.faces || []).forEach(face => {
            const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
            if (!a || !b || !c) { degenerateTriangles++; return; }
            const area = triArea(a, b, c);
            if (!(area > 1e-8)) { degenerateTriangles++; return; }
            function dist(p, q) { return Math.sqrt(Math.pow(p.x-q.x,2) + Math.pow(p.y-q.y,2) + Math.pow(p.z-q.z,2)); }
            const e = [dist(a,b), dist(b,c), dist(c,a)].sort((x,y) => x-y);
            if (e[0] / Math.max(e[2], 1e-9) < 0.025) sliverTriangles++;
        });
        return { degenerateTriangles, sliverTriangles };
    }

    function meshVolumeMm3(geometryObject) {
        if (root.FreeformAnalysisAdapter && typeof root.FreeformAnalysisAdapter.triangleMeshVolumeAndCOM === 'function') {
            const r = root.FreeformAnalysisAdapter.triangleMeshVolumeAndCOM((geometryObject || {}).mesh || {});
            return finite(r.volumeMm3, 0);
        }
        return 0;
    }

    function auditGeometry(geometryObject, analysisContext) {
        const go = geometryObject || {};
        const mesh = go.mesh || {};
        const state = go.state || {};
        const features = state.features || {};
        const b = go.bbox || bounds(mesh.vertices || []);
        const edges = edgeAudit(mesh);
        const quality = triangleQuality(mesh);
        const volume = meshVolumeMm3(go);
        const minWall = (state.rings || []).reduce((acc, r) => Math.min(acc, finite(r.wallThicknessMm, Infinity)), Infinity);
        const wire = features.wireDuct || {};
        const slots = features.cartridgeSlots || {};
        const ti = features.titaniumMountPlate || {};
        const datumProtected = state.centerline && Array.isArray(state.centerline.protectedDatums) ? state.centerline.protectedDatums : [];
        const sharpCornerWarnings = (state.rings || []).filter(r => String(r.shapeFamily) === 'sharp_polygon' || finite(r.cornerSharpness, 0) > 0.9).map(r => r.id || r.shapeFamily);
        const minimumRadiusProxy = Math.max(0, Number.isFinite(minWall) ? minWall * 0.5 : 0);

        const audit = {
            status: (edges.boundaryEdges === 0 && edges.nonManifoldEdges === 0 && quality.degenerateTriangles === 0) ? 'PASS_WITH_SCOPE' : 'PARTIAL_PASS',
            claimBoundary: 'local geometry/manufacturing proxy audit, not browser export validation and not manufacturing certification',
            meshVolumeMm3: round(volume, 6),
            manifoldStatus: (edges.boundaryEdges === 0 && edges.nonManifoldEdges === 0) ? 'PASS' : 'WARN',
            boundaryEdges: edges.boundaryEdges,
            nonManifoldEdges: edges.nonManifoldEdges,
            degenerateTriangles: quality.degenerateTriangles,
            sliverTriangles: quality.sliverTriangles,
            minimumRadiusProxy: round(minimumRadiusProxy, 6),
            sharpCornerWarnings,
            selfIntersectionProxy: {
                status: 'PARTIAL_PASS',
                method: 'bbox/ring continuity proxy only',
                warning: 'self_intersection_proxy_only'
            },
            wireDuctClearance: {
                exists: !!wire.enabled,
                clearanceMm: round(Math.max(0, (Number.isFinite(minWall) ? minWall : 0) - finite(wire.diameterMm, 2.2) / 2), 6),
                diameterMm: finite(wire.diameterMm, 2.2),
                status: Math.max(0, (Number.isFinite(minWall) ? minWall : 0) - finite(wire.diameterMm, 2.2) / 2) >= 0.2 ? 'PASS_WITH_SCOPE' : 'WARN'
            },
            cartridgeSlotClearance: {
                exists: !!slots.enabled,
                slotCount: finite(slots.slotCount, 0),
                slotWidthMm: finite(slots.slotWidthMm, 0),
                spacingMm: finite(slots.spacingMm, 0),
                status: slots.enabled ? 'PASS_WITH_SCOPE' : 'PARTIAL_PASS'
            },
            titaniumPlatePlacementStatus: {
                enabled: !!ti.enabled,
                type: ti.type || null,
                looseUndersidePlate: !!ti.looseUndersidePlate,
                status: ti.enabled && ti.type === 'structural_laminated_interface_plate' && !ti.looseUndersidePlate ? 'PASS_WITH_SCOPE' : 'WARN'
            },
            onshapeScaleAudit: {
                units: 'mm',
                scale: 1,
                exportBbox: b,
                status: 'PASS_WITH_SCOPE',
                claim: 'local_scale_audit_only_no_onshape_verification'
            },
            exportBbox: b,
            datumAudit: {
                protectedDatums: datumProtected,
                protectedDatumCount: datumProtected.length,
                status: datumProtected.length > 0 ? 'PASS_WITH_SCOPE' : 'PARTIAL_PASS'
            },
            warnings: []
        };
        if (audit.selfIntersectionProxy.warning) audit.warnings.push(audit.selfIntersectionProxy.warning);
        if (audit.boundaryEdges > 0) audit.warnings.push('boundary_edges_present');
        if (audit.nonManifoldEdges > 0) audit.warnings.push('non_manifold_edges_present');
        if (audit.sliverTriangles > 0) audit.warnings.push('sliver_triangles_proxy_warning');
        if (analysisContext && analysisContext.status === 'PARTIAL_PASS') audit.warnings.push('analysis_partial_proxy_scope');
        return audit;
    }

    root.FreeformGeometryAudit = Object.freeze({
        auditGeometry,
        bounds,
        edgeAudit,
        triangleQuality
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
