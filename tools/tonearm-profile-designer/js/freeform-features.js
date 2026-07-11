/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F freeform-features.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Freeform feature objects: separate semantic/mechanical features, not hidden ring tricks.

(function(root) {
    'use strict';

    const FEATURE_SCHEMA = 'tonearm-designer-freeform-features-v1';
    const FEATURE_TYPES = Object.freeze([
        'integratedHeadshell',
        'sideBentHeadshellMount',
        'titaniumMountPlate',
        'cartridgeSlots',
        'wireDuct',
        'rearTerminal',
        'counterweightStack'
    ]);

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round(value, digits) {
        const f = Math.pow(10, digits || 6);
        return Math.round(Number(value) * f) / f;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function defaultFeatures() {
        return {
            schema: FEATURE_SCHEMA,
            integratedHeadshell: {
                enabled: true,
                integrated: true,
                detachable: false,
                datumPolicy: 'cartridge_datum_and_headshell_plane_preserved',
                lengthMm: 34,
                widthMm: 20,
                planeZMm: 0,
                mountStyle: 'one_piece_monocoque',
                cartridgeDatumValid: true,
                headshellPlaneValid: true
            },
            sideBentHeadshellMount: {
                enabled: false,
                integrated: true,
                bendYMm: 0,
                bendStartS: 0.02,
                bendEndS: 0.16,
                cartridgeDatumValid: true,
                slotGeometryValid: true,
                integratedWithArm: true
            },
            titaniumMountPlate: {
                enabled: true,
                type: 'structural_laminated_interface_plate',
                looseUndersidePlate: false,
                followsTD051Rule: true,
                xMm: 32,
                yMm: 0,
                zMm: 3.83,
                lengthMm: 24,
                widthMm: 18,
                thicknessMm: 1.5,
                adhesiveThicknessMm: 0.08
            },
            cartridgeSlots: {
                enabled: true,
                separateFeature: true,
                slotCount: 2,
                slotLengthMm: 12.7,
                slotWidthMm: 2.7,
                spacingMm: 12.7,
                datum: 'cartridge_datum',
                slotGeometryValid: true
            },
            wireDuct: {
                enabled: true,
                separateFeature: true,
                diameterMm: 2.2,
                clearanceMm: 0.8,
                path: 'centerline_offset_bottom'
            },
            rearTerminal: {
                enabled: true,
                separateFeature: true,
                s: 0.90,
                terminalDiameterMm: 10,
                terminalLengthMm: 12
            },
            counterweightStack: {
                enabled: true,
                separateFeature: true,
                fakeWithRingOrTail: false,
                mount: 'rear_terminal_disc_stack',
                discCount: 4,
                discDiameterMm: 24,
                discThicknessMm: 5,
                discMassG: 22,
                fineTrimMassG: 7,
                separateRearTerminalAssembly: true
            }
        };
    }

    function cobraFeatures() {
        const f = defaultFeatures();
        f.counterweightStack.discCount = 4;
        f.counterweightStack.discDiameterMm = 24;
        f.counterweightStack.discMassG = 22;
        f.rearTerminal.terminalDiameterMm = 11;
        f.integratedHeadshell.mountStyle = 'long_low_cobra_integrated_headshell';
        return f;
    }

    function straightLTFeatures() {
        const f = defaultFeatures();
        f.counterweightStack.enabled = true;
        f.counterweightStack.discCount = 3;
        f.counterweightStack.discDiameterMm = 20;
        f.counterweightStack.discMassG = 16;
        f.integratedHeadshell.mountStyle = 'straight_low_mass_integrated_headshell';
        return f;
    }

    function sideBentFeatures() {
        const f = defaultFeatures();
        f.sideBentHeadshellMount.enabled = true;
        f.sideBentHeadshellMount.bendYMm = -14;
        f.sideBentHeadshellMount.cartridgeDatumValid = true;
        f.sideBentHeadshellMount.slotGeometryValid = true;
        f.integratedHeadshell.mountStyle = 'integrated_side_bent_headshell';
        return f;
    }

    function presets() {
        return {
            long_low_cobra_monocoque: cobraFeatures(),
            straight_low_mass_lt_arm: straightLTFeatures(),
            integrated_side_bent_headshell: sideBentFeatures()
        };
    }

    function sanitizeBool(v, fallback) {
        return typeof v === 'boolean' ? v : !!fallback;
    }

    function sanitizeFeaturePatch(patch) {
        const src = patch && typeof patch === 'object' ? patch : {};
        const f = defaultFeatures();

        if (src.integratedHeadshell && typeof src.integratedHeadshell === 'object') {
            const p = src.integratedHeadshell;
            f.integratedHeadshell.enabled = sanitizeBool(p.enabled, f.integratedHeadshell.enabled);
            f.integratedHeadshell.integrated = true;
            f.integratedHeadshell.detachable = false;
            f.integratedHeadshell.lengthMm = round(clamp(finite(p.lengthMm, f.integratedHeadshell.lengthMm), 12, 55), 6);
            f.integratedHeadshell.widthMm = round(clamp(finite(p.widthMm, f.integratedHeadshell.widthMm), 8, 35), 6);
            f.integratedHeadshell.planeZMm = round(clamp(finite(p.planeZMm, f.integratedHeadshell.planeZMm), -10, 10), 6);
            f.integratedHeadshell.mountStyle = String(p.mountStyle || f.integratedHeadshell.mountStyle);
            f.integratedHeadshell.cartridgeDatumValid = p.cartridgeDatumValid !== false;
            f.integratedHeadshell.headshellPlaneValid = p.headshellPlaneValid !== false;
        }

        if (src.sideBentHeadshellMount && typeof src.sideBentHeadshellMount === 'object') {
            const p = src.sideBentHeadshellMount;
            f.sideBentHeadshellMount.enabled = sanitizeBool(p.enabled, f.sideBentHeadshellMount.enabled);
            f.sideBentHeadshellMount.integrated = true;
            f.sideBentHeadshellMount.integratedWithArm = true;
            f.sideBentHeadshellMount.bendYMm = round(clamp(finite(p.bendYMm, f.sideBentHeadshellMount.bendYMm), -30, 30), 6);
            f.sideBentHeadshellMount.bendStartS = round(clamp(finite(p.bendStartS, f.sideBentHeadshellMount.bendStartS), 0, 0.25), 6);
            f.sideBentHeadshellMount.bendEndS = round(clamp(finite(p.bendEndS, f.sideBentHeadshellMount.bendEndS), 0.05, 0.35), 6);
            f.sideBentHeadshellMount.cartridgeDatumValid = p.cartridgeDatumValid !== false;
            f.sideBentHeadshellMount.slotGeometryValid = p.slotGeometryValid !== false;
        }

        if (src.titaniumMountPlate && typeof src.titaniumMountPlate === 'object') {
            const p = src.titaniumMountPlate;
            f.titaniumMountPlate.enabled = sanitizeBool(p.enabled, f.titaniumMountPlate.enabled);
            f.titaniumMountPlate.type = 'structural_laminated_interface_plate';
            f.titaniumMountPlate.looseUndersidePlate = false;
            f.titaniumMountPlate.followsTD051Rule = true;
            f.titaniumMountPlate.xMm = round(clamp(finite(p.xMm, f.titaniumMountPlate.xMm), 20, 80), 6);
            f.titaniumMountPlate.yMm = round(clamp(finite(p.yMm, f.titaniumMountPlate.yMm), -15, 15), 6);
            f.titaniumMountPlate.zMm = round(clamp(finite(p.zMm, f.titaniumMountPlate.zMm), -5, 10), 6);
            f.titaniumMountPlate.lengthMm = round(clamp(finite(p.lengthMm, f.titaniumMountPlate.lengthMm), 10, 45), 6);
            f.titaniumMountPlate.widthMm = round(clamp(finite(p.widthMm, f.titaniumMountPlate.widthMm), 8, 30), 6);
            f.titaniumMountPlate.thicknessMm = round(clamp(finite(p.thicknessMm, f.titaniumMountPlate.thicknessMm), 0.4, 3), 6);
            f.titaniumMountPlate.adhesiveThicknessMm = round(clamp(finite(p.adhesiveThicknessMm, f.titaniumMountPlate.adhesiveThicknessMm), 0, 0.5), 6);
        }

        if (src.cartridgeSlots && typeof src.cartridgeSlots === 'object') {
            const p = src.cartridgeSlots;
            f.cartridgeSlots.enabled = sanitizeBool(p.enabled, f.cartridgeSlots.enabled);
            f.cartridgeSlots.separateFeature = true;
            f.cartridgeSlots.slotCount = Math.round(clamp(finite(p.slotCount, 2), 1, 4));
            f.cartridgeSlots.slotLengthMm = round(clamp(finite(p.slotLengthMm, 12.7), 4, 25), 6);
            f.cartridgeSlots.slotWidthMm = round(clamp(finite(p.slotWidthMm, 2.7), 1.5, 5), 6);
            f.cartridgeSlots.spacingMm = round(clamp(finite(p.spacingMm, 12.7), 6, 18), 6);
            f.cartridgeSlots.slotGeometryValid = p.slotGeometryValid !== false;
        }

        if (src.wireDuct && typeof src.wireDuct === 'object') {
            const p = src.wireDuct;
            f.wireDuct.enabled = sanitizeBool(p.enabled, f.wireDuct.enabled);
            f.wireDuct.separateFeature = true;
            f.wireDuct.diameterMm = round(clamp(finite(p.diameterMm, 2.2), 0.8, 5), 6);
            f.wireDuct.clearanceMm = round(clamp(finite(p.clearanceMm, 0.8), 0.2, 3), 6);
            f.wireDuct.path = String(p.path || f.wireDuct.path);
        }

        if (src.rearTerminal && typeof src.rearTerminal === 'object') {
            const p = src.rearTerminal;
            f.rearTerminal.enabled = sanitizeBool(p.enabled, f.rearTerminal.enabled);
            f.rearTerminal.separateFeature = true;
            f.rearTerminal.s = round(clamp(finite(p.s, 0.9), 0.75, 1), 6);
            f.rearTerminal.terminalDiameterMm = round(clamp(finite(p.terminalDiameterMm, 10), 5, 25), 6);
            f.rearTerminal.terminalLengthMm = round(clamp(finite(p.terminalLengthMm, 12), 3, 35), 6);
        }

        if (src.counterweightStack && typeof src.counterweightStack === 'object') {
            const p = src.counterweightStack;
            f.counterweightStack.enabled = sanitizeBool(p.enabled, f.counterweightStack.enabled);
            f.counterweightStack.separateFeature = true;
            f.counterweightStack.fakeWithRingOrTail = false;
            f.counterweightStack.separateRearTerminalAssembly = true;
            f.counterweightStack.mount = 'rear_terminal_disc_stack';
            f.counterweightStack.discCount = Math.round(clamp(finite(p.discCount, 4), 0, 12));
            f.counterweightStack.discDiameterMm = round(clamp(finite(p.discDiameterMm, 24), 8, 45), 6);
            f.counterweightStack.discThicknessMm = round(clamp(finite(p.discThicknessMm, 5), 1, 12), 6);
            f.counterweightStack.discMassG = round(clamp(finite(p.discMassG, 22), 0, 120), 6);
            f.counterweightStack.fineTrimMassG = round(clamp(finite(p.fineTrimMassG, 7), 0, 40), 6);
        }

        return f;
    }

    function applyFeaturePatch(current, patch) {
        const base = sanitizeFeaturePatch(current || defaultFeatures());
        if (!patch || typeof patch !== 'object') return base;
        const merged = clone(base);
        FEATURE_TYPES.forEach(type => {
            if (patch[type] && typeof patch[type] === 'object') merged[type] = Object.assign({}, merged[type] || {}, patch[type]);
        });
        return sanitizeFeaturePatch(merged);
    }

    function validateFeatureSeparation(features) {
        const f = sanitizeFeaturePatch(features || defaultFeatures());
        const errors = [];
        if (!f.integratedHeadshell.integrated || f.integratedHeadshell.detachable) errors.push('headshell must be integrated in standard modes');
        if (f.titaniumMountPlate.looseUndersidePlate || f.titaniumMountPlate.type !== 'structural_laminated_interface_plate') errors.push('titaniumMountPlate must be structural laminated interface plate, never loose underside plate');
        if (!f.cartridgeSlots.separateFeature) errors.push('cartridgeSlots must remain a separate slot feature');
        if (!f.counterweightStack.separateFeature || f.counterweightStack.fakeWithRingOrTail) errors.push('counterweightStack must remain a separate rear-terminal assembly and not be faked by ring/tail geometry');
        return { ok: errors.length === 0, errors, features: f };
    }

    root.FreeformFeatures = Object.freeze({
        schema: FEATURE_SCHEMA,
        featureTypes: FEATURE_TYPES.slice(),
        defaultFeatures,
        presets,
        sanitizeFeaturePatch,
        applyFeaturePatch,
        validateFeatureSeparation
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
