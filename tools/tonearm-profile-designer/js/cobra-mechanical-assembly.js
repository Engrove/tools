/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-mechanical-assembly.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-mechanical-assembly.js
 * Phase 5 Cobra/Copperhead mechanical pivot/tower/bearing/VTA assembly.
 *
 * This module is deliberately a separate assembly model. It does not change N1-P2,
 * does not implement headshell slots, does not implement full FEA, and never uses
 * rearWeightDisc* controls as Cobra counterweight or mechanical proxies.
 */
(function(root) {
    'use strict';

    const FEATURE_ID = 'cobraMechanicalAssembly';
    const SCHEMA = 'tonearm-designer-cobra-mechanical-assembly-v1';
    const TARGET_N1P2_MM = 237.05;
    const N1P2_TOLERANCE_MM = 0.01;

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback) {
        return (value === true || value === false) ? value : fallback;
    }

    function readState(source) {
        return isObject(source) ? source : {};
    }

    function sourceMechanicalBlock(source) {
        const s = readState(source);
        if (isObject(s.mechanical)) return s.mechanical;
        if (isObject(s.cobraMechanicalAssembly)) return s.cobraMechanicalAssembly;
        if (isObject(s.cobraArchitecture) && isObject(s.cobraArchitecture.mechanical)) {
            return s.cobraArchitecture.mechanical;
        }
        return {};
    }

    function getDefaultSpec() {
        return {
            schema: SCHEMA,
            enabled: true,
            variant: 'cobra_pivot_tower_vta',
            pivot: {
                xMm: 237.0,
                yMm: 0.0,
                zMm: 0.0,
                type: 'hardened_pivot'
            },
            tower: {
                enabled: true,
                shape: 'cylindrical_tungsten_tower',
                diameterMm: 30.0,
                heightMm: 42.0,
                xMm: 237.0,
                yMm: 0.0,
                zBaseMm: -18.0,
                massG: 120.0,
                material: 'tungsten_or_equivalent'
            },
            bearing: {
                enabled: true,
                type: 'sapphire_vee_jewel',
                pivotMaterial: 'hardened_stainless_steel',
                veeJewelMaterial: 'sapphire',
                zMm: 0.0,
                clearanceMm: 0.05,
                massG: 2.0,
                swashPlate: {
                    enabled: true,
                    id: 'sapphire_vee_jewel_swash_plate',
                    diameterMm: 12.0,
                    thicknessMm: 1.8,
                    zMm: -0.9,
                    massG: 1.0,
                    material: 'sapphire'
                }
            },
            vta: {
                enabled: true,
                type: 'threaded_ring_on_the_fly',
                ringOuterDiameterMm: 34.0,
                ringHeightMm: 6.0,
                zMm: -3.0,
                massG: 18.0
            },
            clearance: {
                towerToArmwandMinMm: 1.5,
                counterweightToTowerMinMm: 1.0,
                forbidIntersection: true
            },
            integration: {
                contributesToTotalCOM: false,
                totalCOMIntegrationStatus: 'reported_separately_todo'
            }
        };
    }

    function normalizeSpec(source) {
        const raw = sourceMechanicalBlock(source);
        const out = getDefaultSpec();

        out.enabled = bool(raw.enabled, out.enabled);
        out.variant = raw.variant === 'cobra_pivot_tower_vta' ? 'cobra_pivot_tower_vta' : out.variant;

        if (isObject(raw.pivot)) {
            out.pivot.xMm = finite(raw.pivot.xMm, out.pivot.xMm);
            out.pivot.yMm = finite(raw.pivot.yMm, out.pivot.yMm);
            out.pivot.zMm = finite(raw.pivot.zMm, out.pivot.zMm);
            out.pivot.type = (typeof raw.pivot.type === 'string' && raw.pivot.type.trim()) ? raw.pivot.type : out.pivot.type;
        }

        if (isObject(raw.tower)) {
            out.tower.enabled = bool(raw.tower.enabled, out.tower.enabled);
            out.tower.shape = (typeof raw.tower.shape === 'string' && raw.tower.shape.trim()) ? raw.tower.shape : out.tower.shape;
            out.tower.diameterMm = finite(raw.tower.diameterMm, out.tower.diameterMm);
            out.tower.heightMm = finite(raw.tower.heightMm, out.tower.heightMm);
            out.tower.xMm = finite(raw.tower.xMm, out.tower.xMm);
            out.tower.yMm = finite(raw.tower.yMm, out.tower.yMm);
            out.tower.zBaseMm = finite(raw.tower.zBaseMm, out.tower.zBaseMm);
            out.tower.massG = finite(raw.tower.massG, out.tower.massG);
            out.tower.material = (typeof raw.tower.material === 'string' && raw.tower.material.trim()) ? raw.tower.material : out.tower.material;
        }

        if (isObject(raw.bearing)) {
            out.bearing.enabled = bool(raw.bearing.enabled, out.bearing.enabled);
            out.bearing.type = (typeof raw.bearing.type === 'string' && raw.bearing.type.trim()) ? raw.bearing.type : out.bearing.type;
            out.bearing.pivotMaterial = (typeof raw.bearing.pivotMaterial === 'string' && raw.bearing.pivotMaterial.trim()) ? raw.bearing.pivotMaterial : out.bearing.pivotMaterial;
            out.bearing.veeJewelMaterial = (typeof raw.bearing.veeJewelMaterial === 'string' && raw.bearing.veeJewelMaterial.trim()) ? raw.bearing.veeJewelMaterial : out.bearing.veeJewelMaterial;
            out.bearing.zMm = finite(raw.bearing.zMm, out.bearing.zMm);
            out.bearing.clearanceMm = finite(raw.bearing.clearanceMm, out.bearing.clearanceMm);
            out.bearing.massG = Math.max(0, finite(raw.bearing.massG, out.bearing.massG));
            if (isObject(raw.bearing.swashPlate)) {
                const sp = raw.bearing.swashPlate;
                out.bearing.swashPlate.enabled = bool(sp.enabled, out.bearing.swashPlate.enabled);
                out.bearing.swashPlate.id = (typeof sp.id === 'string' && sp.id.trim()) ? sp.id : out.bearing.swashPlate.id;
                out.bearing.swashPlate.diameterMm = finite(sp.diameterMm, out.bearing.swashPlate.diameterMm);
                out.bearing.swashPlate.thicknessMm = finite(sp.thicknessMm, out.bearing.swashPlate.thicknessMm);
                out.bearing.swashPlate.zMm = finite(sp.zMm, out.bearing.swashPlate.zMm);
                out.bearing.swashPlate.massG = Math.max(0, finite(sp.massG, out.bearing.swashPlate.massG));
                out.bearing.swashPlate.material = (typeof sp.material === 'string' && sp.material.trim()) ? sp.material : out.bearing.swashPlate.material;
            }
        }

        if (isObject(raw.vta)) {
            out.vta.enabled = bool(raw.vta.enabled, out.vta.enabled);
            out.vta.type = (typeof raw.vta.type === 'string' && raw.vta.type.trim()) ? raw.vta.type : out.vta.type;
            out.vta.ringOuterDiameterMm = finite(raw.vta.ringOuterDiameterMm, out.vta.ringOuterDiameterMm);
            out.vta.ringHeightMm = finite(raw.vta.ringHeightMm, out.vta.ringHeightMm);
            out.vta.zMm = finite(raw.vta.zMm, out.vta.zMm);
            out.vta.massG = finite(raw.vta.massG, out.vta.massG);
        }

        if (isObject(raw.clearance)) {
            out.clearance.towerToArmwandMinMm = finite(raw.clearance.towerToArmwandMinMm, out.clearance.towerToArmwandMinMm);
            out.clearance.counterweightToTowerMinMm = finite(raw.clearance.counterweightToTowerMinMm, out.clearance.counterweightToTowerMinMm);
            out.clearance.forbidIntersection = bool(raw.clearance.forbidIntersection, out.clearance.forbidIntersection);
        }

        if (isObject(raw.integration)) {
            out.integration.contributesToTotalCOM = bool(raw.integration.contributesToTotalCOM, out.integration.contributesToTotalCOM);
            out.integration.totalCOMIntegrationStatus = (typeof raw.integration.totalCOMIntegrationStatus === 'string' && raw.integration.totalCOMIntegrationStatus.trim())
                ? raw.integration.totalCOMIntegrationStatus
                : out.integration.totalCOMIntegrationStatus;
        }

        return out;
    }

    function isEnabled(source) {
        const spec = normalizeSpec(source);
        return spec.enabled === true;
    }

    function getN1P2Mm(source) {
        const s = readState(source);
        const arch = isObject(s.cobraArchitecture) ? s.cobraArchitecture : {};
        if (Number.isFinite(Number(arch.n1p2Mm))) return Number(arch.n1p2Mm);
        if (Number.isFinite(Number(s.apex)) && Number.isFinite(Number(s.cartX))) {
            return Number(s.apex) - Number(s.cartX);
        }
        if (Number.isFinite(Number(s.inputs && s.inputs.apex)) && Number.isFinite(Number(s.inputs && s.inputs.cartX))) {
            return Number(s.inputs.apex) - Number(s.inputs.cartX);
        }
        return TARGET_N1P2_MM;
    }

    function component(name, massG, com, source) {
        const mass = Math.max(0, finite(massG, 0));
        return {
            name,
            massG: mass,
            mass: mass,
            com: { x: finite(com.x, 0), y: finite(com.y, 0), z: finite(com.z, 0) },
            x: finite(com.x, 0),
            y: finite(com.y, 0),
            z: finite(com.z, 0),
            source: source || FEATURE_ID,
            enabled: mass > 0
        };
    }

    function getMassComponents(source) {
        const spec = normalizeSpec(source);
        if (!spec.enabled) return [];

        const out = [];
        if (spec.tower.enabled) {
            out.push(component('cobraTower', spec.tower.massG, {
                x: spec.tower.xMm,
                y: spec.tower.yMm,
                z: spec.tower.zBaseMm + spec.tower.heightMm / 2
            }, FEATURE_ID));
        }

        if (spec.vta.enabled) {
            out.push(component('cobraVTARing', spec.vta.massG, {
                x: spec.pivot.xMm,
                y: spec.pivot.yMm,
                z: spec.vta.zMm
            }, FEATURE_ID));
        }

        if (spec.bearing.enabled) {
            out.push(component('cobraBearingPivot', spec.bearing.massG, {
                x: spec.pivot.xMm,
                y: spec.pivot.yMm,
                z: spec.bearing.zMm
            }, FEATURE_ID));
            if (spec.bearing.swashPlate && spec.bearing.swashPlate.enabled) {
                out.push(component('sapphireVeeJewelSwashPlate', spec.bearing.swashPlate.massG, {
                    x: spec.pivot.xMm,
                    y: spec.pivot.yMm,
                    z: spec.bearing.swashPlate.zMm
                }, FEATURE_ID));
            }
        }

        return out.filter(c => c.massG > 0);
    }

    function buildAssembly(source) {
        const spec = normalizeSpec(source);
        const components = getMassComponents({ cobraArchitecture: { mechanical: spec } });
        const validation = validateAssembly({ cobraArchitecture: { mechanical: spec }, apex: spec.pivot.xMm, cartX: -0.05 });
        return {
            schema: SCHEMA,
            enabled: spec.enabled,
            variant: spec.variant,
            spec,
            massComponents: components,
            validation,
            groups: {
                tower: spec.tower.enabled,
                vta: spec.vta.enabled,
                bearing: spec.bearing.enabled,
                swashPlate: spec.bearing.enabled && spec.bearing.swashPlate && spec.bearing.swashPlate.enabled
            }
        };
    }

    function simpleBoundsForSpec(spec) {
        const tower = spec.tower;
        return {
            tower: {
                minX: tower.xMm - tower.diameterMm / 2,
                maxX: tower.xMm + tower.diameterMm / 2,
                minY: tower.yMm - tower.diameterMm / 2,
                maxY: tower.yMm + tower.diameterMm / 2,
                minZ: tower.zBaseMm,
                maxZ: tower.zBaseMm + tower.heightMm
            }
        };
    }

    function validateAssembly(source) {
        const spec = normalizeSpec(source);
        const errors = [];
        const warnings = [];
        const components = getMassComponents({ cobraArchitecture: { mechanical: spec } });
        const n1p2Mm = getN1P2Mm(source);

        if (spec.enabled !== true) errors.push('mechanical.enabled must be true for Cobra mechanical assembly validation.');
        if (!spec.pivot) errors.push('pivot block is missing.');
        if (!spec.tower) errors.push('tower block is missing.');
        if (!spec.bearing) errors.push('bearing block is missing.');
        if (!spec.vta) errors.push('vta block is missing.');

        if (Math.abs(spec.pivot.zMm) > 0.01) errors.push('pivot.zMm must be 0.00 ± 0.01 mm; measured ' + spec.pivot.zMm.toFixed(3) + ' mm.');
        if (spec.tower.enabled && spec.tower.diameterMm <= 0) errors.push('tower diameter must be > 0.');
        if (spec.tower.enabled && spec.tower.heightMm <= 0) errors.push('tower height must be > 0.');
        if (spec.tower.enabled && spec.tower.massG <= 0) errors.push('tower mass must be > 0.');
        if (spec.bearing.enabled && !spec.bearing.type) errors.push('bearing type is required.');
        if (spec.bearing.enabled && spec.bearing.massG <= 0) errors.push('bearing/pivot mass must be > 0.');
        if (spec.bearing.enabled && spec.bearing.swashPlate && spec.bearing.swashPlate.enabled) {
            if (spec.bearing.swashPlate.diameterMm <= 0) errors.push('swash plate diameter must be > 0.');
            if (spec.bearing.swashPlate.thicknessMm <= 0) errors.push('swash plate thickness must be > 0.');
            if (spec.bearing.swashPlate.massG <= 0) errors.push('swash plate mass must be > 0.');
        }
        if (spec.vta.enabled && !spec.vta.type) errors.push('VTA type is required when vta.enabled=true.');
        if (spec.vta.enabled && spec.vta.ringOuterDiameterMm <= 0) errors.push('VTA ring outer diameter must be > 0.');
        if (spec.vta.enabled && spec.vta.ringHeightMm <= 0) errors.push('VTA ring height must be > 0.');
        if (spec.vta.enabled && spec.vta.massG <= 0) errors.push('VTA ring mass must be > 0.');
        if (components.length < 3) errors.push('mechanical mass component count must be at least 3.');
        if (Math.abs(n1p2Mm - TARGET_N1P2_MM) > N1P2_TOLERANCE_MM) {
            errors.push('N1-P2 must remain 237.05 ± 0.01 mm; measured ' + n1p2Mm.toFixed(3) + ' mm.');
        }

        if (spec.clearance.forbidIntersection) {
            const bounds = simpleBoundsForSpec(spec);
            if (bounds.tower.maxZ > spec.pivot.zMm + spec.tower.heightMm) {
                warnings.push('tower bounds review recommended.');
            }
        }

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings,
            measured: {
                pivotZMm: spec.pivot.zMm,
                towerDiameterMm: spec.tower.diameterMm,
                towerHeightMm: spec.tower.heightMm,
                towerMassG: spec.tower.massG,
                vtaMassG: spec.vta.enabled ? spec.vta.massG : 0,
                bearingMassG: spec.bearing.enabled ? spec.bearing.massG : 0,
                swashPlateMassG: spec.bearing.enabled && spec.bearing.swashPlate && spec.bearing.swashPlate.enabled ? spec.bearing.swashPlate.massG : 0,
                massComponentCount: components.length,
                n1p2Mm
            },
            massComponents: components
        };
    }

    function toReportBlock(source) {
        const spec = normalizeSpec(source);
        const validation = validateAssembly(source);
        return {
            schema: SCHEMA,
            loaded: true,
            enabled: spec.enabled,
            variant: spec.variant,
            pivotType: spec.pivot.type,
            pivot: { x: spec.pivot.xMm, y: spec.pivot.yMm, z: spec.pivot.zMm },
            towerEnabled: spec.tower.enabled,
            towerDiameterMm: spec.tower.diameterMm,
            towerHeightMm: spec.tower.heightMm,
            towerMassG: spec.tower.massG,
            towerCom: {
                x: spec.tower.xMm,
                y: spec.tower.yMm,
                z: spec.tower.zBaseMm + spec.tower.heightMm / 2
            },
            bearingType: spec.bearing.type,
            swashPlate: spec.bearing.swashPlate ? clone(spec.bearing.swashPlate) : null,
            vtaType: spec.vta.type,
            vtaRingMassG: spec.vta.enabled ? spec.vta.massG : 0,
            massComponentCount: validation.measured.massComponentCount,
            validationStatus: validation.status,
            errors: validation.errors,
            warnings: validation.warnings,
            totalCOMIntegrationStatus: spec.integration.totalCOMIntegrationStatus
        };
    }

    function getFeatureManifest(source) {
        const spec = normalizeSpec(source);
        return {
            id: FEATURE_ID,
            status: 'loaded',
            schema: SCHEMA,
            enabled: spec.enabled,
            featureCount: 6,
            features: [
                { id: 'pivot', role: 'hardened pivot marker at record plane', type: spec.pivot.type, zMm: spec.pivot.zMm },
                { id: 'tower', role: 'separate cylindrical pivot/tower body', diameterMm: spec.tower.diameterMm, heightMm: spec.tower.heightMm, massG: spec.tower.massG },
                { id: 'bearing', role: 'sapphire vee-jewel bearing specification', type: spec.bearing.type },
                { id: 'sapphire_vee_jewel_swash_plate', role: 'solid swash plate under the vee-jewel bearing', enabled: spec.bearing.swashPlate && spec.bearing.swashPlate.enabled, diameterMm: spec.bearing.swashPlate ? spec.bearing.swashPlate.diameterMm : null, thicknessMm: spec.bearing.swashPlate ? spec.bearing.swashPlate.thicknessMm : null },
                { id: 'vta', role: 'threaded VTA ring specification', type: spec.vta.type, massG: spec.vta.massG },
                { id: 'mass_components', role: 'separate mechanical mass components not counted as counterweight COM', names: getMassComponents({ cobraArchitecture: { mechanical: spec } }).map(c => c.name) }
            ],
            missingHere: {
                headshellSlots: true,
                fullFEA: true,
                productionCAD: true
            }
        };
    }

    function buildAssemblyGroup(source) {
        if (!root.THREE || !isEnabled(source)) return null;
        const spec = normalizeSpec(source);
        const group = new root.THREE.Group();
        group.name = 'cobra_mechanical_assembly';

        if (spec.tower.enabled) {
            const matTower = new root.THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.35, metalness: 0.6 });
            const towerGeo = new root.THREE.CylinderGeometry(spec.tower.diameterMm / 2, spec.tower.diameterMm / 2, spec.tower.heightMm, 32);
            const tower = new root.THREE.Mesh(towerGeo, matTower);
            tower.name = 'cobra_tower';
            tower.position.set(spec.tower.xMm, spec.tower.yMm, spec.tower.zBaseMm + spec.tower.heightMm / 2);
            group.add(tower);
        }

        if (spec.vta.enabled) {
            const matVta = new root.THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.25, metalness: 0.75 });
            const ringGeo = new root.THREE.TorusGeometry(spec.vta.ringOuterDiameterMm / 2, Math.max(0.5, spec.vta.ringHeightMm / 2), 10, 32);
            const ring = new root.THREE.Mesh(ringGeo, matVta);
            ring.name = 'cobra_vta_ring';
            ring.position.set(spec.pivot.xMm, spec.pivot.yMm, spec.vta.zMm);
            group.add(ring);
        }

        if (spec.bearing.enabled) {
            const matBearing = new root.THREE.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.2, metalness: 0.25 });
            const bearingGeo = new root.THREE.SphereGeometry(2.0, 16, 16);
            const bearing = new root.THREE.Mesh(bearingGeo, matBearing);
            bearing.name = 'cobra_bearing_pivot_marker';
            bearing.position.set(spec.pivot.xMm, spec.pivot.yMm, spec.bearing.zMm);
            group.add(bearing);

            if (spec.bearing.swashPlate && spec.bearing.swashPlate.enabled) {
                const matSwash = new root.THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.82 });
                const sp = spec.bearing.swashPlate;
                const swashGeo = new root.THREE.CylinderGeometry(sp.diameterMm / 2, sp.diameterMm / 2, sp.thicknessMm, 32);
                swashGeo.rotateX(Math.PI / 2);
                const swash = new root.THREE.Mesh(swashGeo, matSwash);
                swash.name = 'sapphire_vee_jewel_swash_plate';
                swash.position.set(spec.pivot.xMm, spec.pivot.yMm, sp.zMm);
                group.add(swash);
            }
        }

        group.userData = getFeatureManifest({ cobraArchitecture: { mechanical: spec } });
        return group;
    }

    function buildGeometry(source) {
        if (!root.THREE || !isEnabled(source)) return null;
        const group = buildAssemblyGroup(source);
        if (root.flattenGroupToBufferGeometry && group) return root.flattenGroupToBufferGeometry(group);
        return null;
    }

    const api = Object.freeze({
        schema: SCHEMA,
        featureId: FEATURE_ID,
        getFeatureManifest,
        getDefaultSpec,
        normalizeSpec,
        buildAssembly,
        getMassComponents,
        validateAssembly,
        toReportBlock,
        buildAssemblyGroup,
        buildGeometry,
        isEnabled
    });

    root.CobraMechanicalAssembly = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
