/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-controls.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-controls.js
 * Phase 4 CobraControls modern control/capability module.
 *
 * This module is intentionally limited to first-class state/control plumbing for:
 * - the Phase 1 Cobra architecture gate
 * - the Phase 13.1 configurable disc counterweight assembly
 * - the Phase 3 station-based eggshell armwand
 * - the Phase 5 mechanical assembly
 * - the Phase 6 integrated obround headshell slots
 *
 * It does not implement full FEA or a
 * final Cobra tonearm. It writes rearWeightDisc* as canonical disc counterweight controls
 * but does not write rearBend*, tailD, bulge, maxW/maxH/neckW/neckL as Cobra proxies.
 */
(function(root) {
    'use strict';

    const COBRA_CONTROLS_SCHEMA = 'cobra-controls-modern-v1';
    const FEATURE_ID = 'cobraControls';
    const TARGET_N1P2_MM = 237.05;
    const DEFAULT_APEX_FOR_N1P2 = 237.0;
    const DEFAULT_CARTX_FOR_N1P2 = -0.05;

    const PROTECTED_CORE_GEOMETRY_FIELDS = Object.freeze([
        'maxW',
        'maxH',
        'neckW',
        'neckL',
        'tailD',
        'bulge',
        'rearBendStartX',
        'rearBendDropZ',
        'rearBendLength',
        'rearBlendLength',
        'rearMouthWidth',
        'rearMouthLength'
    ]);

    const FORBIDDEN_PROXY_MUTATION_FIELDS = Object.freeze([]);

    const CONTROL_IDS = Object.freeze([
        'enabled',
        'specRegime',
        'n1p2Mm',
        'applyN1P2LockToLegacy',
        'counterweight.enabled',
        'counterweight.variant',
        'counterweight.discStack.diameterMm',
        'counterweight.discStack.thicknessMm',
        'counterweight.discStack.count',
        'counterweight.discStack.massEachG',
        'counterweight.fineTrim.enabled',
        'counterweight.fineTrim.lengthMm',
        'counterweight.fineTrim.massEquivalentG',
        'counterweight.useRearDiscStack',
        'counterweight.useRearDiscProxy',
        'armwand.enabled',
        'armwand.variant',
        'armwand.stationCount',
        'armwand.profile.pivotWidthMm',
        'armwand.profile.midWidthMm',
        'armwand.profile.headWidthMm',
        'armwand.profile.pivotHeightMm',
        'armwand.profile.midHeightMm',
        'armwand.profile.headHeightMm',
        'armwand.profile.topCrownMm',
        'armwand.profile.undersideBellyMm',
        'armwand.profile.asymmetryMm',
        'armwand.profile.wallThicknessMm',
        'mechanical.enabled',
        'mechanical.variant',
        'mechanical.pivot.type',
        'mechanical.pivot.zMm',
        'mechanical.tower.diameterMm',
        'mechanical.tower.heightMm',
        'mechanical.tower.massG',
        'mechanical.bearing.type',
        'mechanical.vta.type',
        'mechanical.vta.massG',
        'headshellSlots.enabled',
        'headshellSlots.variant',
        'headshellSlots.screwStandard',
        'headshellSlots.throughHole',
        'headshellSlots.slotCount',
        'headshellSlots.slotCarrierPlate.lengthMm',
        'headshellSlots.slotCarrierPlate.widthMm',
        'headshellSlots.slotCarrierPlate.thicknessMm',
        'headshellSlots.plate.lengthMm',
        'headshellSlots.plate.widthMm',
        'headshellSlots.plate.thicknessMm',
        'headshellSlots.slots'
    ]);

    function finite(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback) {
        if (value === true || value === false) return value;
        return fallback;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function clamp(value, min, max, fallback) {
        const n = finite(value, fallback);
        return Math.max(min, Math.min(max, n));
    }

    function readPath(source, path, fallback) {
        if (!isObject(source)) return fallback;
        const parts = String(path).split('.');
        let cur = source;
        for (let i = 0; i < parts.length; i += 1) {
            if (!isObject(cur) || !Object.prototype.hasOwnProperty.call(cur, parts[i])) {
                return fallback;
            }
            cur = cur[parts[i]];
        }
        return cur === undefined ? fallback : cur;
    }

    function writePath(target, path, value) {
        const parts = String(path).split('.');
        let cur = target;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const p = parts[i];
            if (!isObject(cur[p])) cur[p] = {};
            cur = cur[p];
        }
        cur[parts[parts.length - 1]] = value;
    }

    function getDefaultCounterweightBlock() {
        return (root.CobraDiscCounterweightAssembly && typeof root.CobraDiscCounterweightAssembly.getDefaultSpec === 'function')
            ? root.CobraDiscCounterweightAssembly.getDefaultSpec()
            : {
                variant: 'configurable_disc_stack',
                enabled: true,
                role: 'rear_terminal_balance_mass',
                mountSource: 'unifiedRearTerminal',
                useRearDiscStack: true,
                useRearDiscProxy: false,
                discStack: {
                    diameterMm: 14,
                    thicknessMm: 4,
                    count: 4,
                    massEachG: 18,
                    xMm: null,
                    yMm: 0,
                    zMm: null
                },
                fineTrim: {
                    enabled: true,
                    lengthMm: 18,
                    massEquivalentG: 0
                },
                targetCOMZMaxMm: 0,
                targetCOMZPreferredMm: -2.9
            };
    }

    function getDefaultArmwandBlock() {
        if (root.CobraEggshellWand && typeof root.CobraEggshellWand.getDefaultSpec === 'function') {
            return root.CobraEggshellWand.getDefaultSpec();
        }
        if (root.StationBasedEggshellWand && typeof root.StationBasedEggshellWand.getDefaultSpec === 'function') {
            return root.StationBasedEggshellWand.getDefaultSpec();
        }
        return {
            variant: 'station_based_eggshell',
            enabled: true,
            lengthMm: TARGET_N1P2_MM,
            stationCount: 9,
            profile: {
                pivotWidthMm: 24,
                midWidthMm: 13,
                headWidthMm: 7,
                pivotHeightMm: 18,
                midHeightMm: 8,
                headHeightMm: 3.2,
                topCrownMm: 2.5,
                undersideBellyMm: 4.5,
                asymmetryMm: 1.5,
                wallThicknessMm: 1.2
            },
            constraints: {
                minStationWidthMm: 3.0,
                minStationHeightMm: 2.0,
                minWallThicknessMm: 0.8,
                forbidCircularTube: true,
                forbidConstantSection: true,
                requireMonotonicForwardTaper: true,
                requirePositiveSectionArea: true,
                requirePositiveEIProxy: true
            }
        };
    }

    function getDefaultMechanicalBlock() {
        if (root.CobraMechanicalAssembly && typeof root.CobraMechanicalAssembly.getDefaultSpec === 'function') {
            return clone(root.CobraMechanicalAssembly.getDefaultSpec());
        }
        return {
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
                massG: 2.0
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

    function getDefaultHeadshellSlotsBlock() {
        if (root.HeadshellSlots && typeof root.HeadshellSlots.getDefaultSpec === 'function') {
            return clone(root.HeadshellSlots.getDefaultSpec());
        }
        return {
            enabled: true,
            variant: 'integrated_obround_cartridge_slots',
            screwStandard: 'M2.5',
            throughHole: true,
            slotCount: 2,
            slotCarrierPlate: {
                enabled: true,
                semanticType: 'slot_carrier_reference_geometry',
                description: 'Reference/carrier geometry for half-inch cartridge slots; not the titanium structural mount plate.',
                lengthMm: 24,
                widthMm: 18,
                thicknessMm: 2.6,
                xMm: 10.2,
                yMm: 0,
                zMm: 0
            },
            plate: {
                enabled: true,
                semanticType: 'legacy_slot_carrier_alias_not_titanium',
                description: 'Legacy alias for slotCarrierPlate only; not the TD051 titaniumMountPlate.',
                lengthMm: 24,
                widthMm: 18,
                thicknessMm: 2.6,
                xMm: 10.2,
                yMm: 0,
                zMm: 0
            },
            slots: [
                { id: 'slot_left', lengthMm: 8, widthMm: 2.6, centerXMm: 10.2, centerYMm: -5.4, angleDeg: 0 },
                { id: 'slot_right', lengthMm: 8, widthMm: 2.6, centerXMm: 10.2, centerYMm: 5.4, angleDeg: 0 }
            ],
            screwMarkers: {
                enabled: true,
                diameterMm: 2.5,
                headDiameterMm: 5.0
            },
            integration: {
                renderMode: 'csg_slotted_plate',
                exportMode: 'csg_slotted_plate_geometry',
                booleanCutStatus: 'full_csg'
            }
        };
    }

    function normalizeHeadshellSlots(source) {
        const src = isObject(source) ? source : {};
        if (root.HeadshellSlots && typeof root.HeadshellSlots.normalizeSpec === 'function') {
            return root.HeadshellSlots.normalizeSpec({ cobraArchitecture: { headshellSlots: src }, apex: 237, cartX: -0.05 });
        }
        const out = getDefaultHeadshellSlotsBlock();
        out.enabled = bool(src.enabled, out.enabled);
        out.variant = src.variant === 'integrated_obround_cartridge_slots' ? 'integrated_obround_cartridge_slots' : out.variant;
        out.screwStandard = typeof src.screwStandard === 'string' && src.screwStandard.trim() ? src.screwStandard : out.screwStandard;
        out.throughHole = bool(src.throughHole, out.throughHole);
        out.slotCount = Math.max(0, Math.round(finite(src.slotCount, out.slotCount)));
        if (isObject(src.plate)) {
            ['lengthMm', 'widthMm', 'thicknessMm', 'xMm', 'yMm', 'zMm'].forEach(key => {
                out.plate[key] = finite(src.plate[key], out.plate[key]);
            });
        }
        if (Array.isArray(src.slots) && src.slots.length) {
            out.slots = src.slots.map((slot, index) => ({
                id: String(slot.id || ('slot_' + (index + 1))),
                lengthMm: finite(slot.lengthMm, 8),
                widthMm: finite(slot.widthMm, 2.6),
                centerXMm: finite(slot.centerXMm, 10.2),
                centerYMm: finite(slot.centerYMm, index === 0 ? -5.4 : 5.4),
                angleDeg: finite(slot.angleDeg, 0)
            }));
        }
        return out;
    }

    function normalizeMechanical(source) {
        const src = isObject(source) ? source : {};
        if (root.CobraMechanicalAssembly && typeof root.CobraMechanicalAssembly.normalizeSpec === 'function') {
            return root.CobraMechanicalAssembly.normalizeSpec({ cobraArchitecture: { mechanical: src } });
        }
        const out = getDefaultMechanicalBlock();
        out.enabled = bool(src.enabled, out.enabled);
        out.variant = src.variant === 'cobra_pivot_tower_vta' ? 'cobra_pivot_tower_vta' : out.variant;
        if (isObject(src.pivot)) {
            out.pivot.xMm = finite(src.pivot.xMm, out.pivot.xMm);
            out.pivot.yMm = finite(src.pivot.yMm, out.pivot.yMm);
            out.pivot.zMm = finite(src.pivot.zMm, out.pivot.zMm);
            out.pivot.type = (typeof src.pivot.type === 'string' && src.pivot.type.trim()) ? src.pivot.type : out.pivot.type;
        }
        if (isObject(src.tower)) {
            out.tower.enabled = bool(src.tower.enabled, out.tower.enabled);
            ['diameterMm', 'heightMm', 'xMm', 'yMm', 'zBaseMm', 'massG'].forEach(key => {
                out.tower[key] = finite(src.tower[key], out.tower[key]);
            });
        }
        if (isObject(src.bearing)) {
            out.bearing.enabled = bool(src.bearing.enabled, out.bearing.enabled);
            out.bearing.type = (typeof src.bearing.type === 'string' && src.bearing.type.trim()) ? src.bearing.type : out.bearing.type;
            out.bearing.zMm = finite(src.bearing.zMm, out.bearing.zMm);
            out.bearing.massG = finite(src.bearing.massG, out.bearing.massG);
        }
        if (isObject(src.vta)) {
            out.vta.enabled = bool(src.vta.enabled, out.vta.enabled);
            out.vta.type = (typeof src.vta.type === 'string' && src.vta.type.trim()) ? src.vta.type : out.vta.type;
            out.vta.ringOuterDiameterMm = finite(src.vta.ringOuterDiameterMm, out.vta.ringOuterDiameterMm);
            out.vta.ringHeightMm = finite(src.vta.ringHeightMm, out.vta.ringHeightMm);
            out.vta.zMm = finite(src.vta.zMm, out.vta.zMm);
            out.vta.massG = finite(src.vta.massG, out.vta.massG);
        }
        return out;
    }

    function getDefaultControlState() {
        return {
            schema: COBRA_CONTROLS_SCHEMA,
            enabled: true,
            specRegime: 'custom_237_05',
            n1p2Mm: TARGET_N1P2_MM,
            applyN1P2LockToLegacy: true,
            counterweight: getDefaultCounterweightBlock(),
            armwand: getDefaultArmwandBlock(),
            mechanical: getDefaultMechanicalBlock(),
            headshellSlots: getDefaultHeadshellSlotsBlock(),
            ui: {
                panelStatus: 'api_only',
                todo: [
                    'browser_ui_panel_for_cobra_controls',
                    'manual_visual_browser_verification_by_jan_eric'
                ]
            },
            deprecated: {
                heartCounterweightControlsActive: false,
                heartCounterweightStandard: false,
                rearDiscStackIsCanonicalCobraCounterweight: true
            }
        };
    }

    function normalizeCounterweight(source) {
        const def = getDefaultCounterweightBlock();
        const src = isObject(source) ? source : {};
        if (root.CobraDiscCounterweightAssembly &&
            typeof root.CobraDiscCounterweightAssembly.normalizeCounterweightBlock === 'function') {
            return root.CobraDiscCounterweightAssembly.normalizeCounterweightBlock(src);
        }

        const out = clone(def);
        out.enabled = bool(src.enabled, out.enabled);
        out.variant = 'configurable_disc_stack';
        out.role = typeof src.role === 'string' && src.role.trim() ? src.role : out.role;
        out.useRearDiscStack = src.useRearDiscStack !== false;
        out.useRearDiscProxy = false;
        out.targetCOMZMaxMm = finite(src.targetCOMZMaxMm, out.targetCOMZMaxMm);
        out.targetCOMZPreferredMm = finite(src.targetCOMZPreferredMm, out.targetCOMZPreferredMm);

        const ds = isObject(src.discStack) ? src.discStack : {};
        out.discStack.diameterMm = clamp(ds.diameterMm, 1, 80, out.discStack.diameterMm);
        out.discStack.thicknessMm = clamp(ds.thicknessMm, 0.5, 40, out.discStack.thicknessMm);
        out.discStack.count = Math.max(0, Math.min(24, Math.round(finite(ds.count, out.discStack.count))));
        out.discStack.massEachG = clamp(ds.massEachG, 0, 200, out.discStack.massEachG);
        out.discStack.xMm = finite(ds.xMm, out.discStack.xMm);
        out.discStack.yMm = finite(ds.yMm, out.discStack.yMm);
        out.discStack.zMm = finite(ds.zMm, out.discStack.zMm);

        if (isObject(src.fineTrim)) {
            out.fineTrim.enabled = bool(src.fineTrim.enabled, out.fineTrim.enabled);
            out.fineTrim.lengthMm = clamp(src.fineTrim.lengthMm, 0, 80, out.fineTrim.lengthMm);
            out.fineTrim.massEquivalentG = clamp(src.fineTrim.massEquivalentG, 0, 80, out.fineTrim.massEquivalentG);
        }
        return out;
    }

    function normalizeArmwand(source) {
        const def = getDefaultArmwandBlock();
        const src = isObject(source) ? source : {};
        const out = clone(def);

        out.enabled = bool(src.enabled, out.enabled);
        out.variant = src.variant === 'station_based_eggshell' ? 'station_based_eggshell' : 'station_based_eggshell';
        out.lengthMm = Math.max(1, finite(src.lengthMm, out.lengthMm));
        out.stationCount = Math.max(7, Math.min(33, Math.round(finite(src.stationCount, out.stationCount))));

        if (isObject(src.profile)) {
            const p = src.profile;
            out.profile.pivotWidthMm = clamp(p.pivotWidthMm, 0.1, 120, out.profile.pivotWidthMm);
            out.profile.midWidthMm = clamp(p.midWidthMm, 0.1, 120, out.profile.midWidthMm);
            out.profile.headWidthMm = clamp(p.headWidthMm, 0.1, 120, out.profile.headWidthMm);
            out.profile.pivotHeightMm = clamp(p.pivotHeightMm, 0.1, 120, out.profile.pivotHeightMm);
            out.profile.midHeightMm = clamp(p.midHeightMm, 0.1, 120, out.profile.midHeightMm);
            out.profile.headHeightMm = clamp(p.headHeightMm, 0.1, 120, out.profile.headHeightMm);
            out.profile.topCrownMm = clamp(p.topCrownMm, 0, 80, out.profile.topCrownMm);
            out.profile.undersideBellyMm = clamp(p.undersideBellyMm, 0, 80, out.profile.undersideBellyMm);
            out.profile.asymmetryMm = finite(p.asymmetryMm, out.profile.asymmetryMm);
            out.profile.wallThicknessMm = clamp(p.wallThicknessMm, 0.01, 20, out.profile.wallThicknessMm);
        }

        if (isObject(src.constraints)) {
            out.constraints = Object.assign({}, out.constraints, src.constraints);
        }

        return out;
    }

    function sourceControlBlock(source) {
        if (!isObject(source)) return {};
        if (isObject(source.cobraControls)) return source.cobraControls;
        if (isObject(source.cobraArchitecture)) return source.cobraArchitecture;
        return source;
    }

    function normalizeControlState(source) {
        const raw = sourceControlBlock(source);
        const out = getDefaultControlState();

        out.enabled = bool(raw.enabled, out.enabled);
        out.specRegime = raw.specRegime === 'custom_237_05' ? 'custom_237_05' : out.specRegime;
        out.n1p2Mm = finite(raw.n1p2Mm, out.n1p2Mm);
        out.applyN1P2LockToLegacy = bool(raw.applyN1P2LockToLegacy, out.applyN1P2LockToLegacy);
        out.counterweight = normalizeCounterweight(raw.counterweight);
        out.armwand = normalizeArmwand(raw.armwand);
        out.mechanical = normalizeMechanical(raw.mechanical);
        out.headshellSlots = normalizeHeadshellSlots(raw.headshellSlots);

        return out;
    }

    function applyToState(targetState, controlState) {
        const target = isObject(targetState) ? targetState : {};
        const controls = normalizeControlState(controlState);
        const proxyBefore = {};
        FORBIDDEN_PROXY_MUTATION_FIELDS.forEach(id => {
            if (Object.prototype.hasOwnProperty.call(target, id)) proxyBefore[id] = target[id];
        });
        const architecture = isObject(target.cobraArchitecture) ? clone(target.cobraArchitecture) : {};

        architecture.schema = 'tonearm-designer-cobra-architecture-v1';
        architecture.enabled = controls.enabled === true;
        architecture.specRegime = controls.specRegime;
        architecture.n1p2Mm = controls.n1p2Mm;
        architecture.counterweight = clone(controls.counterweight);
        architecture.armwand = clone(controls.armwand);
        architecture.mechanical = clone(controls.mechanical);
        architecture.headshellSlots = clone(controls.headshellSlots);
        architecture.constraints = Object.assign({
            pivotAtRecordHeight: true,
            totalCOMZMaxMm: 0,
            counterweightCOMZMaxMm: 0,
            neutralBalanceResidualMaxMm: 0.5,
            eiMinMustBePositive: true,
            firstBendingHzMustBePositive: true,
            exportMustPass: true
        }, architecture.constraints || {});
        architecture.capabilitiesRequired = [
            'cobraControls',
            'cobraDiscCounterweightAssembly',
            'cobraMechanicalAssembly',
            'headshellSlots',
            'stationBasedEggshellWand',
            'structuralStationFilter'
        ];

        target.cobraArchitecture = architecture;
        target.cobraControls = toStateBlock({ cobraArchitecture: architecture });

        if (controls.specRegime === 'custom_237_05' && controls.applyN1P2LockToLegacy !== false) {
            target.apex = DEFAULT_APEX_FOR_N1P2;
            target.cartX = DEFAULT_CARTX_FOR_N1P2;
        }

        if (controls.counterweight && controls.counterweight.discStack) {
            target.rearWeightDiscDiameter = controls.counterweight.discStack.diameterMm;
            target.rearWeightDiscThickness = controls.counterweight.discStack.thicknessMm;
            target.rearWeightDiscCount = controls.counterweight.discStack.count;
            target.rearWeightDiscMass = Math.max(0, controls.counterweight.discStack.massEachG);
            target.counterweightZOffset = Number.isFinite(Number(controls.counterweight.discStack.zOffsetMm)) ? Number(controls.counterweight.discStack.zOffsetMm) : 0;
            target.rearFineTrimScrewLength = controls.counterweight.fineTrim ? controls.counterweight.fineTrim.lengthMm : 18;
            target.rearFineTrimScrewMassEquivalent = controls.counterweight.fineTrim ? Math.max(0, controls.counterweight.fineTrim.massEquivalentG) : 0;
            target.includeRearWeightDiscsInExport = true;
            target.showRearWeights = true;
            target.showFineTrimScrew = false;
        }

        return {
            ok: true,
            schema: COBRA_CONTROLS_SCHEMA,
            appliedTo: 'cobraArchitecture',
            n1p2LegacyLockApplied: controls.specRegime === 'custom_237_05' && controls.applyN1P2LockToLegacy !== false,
            forbiddenProxyFieldsTouched: FORBIDDEN_PROXY_MUTATION_FIELDS.filter(id => {
                const hadBefore = Object.prototype.hasOwnProperty.call(proxyBefore, id);
                const hasAfter = Object.prototype.hasOwnProperty.call(target, id);
                if (!hadBefore && !hasAfter) return false;
                if (hadBefore !== hasAfter) return true;
                return target[id] !== proxyBefore[id];
            })
        };
    }

    function toStateBlock(sourceState) {
        const c = normalizeControlState(sourceState);
        return {
            schema: COBRA_CONTROLS_SCHEMA,
            enabled: c.enabled,
            specRegime: c.specRegime,
            n1p2Mm: c.n1p2Mm,
            applyN1P2LockToLegacy: c.applyN1P2LockToLegacy,
            counterweightVariant: c.counterweight.variant,
            counterweightEnabled: c.counterweight.enabled,
            counterweightMassG: c.counterweight.discStack.count * c.counterweight.discStack.massEachG,
            counterweightZMm: c.counterweight.discStack.zMm,
            counterweightImplementation: 'configurable_disc_stack',
            counterweightCOMSource: 'rearWeightDiscStack',
            counterweightUseRearDiscProxy: false,
            armwandVariant: c.armwand.variant,
            armwandEnabled: c.armwand.enabled,
            armwandStationCount: c.armwand.stationCount,
            armwandPivotWidthMm: c.armwand.profile.pivotWidthMm,
            armwandHeadWidthMm: c.armwand.profile.headWidthMm,
            armwandPivotHeightMm: c.armwand.profile.pivotHeightMm,
            armwandHeadHeightMm: c.armwand.profile.headHeightMm,
            mechanicalVariant: c.mechanical.variant,
            mechanicalEnabled: c.mechanical.enabled,
            mechanicalPivotType: c.mechanical.pivot.type,
            mechanicalPivotZMm: c.mechanical.pivot.zMm,
            mechanicalTowerDiameterMm: c.mechanical.tower.diameterMm,
            mechanicalTowerHeightMm: c.mechanical.tower.heightMm,
            mechanicalTowerMassG: c.mechanical.tower.massG,
            mechanicalBearingType: c.mechanical.bearing.type,
            mechanicalVtaType: c.mechanical.vta.type,
            mechanicalVtaMassG: c.mechanical.vta.massG,
            headshellSlotsEnabled: c.headshellSlots.enabled,
            headshellSlotsVariant: c.headshellSlots.variant,
            headshellSlotsScrewStandard: c.headshellSlots.screwStandard,
            headshellSlotsThroughHole: c.headshellSlots.throughHole,
            headshellSlotsSlotCount: Array.isArray(c.headshellSlots.slots) ? c.headshellSlots.slots.length : c.headshellSlots.slotCount,
            headshellSlotsBooleanCutStatus: c.headshellSlots.integration ? c.headshellSlots.integration.booleanCutStatus : 'full_csg',
            deprecatedHeartCounterweightActive: false
        };
    }

    function validateControlState(controlState) {
        const c = normalizeControlState(controlState);
        const errors = [];
        const warnings = [];

        if (c.specRegime !== 'custom_237_05') errors.push('unsupported specRegime: ' + c.specRegime);
        if (Math.abs(Number(c.n1p2Mm) - TARGET_N1P2_MM) > 0.01) errors.push('n1p2Mm must remain 237.05 mm');
        if (c.counterweight.variant !== 'configurable_disc_stack') errors.push('counterweight.variant must remain configurable_disc_stack');
        if (c.counterweight.useRearDiscStack !== true) errors.push('counterweight.useRearDiscStack must be true');
        if (!c.counterweight.discStack || c.counterweight.discStack.count <= 0) errors.push('counterweight.discStack.count must be > 0');
        if (c.counterweight.discStack && c.counterweight.discStack.massEachG <= 0) errors.push('counterweight.discStack.massEachG must be > 0');
        if (c.armwand.variant !== 'station_based_eggshell') errors.push('armwand.variant must be station_based_eggshell');
        if (c.armwand.stationCount < 7) errors.push('armwand.stationCount must be >= 7');
        if (c.mechanical.variant !== 'cobra_pivot_tower_vta') errors.push('mechanical.variant must be cobra_pivot_tower_vta');
        if (Math.abs(Number(c.mechanical.pivot.zMm)) > 0.01) errors.push('mechanical.pivot.zMm must remain 0.00 ± 0.01 mm');
        if (c.mechanical.tower.diameterMm <= 0) errors.push('mechanical tower diameter must be > 0');
        if (c.mechanical.tower.heightMm <= 0) errors.push('mechanical tower height must be > 0');
        if (c.mechanical.tower.massG <= 0) errors.push('mechanical tower mass must be > 0');
        if (c.mechanical.vta.enabled && c.mechanical.vta.massG <= 0) errors.push('mechanical VTA mass must be > 0 when enabled');
        if (c.headshellSlots.variant !== 'integrated_obround_cartridge_slots') errors.push('headshellSlots.variant must be integrated_obround_cartridge_slots');
        if (!Array.isArray(c.headshellSlots.slots) || c.headshellSlots.slots.length < 2) errors.push('headshellSlots must contain at least two cartridge slots');
        if (root.HeadshellSlots && typeof root.HeadshellSlots.validateSpec === 'function') {
            const slotValidation = root.HeadshellSlots.validateSpec({ apex: DEFAULT_APEX_FOR_N1P2, cartX: DEFAULT_CARTX_FOR_N1P2, cobraArchitecture: { headshellSlots: c.headshellSlots } });
            if (slotValidation.status !== 'PASS') {
                slotValidation.errors.forEach(err => errors.push('headshellSlots: ' + err));
            }
        }
        if (c.counterweight.discStack.zMm > 0) warnings.push('counterweight disc stack zMm is above Z0; Cobra architecture validation will fail when enabled');

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings,
            normalized: c
        };
    }

    function getFeatureManifest() {
        return {
            id: FEATURE_ID,
            status: 'loaded',
            schema: COBRA_CONTROLS_SCHEMA,
            featureCount: 6,
            features: [
                {
                    id: 'cobraArchitectureControl',
                    role: 'first-class state writer for cobraArchitecture.enabled/specRegime/n1p2Mm',
                    writesLegacyProxyFields: false
                },
                {
                    id: 'cobraDiscCounterweightControls',
                    role: 'first-class controls for canonical configurable Cobra disc counterweight stack',
                    writesRearDiscStack: true
                },
                {
                    id: 'stationBasedEggshellWandControls',
                    role: 'first-class controls for Phase 3 station-based eggshell armwand',
                    writesLegacyShapeSliders: false
                },
                {
                    id: 'cobraMechanicalAssemblyControls',
                    role: 'first-class controls for Phase 5 pivot/tower/bearing/VTA mechanical assembly',
                    writesLegacyProxyFields: false,
                    writesRearDiscProxy: false
                },
                {
                    id: 'headshellSlotsControls',
                    role: 'first-class controls for Phase 6 integrated obround cartridge mounting slots',
                    writesLegacyProxyFields: false,
                    writesRearDiscProxy: false,
                    booleanCutStatus: 'full_csg'
                },
                {
                    id: 'custom23705N1P2Lock',
                    role: 'explicit apex/cartX lock path for N1-P2=237.05 when custom_237_05 is selected',
                    allowedLegacyFields: ['apex', 'cartX']
                }
            ],
            forbiddenProxyMutationFields: FORBIDDEN_PROXY_MUTATION_FIELDS.slice(),
        protectedCoreGeometryFields: PROTECTED_CORE_GEOMETRY_FIELDS.slice(),
            protectedCoreGeometryFields: PROTECTED_CORE_GEOMETRY_FIELDS.slice(),
            deprecatedControls: {
                heartCounterweightStandard: false,
                rearDiscStackIsCanonicalCobraCounterweight: true,
                headshellSlotsImplementedHere: true
            },
            ui: {
                panelStatus: 'api_only',
                todo: ['full browser UI panel']
            }
        };
    }

    function defaults() {
        return getDefaultControlState();
    }

    function isActiveForState(sourceState) {
        const c = normalizeControlState(sourceState);
        return c.enabled === true;
    }

    function get(id, sourceState) {
        const block = toStateBlock(sourceState);
        if (Object.prototype.hasOwnProperty.call(block, id)) return block[id];
        return readPath(normalizeControlState(sourceState), id, undefined);
    }

    function set(id, value, targetState) {
        if (FORBIDDEN_PROXY_MUTATION_FIELDS.indexOf(id) !== -1) {
            return { ok: false, code: 'cobra_controls_forbid_legacy_proxy_mutation', id };
        }
        const controls = normalizeControlState(targetState || {});
        writePath(controls, id, value);
        return applyToState(targetState || {}, controls);
    }

    function applyDelta(delta, targetState) {
        const controls = normalizeControlState(targetState || {});
        const src = isObject(delta) ? delta : {};
        Object.keys(src).forEach(id => {
            if (FORBIDDEN_PROXY_MUTATION_FIELDS.indexOf(id) === -1) {
                writePath(controls, id, src[id]);
            }
        });
        return applyToState(targetState || {}, controls);
    }

    const api = {
        schema: COBRA_CONTROLS_SCHEMA,
        ids: CONTROL_IDS.slice(),
        forbiddenProxyMutationFields: FORBIDDEN_PROXY_MUTATION_FIELDS.slice(),
        getFeatureManifest,
        getDefaultControlState,
        normalizeControlState,
        applyToState,
        toStateBlock,
        validateControlState,
        defaults,
        isActiveForState,
        get,
        set,
        applyDelta
    };

    root.CobraControls = Object.freeze(api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
