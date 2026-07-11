/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F titanium-mount-plate.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/titanium-mount-plate.js
 * TD051 structural titanium interface plate contract.
 *
 * The titanium mount plate is not the headshell slot carrier/reference plate.
 * It is a structural laminated interface between the carbon armwand /
 * integrated headshell structure and the cartridge / tonehead mounting surface.
 * It must not be placed as a loose underside plate below the cartridge or
 * headshell.
 */
(function(root) {
    'use strict';

    const FEATURE_SCHEMA = 'td051-titanium-head-interface-plate-v1';

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback) {
        if (value === true || value === false) return value;
        return fallback;
    }

    function hasOwn(obj, key) {
        return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
    }

    function readValue(source, id, fallback) {
        const s = isObject(source) ? source : {};
        if (hasOwn(s, id)) return s[id];
        if (isObject(s.inputs) && hasOwn(s.inputs, id)) return s.inputs[id];
        if (isObject(s.checkboxes) && hasOwn(s.checkboxes, id)) return s.checkboxes[id];
        return fallback;
    }

    function clamp(value, min, max, fallback) {
        const n = finite(value, fallback);
        return Math.max(min, Math.min(max, n));
    }

    function defaultInterfaceCenterX(source, lengthMm) {
        const padL = finite(readValue(source, 'padL', 26), 26);
        const noseL = finite(readValue(source, 'noseL', 16), 16);
        const neckL = finite(readValue(source, 'neckL', 45), 45);
        const aftOfSlotZone = padL + Math.min(8, Math.max(3, noseL * 0.35));
        const neckBlendCenter = padL + Math.max(4, Math.min(18, neckL * 0.22));
        return Math.max(24, Math.min(neckBlendCenter, aftOfSlotZone + Math.max(0, lengthMm - 20) * 0.25));
    }

    function resolveTitaniumMountPlatePose(source, profile, cobraArchitecture) {
        const s = isObject(source) ? source : {};
        const enabled = bool(readValue(s, 'titaniumPlateEnabled', false), false);
        const lengthMm = clamp(readValue(s, 'titaniumPlateLength', 24), 10, 36, 24);
        const widthMm = clamp(readValue(s, 'titaniumPlateWidth', 18), 10, 24, 18);
        const thicknessMm = clamp(readValue(s, 'titaniumPlateThickness', 1.5), 0.5, 3, 1.5);
        const massG = Math.max(0, finite(readValue(s, 'titaniumPlateMass', 2.85), 2.85));
        const adhesiveThicknessMm = clamp(readValue(s, 'titaniumAdhesiveThickness', 0.08), 0, 0.5, 0.08);
        const adhesiveDampingLossFactor = clamp(readValue(s, 'titaniumAdhesiveDampingLossFactor', 0.18), 0, 1, 0.18);

        const padL = finite(readValue(s, 'padL', 26), 26);
        const neckL = finite(readValue(s, 'neckL', 45), 45);
        const headH = finite(readValue(s, 'headH', 6), 6);
        const apex = finite(readValue(s, 'apex', 237), 237);
        const requestedX = finite(readValue(s, 'titaniumPlateX', defaultInterfaceCenterX(s, lengthMm)), defaultInterfaceCenterX(s, lengthMm));

        const interfaceMinX = Math.max(20, padL - lengthMm * 0.20);
        const interfaceMaxX = Math.max(interfaceMinX + 0.1, Math.min(apex - 35, padL + Math.max(10, neckL * 0.72)));
        const xMm = clamp(requestedX, interfaceMinX, interfaceMaxX, defaultInterfaceCenterX(s, lengthMm));
        const yMm = clamp(readValue(s, 'titaniumPlateYOffset', 0), -4, 4, 0);
        const zBase = Math.max(1.4, headH * 0.50) + adhesiveThicknessMm + thicknessMm / 2;
        const zMm = zBase + clamp(readValue(s, 'titaniumPlateZOffset', 0), -2, 4, 0);

        const bbox = {
            minX: xMm - lengthMm / 2,
            maxX: xMm + lengthMm / 2,
            minY: yMm - widthMm / 2,
            maxY: yMm + widthMm / 2,
            minZ: zMm - thicknessMm / 2,
            maxZ: zMm + thicknessMm / 2
        };
        const undersideLoosePlateZone = bbox.maxX <= 24 && bbox.maxZ <= 1.5;
        const contactsInterface = bbox.minX <= padL + 4 && bbox.maxX >= padL - 4 && bbox.minZ >= 1.0;

        return {
            schema: FEATURE_SCHEMA,
            featureId: 'titaniumMountPlate',
            semanticType: 'structural_laminated_interface_plate',
            enabled: enabled,
            lengthMm,
            widthMm,
            thicknessMm,
            massG,
            adhesiveThicknessMm,
            adhesiveDampingLossFactor,
            xMm,
            yMm,
            zMm,
            bbox,
            interfaceZone: {
                description: 'headshell-to-armwand/neck laminated interface zone',
                minX: interfaceMinX,
                maxX: interfaceMaxX,
                referencePadRearX: padL,
                referenceNeckLength: neckL
            },
            contactsIntegratedHeadshellInterface: contactsInterface,
            undersideLoosePlateZone,
            rule: 'Titanium mounting plate is a structural laminated interface between the carbon armwand / integrated headshell structure and the cartridge / tonehead mounting surface. It must not be placed as a loose underside plate below the cartridge or headshell.'
        };
    }

    function isEnabled(source) {
        return resolveTitaniumMountPlatePose(source).enabled === true;
    }

    function buildGeometry(source, options) {
        const pose = resolveTitaniumMountPlatePose(source);
        if (!pose.enabled) {
            return {
                type: 'titanium_mount_plate_disabled_descriptor',
                enabled: false,
                pose,
                userData: {
                    featureSchema: FEATURE_SCHEMA,
                    featureId: 'titaniumMountPlate',
                    semanticType: 'structural_laminated_interface_plate',
                    disabledBy: 'titaniumPlateEnabled=false'
                }
            };
        }

        if (!root.THREE || !root.THREE.BoxGeometry) {
            return {
                type: 'titanium_mount_plate_descriptor_geometry',
                enabled: true,
                pose,
                bbox: pose.bbox,
                userData: {
                    featureSchema: FEATURE_SCHEMA,
                    featureId: 'titaniumMountPlate',
                    semanticType: 'structural_laminated_interface_plate',
                    geometryRole: 'structural_laminated_interface_plate_descriptor',
                    controlsUsed: ['titaniumPlateEnabled', 'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass', 'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset', 'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor']
                }
            };
        }

        let geo = new root.THREE.BoxGeometry(pose.lengthMm, pose.widthMm, pose.thicknessMm);
        geo.translate(pose.xMm, pose.yMm, pose.zMm);
        geo.userData = {
            featureSchema: FEATURE_SCHEMA,
            featureId: 'titaniumMountPlate',
            semanticType: 'structural_laminated_interface_plate',
            geometryRole: 'structural_laminated_interface_plate',
            titaniumMountPlateExportPath: true,
            controlsUsed: ['titaniumPlateEnabled', 'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass', 'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset', 'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor'],
            pose: pose
        };
        if (root.finalizeWeldedGeometry && typeof root.finalizeWeldedGeometry === 'function') {
            geo = root.finalizeWeldedGeometry(geo, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });
        } else if (geo.computeVertexNormals) {
            geo.computeVertexNormals();
        }
        geo.userData = Object.assign({}, geo.userData || {}, {
            featureSchema: FEATURE_SCHEMA,
            featureId: 'titaniumMountPlate',
            semanticType: 'structural_laminated_interface_plate',
            geometryRole: 'structural_laminated_interface_plate',
            titaniumMountPlateExportPath: true,
            pose: pose
        });
        return geo;
    }

    root.TitaniumMountPlate = {
        FEATURE_SCHEMA,
        resolveTitaniumMountPlatePose,
        buildGeometry,
        isEnabled
    };
})(typeof window !== 'undefined' ? window : globalThis);
