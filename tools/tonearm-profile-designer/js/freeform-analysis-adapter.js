/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-analysis-adapter.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Freeform physical-analysis adapter.
// Bridges generated freeform mesh/object to mass, COM/COG, inertia and audit-style fields expected by existing analysis/export pipeline.

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

    function sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }

    function cross(a, b) {
        return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x };
    }

    function dot(a, b) {
        return a.x*b.x + a.y*b.y + a.z*b.z;
    }

    function bounds(vertices) {
        const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
        (vertices || []).forEach(v => {
            b.minX = Math.min(b.minX, finite(v.x, 0)); b.maxX = Math.max(b.maxX, finite(v.x, 0));
            b.minY = Math.min(b.minY, finite(v.y, 0)); b.maxY = Math.max(b.maxY, finite(v.y, 0));
            b.minZ = Math.min(b.minZ, finite(v.z, 0)); b.maxZ = Math.max(b.maxZ, finite(v.z, 0));
        });
        b.width = b.maxY - b.minY;
        b.height = b.maxZ - b.minZ;
        b.length = b.maxX - b.minX;
        return b;
    }

    function pointInsideBounds(p, b, toleranceMm) {
        const t = finite(toleranceMm, 2);
        return !!p &&
            p.x >= b.minX - t && p.x <= b.maxX + t &&
            p.y >= b.minY - t && p.y <= b.maxY + t &&
            p.z >= b.minZ - t && p.z <= b.maxZ + t;
    }

    function triangleAreaAndCentroid(a, b, c) {
        const ab = sub(b, a);
        const ac = sub(c, a);
        const cr = cross(ab, ac);
        const area = Math.sqrt(cr.x*cr.x + cr.y*cr.y + cr.z*cr.z) / 2;
        return {
            area,
            centroid: {
                x: (a.x + b.x + c.x) / 3,
                y: (a.y + b.y + c.y) / 3,
                z: (a.z + b.z + c.z) / 3
            }
        };
    }

    function areaWeightedCentroid(mesh) {
        const vertices = mesh && mesh.vertices ? mesh.vertices : [];
        const faces = mesh && mesh.faces ? mesh.faces : [];
        let areaSum = 0;
        let cx = 0, cy = 0, cz = 0;
        faces.forEach(face => {
            const a = vertices[face[0]];
            const b = vertices[face[1]];
            const c = vertices[face[2]];
            if (!a || !b || !c) return;
            const ac = triangleAreaAndCentroid(a, b, c);
            if (!(ac.area > 0)) return;
            areaSum += ac.area;
            cx += ac.centroid.x * ac.area;
            cy += ac.centroid.y * ac.area;
            cz += ac.centroid.z * ac.area;
        });
        if (areaSum > 1e-12) return { x: cx / areaSum, y: cy / areaSum, z: cz / areaSum, method: 'triangle_area_weighted_centroid' };
        const b = bounds(vertices);
        return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2, method: 'bbox_centroid_fallback' };
    }

    function triangleMeshVolumeAndCOM(mesh) {
        const vertices = mesh && mesh.vertices ? mesh.vertices : [];
        const faces = mesh && mesh.faces ? mesh.faces : [];
        const b = bounds(vertices);
        const warnings = [];
        const cfg = {
            bboxToleranceMm: 2,
            comDisagreementToleranceMm: 40,
            signedAbsVolumeRatioMin: 0.65
        };
        const bboxCentroid = {
            x: (b.minX + b.maxX) / 2,
            y: (b.minY + b.maxY) / 2,
            z: (b.minZ + b.maxZ) / 2,
            method: 'bbox_centroid'
        };

        function pointFinite(p) {
            return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
        }

        function distance(a, bb) {
            if (!pointFinite(a) || !pointFinite(bb)) return Infinity;
            const dx = a.x - bb.x;
            const dy = a.y - bb.y;
            const dz = a.z - bb.z;
            return Math.sqrt(dx*dx + dy*dy + dz*dz);
        }

        let signedVolume = 0;
        let absTetraVolume = 0;
        let cxSigned = 0, cySigned = 0, czSigned = 0;
        let cxAbs = 0, cyAbs = 0, czAbs = 0;

        faces.forEach(face => {
            const a = vertices[face[0]];
            const bb = vertices[face[1]];
            const c = vertices[face[2]];
            if (!a || !bb || !c) return;
            const v = dot(a, cross(bb, c)) / 6;
            if (!Number.isFinite(v)) return;
            const centroid4 = {
                x: (a.x + bb.x + c.x) / 4,
                y: (a.y + bb.y + c.y) / 4,
                z: (a.z + bb.z + c.z) / 4
            };
            signedVolume += v;
            absTetraVolume += Math.abs(v);
            cxSigned += centroid4.x * v; cySigned += centroid4.y * v; czSigned += centroid4.z * v;
            cxAbs += centroid4.x * Math.abs(v); cyAbs += centroid4.y * Math.abs(v); czAbs += centroid4.z * Math.abs(v);
        });

        const signedCom = (Number.isFinite(signedVolume) && Math.abs(signedVolume) > 1e-9) ? {
            x: cxSigned / signedVolume,
            y: cySigned / signedVolume,
            z: czSigned / signedVolume,
            method: 'signed_tetra_mesh'
        } : null;

        const absCom = (Number.isFinite(absTetraVolume) && absTetraVolume > 1e-9) ? {
            x: cxAbs / absTetraVolume,
            y: cyAbs / absTetraVolume,
            z: czAbs / absTetraVolume,
            method: 'absolute_tetra_winding_fallback'
        } : null;

        const areaComRaw = areaWeightedCentroid(mesh);
        const areaCom = {
            x: areaComRaw.x,
            y: areaComRaw.y,
            z: areaComRaw.z,
            method: areaComRaw.method || 'triangle_area_weighted_centroid'
        };

        const signedAbsVolumeRatio = absTetraVolume > 1e-9 && Number.isFinite(signedVolume) ? Math.abs(signedVolume) / absTetraVolume : 0;
        const signedVsAbsComDistance = distance(signedCom, absCom);
        const signedVsAreaCentroidDistance = distance(signedCom, areaCom);
        const absVsAreaCentroidDistance = distance(absCom, areaCom);
        const signedInside = pointInsideBounds(signedCom, b, cfg.bboxToleranceMm);
        const absInside = pointInsideBounds(absCom, b, cfg.bboxToleranceMm);
        const areaInside = pointInsideBounds(areaCom, b, cfg.bboxToleranceMm);

        const signedLooksStable = pointFinite(signedCom) &&
            signedInside &&
            Number.isFinite(signedVolume) &&
            Math.abs(signedVolume) > 1e-9 &&
            signedAbsVolumeRatio >= cfg.signedAbsVolumeRatioMin &&
            signedVsAbsComDistance <= cfg.comDisagreementToleranceMm &&
            signedVsAreaCentroidDistance <= cfg.comDisagreementToleranceMm;

        let method = 'signed_tetra_mesh';
        let volume = Math.abs(signedVolume);
        let com = signedCom;

        if (!signedLooksStable) {
            warnings.push('signed_tetra_com_rejected_by_robustness_guard');
            if (!(Number.isFinite(signedVolume) && Math.abs(signedVolume) > 1e-9)) warnings.push('signed_volume_invalid_or_too_small');
            if (signedAbsVolumeRatio < cfg.signedAbsVolumeRatioMin) warnings.push('signed_abs_volume_ratio_below_threshold');
            if (!signedInside) warnings.push('signed_com_outside_bbox_tolerance');
            if (signedVsAbsComDistance > cfg.comDisagreementToleranceMm) warnings.push('signed_vs_absolute_com_disagreement');
            if (signedVsAreaCentroidDistance > cfg.comDisagreementToleranceMm) warnings.push('signed_vs_area_centroid_disagreement');

            if (pointFinite(absCom) && absInside && absVsAreaCentroidDistance <= Math.max(cfg.comDisagreementToleranceMm * 2, 80)) {
                com = absCom;
                volume = absTetraVolume;
                method = 'absolute_tetra_winding_fallback';
                warnings.push('used_absolute_tetra_winding_fallback');
            } else if (pointFinite(areaCom) && areaInside) {
                com = areaCom;
                volume = absTetraVolume > 1e-9 ? absTetraVolume : Math.max(0, b.length * b.width * b.height * 0.45);
                method = areaCom.method || 'triangle_area_weighted_centroid';
                warnings.push('used_area_weighted_centroid_fallback');
            } else {
                com = bboxCentroid;
                volume = absTetraVolume > 1e-9 ? absTetraVolume : Math.max(0, b.length * b.width * b.height * 0.45);
                method = 'bbox_centroid_hard_guard';
                warnings.push('used_bbox_centroid_hard_guard');
            }
        }

        if (!pointFinite(com) || !pointInsideBounds(com, b, cfg.bboxToleranceMm)) {
            com = pointFinite(areaCom) && areaInside ? areaCom : bboxCentroid;
            volume = absTetraVolume > 1e-9 ? absTetraVolume : Math.max(0, b.length * b.width * b.height * 0.45);
            method = pointFinite(areaCom) && areaInside ? (areaCom.method || 'triangle_area_weighted_centroid') : 'bbox_centroid_hard_guard';
            warnings.push('used_final_com_bbox_sanity_guard');
        }

        const selectedVsAbsComDistance = distance(com, absCom);
        const selectedVsAreaCentroidDistance = distance(com, areaCom);
        const comInsideBbox = pointInsideBounds(com, b, cfg.bboxToleranceMm);
        const robustEnough = comInsideBbox &&
            pointFinite(com) &&
            (method !== 'signed_tetra_mesh' || signedLooksStable) &&
            (method === 'bbox_centroid_hard_guard' || selectedVsAbsComDistance <= Math.max(cfg.comDisagreementToleranceMm * 2, 80) || selectedVsAreaCentroidDistance <= Math.max(cfg.comDisagreementToleranceMm * 2, 80));

        const sanityMetrics = {
            signedVolume: round(signedVolume, 6),
            absTetraVolume: round(absTetraVolume, 6),
            signedAbsVolumeRatio: round(signedAbsVolumeRatio, 6),
            signedCOM: signedCom ? { x: round(signedCom.x, 6), y: round(signedCom.y, 6), z: round(signedCom.z, 6) } : null,
            absoluteTetraCOM: absCom ? { x: round(absCom.x, 6), y: round(absCom.y, 6), z: round(absCom.z, 6) } : null,
            areaWeightedCentroid: pointFinite(areaCom) ? { x: round(areaCom.x, 6), y: round(areaCom.y, 6), z: round(areaCom.z, 6), method: areaCom.method } : null,
            bboxCentroid: { x: round(bboxCentroid.x, 6), y: round(bboxCentroid.y, 6), z: round(bboxCentroid.z, 6) },
            signedVsAbsComDistance: round(signedVsAbsComDistance, 6),
            signedVsAreaCentroidDistance: round(signedVsAreaCentroidDistance, 6),
            absVsAreaCentroidDistance: round(absVsAreaCentroidDistance, 6),
            selectedVsAbsComDistance: round(selectedVsAbsComDistance, 6),
            selectedVsAreaCentroidDistance: round(selectedVsAreaCentroidDistance, 6),
            comInsideBbox,
            bboxToleranceMm: cfg.bboxToleranceMm,
            comDisagreementToleranceMm: cfg.comDisagreementToleranceMm,
            signedAbsVolumeRatioMin: cfg.signedAbsVolumeRatioMin,
            selectedMethod: method,
            signedMethodAccepted: method === 'signed_tetra_mesh'
        };

        return {
            volumeMm3: Math.max(0, Number.isFinite(volume) ? volume : 0),
            signedVolume,
            absTetraVolume,
            com,
            method,
            warnings,
            comSanity: {
                ok: !!robustEnough,
                status: robustEnough ? 'PASS' : 'BLOCKER',
                toleranceMm: cfg.bboxToleranceMm,
                bounds: b,
                metrics: sanityMetrics
            }
        };
    }

    function inertiaProxy(mesh, massG, com) {
        const vertices = mesh && mesh.vertices ? mesh.vertices : [];
        const m = finite(massG, 0) / Math.max(1, vertices.length);
        let ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
        vertices.forEach(v => {
            const dx = finite(v.x, 0) - com.x;
            const dy = finite(v.y, 0) - com.y;
            const dz = finite(v.z, 0) - com.z;
            ixx += m * (dy*dy + dz*dz);
            iyy += m * (dx*dx + dz*dz);
            izz += m * (dx*dx + dy*dy);
            ixy -= m * dx * dy;
            ixz -= m * dx * dz;
            iyz -= m * dy * dz;
        });
        return {
            ixxGmm2: round(ixx, 6),
            iyyGmm2: round(iyy, 6),
            izzGmm2: round(izz, 6),
            ixyGmm2: round(ixy, 6),
            ixzGmm2: round(ixz, 6),
            iyzGmm2: round(iyz, 6)
        };
    }

    function featureMasses(features) {
        const f = features || {};
        const ti = f.titaniumMountPlate || {};
        const cw = f.counterweightStack || {};
        const titaniumVolumeMm3 = ti.enabled ? finite(ti.lengthMm, 0) * finite(ti.widthMm, 0) * finite(ti.thicknessMm, 0) : 0;
        const titaniumMassG = titaniumVolumeMm3 / 1000 * 4.43;
        const counterweightMassG = cw.enabled ? Math.max(0, Math.round(finite(cw.discCount, 0))) * finite(cw.discMassG, 0) + finite(cw.fineTrimMassG, 0) : 0;
        return {
            titaniumMountPlateG: round(titaniumMassG, 6),
            counterweightStackG: round(counterweightMassG, 6),
            accessoryTotalG: round(titaniumMassG + counterweightMassG, 6)
        };
    }

    function estimateResonance(effectiveMassG, compliance10Hz) {
        const m = finite(effectiveMassG, 0);
        const c = finite(compliance10Hz, 12);
        if (root.Physics && typeof root.Physics.calculateResonance === 'function') return root.Physics.calculateResonance(m, c);
        return m > 0 && c > 0 ? 1000 / (2 * Math.PI * Math.sqrt(m * c)) : 0;
    }

    function makeAdapterInput(geometryObject) {
        const go = geometryObject || (root.FreeformLoftKernel && root.FreeformLoftKernel.createIntermediateGeometryObject ? root.FreeformLoftKernel.createIntermediateGeometryObject() : null);
        if (!go || !go.mesh) return { ok: false, error: 'missing freeform geometry object' };
        const mesh = go.mesh;
        const state = go.state || {};
        const b = bounds(mesh.vertices);
        const solid = triangleMeshVolumeAndCOM(mesh);
        const features = state.features || {};
        const massParts = featureMasses(features);
        const materialDensity = finite(state.analysisTargets && state.analysisTargets.materialDensityGPerCm3, 1.25);
        const bodyMassG = solid.volumeMm3 / 1000 * materialDensity;
        const totalMassG = bodyMassG + massParts.accessoryTotalG;
        const com = solid.com;
        const inertia = inertiaProxy(mesh, Math.max(totalMassG, 0.001), com);
        const effectiveLengthMm = 237.05;
        const effectiveMassProxyG = inertia.iyyGmm2 > 0 ? inertia.iyyGmm2 / (effectiveLengthMm * effectiveLengthMm) : totalMassG * 0.55;
        const compliance = finite(state.analysisTargets && state.analysisTargets.compliance10Hz, 12);
        const resonance = estimateResonance(effectiveMassProxyG, compliance);
        const minSection = (state.rings || []).reduce((acc, r) => Math.min(acc, finite(r.widthMm, 99) * finite(r.heightMm, 99)), Infinity);
        const maxSpan = Math.max(1, b.length);
        const firstBendingProxyHz = Math.max(15, Math.sqrt(Math.max(1, minSection)) * 9 / Math.sqrt(Math.max(1, maxSpan / 100)));
        const wireDuct = features.wireDuct || {};
        const minWall = (state.rings || []).reduce((acc, r) => Math.min(acc, finite(r.wallThicknessMm, 99)), Infinity);
        const wireDuctClearanceMm = Math.max(0, minWall - finite(wireDuct.diameterMm, 2.2) / 2);
        const cartridgeDatumValid = !(features.sideBentHeadshellMount && features.sideBentHeadshellMount.cartridgeDatumValid === false);
        const headshellDatumValid = !(features.integratedHeadshell && features.integratedHeadshell.integrated === false);
        const counterweightRelation = {
            separateRearTerminalAssembly: !!(features.counterweightStack && features.counterweightStack.separateFeature),
            notFakedByRingOrTail: !(features.counterweightStack && features.counterweightStack.fakeWithRingOrTail),
            massG: massParts.counterweightStackG,
            mount: features.counterweightStack && features.counterweightStack.mount
        };

        return {
            ok: !!(solid.comSanity && solid.comSanity.ok),
            status: (solid.comSanity && solid.comSanity.ok) ? 'PARTIAL_PASS' : 'BLOCKER',
            partialReason: 'Adapter supplies analysis fields from deterministic local freeform mesh; full browser/WebGL/export/Onshape/FEA validation is outside this local kernel.',
            warnings: solid.warnings || [],
            comSanity: solid.comSanity,
            schema: 'tonearm-designer-freeform-analysis-adapter-v1',
            mode: 'freeform_centerline_ring_loft',
            geometryFields: {
                vertices: mesh.vertices,
                faces: mesh.faces,
                vertexCount: mesh.vertices.length,
                faceCount: mesh.faces.length,
                closed: !!(mesh.closed || (mesh.validation && mesh.validation.closed)),
                units: mesh.units || 'mm',
                bounds: b
            },
            mass: {
                g: round(totalMassG, 6),
                bodyMassG: round(bodyMassG, 6),
                totalMassG: round(totalMassG, 6),
                parts: massParts,
                densityGPerCm3: materialDensity
            },
            volume: {
                mm3: round(solid.volumeMm3, 6),
                volumeMm3: round(solid.volumeMm3, 6),
                volumeCm3: round(solid.volumeMm3 / 1000, 6),
                signedVolumeMm3: round(solid.signedVolume || 0, 6),
                absTetraVolumeMm3: round(solid.absTetraVolume || 0, 6),
                signedAbsVolumeRatio: solid.comSanity && solid.comSanity.metrics ? solid.comSanity.metrics.signedAbsVolumeRatio : null,
                method: solid.method,
                comSanity: solid.comSanity
            },
            COM: { x: round(com.x, 6), y: round(com.y, 6), z: round(com.z, 6), units: 'mm' },
            COG: { x: round(com.x, 6), y: round(com.y, 6), z: round(com.z, 6), units: 'mm' },
            inertiaTensor: inertia,
            effectiveMassProxy: {
                effectiveMassG: round(effectiveMassProxyG, 6),
                method: 'Iyy/effectiveLength^2 proxy',
                effectiveLengthMm
            },
            resonance: {
                verticalHz: round(resonance, 6),
                horizontalHz: round(resonance * 0.96, 6),
                compliance10Hz: compliance,
                method: 'low-frequency resonance estimate'
            },
            verticalResonanceEstimate: { hz: round(resonance, 6), method: 'low-frequency resonance estimate' },
            horizontalResonanceEstimate: { hz: round(resonance * 0.96, 6), method: 'low-frequency resonance estimate' },
            stiffness: {
                EIProxy: round(minSection * maxSpan, 6),
                firstBendingProxyHz: round(firstBendingProxyHz, 6),
                method: 'section-area/length proxy'
            },
            EIProxy: round(minSection * maxSpan, 6),
            firstBendingProxy: { hz: round(firstBendingProxyHz, 6), method: 'section-area/length proxy' },
            wireDuctClearance: {
                clearanceMm: round(wireDuctClearanceMm, 6),
                ok: wireDuctClearanceMm >= 0.2,
                diameterMm: finite(wireDuct.diameterMm, 2.2)
            },
            cartridgeDatum: {
                valid: cartridgeDatumValid,
                datum: 'cartridge_datum',
                protected: true
            },
            headshellDatum: {
                valid: headshellDatumValid,
                datum: 'headshell_plane',
                integratedHeadshell: !!(features.integratedHeadshell && features.integratedHeadshell.integrated)
            },
            counterweightRelation,
            printabilityAudit: {
                closedMesh: !!(mesh.validation && mesh.validation.closed),
                boundaryEdges: mesh.validation ? mesh.validation.boundaryEdgeCount : null,
                minWallThicknessMm: round(minWall, 6),
                featureSeparated: counterweightRelation.separateRearTerminalAssembly && counterweightRelation.notFakedByRingOrTail
            },
            onshapeAudit: {
                units: 'mm',
                scale: 1,
                exactOneToOneCandidate: true,
                noDirectOnshapeVerification: true,
                noRuntimeDeploymentClaim: true,
                claim: 'NOT_TESTED'
            },
            requiredDownstreamFields: {
                mass: true,
                volume: true,
                comCog: true,
                inertiaTensor: true,
                effectiveMassProxy: true,
                resonanceEstimate: true,
                stiffnessProxy: true,
                printabilityExportAudit: true
            }
        };
    }

    root.FreeformAnalysisAdapter = Object.freeze({
        makeAdapterInput,
        triangleMeshVolumeAndCOM,
        areaWeightedCentroid,
        inertiaProxy,
        estimateResonance
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
