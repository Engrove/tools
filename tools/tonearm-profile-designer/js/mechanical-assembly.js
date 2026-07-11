/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F mechanical-assembly.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/mechanical-assembly.js
 * TD046 Cobra mechanical assembly foundation.
 *
 * Additive wrapper layer for pivot/tower/swash/anti-skate reference geometry.
 * It does not replace or alter existing preview physics. Later deliveries can
 * merge this assembly into export and validation through its feature manifest.
 */
(function (root) {
    'use strict';

    const ASSEMBLY_NAME = 'mechanicalAssembly';
    const MANIFEST_VERSION = 1;

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function getPivotPoint(sourceState) {
        const s = sourceState || root.state || {};
        if (root.Physics && typeof root.Physics.getPivotPoint === 'function') {
            return root.Physics.getPivotPoint(s);
        }
        const lpTopZ = (s.lpTopZ !== undefined) ? Number(s.lpTopZ) : 0;
        const heightAboveLP = (s.verticalPivotHeightAboveLP !== undefined)
            ? Number(s.verticalPivotHeightAboveLP)
            : (Number(s.pivotOffsetZ) || 0);
        return {
            x: finite(s.apex, 232) + finite(s.pivotOffsetX, 0),
            y: finite(s.pivotOffsetY, 0),
            z: lpTopZ + heightAboveLP
        };
    }

    function getParameters(sourceState) {
        const s = sourceState || root.state || {};
        const pivot = getPivotPoint(s);
        const lpTopZ = (s.lpTopZ !== undefined) ? Number(s.lpTopZ) : 0;
        return {
            schemaVersion: MANIFEST_VERSION,
            pivot,
            lpTopZ,
            towerCenter: { x: pivot.x, y: pivot.y, z: lpTopZ - 8 },
            towerHeight: Math.max(18, Math.abs(pivot.z - lpTopZ) + 24),
            towerRadius: 6.5,
            swashPlateRadius: 9.0,
            swashPlateThickness: 1.8,
            veeJewelRadius: 1.4,
            crossArmLength: 42.3,
            antiSkateRadius: 18,
            antiSkateStartDeg: -32,
            antiSkateEndDeg: 24,
            wireGuideOffset: { x: -10, y: -12, z: 10 }
        };
    }

    function material(color, metalness) {
        if (!root.THREE) return null;
        return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.36,
            metalness: metalness === undefined ? 0.55 : metalness
        });
    }

    function cylinderZ(radius, height, segments) {
        const geo = new THREE.CylinderGeometry(radius, radius, height, segments || 32);
        geo.rotateX(Math.PI / 2);
        return geo;
    }

    function buildTowerGeometry(params) {
        if (!root.THREE) return null;
        const geo = cylinderZ(params.towerRadius, params.towerHeight, 36);
        geo.translate(params.towerCenter.x, params.towerCenter.y, params.towerCenter.z + params.towerHeight / 2);
        geo.userData = { assembly: ASSEMBLY_NAME, featureId: 'central_tower' };
        return geo;
    }

    function buildSwashPlateGeometry(params) {
        if (!root.THREE) return null;
        const geo = cylinderZ(params.swashPlateRadius, params.swashPlateThickness, 40);
        geo.translate(params.pivot.x, params.pivot.y, params.lpTopZ + params.swashPlateThickness / 2);
        geo.userData = { assembly: ASSEMBLY_NAME, featureId: 'sapphire_swash_plate' };
        return geo;
    }

    function buildVeeJewelGeometry(params) {
        if (!root.THREE) return null;
        const geo = new THREE.SphereGeometry(params.veeJewelRadius, 18, 10);
        geo.translate(params.pivot.x, params.pivot.y, params.pivot.z);
        geo.userData = { assembly: ASSEMBLY_NAME, featureId: 'sapphire_vee_jewel' };
        return geo;
    }

    function buildCrossArmGeometry(params) {
        if (!root.THREE) return null;
        const geo = new THREE.CylinderGeometry(1.35, 1.35, params.crossArmLength, 18);
        geo.rotateZ(Math.PI / 2);
        geo.translate(params.pivot.x, params.pivot.y, params.pivot.z);
        geo.userData = { assembly: ASSEMBLY_NAME, featureId: 'cross_arm_reference' };
        return geo;
    }

    function buildAntiSkateGuideGeometry(params) {
        if (!root.THREE) return null;
        const curve = new THREE.Curve();
        curve.getPoint = function (t) {
            const a0 = params.antiSkateStartDeg * Math.PI / 180;
            const a1 = params.antiSkateEndDeg * Math.PI / 180;
            const a = a0 + (a1 - a0) * t;
            return new THREE.Vector3(
                params.pivot.x + Math.cos(a) * params.antiSkateRadius,
                params.pivot.y + Math.sin(a) * params.antiSkateRadius,
                params.lpTopZ + 3.2
            );
        };
        const geo = new THREE.TubeGeometry(curve, 32, 0.55, 8, false);
        geo.userData = { assembly: ASSEMBLY_NAME, featureId: 'anti_skate_dynamic_guide' };
        return geo;
    }

    function buildWireGuideGeometry(params) {
        if (!root.THREE) return null;
        const geo = new THREE.TorusGeometry(3.2, 0.35, 8, 24);
        geo.rotateX(Math.PI / 2);
        geo.translate(
            params.pivot.x + params.wireGuideOffset.x,
            params.pivot.y + params.wireGuideOffset.y,
            params.pivot.z + params.wireGuideOffset.z
        );
        geo.userData = { assembly: ASSEMBLY_NAME, featureId: 'wire_guide_loop' };
        return geo;
    }

    function buildGeometry(sourceState) {
        if (!root.THREE) return null;
        const params = getParameters(sourceState);
        const parts = [
            buildTowerGeometry(params),
            buildSwashPlateGeometry(params),
            buildVeeJewelGeometry(params),
            buildCrossArmGeometry(params),
            buildAntiSkateGuideGeometry(params),
            buildWireGuideGeometry(params)
        ].filter(Boolean);
        if (root.mergeBufferGeometries && parts.length) return root.mergeBufferGeometries(parts);
        const group = buildAssemblyGroup(sourceState);
        if (root.flattenGroupToBufferGeometry) return root.flattenGroupToBufferGeometry(group);
        return parts[0] || new THREE.BufferGeometry();
    }

    function buildAssemblyGroup(sourceState, materials) {
        if (!root.THREE) return null;
        const params = getParameters(sourceState);
        const mats = materials || {
            metal: material(0x1a1a1a, 0.72),
            jewel: material(0x3e6cff, 0.15),
            guide: material(0x222222, 0.5)
        };
        const group = new THREE.Group();
        group.name = ASSEMBLY_NAME;

        const items = [
            ['central_tower', buildTowerGeometry(params), mats.metal],
            ['sapphire_swash_plate', buildSwashPlateGeometry(params), mats.jewel],
            ['sapphire_vee_jewel', buildVeeJewelGeometry(params), mats.jewel],
            ['cross_arm_reference', buildCrossArmGeometry(params), mats.metal],
            ['anti_skate_dynamic_guide', buildAntiSkateGuideGeometry(params), mats.guide],
            ['wire_guide_loop', buildWireGuideGeometry(params), mats.guide]
        ];

        items.forEach(item => {
            if (!item[1]) return;
            const mesh = new THREE.Mesh(item[1], item[2]);
            mesh.name = item[0];
            group.add(mesh);
        });
        group.userData = getFeatureManifest(sourceState);
        return group;
    }

    function getFeatureManifest(sourceState) {
        const params = getParameters(sourceState);
        const features = [
            { id: 'central_tower', role: 'vertical_pivot_support', center: params.towerCenter },
            { id: 'sapphire_swash_plate', role: 'secondary_pivot_plate', center: params.pivot },
            { id: 'sapphire_vee_jewel', role: 'primary_vertical_bearing', center: params.pivot },
            { id: 'cross_arm_reference', role: 'vta_cross_arm_reference', lengthMm: params.crossArmLength },
            { id: 'anti_skate_dynamic_guide', role: 'dynamic_anti_skate_reference', percentRange: [8, 12] },
            { id: 'wire_guide_loop', role: 'wire_dressing_reference' }
        ];
        return {
            exportManifestVersion: MANIFEST_VERSION,
            assembly: ASSEMBLY_NAME,
            featureCount: features.length,
            features
        };
    }

    root.CobraMechanicalAssembly = {
        schemaVersion: MANIFEST_VERSION,
        assemblyName: ASSEMBLY_NAME,
        getParameters,
        buildGeometry,
        buildAssemblyGroup,
        getFeatureManifest
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
