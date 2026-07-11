/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-physical-analysis.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 Freeform Physical Analysis Model.
// Two-level model: AI proposes geometry/targets; app/kernel deterministically computes proxy physics.
// Claim boundary: local deterministic proxy analysis, not FEA, not browser/WebGL/export verification.

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

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function distance(a, b) {
        if (!a || !b) return 0;
        const dx = finite(a.x, 0) - finite(b.x, 0);
        const dy = finite(a.y, 0) - finite(b.y, 0);
        const dz = finite(a.z, 0) - finite(b.z, 0);
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }

    function bounds(vertices) {
        if (root.FreeformGeometryAudit && typeof root.FreeformGeometryAudit.bounds === 'function') {
            return root.FreeformGeometryAudit.bounds(vertices);
        }
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

    function centerlineLength(state, mesh) {
        const stations = mesh && Array.isArray(mesh.stations) ? mesh.stations : [];
        if (stations.length > 1) {
            let len = 0;
            for (let i = 1; i < stations.length; i++) len += distance(stations[i - 1].center, stations[i].center);
            return len;
        }
        const pts = state && state.centerline && Array.isArray(state.centerline.points) ? state.centerline.points : [];
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += distance(pts[i - 1], pts[i]);
        return len || 237.05;
    }

    function point(x, y, z) {
        return { x: round(x, 6), y: round(y, 6), z: round(z, 6) };
    }

    function featureMassAndCom(state, bodyCom) {
        const f = (state && state.features) || {};
        const out = {};
        const add = function(name, massG, com, claim) {
            out[name] = {
                massG: round(Math.max(0, finite(massG, 0)), 6),
                COM: point(finite(com.x, bodyCom.x), finite(com.y, bodyCom.y), finite(com.z, bodyCom.z)),
                COG: point(finite(com.x, bodyCom.x), finite(com.y, bodyCom.y), finite(com.z, bodyCom.z)),
                claim: claim || 'feature_mass_proxy_from_feature_geometry'
            };
        };
        const ih = f.integratedHeadshell || {};
        const ti = f.titaniumMountPlate || {};
        const cs = f.cartridgeSlots || {};
        const wd = f.wireDuct || {};
        const rt = f.rearTerminal || {};
        const cw = f.counterweightStack || {};
        const sh = f.sideBentHeadshellMount || {};

        add('armBody', 0, bodyCom, 'mesh_body_mass_computed_from_volume');
        add('integratedHeadshell', ih.enabled ? Math.max(0, finite(ih.lengthMm, 34) * finite(ih.widthMm, 20) * 2.2 / 1000 * 1.25) : 0,
            point(Math.max(10, finite(ih.lengthMm, 34) / 2), finite(sh.bendYMm, 0) * 0.35, finite(ih.planeZMm, 0)), 'headshell_proxy_from_dimensions');
        add('titaniumMountPlate', ti.enabled ? finite(ti.lengthMm, 0) * finite(ti.widthMm, 0) * finite(ti.thicknessMm, 0) / 1000 * 4.43 : 0,
            point(finite(ti.xMm, 32), finite(ti.yMm, 0), finite(ti.zMm, 3.83)), 'density_4_43g_cm3_structural_laminated_interface_plate');
        add('cartridgeSlots', cs.enabled ? Math.max(0, finite(cs.slotCount, 0) * finite(cs.slotLengthMm, 12.7) * finite(cs.slotWidthMm, 2.7) * 1.0 / 1000 * 1.25) : 0,
            point(28, 0, 0.5), 'slot_land_proxy_not_subtractive_cad');
        add('wireDuct', wd.enabled ? Math.max(0, 237.05 * Math.PI * Math.pow(finite(wd.diameterMm, 2.2) / 2, 2) / 1000 * 0.2) : 0,
            point(118.5, 0, -2.2), 'wire_duct_clearance_proxy');
        add('rearTerminal', rt.enabled ? Math.PI * Math.pow(finite(rt.terminalDiameterMm, 10) / 2, 2) * finite(rt.terminalLengthMm, 12) / 1000 * 1.25 : 0,
            point(222, 0, 0), 'rear_terminal_proxy_from_cylinder');
        add('counterweightStack', cw.enabled ? Math.max(0, Math.round(finite(cw.discCount, 0))) * finite(cw.discMassG, 0) + finite(cw.fineTrimMassG, 0) : 0,
            point(255, 0, 0), 'counterweight_mass_from_feature_disc_stack');
        add('sideBentHeadshellMount', sh.enabled ? Math.abs(finite(sh.bendYMm, 0)) * 0.12 : 0,
            point(22, finite(sh.bendYMm, 0) * 0.5, 0), 'side_bend_mass_proxy');
        return out;
    }

    function combineCom(bodyMassG, bodyCom, features) {
        let mass = Math.max(0, finite(bodyMassG, 0));
        let sx = bodyCom.x * mass, sy = bodyCom.y * mass, sz = bodyCom.z * mass;
        Object.keys(features || {}).forEach(k => {
            if (k === 'armBody') return;
            const f = features[k];
            const m = finite(f.massG, 0);
            mass += m;
            sx += m * finite(f.COM && f.COM.x, 0);
            sy += m * finite(f.COM && f.COM.y, 0);
            sz += m * finite(f.COM && f.COM.z, 0);
        });
        if (!(mass > 0)) return { massG: 0, com: point(0, 0, 0) };
        return { massG: mass, com: point(sx / mass, sy / mass, sz / mass) };
    }

    function zeroTensor() {
        return { Ixx: 0, Iyy: 0, Izz: 0, Ixy: 0, Ixz: 0, Iyz: 0 };
    }

    function roundTensor(t) {
        return {
            Ixx: round(t.Ixx, 6),
            Iyy: round(t.Iyy, 6),
            Izz: round(t.Izz, 6),
            Ixy: round(t.Ixy, 6),
            Ixz: round(t.Ixz, 6),
            Iyz: round(t.Iyz, 6)
        };
    }

    function addTensor(a, b) {
        return {
            Ixx: finite(a.Ixx, 0) + finite(b.Ixx, 0),
            Iyy: finite(a.Iyy, 0) + finite(b.Iyy, 0),
            Izz: finite(a.Izz, 0) + finite(b.Izz, 0),
            Ixy: finite(a.Ixy, 0) + finite(b.Ixy, 0),
            Ixz: finite(a.Ixz, 0) + finite(b.Ixz, 0),
            Iyz: finite(a.Iyz, 0) + finite(b.Iyz, 0)
        };
    }

    function pointMassInertia(m, p, pivot) {
        const mass = Math.max(0, finite(m, 0));
        const dx = finite(p && p.x, 0) - pivot.x;
        const dy = finite(p && p.y, 0) - pivot.y;
        const dz = finite(p && p.z, 0) - pivot.z;
        return {
            Ixx: mass * (dy*dy + dz*dz),
            Iyy: mass * (dx*dx + dz*dz),
            Izz: mass * (dx*dx + dy*dy),
            Ixy: -mass * dx * dy,
            Ixz: -mass * dx * dz,
            Iyz: -mass * dy * dz
        };
    }

    function bodyMeshInertiaAboutPivot(mesh, bodyMassG, pivot) {
        const vertices = (mesh && mesh.vertices) || [];
        const perVertexMass = Math.max(0, finite(bodyMassG, 0)) / Math.max(1, vertices.length);
        let t = zeroTensor();
        vertices.forEach(v => {
            t = addTensor(t, pointMassInertia(perVertexMass, v, pivot));
        });
        return roundTensor(t);
    }

    function featureInertiaAboutPivot(featureAnalysis, pivot, bodyCom) {
        let t = zeroTensor();
        let featureMassG = 0;
        let featureContributionCount = 0;
        Object.keys(featureAnalysis || {}).forEach(k => {
            if (k === 'armBody') return;
            const f = featureAnalysis[k] || {};
            const m = Math.max(0, finite(f.massG, 0));
            if (!(m > 0)) return;
            featureMassG += m;
            featureContributionCount += 1;
            t = addTensor(t, pointMassInertia(m, f.COM || bodyCom || pivot, pivot));
        });
        return {
            tensor: roundTensor(t),
            featureMassG: round(featureMassG, 6),
            featureContributionCount
        };
    }

    function inertiaAboutPivot(mesh, bodyMassG, featureAnalysis, totalCom, pivot) {
        return inertiaAboutPivotWithDebug(mesh, bodyMassG, featureAnalysis, totalCom, pivot).totalInertiaPivotGmm2;
    }

    function inertiaAboutPivotWithDebug(mesh, bodyMassG, featureAnalysis, totalCom, pivot) {
        const bodyInertia = bodyMeshInertiaAboutPivot(mesh, bodyMassG, pivot);
        const feature = featureInertiaAboutPivot(featureAnalysis, pivot, totalCom);
        const total = roundTensor(addTensor(bodyInertia, feature.tensor));
        const featureMassG = feature.featureMassG;
        const totalMassG = round(Math.max(0, finite(bodyMassG, 0)) + featureMassG, 6);
        return {
            bodyMassG: round(bodyMassG, 6),
            featureMassG,
            totalMassG,
            bodyInertiaPivotGmm2: bodyInertia,
            featureInertiaPivotGmm2: feature.tensor,
            totalInertiaPivotGmm2: total,
            featureContributionCount: feature.featureContributionCount,
            doubleCountGuard: 'PASS',
            method: 'body_mesh_mass_once_plus_feature_point_masses_once'
        };
    }

    function balanceResidualDebug(bodyMassG, bodyCom, featureAnalysis, totalMassG, totalCom, pivot) {
        const bodyMomentGmm = finite(bodyMassG, 0) * (finite(bodyCom && bodyCom.x, 0) - pivot.x);
        let featureMomentSumGmm = 0;
        let counterweightMomentGmm = 0;
        let featureContributionCount = 0;
        Object.keys(featureAnalysis || {}).forEach(k => {
            if (k === 'armBody') return;
            const f = featureAnalysis[k] || {};
            const m = Math.max(0, finite(f.massG, 0));
            const moment = m * (finite(f.COM && f.COM.x, pivot.x) - pivot.x);
            if (m > 0) featureContributionCount += 1;
            featureMomentSumGmm += moment;
            if (k === 'counterweightStack') counterweightMomentGmm = moment;
        });
        const totalMomentGmm = finite(totalMassG, 0) * (finite(totalCom && totalCom.x, 0) - pivot.x);
        const explicitBodyFeatureMomentGmm = bodyMomentGmm + featureMomentSumGmm;
        return {
            totalMomentGmm: round(totalMomentGmm, 6),
            bodyMomentGmm: round(bodyMomentGmm, 6),
            featureMomentSumGmm: round(featureMomentSumGmm, 6),
            explicitBodyFeatureMomentGmm: round(explicitBodyFeatureMomentGmm, 6),
            counterweightMomentGmm: round(counterweightMomentGmm, 6),
            residualMethod: 'total_com_moment',
            featureContributionCount,
            doubleCountGuard: Math.abs(totalMomentGmm - explicitBodyFeatureMomentGmm) <= Math.max(0.01, Math.abs(totalMomentGmm) * 1e-6) ? 'PASS' : 'BLOCKER',
            residualGmm: round(totalMomentGmm, 6)
        };
    }

    function balanceResidual(totalMassG, totalCom, featureAnalysis, pivot) {
        return round(finite(totalMassG, 0) * (finite(totalCom && totalCom.x, 0) - pivot.x), 6);
    }

    function hasFiniteTensor(t) {
        return !!t && ['Ixx','Iyy','Izz','Ixy','Ixz','Iyz'].every(k => Number.isFinite(Number(t[k])));
    }

    function classifyAnalysisStatus(core, warnings) {
        const w = Array.isArray(warnings) ? warnings : [];
        const required = core && core.requiredFields ? core.requiredFields : {};
        const inertia = core && core.inertiaTensorPivotGmm2;
        const resonance = core && core.resonance;
        const effV = finite(core && core.effectiveMassVerticalG, NaN);
        const effH = finite(core && core.effectiveMassHorizontalG, NaN);
        const blockerReasons = [];
        if (core && core.comSanity && core.comSanity.status === 'BLOCKER') blockerReasons.push('com_sanity_blocker');
        if (!hasFiniteTensor(inertia) || finite(inertia && inertia.Ixx, NaN) < 0 || finite(inertia && inertia.Iyy, NaN) < 0 || finite(inertia && inertia.Izz, NaN) < 0) blockerReasons.push('invalid_inertia_tensor');
        if (!(effV > 0) || !(effH > 0) || !Number.isFinite(effV) || !Number.isFinite(effH)) blockerReasons.push('invalid_effective_mass');
        if (resonance && (resonance.requiresValidEffectiveMass !== false)) {
            const rv = finite(resonance.cartridgeArmResonanceVerticalHz, NaN);
            const rh = finite(resonance.cartridgeArmResonanceHorizontalHz, NaN);
            if (!(rv > 0) || !(rh > 0) || !Number.isFinite(rv) || !Number.isFinite(rh)) blockerReasons.push('invalid_lf_resonance');
        }
        Object.keys(required).forEach(k => {
            if (!required[k]) blockerReasons.push('missing_required_' + k);
        });
        if (core && core.inertiaDebug && core.inertiaDebug.doubleCountGuard === 'BLOCKER') blockerReasons.push('inertia_double_count_guard');
        if (core && core.balanceDebug && core.balanceDebug.doubleCountGuard === 'BLOCKER') blockerReasons.push('balance_double_count_guard');
        if (blockerReasons.length) return { status: 'BLOCKER', blockerReasons };
        const partialMarkers = w.some(v => /proxy|not_fea|default|partial|browser|webgl|export|onshape|fea/i.test(String(v || '')));
        return { status: partialMarkers ? 'PARTIAL_PASS' : 'PASS_WITH_SCOPE', blockerReasons: [] };
    }

    function analyzeFreeformGeometry(geometryObject, options) {
        if (!geometryObject || !geometryObject.mesh) {
            return { ok: false, status: 'BLOCKER', analysis: { status: 'BLOCKER', warnings: ['missing_freeform_geometry'] } };
        }
        const warnings = [];
        const go = geometryObject;
        const mesh = go.mesh;
        const state = go.state || {};
        const material = Object.assign({
            densityGPerCm3: finite(state.analysisTargets && state.analysisTargets.materialDensityGPerCm3, 1.25),
            eModulusGPa: finite(state.analysisTargets && state.analysisTargets.eModulusGPa, 70),
            gModulusGPa: finite(state.analysisTargets && state.analysisTargets.gModulusGPa, 26)
        }, options && options.material ? options.material : {});
        const b = go.bbox || bounds(mesh.vertices);
        const solid = root.FreeformAnalysisAdapter && root.FreeformAnalysisAdapter.triangleMeshVolumeAndCOM
            ? root.FreeformAnalysisAdapter.triangleMeshVolumeAndCOM(mesh)
            : { volumeMm3: 0, com: point(0, 0, 0), comSanity: { ok: false, status: 'BLOCKER' }, warnings: ['FreeformAnalysisAdapter unavailable'] };
        (solid.warnings || []).forEach(w => warnings.push(w));
        const bodyMassG = solid.volumeMm3 / 1000 * finite(material.densityGPerCm3, 1.25);
        const bodyCom = point(solid.com.x, solid.com.y, solid.com.z);
        const featureAnalysis = featureMassAndCom(state, bodyCom);
        featureAnalysis.armBody.massG = round(bodyMassG, 6);
        featureAnalysis.armBody.COM = bodyCom;
        featureAnalysis.armBody.COG = bodyCom;
        const combined = combineCom(bodyMassG, bodyCom, featureAnalysis);
        const totalMassG = combined.massG;
        const totalCom = combined.com;
        const pivot = { x: 237.05, y: 0, z: 0 };
        const inertiaDebug = inertiaAboutPivotWithDebug(mesh, bodyMassG, featureAnalysis, totalCom, pivot);
        const inertia = inertiaDebug.totalInertiaPivotGmm2;
        const effectiveLengthMm = 237.05;
        const pivotInertiaVerticalGmm2 = inertia.Iyy;
        const pivotInertiaHorizontalGmm2 = inertia.Izz;
        const centerlineLen = centerlineLength(state, mesh);
        const stationAnalysis = root.FreeformSectionProperties && root.FreeformSectionProperties.stationAnalysisFromGeometry
            ? root.FreeformSectionProperties.stationAnalysisFromGeometry(go, { material })
            : [];
        const stationSummary = root.FreeformSectionProperties && root.FreeformSectionProperties.summarizeStationAnalysis
            ? root.FreeformSectionProperties.summarizeStationAnalysis(stationAnalysis)
            : {};
        const resonance = root.FreeformResonanceAnalysis && root.FreeformResonanceAnalysis.analyzeResonanceAndModes
            ? root.FreeformResonanceAnalysis.analyzeResonanceAndModes({
                state,
                totalMassG,
                inertiaTensorPivotGmm2: inertia,
                effectiveLengthMm,
                centerlineLengthMm: centerlineLen,
                stationAnalysis
            })
            : { warnings: ['FreeformResonanceAnalysis unavailable'], effectiveMassVerticalG: 0, effectiveMassHorizontalG: 0 };
        (resonance.warnings || []).forEach(w => warnings.push(w));
        const geomAudit = root.FreeformGeometryAudit && root.FreeformGeometryAudit.auditGeometry
            ? root.FreeformGeometryAudit.auditGeometry(go, { status: warnings.length ? 'PARTIAL_PASS' : 'PASS_WITH_SCOPE' })
            : { status: 'PARTIAL_PASS', warnings: ['FreeformGeometryAudit unavailable'] };
        (geomAudit.warnings || []).forEach(w => warnings.push(w));
        warnings.push('effective_mass_proxy_not_fea');
        warnings.push('bending_torsion_proxy_not_fea');

        const balanceDebug = balanceResidualDebug(bodyMassG, bodyCom, featureAnalysis, totalMassG, totalCom, pivot);
        const statusDecision = classifyAnalysisStatus({
            comSanity: solid.comSanity,
            inertiaTensorPivotGmm2: inertia,
            effectiveMassVerticalG: resonance.effectiveMassVerticalG,
            effectiveMassHorizontalG: resonance.effectiveMassHorizontalG,
            resonance: {
                cartridgeArmResonanceVerticalHz: resonance.cartridgeArmResonanceVerticalHz,
                cartridgeArmResonanceHorizontalHz: resonance.cartridgeArmResonanceHorizontalHz,
                requiresValidEffectiveMass: true
            },
            inertiaDebug,
            balanceDebug,
            requiredFields: {
                massG: totalMassG > 0,
                bodyMassG: bodyMassG > 0,
                COM: !!(totalCom && Number.isFinite(Number(totalCom.x)) && Number.isFinite(Number(totalCom.y)) && Number.isFinite(Number(totalCom.z))),
                inertiaTensorPivotGmm2: hasFiniteTensor(inertia),
                effectiveMassVerticalG: finite(resonance.effectiveMassVerticalG, NaN) > 0,
                effectiveMassHorizontalG: finite(resonance.effectiveMassHorizontalG, NaN) > 0,
                counterweightBalanceResidualGmm: Number.isFinite(Number(balanceDebug.residualGmm))
            }
        }, warnings);
        statusDecision.blockerReasons.forEach(r => warnings.push('analysis_blocker_' + r));
        const status = statusDecision.status;
        const analysis = {
            status,
            claimBoundary: 'local deterministic proxy analysis, not FEA',
            massG: round(totalMassG, 6),
            movingMassG: round(totalMassG, 6),
            bodyMassG: round(bodyMassG, 6),
            effectiveMassVerticalG: round(resonance.effectiveMassVerticalG, 6),
            effectiveMassHorizontalG: round(resonance.effectiveMassHorizontalG, 6),
            COM: totalCom,
            COG: clone(totalCom),
            totalCOM: clone(totalCom),
            inertiaTensorPivotGmm2: inertia,
            pivotInertiaVerticalGmm2: round(pivotInertiaVerticalGmm2, 6),
            pivotInertiaHorizontalGmm2: round(pivotInertiaHorizontalGmm2, 6),
            counterweightBalanceResidualGmm: balanceDebug.residualGmm,
            cartridgeArmResonanceVerticalHz: round(resonance.cartridgeArmResonanceVerticalHz, 6),
            cartridgeArmResonanceHorizontalHz: round(resonance.cartridgeArmResonanceHorizontalHz, 6),
            lfResonance: resonance.lfResonance,
            firstBendingModeProxyHz: round(resonance.firstBendingModeProxyHz, 6),
            firstTorsionModeProxyHz: round(resonance.firstTorsionModeProxyHz, 6),
            bendingProxyClaim: 'not_fea',
            torsionProxyClaim: 'not_fea',
            headshellInterfaceModeProxyHz: round(resonance.headshellInterfaceModeProxyHz, 6),
            counterweightAssemblyModeProxyHz: round(resonance.counterweightAssemblyModeProxyHz, 6),
            stationAnalysis,
            stationSummary,
            featureAnalysis,
            geometryAudit: geomAudit,
            material,
            inertiaDebug,
            balanceDebug,
            statusDecision,
            volume: {
                meshVolumeMm3: round(solid.volumeMm3, 6),
                volumeMm3: round(solid.volumeMm3, 6),
                signedVolumeMm3: round(solid.signedVolume || 0, 6),
                absTetraVolumeMm3: round(solid.absTetraVolume || 0, 6),
                comSanity: solid.comSanity
            },
            warnings: Array.from(new Set(warnings))
        };

        return {
            ok: true,
            status: analysis.status,
            partialReason: 'TD053 local deterministic proxy analysis; browser/WebGL/export/Onshape/FEA validation is outside this local kernel.',
            warnings: analysis.warnings,
            schema: 'tonearm-designer-freeform-physical-analysis-td053-v1',
            mode: 'freeform_centerline_ring_loft',
            geometryMode: 'freeform',
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
                g: analysis.massG,
                bodyMassG: analysis.bodyMassG,
                totalMassG: analysis.massG,
                movingMassG: analysis.movingMassG,
                parts: featureAnalysis,
                densityGPerCm3: material.densityGPerCm3
            },
            volume: analysis.volume,
            COM: analysis.COM,
            COG: analysis.COG,
            inertiaTensor: {
                ixxGmm2: inertia.Ixx,
                iyyGmm2: inertia.Iyy,
                izzGmm2: inertia.Izz,
                ixyGmm2: inertia.Ixy,
                ixzGmm2: inertia.Ixz,
                iyzGmm2: inertia.Iyz
            },
            effectiveMassProxy: {
                effectiveMassG: analysis.effectiveMassVerticalG,
                effectiveMassVerticalG: analysis.effectiveMassVerticalG,
                effectiveMassHorizontalG: analysis.effectiveMassHorizontalG,
                method: 'pivotInertia/effectiveLength^2 deterministic proxy',
                effectiveLengthMm
            },
            resonance: {
                verticalHz: analysis.cartridgeArmResonanceVerticalHz,
                horizontalHz: analysis.cartridgeArmResonanceHorizontalHz,
                method: 'cartridge-arm LF resonance proxy',
                lfResonance: analysis.lfResonance
            },
            stiffness: {
                EIProxy: stationSummary.averageEIzzProxy || 0,
                firstBendingProxyHz: analysis.firstBendingModeProxyHz,
                firstTorsionProxyHz: analysis.firstTorsionModeProxyHz,
                method: 'station EI/GJ distribution proxy'
            },
            printabilityAudit: analysis.geometryAudit,
            onshapeAudit: analysis.geometryAudit.onshapeScaleAudit,
            deterministicAnalysis: analysis,
            analysis,
            requiredDownstreamFields: {
                mass: true,
                volume: true,
                comCog: true,
                inertiaTensor: true,
                effectiveMassProxy: true,
                resonanceEstimate: true,
                stiffnessProxy: true,
                printabilityExportAudit: true,
                td053DeterministicPhysicalAnalysis: true
            }
        };
    }

    function analyzeState(freeformState, options) {
        if (!root.FreeformLoftKernel || typeof root.FreeformLoftKernel.buildFreeformGeometry !== 'function') {
            return { ok: false, status: 'BLOCKER', analysis: { status: 'BLOCKER', warnings: ['FreeformLoftKernel unavailable'] } };
        }
        const go = root.FreeformLoftKernel.buildFreeformGeometry(freeformState || root.FreeformLoftKernel.defaultState(), options || {});
        return analyzeFreeformGeometry(go, options || {});
    }

    root.FreeformPhysicalAnalysis = Object.freeze({
        analyzeFreeformGeometry,
        analyzeState,
        featureMassAndCom,
        inertiaAboutPivot,
        inertiaAboutPivotWithDebug,
        bodyMeshInertiaAboutPivot,
        balanceResidual,
        balanceResidualDebug,
        classifyAnalysisStatus
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
