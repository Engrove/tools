/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F counterweight-assembly.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/counterweight-assembly.js
 * TD046 Cobra counterweight assembly foundation.
 *
 * This module introduces the Cobra counterweight as a first-class assembly.
 * It is intentionally additive in DELIVERY 2: no existing render/export path
 * calls it yet. Later deliveries may wire buildAssemblyGroup() into preview and
 * export. Counterweight intent is kept separate from armwand parameters.
 */
(function (root) {
    'use strict';

    const ASSEMBLY_NAME = 'counterweightAssembly';
    const MANIFEST_VERSION = 1;

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function cobraApi() {
        return root.CobraControls || null;
    }

    function cobraValue(sourceState, id, fallback) {
        const api = cobraApi();
        if (api && typeof api.get === 'function') {
            const v = api.get(id, sourceState || root.state || {});
            if (Number.isFinite(Number(v))) return Number(v);
        }
        return fallback;
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
        const width = cobraValue(s, 'heartCounterweightWidth', 38);
        const dropZ = cobraValue(s, 'heartCounterweightDropZ', -22);
        const skewDeg = cobraValue(s, 'heartCounterweightSkew', 0);
        const pocketCount = Math.max(0, Math.min(8, Math.round(cobraValue(s, 'underWeightPocketCount', 4))));
        const fineTrimMass = cobraValue(s, 'fineTrimScrewMass', 8);

        return {
            schemaVersion: MANIFEST_VERSION,
            pivot,
            center: {
                x: pivot.x + finite(s.cobraCounterweightOffsetX, 12),
                y: pivot.y,
                z: pivot.z + dropZ
            },
            width,
            height: clamp(width * 0.84, 16, 54),
            thickness: clamp(width * 0.32, 7, 20),
            skewDeg: clamp(skewDeg, -15, 15),
            underWeightPocketCount: pocketCount,
            fineTrimScrewMass: clamp(fineTrimMass, 0, 12),
            fineTrimScrewLength: clamp(finite(s.rearFineTrimScrewLength, 10), 4, 24)
        };
    }

    function buildHeartOutline(width, height, steps) {
        const pts = [];
        const n = Math.max(24, steps || 48);
        for (let i = 0; i < n; i++) {
            const t = (i / n) * Math.PI * 2;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            pts.push({ y: (x / 32) * width, z: ((y - 4) / 28) * height });
        }
        return pts;
    }

    function rotateYZ(point, skewRad) {
        const c = Math.cos(skewRad);
        const s = Math.sin(skewRad);
        return {
            y: point.y * c - point.z * s,
            z: point.y * s + point.z * c
        };
    }

    function buildExtrudedOutlineGeometry(outline, thicknessX, center, skewDeg) {
        if (!root.THREE) return null;
        const n = outline.length;
        const positions = [];
        const indices = [];
        const skewRad = (Math.PI / 180) * finite(skewDeg, 0);

        for (let side = 0; side < 2; side++) {
            const x = center.x + (side === 0 ? -thicknessX / 2 : thicknessX / 2);
            for (let i = 0; i < n; i++) {
                const p = rotateYZ(outline[i], skewRad);
                positions.push(x, center.y + p.y, center.z + p.z);
            }
        }

        const frontCenter = positions.length / 3;
        positions.push(center.x - thicknessX / 2, center.y, center.z);
        const rearCenter = positions.length / 3;
        positions.push(center.x + thicknessX / 2, center.y, center.z);

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            indices.push(i, n + i, j, j, n + i, n + j);
        }
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            indices.push(frontCenter, j, i);
            indices.push(rearCenter, n + i, n + j);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        geo.userData = Object.assign({}, geo.userData || {}, {
            assembly: ASSEMBLY_NAME,
            featureId: 'heart_counterweight',
            semanticType: 'pivot_adjacent_heart_mass'
        });
        return geo;
    }

    function buildPocketGeometry(params, index) {
        if (!root.THREE) return null;
        const count = Math.max(1, params.underWeightPocketCount);
        const spread = Math.min(params.width * 0.55, 28);
        const t = count === 1 ? 0.5 : index / (count - 1);
        const y = params.center.y - spread / 2 + t * spread;
        const z = params.center.z - params.height * 0.34;
        const geo = new THREE.CylinderGeometry(2.1, 2.1, Math.max(1.2, params.thickness * 0.38), 20);
        geo.rotateY(Math.PI / 2);
        geo.translate(params.center.x, y, z);
        geo.userData = Object.assign({}, geo.userData || {}, {
            assembly: ASSEMBLY_NAME,
            featureId: 'underweight_pocket_' + (index + 1),
            semanticType: 'underside_weight_pocket'
        });
        return geo;
    }

    function buildFineTrimScrewGeometry(params) {
        if (!root.THREE || params.fineTrimScrewMass <= 0) return null;
        const geo = new THREE.CylinderGeometry(1.55, 1.55, params.fineTrimScrewLength, 18);
        geo.rotateZ(Math.PI / 2);
        geo.translate(params.center.x + params.thickness * 0.7, params.center.y, params.center.z + params.height * 0.06);
        geo.userData = Object.assign({}, geo.userData || {}, {
            assembly: ASSEMBLY_NAME,
            featureId: 'fine_trim_screw',
            semanticType: 'rear_fine_stylus_load_trim'
        });
        return geo;
    }

    function buildGeometry(sourceState) {
        if (!root.THREE) return null;
        const params = getParameters(sourceState);
        const parts = [];
        const outline = buildHeartOutline(params.width, params.height, 56);
        parts.push(buildExtrudedOutlineGeometry(outline, params.thickness, params.center, params.skewDeg));
        for (let i = 0; i < params.underWeightPocketCount; i++) {
            parts.push(buildPocketGeometry(params, i));
        }
        parts.push(buildFineTrimScrewGeometry(params));

        const valid = parts.filter(Boolean);
        if (root.mergeBufferGeometries && valid.length) return root.mergeBufferGeometries(valid);
        const group = buildAssemblyGroup(sourceState);
        if (root.flattenGroupToBufferGeometry) return root.flattenGroupToBufferGeometry(group);
        return valid[0] || new THREE.BufferGeometry();
    }

    function buildAssemblyGroup(sourceState, material) {
        if (!root.THREE) return null;
        const params = getParameters(sourceState);
        const group = new THREE.Group();
        group.name = ASSEMBLY_NAME;
        const mat = material || new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.32, metalness: 0.35 });
        const pocketMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.42, metalness: 0.2 });
        const screwMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.24, metalness: 0.9 });

        const heartGeo = buildExtrudedOutlineGeometry(buildHeartOutline(params.width, params.height, 56), params.thickness, params.center, params.skewDeg);
        if (heartGeo) {
            const mesh = new THREE.Mesh(heartGeo, mat);
            mesh.name = 'heart_counterweight';
            group.add(mesh);
        }
        for (let i = 0; i < params.underWeightPocketCount; i++) {
            const pocketGeo = buildPocketGeometry(params, i);
            if (pocketGeo) {
                const mesh = new THREE.Mesh(pocketGeo, pocketMat);
                mesh.name = 'underweight_pocket_' + (i + 1);
                group.add(mesh);
            }
        }
        const screwGeo = buildFineTrimScrewGeometry(params);
        if (screwGeo) {
            const mesh = new THREE.Mesh(screwGeo, screwMat);
            mesh.name = 'fine_trim_screw';
            group.add(mesh);
        }
        group.userData = getFeatureManifest(sourceState);
        return group;
    }

    function getFeatureManifest(sourceState) {
        const params = getParameters(sourceState);
        const features = [
            {
                id: 'heart_counterweight',
                role: 'primary_mass',
                center: params.center,
                widthMm: params.width,
                heightMm: params.height,
                thicknessMm: params.thickness,
                skewDeg: params.skewDeg
            }
        ];
        for (let i = 0; i < params.underWeightPocketCount; i++) {
            features.push({
                id: 'underweight_pocket_' + (i + 1),
                role: 'underside_weight_pocket',
                index: i + 1
            });
        }
        if (params.fineTrimScrewMass > 0) {
            features.push({
                id: 'fine_trim_screw',
                role: 'fine_stylus_load_trim',
                massG: params.fineTrimScrewMass,
                travelMm: params.fineTrimScrewLength
            });
        }
        return {
            exportManifestVersion: MANIFEST_VERSION,
            assembly: ASSEMBLY_NAME,
            featureCount: features.length,
            features
        };
    }

    function rejectArmwandProxyUse(id) {
        const protectedCoreGeometry = ['rearBendStartX', 'rearBlendLength', 'rearBendDropZ', 'rearBendLength',
            'rearMouthWidth', 'rearMouthLength', 'tailD', 'bulge', 'maxW', 'maxH', 'neckW', 'neckL'];
        if (protectedCoreGeometry.indexOf(id) !== -1) {
            return {
                ok: true,
                code: 'protected_core_geometry_control',
                message: 'Protected TD026 core geometry control; valid for real full-ring geometry, not a counterweight proxy path.'
            };
        }
        return { ok: true };
    }

    root.CobraCounterweightAssembly = {
        schemaVersion: MANIFEST_VERSION,
        assemblyName: ASSEMBLY_NAME,
        getParameters,
        buildHeartOutline,
        buildGeometry,
        buildAssemblyGroup,
        getFeatureManifest,
        rejectArmwandProxyUse
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
