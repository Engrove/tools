/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-oval-counterweight.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-oval-counterweight.js
 * Phase 2 Cobra oval counterweight assembly.
 *
 * This module adds a separate pivot-adjacent oval/capsule counterweight body.
 * It is intentionally limited to the counterweight assembly: no Cobra armwand,
 * no station-based eggshell wand, no headshell slots and no mesh-generator rewrite.
 */
(function(root) {
    'use strict';

    const ASSEMBLY_NAME = 'cobraOvalCounterweightAssembly';
    const COMPONENT_NAME = 'cobraOvalCounterweight';
    const MANIFEST_VERSION = 1;

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback) {
        return value === true ? true : (value === false ? false : fallback);
    }

    function clamp(value, min, max, fallback) {
        const v = finite(value, fallback);
        return Math.max(min, Math.min(max, v));
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function defaultCounterweightBlock() {
        return {
            variant: 'oval',
            enabled: true,
            role: 'pivot_adjacent_balance_mass',
            body: {
                shape: 'rounded_capsule',
                xMm: 237.0,
                yMm: 0.0,
                zMm: -2.0,
                lengthMm: 42.0,
                widthMm: 24.0,
                heightMm: 12.0,
                cornerRadiusMm: 6.0,
                massG: 55.0,
                material: 'tungsten_or_equivalent'
            },
            underWeights: {
                enabled: true,
                count: 2,
                massEachG: 6.0,
                zMm: -7.0,
                spacingMm: 14.0
            },
            fineTrim: {
                enabled: true,
                massEquivalentG: 3.0,
                xOffsetMm: -6.0,
                zMm: -3.0
            },
            targetCOMZMaxMm: 0.0,
            targetCOMZPreferredMm: -2.0,
            useRearDiscProxy: false
        };
    }

    function normalizeCounterweightBlock(value) {
        const incoming = value && typeof value === 'object' ? value : {};
        const out = defaultCounterweightBlock();

        out.variant = incoming.variant === 'oval' ? 'oval' : out.variant;
        out.enabled = bool(incoming.enabled, out.enabled);
        out.role = (typeof incoming.role === 'string' && incoming.role.trim()) ? incoming.role : out.role;
        out.targetCOMZMaxMm = finite(incoming.targetCOMZMaxMm, out.targetCOMZMaxMm);
        out.targetCOMZPreferredMm = finite(incoming.targetCOMZPreferredMm, out.targetCOMZPreferredMm);
        out.useRearDiscProxy = incoming.useRearDiscProxy === true;

        if (incoming.body && typeof incoming.body === 'object') {
            const b = incoming.body;
            out.body.shape = (typeof b.shape === 'string' && b.shape.trim()) ? b.shape : out.body.shape;
            out.body.xMm = finite(b.xMm, out.body.xMm);
            out.body.yMm = finite(b.yMm, out.body.yMm);
            out.body.zMm = finite(b.zMm, out.body.zMm);
            out.body.lengthMm = clamp(b.lengthMm, 4, 160, out.body.lengthMm);
            out.body.widthMm = clamp(b.widthMm, 4, 90, out.body.widthMm);
            out.body.heightMm = clamp(b.heightMm, 2, 60, out.body.heightMm);
            out.body.cornerRadiusMm = clamp(b.cornerRadiusMm, 0, Math.min(out.body.widthMm, out.body.heightMm) / 2, out.body.cornerRadiusMm);
            out.body.massG = clamp(b.massG, 0, 500, out.body.massG);
            out.body.material = (typeof b.material === 'string' && b.material.trim()) ? b.material : out.body.material;
        }

        if (incoming.underWeights && typeof incoming.underWeights === 'object') {
            const u = incoming.underWeights;
            out.underWeights.enabled = bool(u.enabled, out.underWeights.enabled);
            out.underWeights.count = Math.max(0, Math.min(12, Math.round(finite(u.count, out.underWeights.count))));
            out.underWeights.massEachG = clamp(u.massEachG, 0, 100, out.underWeights.massEachG);
            out.underWeights.zMm = finite(u.zMm, out.underWeights.zMm);
            out.underWeights.spacingMm = clamp(u.spacingMm, 0, 80, out.underWeights.spacingMm);
        }

        if (incoming.fineTrim && typeof incoming.fineTrim === 'object') {
            const f = incoming.fineTrim;
            out.fineTrim.enabled = bool(f.enabled, out.fineTrim.enabled);
            out.fineTrim.massEquivalentG = clamp(f.massEquivalentG, 0, 50, out.fineTrim.massEquivalentG);
            out.fineTrim.xOffsetMm = finite(f.xOffsetMm, out.fineTrim.xOffsetMm);
            out.fineTrim.zMm = finite(f.zMm, out.fineTrim.zMm);
        }

        return out;
    }

    function getArchitecture(sourceState) {
        const s = sourceState || root.state || {};
        const arch = s && s.cobraArchitecture && typeof s.cobraArchitecture === 'object'
            ? s.cobraArchitecture
            : {};
        return arch;
    }

    function getCounterweightBlock(sourceState) {
        const arch = getArchitecture(sourceState);
        return normalizeCounterweightBlock(arch.counterweight);
    }

    function isEnabled(sourceState) {
        const arch = getArchitecture(sourceState);
        const cw = getCounterweightBlock(sourceState);
        return arch.enabled === true &&
            cw.enabled === true &&
            cw.variant === 'oval' &&
            cw.useRearDiscProxy !== true;
    }

    function weightedAverage(points) {
        const totalMass = points.reduce((sum, p) => sum + Math.max(0, finite(p.massG, 0)), 0);
        if (totalMass <= 0) return { x: 0, y: 0, z: 0, massG: 0 };
        return {
            x: points.reduce((sum, p) => sum + finite(p.x, 0) * Math.max(0, finite(p.massG, 0)), 0) / totalMass,
            y: points.reduce((sum, p) => sum + finite(p.y, 0) * Math.max(0, finite(p.massG, 0)), 0) / totalMass,
            z: points.reduce((sum, p) => sum + finite(p.z, 0) * Math.max(0, finite(p.massG, 0)), 0) / totalMass,
            massG: totalMass
        };
    }

    function componentParts(sourceState) {
        const cw = getCounterweightBlock(sourceState);
        const b = cw.body;
        const parts = [];

        if (cw.enabled && b.massG > 0) {
            parts.push({
                id: 'oval_body',
                role: 'primary_mass',
                massG: b.massG,
                x: b.xMm,
                y: b.yMm,
                z: b.zMm
            });
        }

        if (cw.enabled && cw.underWeights.enabled && cw.underWeights.count > 0 && cw.underWeights.massEachG > 0) {
            const count = cw.underWeights.count;
            const spacing = cw.underWeights.spacingMm;
            for (let i = 0; i < count; i++) {
                const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spacing;
                parts.push({
                    id: 'under_weight_' + (i + 1),
                    role: 'underside_weight',
                    massG: cw.underWeights.massEachG,
                    x: b.xMm,
                    y: b.yMm + offset,
                    z: cw.underWeights.zMm
                });
            }
        }

        if (cw.enabled && cw.fineTrim.enabled && cw.fineTrim.massEquivalentG > 0) {
            parts.push({
                id: 'fine_trim',
                role: 'fine_trim_mass',
                massG: cw.fineTrim.massEquivalentG,
                x: b.xMm + cw.fineTrim.xOffsetMm,
                y: b.yMm,
                z: cw.fineTrim.zMm
            });
        }

        return parts;
    }

    function inertiaApproxForBody(cw, totalMassG) {
        const b = cw.body;
        const m = Math.max(0, finite(totalMassG, b.massG));
        // Approximate as a rounded capsule/ellipsoid bounding body in g·mm².
        return {
            Ixx_gmm2: (m / 12) * (b.widthMm * b.widthMm + b.heightMm * b.heightMm),
            Iyy_gmm2: (m / 12) * (b.lengthMm * b.lengthMm + b.heightMm * b.heightMm),
            Izz_gmm2: (m / 12) * (b.lengthMm * b.lengthMm + b.widthMm * b.widthMm),
            model: 'rounded_capsule_bounding_box_approx'
        };
    }

    function getMassComponent(sourceState) {
        const cw = getCounterweightBlock(sourceState);
        if (!isEnabled(sourceState)) {
            return {
                name: COMPONENT_NAME,
                enabled: false,
                massG: 0,
                mass: 0,
                com: { x: 0, y: 0, z: 0 },
                x: 0,
                y: 0,
                z: 0,
                inertiaApprox: inertiaApproxForBody(cw, 0),
                source: 'none',
                rearDiscProxyUsed: false,
                parts: []
            };
        }

        const parts = componentParts(sourceState);
        const combined = weightedAverage(parts);
        return {
            name: COMPONENT_NAME,
            enabled: true,
            massG: combined.massG,
            mass: combined.massG,
            com: { x: combined.x, y: combined.y, z: combined.z },
            x: combined.x,
            y: combined.y,
            z: combined.z,
            inertiaApprox: inertiaApproxForBody(cw, combined.massG),
            source: COMPONENT_NAME,
            rearDiscProxyUsed: false,
            body: deepClone(cw.body),
            underWeights: deepClone(cw.underWeights),
            fineTrim: deepClone(cw.fineTrim),
            parts
        };
    }

    function buildBodyGeometry(cw) {
        if (!root.THREE) return null;
        const b = cw.body;
        const geo = new root.THREE.SphereGeometry(1, 32, 16);
        geo.scale(b.lengthMm / 2, b.widthMm / 2, b.heightMm / 2);
        geo.translate(b.xMm, b.yMm, b.zMm);
        geo.userData = Object.assign({}, geo.userData || {}, {
            assembly: ASSEMBLY_NAME,
            featureId: 'oval_body',
            semanticType: 'pivot_adjacent_rounded_capsule_mass'
        });
        return geo;
    }

    function buildUnderWeightGeometry(cw, index) {
        if (!root.THREE || !cw.underWeights.enabled) return null;
        const count = Math.max(1, cw.underWeights.count);
        const spacing = cw.underWeights.spacingMm;
        const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spacing;
        const radius = Math.max(1.2, Math.min(cw.body.widthMm / 7, 4.0));
        const thickness = Math.max(1.0, cw.body.heightMm * 0.18);
        const geo = new root.THREE.CylinderGeometry(radius, radius, thickness, 20);
        geo.rotateX(Math.PI / 2);
        geo.translate(cw.body.xMm, cw.body.yMm + offset, cw.underWeights.zMm);
        geo.userData = Object.assign({}, geo.userData || {}, {
            assembly: ASSEMBLY_NAME,
            featureId: 'under_weight_' + (index + 1),
            semanticType: 'separate_underside_weight'
        });
        return geo;
    }

    function buildFineTrimGeometry(cw) {
        if (!root.THREE || !cw.fineTrim.enabled || cw.fineTrim.massEquivalentG <= 0) return null;
        const radius = Math.max(0.8, Math.min(cw.body.heightMm / 8, 2.0));
        const length = Math.max(4, Math.min(cw.body.lengthMm * 0.35, 22));
        const geo = new root.THREE.CylinderGeometry(radius, radius, length, 18);
        geo.rotateZ(Math.PI / 2);
        geo.translate(cw.body.xMm + cw.fineTrim.xOffsetMm, cw.body.yMm, cw.fineTrim.zMm);
        geo.userData = Object.assign({}, geo.userData || {}, {
            assembly: ASSEMBLY_NAME,
            featureId: 'fine_trim_mass',
            semanticType: 'separate_fine_trim_mass'
        });
        return geo;
    }

    function buildAssemblyGroup(sourceState, material) {
        if (!root.THREE || !isEnabled(sourceState)) return null;
        const cw = getCounterweightBlock(sourceState);
        const group = new root.THREE.Group();
        group.name = ASSEMBLY_NAME;

        const matBody = material || new root.THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.32, metalness: 0.45 });
        const matUnder = new root.THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.38, metalness: 0.6 });
        const matTrim = new root.THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.24, metalness: 0.85 });

        const bodyGeo = buildBodyGeometry(cw);
        if (bodyGeo) {
            const mesh = new root.THREE.Mesh(bodyGeo, matBody);
            mesh.name = 'cobra_oval_counterweight_body';
            group.add(mesh);
        }

        for (let i = 0; i < cw.underWeights.count; i++) {
            const geo = buildUnderWeightGeometry(cw, i);
            if (geo) {
                const mesh = new root.THREE.Mesh(geo, matUnder);
                mesh.name = 'cobra_oval_underweight_' + (i + 1);
                group.add(mesh);
            }
        }

        const trimGeo = buildFineTrimGeometry(cw);
        if (trimGeo) {
            const mesh = new root.THREE.Mesh(trimGeo, matTrim);
            mesh.name = 'cobra_oval_fine_trim';
            group.add(mesh);
        }

        group.userData = getFeatureManifest(sourceState);
        return group;
    }

    function buildGeometry(sourceState) {
        if (!root.THREE || !isEnabled(sourceState)) return null;
        const group = buildAssemblyGroup(sourceState);
        if (root.flattenGroupToBufferGeometry && group) return root.flattenGroupToBufferGeometry(group);
        const cw = getCounterweightBlock(sourceState);
        return buildBodyGeometry(cw);
    }

    function getFeatureManifest(sourceState) {
        const cw = getCounterweightBlock(sourceState);
        const comp = getMassComponent(sourceState);
        const features = [];
        if (cw.enabled) {
            features.push({
                id: 'oval_body',
                role: 'primary_mass',
                shape: cw.body.shape,
                lengthMm: cw.body.lengthMm,
                widthMm: cw.body.widthMm,
                heightMm: cw.body.heightMm,
                massG: cw.body.massG,
                center: { x: cw.body.xMm, y: cw.body.yMm, z: cw.body.zMm }
            });
        }
        if (cw.underWeights.enabled && cw.underWeights.count > 0) {
            features.push({
                id: 'under_weights',
                role: 'separate_underside_weights',
                count: cw.underWeights.count,
                massEachG: cw.underWeights.massEachG,
                zMm: cw.underWeights.zMm,
                spacingMm: cw.underWeights.spacingMm
            });
        }
        if (cw.fineTrim.enabled && cw.fineTrim.massEquivalentG > 0) {
            features.push({
                id: 'fine_trim',
                role: 'separate_fine_trim_mass',
                massEquivalentG: cw.fineTrim.massEquivalentG,
                xOffsetMm: cw.fineTrim.xOffsetMm,
                zMm: cw.fineTrim.zMm
            });
        }

        return {
            exportManifestVersion: MANIFEST_VERSION,
            assembly: ASSEMBLY_NAME,
            featureCount: features.length,
            enabled: isEnabled(sourceState),
            componentName: COMPONENT_NAME,
            massG: comp.massG,
            com: comp.com,
            rearDiscProxyUsed: false,
            features
        };
    }

    root.CobraOvalCounterweightAssembly = Object.freeze({
        schemaVersion: MANIFEST_VERSION,
        assemblyName: ASSEMBLY_NAME,
        componentName: COMPONENT_NAME,
        defaultCounterweightBlock,
        normalizeCounterweightBlock,
        getCounterweightBlock,
        isEnabled,
        getMassComponent,
        buildGeometry,
        buildAssemblyGroup,
        getFeatureManifest
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
