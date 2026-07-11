/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-architecture.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-architecture.js
 * Phase 13.1 Cobra architecture contract, controls, configurable disc counterweight assembly, station-based eggshell wand, mechanical assembly, headshell slots capability, manifest and validation gate.
 *
 * This module is intentionally non-generative for the armwand. It does not create final Cobra CAD
 * armwand geometry and it does not alter the mesh generator. It records the target
 * architecture contract, reports runtime capability presence, and blocks false
 * Cobra PASS/ok results until the required modules exist and the physics/export
 * constraints are actually satisfied.
 */
(function(root) {
    'use strict';

    const ARCHITECTURE_SCHEMA = 'tonearm-designer-cobra-architecture-v1';
    const SPEC_REGIME_CUSTOM_237_05 = 'custom_237_05';
    const TARGET_N1P2_MM = 237.05;
    const N1P2_TOLERANCE_MM = 0.01;

    const REQUIRED_CAPABILITIES = Object.freeze([
        'cobraControls',
        'cobraDiscCounterweightAssembly',
        'cobraMechanicalAssembly',
        'headshellSlots',
        'stationBasedEggshellWand',
        'structuralStationFilter'
    ]);

    const CAPABILITY_KEYS = Object.freeze(REQUIRED_CAPABILITIES.concat(['aiCapabilityGate']));

    const PROTECTED_CORE_GEOMETRY_FIELDS = Object.freeze([
        'rearBendStartX',
        'rearBendDropZ',
        'rearBendLength',
        'rearBlendLength',
        'rearMouthWidth',
        'rearMouthLength',
        'tailD',
        'bulge',
        'maxW',
        'maxH',
        'neckW',
        'neckL'
    ]);

    const FORBIDDEN_COBRA_COUNTERWEIGHT_PROXY_FIELDS = Object.freeze([]);
    const FORBIDDEN_COBRA_ARMWAND_PROXY_FIELDS = Object.freeze([]);
    const FORBIDDEN_COBRA_PROXY_FIELDS = Object.freeze([]);
    const FORBIDDEN_DISC_COUNTERWEIGHT_PROXY_FIELDS = Object.freeze([]);

    const FINE_TRIM_FIELDS = Object.freeze([
        'rearFineTrimScrewLength',
        'rearFineTrimScrewMassEquivalent',
        'counterweightZOffset'
    ]);

    const COBRA_VALIDATION_PLAN = Object.freeze([
        'apply canonical Cobra preset',
        'run CobraAcceptance.runStaticAcceptance known_good',
        'run runtime measured acceptance when browser/UI is available',
        'reject if N1-P2 != 237.05',
        'reject if counterweightCOM.z > 0',
        'reject if EI_min <= 0',
        'reject if exportValidation != PASS',
        'protect TD026 core geometry controls (rearBend*, rearMouth*, tailD, bulge, maxW, maxH, neckW, neckL); rearWeightDisc* and rearFineTrim* are canonical configurable Cobra counterweight controls'
    ]);

    const STRONG_COBRA_INTENT_RE = /\b(?:cobra|copperhead|eggshell|custom_237_05)\b|\b(?:caliburn|continuum)\s+cobra\b|compound\s+curve|\bn1\s*[-–—]?\s*p2\s*(?:=|:)?\s*237[.,]05\b|\b237[.,]05\b/i;
    const OVAL_COUNTERWEIGHT_TERM_RE = /\b(?:oval|avl[aå]ng|avlang|rund)\b/i;
    const COUNTERWEIGHT_TERM_RE = /\b(?:counterweight|motvikt)\b/i;
    const MONOCOQUE_RE = /\bmonocoque\b/i;
    const ARMWAND_RE = /\barmwand\b/i;

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function finiteNumber(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function hasPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function hasOwn(obj, id) {
        return !!(obj && Object.prototype.hasOwnProperty.call(obj, id));
    }

    function uniqueStrings(values) {
        return (values || []).filter((value, index, array) => typeof value === 'string' && array.indexOf(value) === index);
    }

    function cobraValidationPlan(existing) {
        return uniqueStrings((Array.isArray(existing) ? existing : []).concat(COBRA_VALIDATION_PLAN));
    }

    function defaultCobraArchitecture(enabled) {
        return {
            schema: ARCHITECTURE_SCHEMA,
            enabled: enabled === true,
            specRegime: SPEC_REGIME_CUSTOM_237_05,
            n1p2Mm: TARGET_N1P2_MM,
            counterweight: (root.CobraDiscCounterweightAssembly && typeof root.CobraDiscCounterweightAssembly.getDefaultSpec === 'function')
                ? root.CobraDiscCounterweightAssembly.getDefaultSpec()
                : {
                    variant: 'configurable_disc_stack',
                    enabled: true,
                    role: 'rear_terminal_balance_mass',
                    mountSource: 'unifiedRearTerminal',
                    useRearDiscStack: true,
                    useRearDiscProxy: false,
                    discStack: {
                        diameterMm: 14.0,
                        thicknessMm: 4.0,
                        count: 4,
                        massEachG: 18.0,
                        zOffsetMm: 0.0,
                        xMm: null,
                        yMm: 0.0,
                        zMm: null
                    },
                    fineTrim: {
                        enabled: true,
                        lengthMm: 18.0,
                        massEquivalentG: 0.0,
                        zOffsetMm: 0.0
                    },
                    targetCOMZMaxMm: 0,
                    targetCOMZPreferredMm: -2.9
                },
            armwand: {
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
            },
            mechanical: {
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
            },
            headshellSlots: (root.HeadshellSlots && typeof root.HeadshellSlots.getDefaultSpec === 'function')
                ? root.HeadshellSlots.getDefaultSpec()
                : {
                    enabled: true,
                    variant: 'integrated_obround_cartridge_slots',
                    screwStandard: 'M2.5',
                    throughHole: true,
                    slotCount: 2,
                    plate: {
                        enabled: true,
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
                },
            constraints: {
                pivotAtRecordHeight: true,
                totalCOMZMaxMm: 0,
                counterweightCOMZMaxMm: 0,
                neutralBalanceResidualMaxMm: 0.5,
                eiMinMustBePositive: true,
                firstBendingHzMustBePositive: true,
                exportMustPass: true
            },
            capabilitiesRequired: REQUIRED_CAPABILITIES.slice()
        };
    }

    function normalizeCobraArchitecture(value, options) {
        const opts = options || {};
        const incoming = hasPlainObject(value) ? value : {};
        const out = defaultCobraArchitecture(
            incoming.enabled === true || (incoming.enabled === undefined && opts.defaultEnabled === true)
        );

        out.enabled = incoming.enabled === true;
        out.specRegime = (typeof incoming.specRegime === 'string' && incoming.specRegime.trim())
            ? incoming.specRegime
            : SPEC_REGIME_CUSTOM_237_05;
        out.n1p2Mm = finiteNumber(incoming.n1p2Mm, TARGET_N1P2_MM);

        if (root.CobraDiscCounterweightAssembly &&
            typeof root.CobraDiscCounterweightAssembly.normalizeCounterweightBlock === 'function') {
            out.counterweight = root.CobraDiscCounterweightAssembly.normalizeCounterweightBlock(
                hasPlainObject(incoming.counterweight) ? incoming.counterweight : out.counterweight
            );
        } else if (hasPlainObject(incoming.counterweight)) {
            const cw = incoming.counterweight;
            out.counterweight.variant = 'configurable_disc_stack';
            out.counterweight.enabled = cw.enabled === false ? false : true;
            out.counterweight.role = (typeof cw.role === 'string' && cw.role.trim())
                ? cw.role
                : 'rear_terminal_balance_mass';
            out.counterweight.useRearDiscStack = cw.useRearDiscStack !== false;
            out.counterweight.useRearDiscProxy = false;
            if (!hasPlainObject(out.counterweight.discStack)) out.counterweight.discStack = {};
            const ds = hasPlainObject(cw.discStack) ? cw.discStack : {};
            out.counterweight.discStack.diameterMm = finiteNumber(ds.diameterMm, 14.0);
            out.counterweight.discStack.thicknessMm = finiteNumber(ds.thicknessMm, 4.0);
            out.counterweight.discStack.count = Math.max(0, Math.round(finiteNumber(ds.count, 4)));
            out.counterweight.discStack.massEachG = finiteNumber(ds.massEachG, 18.0);
            out.counterweight.discStack.xMm = finiteNumber(ds.xMm, out.counterweight.discStack.xMm);
            out.counterweight.discStack.yMm = finiteNumber(ds.yMm, 0.0);
            out.counterweight.discStack.zMm = finiteNumber(ds.zMm, out.counterweight.discStack.zMm);
            if (!hasPlainObject(out.counterweight.fineTrim)) out.counterweight.fineTrim = {};
            const f = hasPlainObject(cw.fineTrim) ? cw.fineTrim : {};
            out.counterweight.fineTrim.enabled = f.enabled === false ? false : true;
            out.counterweight.fineTrim.lengthMm = finiteNumber(f.lengthMm, 18.0);
            out.counterweight.fineTrim.massEquivalentG = Math.max(0, finiteNumber(f.massEquivalentG, 0.0));
                out.counterweight.fineTrim.zOffsetMm = finiteNumber(f.zOffsetMm, out.counterweight.fineTrim.zOffsetMm);
            out.counterweight.targetCOMZMaxMm = finiteNumber(cw.targetCOMZMaxMm, 0);
            out.counterweight.targetCOMZPreferredMm = finiteNumber(cw.targetCOMZPreferredMm, -2.9);
        }

        if (hasPlainObject(incoming.armwand)) {
            if (root.CobraEggshellWand &&
                typeof root.CobraEggshellWand.normalizeArmwandBlock === 'function') {
                out.armwand = root.CobraEggshellWand.normalizeArmwandBlock(incoming.armwand);
            } else {
                const a = incoming.armwand;
                out.armwand.variant = a.variant === 'station_based_eggshell' ? 'station_based_eggshell' : out.armwand.variant;
                out.armwand.enabled = a.enabled === false ? false : true;
                out.armwand.lengthMm = finiteNumber(a.lengthMm, out.armwand.lengthMm);
                out.armwand.stationCount = Math.max(7, Math.round(finiteNumber(a.stationCount, out.armwand.stationCount)));
                if (hasPlainObject(a.profile)) {
                    Object.keys(out.armwand.profile).forEach(key => {
                        out.armwand.profile[key] = finiteNumber(a.profile[key], out.armwand.profile[key]);
                    });
                }
                if (hasPlainObject(a.constraints)) {
                    Object.keys(out.armwand.constraints).forEach(key => {
                        if (typeof out.armwand.constraints[key] === 'boolean') {
                            out.armwand.constraints[key] = a.constraints[key] !== false;
                        } else {
                            out.armwand.constraints[key] = finiteNumber(a.constraints[key], out.armwand.constraints[key]);
                        }
                    });
                }
            }
        } else if (root.CobraEggshellWand &&
            typeof root.CobraEggshellWand.normalizeArmwandBlock === 'function') {
            out.armwand = root.CobraEggshellWand.normalizeArmwandBlock(out.armwand);
        }

        if (root.CobraMechanicalAssembly &&
            typeof root.CobraMechanicalAssembly.normalizeSpec === 'function') {
            out.mechanical = root.CobraMechanicalAssembly.normalizeSpec({ cobraArchitecture: { mechanical: hasPlainObject(incoming.mechanical) ? incoming.mechanical : out.mechanical } });
        } else if (hasPlainObject(incoming.mechanical)) {
            const m = incoming.mechanical;
            out.mechanical.enabled = m.enabled === false ? false : true;
            out.mechanical.variant = m.variant === 'cobra_pivot_tower_vta' ? 'cobra_pivot_tower_vta' : out.mechanical.variant;
            if (hasPlainObject(m.pivot)) {
                out.mechanical.pivot.xMm = finiteNumber(m.pivot.xMm, out.mechanical.pivot.xMm);
                out.mechanical.pivot.yMm = finiteNumber(m.pivot.yMm, out.mechanical.pivot.yMm);
                out.mechanical.pivot.zMm = finiteNumber(m.pivot.zMm, out.mechanical.pivot.zMm);
                out.mechanical.pivot.type = (typeof m.pivot.type === 'string' && m.pivot.type.trim()) ? m.pivot.type : out.mechanical.pivot.type;
            }
            if (hasPlainObject(m.tower)) {
                out.mechanical.tower.enabled = m.tower.enabled === false ? false : true;
                ['diameterMm', 'heightMm', 'xMm', 'yMm', 'zBaseMm', 'massG'].forEach(key => {
                    out.mechanical.tower[key] = finiteNumber(m.tower[key], out.mechanical.tower[key]);
                });
            }
            if (hasPlainObject(m.bearing)) {
                out.mechanical.bearing.enabled = m.bearing.enabled === false ? false : true;
                out.mechanical.bearing.type = (typeof m.bearing.type === 'string' && m.bearing.type.trim()) ? m.bearing.type : out.mechanical.bearing.type;
                out.mechanical.bearing.zMm = finiteNumber(m.bearing.zMm, out.mechanical.bearing.zMm);
                out.mechanical.bearing.massG = Math.max(0, finiteNumber(m.bearing.massG, out.mechanical.bearing.massG));
                if (hasPlainObject(m.bearing.swashPlate)) {
                    const sp = m.bearing.swashPlate;
                    out.mechanical.bearing.swashPlate.enabled = sp.enabled === false ? false : true;
                    out.mechanical.bearing.swashPlate.id = (typeof sp.id === 'string' && sp.id.trim()) ? sp.id : out.mechanical.bearing.swashPlate.id;
                    out.mechanical.bearing.swashPlate.diameterMm = finiteNumber(sp.diameterMm, out.mechanical.bearing.swashPlate.diameterMm);
                    out.mechanical.bearing.swashPlate.thicknessMm = finiteNumber(sp.thicknessMm, out.mechanical.bearing.swashPlate.thicknessMm);
                    out.mechanical.bearing.swashPlate.zMm = finiteNumber(sp.zMm, out.mechanical.bearing.swashPlate.zMm);
                    out.mechanical.bearing.swashPlate.massG = Math.max(0, finiteNumber(sp.massG, out.mechanical.bearing.swashPlate.massG));
                    out.mechanical.bearing.swashPlate.material = (typeof sp.material === 'string' && sp.material.trim()) ? sp.material : out.mechanical.bearing.swashPlate.material;
                }
            }
            if (hasPlainObject(m.vta)) {
                out.mechanical.vta.enabled = m.vta.enabled === false ? false : true;
                out.mechanical.vta.type = (typeof m.vta.type === 'string' && m.vta.type.trim()) ? m.vta.type : out.mechanical.vta.type;
                out.mechanical.vta.ringOuterDiameterMm = finiteNumber(m.vta.ringOuterDiameterMm, out.mechanical.vta.ringOuterDiameterMm);
                out.mechanical.vta.ringHeightMm = finiteNumber(m.vta.ringHeightMm, out.mechanical.vta.ringHeightMm);
                out.mechanical.vta.zMm = finiteNumber(m.vta.zMm, out.mechanical.vta.zMm);
                out.mechanical.vta.massG = finiteNumber(m.vta.massG, out.mechanical.vta.massG);
            }
        }

        if (root.HeadshellSlots && typeof root.HeadshellSlots.normalizeSpec === 'function') {
            out.headshellSlots = root.HeadshellSlots.normalizeSpec({
                cobraArchitecture: {
                    headshellSlots: hasPlainObject(incoming.headshellSlots) ? incoming.headshellSlots : out.headshellSlots
                },
                apex: finiteNumber(incoming.apex, 237),
                cartX: finiteNumber(incoming.cartX, -0.05)
            });
        } else if (hasPlainObject(incoming.headshellSlots)) {
            const h = incoming.headshellSlots;
            out.headshellSlots.enabled = h.enabled === false ? false : true;
            out.headshellSlots.variant = h.variant === 'integrated_obround_cartridge_slots'
                ? 'integrated_obround_cartridge_slots'
                : out.headshellSlots.variant;
            out.headshellSlots.screwStandard = (typeof h.screwStandard === 'string' && h.screwStandard.trim())
                ? h.screwStandard
                : out.headshellSlots.screwStandard;
            out.headshellSlots.throughHole = h.throughHole !== false;
            out.headshellSlots.slotCount = Math.max(0, Math.round(finiteNumber(h.slotCount, out.headshellSlots.slotCount)));
            if (hasPlainObject(h.plate)) {
                ['lengthMm', 'widthMm', 'thicknessMm', 'xMm', 'yMm', 'zMm'].forEach(key => {
                    out.headshellSlots.plate[key] = finiteNumber(h.plate[key], out.headshellSlots.plate[key]);
                });
            }
            if (Array.isArray(h.slots) && h.slots.length) {
                out.headshellSlots.slots = h.slots.map((slot, index) => ({
                    id: String(slot.id || ('slot_' + (index + 1))),
                    lengthMm: finiteNumber(slot.lengthMm, 8),
                    widthMm: finiteNumber(slot.widthMm, 2.6),
                    centerXMm: finiteNumber(slot.centerXMm, 10.2),
                    centerYMm: finiteNumber(slot.centerYMm, index === 0 ? -5.4 : 5.4),
                    angleDeg: finiteNumber(slot.angleDeg, 0)
                }));
            }
        }

        if (hasPlainObject(incoming.constraints)) {
            const c = incoming.constraints;
            out.constraints.pivotAtRecordHeight = c.pivotAtRecordHeight !== false;
            out.constraints.totalCOMZMaxMm = finiteNumber(c.totalCOMZMaxMm, 0);
            out.constraints.counterweightCOMZMaxMm = finiteNumber(c.counterweightCOMZMaxMm, 0);
            out.constraints.neutralBalanceResidualMaxMm = finiteNumber(c.neutralBalanceResidualMaxMm, 0.5);
            out.constraints.eiMinMustBePositive = c.eiMinMustBePositive !== false;
            out.constraints.firstBendingHzMustBePositive = c.firstBendingHzMustBePositive !== false;
            out.constraints.exportMustPass = c.exportMustPass !== false;
        }

        if (Array.isArray(incoming.capabilitiesRequired) && incoming.capabilitiesRequired.length) {
            out.capabilitiesRequired = incoming.capabilitiesRequired
                .filter(id => REQUIRED_CAPABILITIES.indexOf(id) !== -1)
                .filter((id, index, arr) => arr.indexOf(id) === index);
            REQUIRED_CAPABILITIES.forEach(id => {
                if (out.capabilitiesRequired.indexOf(id) === -1) out.capabilitiesRequired.push(id);
            });
        }

        return out;
    }

    function getRuntimeState(sourceState) {
        if (sourceState && typeof sourceState === 'object') return sourceState;
        if (typeof state !== 'undefined') return state;
        return root.state || {};
    }

    function readInput(source, id, fallback) {
        const s = getRuntimeState(source);
        if (hasOwn(s, id)) return s[id];
        if (s.inputs && hasOwn(s.inputs, id)) return s.inputs[id];
        return fallback;
    }

    function readSelect(source, id, fallback) {
        const s = getRuntimeState(source);
        if (hasOwn(s, id)) return s[id];
        if (s.selects && hasOwn(s.selects, id)) return s.selects[id];
        return fallback;
    }

    function readCheckbox(source, id, fallback) {
        const s = getRuntimeState(source);
        if (hasOwn(s, id)) return s[id];
        if (s.checkboxes && hasOwn(s.checkboxes, id)) return s.checkboxes[id];
        return fallback;
    }

    function readStateValue(source, id, fallback) {
        const s = getRuntimeState(source);
        if (hasOwn(s, id)) return s[id];
        if (s.inputs && hasOwn(s.inputs, id)) return s.inputs[id];
        if (s.selects && hasOwn(s.selects, id)) return s.selects[id];
        if (s.checkboxes && hasOwn(s.checkboxes, id)) return s.checkboxes[id];
        if (s.flags && hasOwn(s.flags, id)) return s.flags[id];
        return fallback;
    }

    function hasInputValue(source, id) {
        const s = getRuntimeState(source);
        return hasOwn(s, id) || !!(s.inputs && hasOwn(s.inputs, id));
    }

    function applyRuntimeControlsToArchitecture(arch, sourceState) {
        const s = getRuntimeState(sourceState);
        const out = normalizeCobraArchitecture(arch, { defaultEnabled: false });
        if (readStateValue(s, 'cobraArchitectureEnabled', false) === true ||
            readStateValue(s, 'enableCobraArchitecture', false) === true ||
            readStateValue(s, 'rearMode', '') === 'cobra_integrated_tail') {
            out.enabled = true;
        }
        if (out.counterweight && out.counterweight.discStack) {
            out.counterweight.discStack.diameterMm = finiteNumber(readStateValue(s, 'rearWeightDiscDiameter', out.counterweight.discStack.diameterMm), out.counterweight.discStack.diameterMm);
            out.counterweight.discStack.thicknessMm = finiteNumber(readStateValue(s, 'rearWeightDiscThickness', out.counterweight.discStack.thicknessMm), out.counterweight.discStack.thicknessMm);
            out.counterweight.discStack.count = Math.max(0, Math.round(finiteNumber(readStateValue(s, 'rearWeightDiscCount', out.counterweight.discStack.count), out.counterweight.discStack.count)));
            out.counterweight.discStack.massEachG = Math.max(0, finiteNumber(readStateValue(s, 'rearWeightDiscMass', out.counterweight.discStack.massEachG), out.counterweight.discStack.massEachG));
            out.counterweight.discStack.zOffsetMm = finiteNumber(readStateValue(s, 'counterweightZOffset', out.counterweight.discStack.zOffsetMm), out.counterweight.discStack.zOffsetMm);
        }
        if (out.counterweight && out.counterweight.fineTrim) {
            out.counterweight.fineTrim.lengthMm = finiteNumber(readStateValue(s, 'rearFineTrimScrewLength', out.counterweight.fineTrim.lengthMm), out.counterweight.fineTrim.lengthMm);
            out.counterweight.fineTrim.massEquivalentG = Math.max(0, finiteNumber(readStateValue(s, 'rearFineTrimScrewMassEquivalent', out.counterweight.fineTrim.massEquivalentG), out.counterweight.fineTrim.massEquivalentG));
        }
        if (out.armwand && out.armwand.profile) {
            out.armwand.profile.wallThicknessMm = Math.max(0.01, finiteNumber(readStateValue(s, 'thick', out.armwand.profile.wallThicknessMm), out.armwand.profile.wallThicknessMm));
            out.armwand.profile.canopyRidgeHeightMm = Math.max(0, finiteNumber(readStateValue(s, 'canopyRidgeHeight', out.armwand.profile.canopyRidgeHeightMm), out.armwand.profile.canopyRidgeHeightMm));
            out.armwand.profile.canopyRidgeWidthFraction = Math.max(0.05, Math.min(0.8, finiteNumber(readStateValue(s, 'canopyRidgeWidthFraction', out.armwand.profile.canopyRidgeWidthFraction), out.armwand.profile.canopyRidgeWidthFraction)));
            out.armwand.profile.canopyRidgeSharpness = Math.max(0.5, Math.min(12, finiteNumber(readStateValue(s, 'canopyRidgeSharpness', out.armwand.profile.canopyRidgeSharpness), out.armwand.profile.canopyRidgeSharpness)));
        }
        // TD051: do not map titaniumPlate* controls onto headshellSlots.plate.
        // headshellSlots.plate/slotCarrierPlate is cartridge-slot carrier/reference
        // geometry. The structural titaniumMountPlate pose is resolved by
        // TitaniumMountPlate.resolveTitaniumMountPlatePose and obeys
        // titaniumPlateEnabled plus titaniumPlateX/Y/Z controls there.
        if (out.headshellSlots && out.headshellSlots.slotCarrierPlate) {
            out.headshellSlots.slotCarrierPlate.semanticType = 'slot_carrier_reference_geometry';
            if (out.headshellSlots.plate) out.headshellSlots.plate.semanticType = 'legacy_slot_carrier_alias_not_titanium';
        }
        if (root.TitaniumMountPlate && typeof root.TitaniumMountPlate.resolveTitaniumMountPlatePose === 'function') {
            out.titaniumMountPlate = root.TitaniumMountPlate.resolveTitaniumMountPlatePose(s, null, out);
        }
        return out;
    }

    function getCobraArchitecture(sourceState) {
        const s = getRuntimeState(sourceState);
        return applyRuntimeControlsToArchitecture(s.cobraArchitecture, s);
    }

    function ensureCobraArchitecture(sourceState) {
        const s = getRuntimeState(sourceState);
        s.cobraArchitecture = applyRuntimeControlsToArchitecture(s.cobraArchitecture, s);
        return s.cobraArchitecture;
    }

    function loaded(condition) {
        return condition ? 'loaded' : 'missing';
    }

    function getCobraCapabilityManifest() {
        const manifest = {};
        manifest.cobraControls = loaded(!!(root.CobraControls && typeof root.CobraControls.getFeatureManifest === 'function'));
        manifest.cobraDiscCounterweightAssembly = loaded(!!(
            root.CobraDiscCounterweightAssembly &&
            typeof root.CobraDiscCounterweightAssembly.getFeatureManifest === 'function'
        ));
        manifest.cobraMechanicalAssembly = loaded(!!(
            root.CobraMechanicalAssembly &&
            typeof root.CobraMechanicalAssembly.getFeatureManifest === 'function'
        ));
        manifest.headshellSlots = loaded(!!(
            root.HeadshellSlots &&
            typeof root.HeadshellSlots.getFeatureManifest === 'function'
        ));
        manifest.stationBasedEggshellWand = loaded(!!(
            (root.CobraEggshellWand && typeof root.CobraEggshellWand.getFeatureManifest === 'function') ||
            (root.StationBasedEggshellWand && typeof root.StationBasedEggshellWand.getFeatureManifest === 'function')
        ));
        manifest.structuralStationFilter = loaded(!!(
            root.StructuralStationFilter &&
            typeof root.StructuralStationFilter.validateStations === 'function'
        ));
        manifest.aiCapabilityGate = loaded(!!(
            root.AICapabilityGate &&
            typeof root.AICapabilityGate.validateCobraDeltaCapability === 'function'
        ));
        return manifest;
    }

    function missingCapabilitiesFor(architecture, capabilities) {
        const arch = architecture || defaultCobraArchitecture(false);
        const manifest = capabilities || getCobraCapabilityManifest();
        return (arch.capabilitiesRequired || REQUIRED_CAPABILITIES)
            .filter(id => manifest[id] !== 'loaded');
    }

    function getDiscCounterweightComponent(session) {
        const s = getRuntimeState(session);
        if (root.CobraDiscCounterweightAssembly &&
            typeof root.CobraDiscCounterweightAssembly.getMassComponent === 'function') {
            return root.CobraDiscCounterweightAssembly.getMassComponent(s);
        }
        return null;
    }

    function getDiscCounterweightValidation(session) {
        const s = getRuntimeState(session);
        if (root.CobraDiscCounterweightAssembly &&
            typeof root.CobraDiscCounterweightAssembly.validateCounterweight === 'function') {
            return root.CobraDiscCounterweightAssembly.validateCounterweight(s);
        }
        return null;
    }

    function getEggshellArmwandValidation(session) {
        const s = getRuntimeState(session);
        const arch = getCobraArchitecture(s);
        const api = root.CobraEggshellWand || root.StationBasedEggshellWand;
        if (!api || typeof api.buildStations !== 'function' || typeof api.validateStations !== 'function') {
            return null;
        }
        try {
            const stations = api.buildStations({ cobraArchitecture: { armwand: arch.armwand } });
            const validation = api.validateStations(stations, { spec: arch.armwand });
            return Object.assign({ stations }, validation);
        } catch (err) {
            return {
                status: 'FAIL',
                errors: ['CobraEggshellWand validation error: ' + (err && err.message ? err.message : String(err))],
                warnings: [],
                stationCount: 0,
                structuralStationCount: 0
            };
        }
    }

    function getMechanicalAssemblyValidation(session) {
        const s = getRuntimeState(session);
        const arch = getCobraArchitecture(s);
        const api = root.CobraMechanicalAssembly;
        if (!api || typeof api.validateAssembly !== 'function') {
            return null;
        }
        try {
            return api.validateAssembly(Object.assign({}, s, {
                cobraArchitecture: Object.assign({}, s.cobraArchitecture || {}, { mechanical: arch.mechanical })
            }));
        } catch (err) {
            return {
                status: 'FAIL',
                errors: ['CobraMechanicalAssembly validation error: ' + (err && err.message ? err.message : String(err))],
                warnings: [],
                measured: {
                    pivotZMm: null,
                    towerDiameterMm: null,
                    towerMassG: null,
                    vtaMassG: null,
                    massComponentCount: 0
                }
            };
        }
    }

    function getHeadshellSlotsValidation(session) {
        const s = getRuntimeState(session);
        const arch = getCobraArchitecture(s);
        const api = root.HeadshellSlots;
        if (!api || typeof api.validateSpec !== 'function') {
            return null;
        }
        try {
            return api.validateSpec(Object.assign({}, s, {
                cobraArchitecture: Object.assign({}, s.cobraArchitecture || {}, { headshellSlots: arch.headshellSlots })
            }));
        } catch (err) {
            return {
                status: 'FAIL',
                errors: ['HeadshellSlots validation error: ' + (err && err.message ? err.message : String(err))],
                warnings: [],
                measured: {
                    slotCount: 0,
                    slotLengthMinMm: null,
                    slotWidthMinMm: null,
                    slotSymmetryErrorMm: null,
                    plateLengthMm: null,
                    plateWidthMm: null,
                    throughHole: null,
                    n1p2Mm: null
                }
            };
        }
    }

    function discCounterweightEnabled(session, architecture) {
        const arch = architecture || getCobraArchitecture(session);
        const cw = arch && arch.counterweight ? arch.counterweight : null;
        return !!(arch && arch.enabled === true &&
            cw && cw.variant === 'configurable_disc_stack' &&
            cw.enabled !== false &&
            cw.useRearDiscStack !== false);
    }

    function normalizeExportStatus(status) {
        const raw = typeof status === 'string' ? status.trim().toUpperCase() : '';
        if (raw === 'PASS') return 'PASS';
        if (raw === 'FAIL') return 'FAIL';
        if (raw === 'HOLD') return 'HOLD';
        if (raw === 'ERROR') return 'ERROR';
        return 'INDETERMINATE';
    }

    function getExportValidationStatus(geometry) {
        if (geometry && geometry.exportValidation) {
            if (typeof geometry.exportValidation === 'string') {
                return normalizeExportStatus(geometry.exportValidation);
            }
            if (geometry.exportValidation.isValid === true) return 'PASS';
            if (geometry.exportValidation.isValid === false) return 'FAIL';
            return 'INDETERMINATE';
        }
        if (typeof validateExportGeometry === 'function') {
            try {
                const s = getRuntimeState();
                const val = validateExportGeometry(readSelect(s, 'exportType', s.exportType), s);
                if (val && val.isValid === true) return 'PASS';
                if (val && val.isValid === false) return 'FAIL';
                return 'INDETERMINATE';
            } catch (err) {
                return 'ERROR';
            }
        }
        return 'INDETERMINATE';
    }

    function getN1P2Mm(session, physics) {
        const s = getRuntimeState(session);
        if (physics && physics.distances && physics.distances.stylus_pivot && Number.isFinite(Number(physics.distances.stylus_pivot.d))) {
            return Number(physics.distances.stylus_pivot.d);
        }
        if (physics && physics.stylus && physics.pivot) {
            const dx = finiteNumber(physics.pivot.x, NaN) - finiteNumber(physics.stylus.x, NaN);
            const dy = finiteNumber(physics.pivot.y, NaN) - finiteNumber(physics.stylus.y, NaN);
            const dz = finiteNumber(physics.pivot.z, NaN) - finiteNumber(physics.stylus.z, NaN);
            if (Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz)) {
                return Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
        }
        if (root.Physics && typeof root.Physics.getEffectiveLength === 'function') {
            try {
                return Number(root.Physics.getEffectiveLength(s, readSelect(s, 'cartMode', 'g1042')));
            } catch (err) {
                return null;
            }
        }
        if (typeof Physics !== 'undefined' && Physics && typeof Physics.getEffectiveLength === 'function') {
            try {
                return Number(Physics.getEffectiveLength(s, readSelect(s, 'cartMode', 'g1042')));
            } catch (err) {
                return null;
            }
        }

        // Phase 4 Node/static fallback for the explicit custom_237_05 control lock.
        // The live browser physics path remains preferred; this fallback allows the
        // gate and CobraControls smokes to verify apex/cartX without a browser.
        const apex = finiteNumber(readInput(s, 'apex', NaN), NaN);
        const cartX = finiteNumber(readInput(s, 'cartX', NaN), NaN);
        if (Number.isFinite(apex) && Number.isFinite(cartX)) {
            return Math.abs(apex - cartX);
        }

        return null;
    }

    function currentCounterweightProxyUse(session, architecture) {
        // Phase 13.1: rearWeightDisc* is the canonical Cobra disc counterweight path, not a proxy.
        return false;
    }

    function isArchitectureAIResult(value) {
        return hasPlainObject(value) &&
            typeof value.status === 'string' &&
            Object.prototype.hasOwnProperty.call(value, 'delta');
    }

    function deltaPayloadFrom(value) {
        return isArchitectureAIResult(value) ? value.delta : value;
    }

    function hasExplicitSelectedSpecRegime(resultOrDelta, options) {
        const opts = options || {};
        if (hasOwn(opts, 'selectedSpecRegime') && opts.selectedSpecRegime !== undefined && opts.selectedSpecRegime !== null) {
            return true;
        }
        if (hasPlainObject(resultOrDelta) &&
            hasOwn(resultOrDelta, 'selectedSpecRegime') &&
            resultOrDelta.selectedSpecRegime !== undefined &&
            resultOrDelta.selectedSpecRegime !== null) {
            return true;
        }
        return false;
    }

    function getExplicitSelectedSpecRegime(resultOrDelta, options) {
        const opts = options || {};
        if (hasOwn(opts, 'selectedSpecRegime') && opts.selectedSpecRegime !== undefined && opts.selectedSpecRegime !== null) {
            return opts.selectedSpecRegime;
        }
        if (hasPlainObject(resultOrDelta) &&
            hasOwn(resultOrDelta, 'selectedSpecRegime') &&
            resultOrDelta.selectedSpecRegime !== undefined &&
            resultOrDelta.selectedSpecRegime !== null) {
            return resultOrDelta.selectedSpecRegime;
        }
        return undefined;
    }

    function textContainsCobraArchitectureIntent(text) {
        const value = String(text || '');
        if (!value.trim()) return false;

        // Strong product/spec signals are sufficient on their own.
        if (STRONG_COBRA_INTENT_RE.test(value)) return true;

        // Generic tonearm words must not activate the Cobra gate by themselves.
        // Require an explicit Cobra architecture combination.
        const hasMonocoque = MONOCOQUE_RE.test(value);
        const hasArmwand = ARMWAND_RE.test(value);
        if (hasMonocoque && hasArmwand) return true;

        const hasOval = OVAL_COUNTERWEIGHT_TERM_RE.test(value);
        const hasCounterweight = COUNTERWEIGHT_TERM_RE.test(value);
        if (hasOval && hasCounterweight) return true;

        // "cobra + armwand/counterweight/motvikt" is covered by the strong Cobra signal,
        // but keep the rule documented here by letting the strong signal above handle it.
        return false;
    }

    function objectTextContainsCobraArchitectureIntent(value) {
        if (!value || typeof value !== 'object') return false;
        try {
            return textContainsCobraArchitectureIntent(JSON.stringify(value).slice(0, 20000));
        } catch (err) {
            return false;
        }
    }

    function cobraOvalCounterweightIntent(value) {
        if (!value || typeof value !== 'object') return false;
        if (value.selectedSpecRegime === SPEC_REGIME_CUSTOM_237_05) return true;
        if (value.counterweight && value.counterweight.variant === 'oval') return true;
        if (value.hardConstraints && value.hardConstraints.counterweight && value.hardConstraints.counterweight.variant === 'oval') return true;
        if (value.cobraArchitecture && value.cobraArchitecture.counterweight && value.cobraArchitecture.counterweight.variant === 'oval') return true;
        if (objectTextContainsCobraArchitectureIntent(value)) {
            const text = JSON.stringify(value).toLowerCase();
            return /oval|avl[aå]ng|avlang|rund|counterweight|motvikt/.test(text);
        }
        return false;
    }

    function isCobraArchitectureContext(session, options) {
        const opts = options || {};
        const s = getRuntimeState(session || opts.session);
        const result = opts.result || null;
        const delta = opts.delta || (result ? deltaPayloadFrom(result) : null);
        const reasons = [];

        const arch = getCobraArchitecture(s);
        if (arch.enabled === true) reasons.push('cobraArchitecture.enabled');

        const explicitSpecRegime = getExplicitSelectedSpecRegime(result, opts) ||
            getExplicitSelectedSpecRegime(delta, opts);
        if (explicitSpecRegime === SPEC_REGIME_CUSTOM_237_05) reasons.push('selectedSpecRegime');

        if (readSelect(s, 'rearMode', null) === 'cobra_integrated_tail') reasons.push('rearMode');
        if (readStateValue(s, 'rearMode', null) === 'cobra_integrated_tail' && reasons.indexOf('rearMode') === -1) reasons.push('rearMode');
        if (readSelect(delta, 'rearMode', null) === 'cobra_integrated_tail' && reasons.indexOf('rearMode') === -1) reasons.push('rearMode');
        if (readSelect(result, 'rearMode', null) === 'cobra_integrated_tail' && reasons.indexOf('rearMode') === -1) reasons.push('rearMode');

        const modelFamily = opts.modelFamily ||
            readStateValue(s, 'modelFamily', null) ||
            (result && result.modelFamily) ||
            (delta && delta.modelFamily);
        if (modelFamily === 'cobra_tonearm') reasons.push('aiModelFamily');

        const promptContext = opts.promptContext || opts.shapeFormContext || opts.currentContext || null;
        if (promptContext) {
            if (promptContext.selectedModelFamily === 'cobra_tonearm' ||
                promptContext.modelFamily === 'cobra_tonearm' ||
                promptContext.builtFromModelFamily === 'cobra_tonearm') {
                reasons.push('aiModelFamily');
            }
            if (promptContext.actualRearMode === 'cobra_integrated_tail' ||
                promptContext.currentRearMode === 'cobra_integrated_tail' ||
                promptContext.builtFromRearMode === 'cobra_integrated_tail') {
                reasons.push('rearMode');
            }
            if (cobraOvalCounterweightIntent(promptContext)) reasons.push('promptContext');
        }

        if (cobraOvalCounterweightIntent(result) || cobraOvalCounterweightIntent(delta)) {
            reasons.push('aiResult');
        }

        if (textContainsCobraArchitectureIntent(opts.userIntentText || opts.userIntent || opts.promptText)) {
            reasons.push('userIntent');
        }

        const uniqueReasons = reasons.filter((id, index, arr) => arr.indexOf(id) === index);
        return {
            detected: uniqueReasons.length > 0,
            reasons: uniqueReasons,
            primaryReason: uniqueReasons[0] || 'none',
            architectureGateActive: arch.enabled === true
        };
    }

    function changedFieldIds(delta, session, fields) {
        const s = getRuntimeState(session);
        const d = deltaPayloadFrom(delta) || {};
        return fields.filter(id => {
            if (!hasInputValue(d, id)) return false;
            const nextValue = readInput(d, id, undefined);
            const currentValue = readInput(s, id, undefined);
            const next = Number(nextValue);
            const current = Number(currentValue);
            if (!Number.isFinite(next) || !Number.isFinite(current)) return String(nextValue) !== String(currentValue);
            return Math.abs(next - current) > 1e-9;
        });
    }

    function validationArchitectureForContext(architecture, contextDetected) {
        const arch = architecture || defaultCobraArchitecture(false);
        if (arch.enabled || !contextDetected) return arch;
        return normalizeCobraArchitecture(Object.assign({}, arch, { enabled: true }), { defaultEnabled: true });
    }

    function validateCobraArchitecture(session, physics, geometry, capabilities) {
        const s = getRuntimeState(session);
        const architecture = getCobraArchitecture(s);
        const context = isCobraArchitectureContext(s);
        const effectiveArchitecture = validationArchitectureForContext(architecture, context.detected);
        const manifest = capabilities || getCobraCapabilityManifest();
        const errors = [];
        const warnings = [];
        const missingCapabilities = (architecture.enabled || context.detected)
            ? missingCapabilitiesFor(effectiveArchitecture, manifest)
            : [];

        const discComponent = (physics && physics.c_rear_weights)
            ? physics.c_rear_weights
            : getDiscCounterweightComponent(s);
        const discComponentZ = discComponent && discComponent.com
            ? finiteNumber(discComponent.com.z, null)
            : (discComponent ? finiteNumber(discComponent.z, null) : null);
        const discComponentMass = discComponent
            ? finiteNumber(discComponent.massG !== undefined ? discComponent.massG : discComponent.mass, null)
            : null;
        const discComponentActive = !!(discComponent &&
            (discComponent.enabled !== false) &&
            (discComponentMass === null || discComponentMass > 0 || discComponentZ !== null));
        const discValidation = getDiscCounterweightValidation(s);
        const counterweightSource = (physics && physics.counterweightCOMSource) ||
            (discComponentActive ? 'rearWeightDiscStack' : 'none');
        const counterweightZ = discComponentZ;
        const eggshellValidation = getEggshellArmwandValidation(s);
        const mechanicalValidation = getMechanicalAssemblyValidation(s);
        const headshellSlotsValidation = getHeadshellSlotsValidation(s);
        const measured = {
            n1p2Mm: getN1P2Mm(s, physics),
            totalCOMZMm: physics && physics.c_total ? finiteNumber(physics.c_total.z, null) : null,
            counterweightCOMZMm: counterweightZ,
            counterweightCOMSource: counterweightSource,
            rearDiscProxyUsed: false,
            rearDiscCanonical: counterweightSource === 'rearWeightDiscStack',
            discCounterweightAssembly: manifest.cobraDiscCounterweightAssembly || 'missing',
            discCounterweightValidation: discValidation,
            discCounterweightValidationStatus: discValidation ? discValidation.status : 'missing',
            discCounterweightEnabled: discCounterweightEnabled(s, architecture),
            discCounterweightMassG: discValidation && discValidation.measured ? discValidation.measured.totalDiscMassG : (discComponentActive ? finiteNumber(discComponent.massG !== undefined ? discComponent.massG : discComponent.mass, null) : null),
            discCounterweightCOM: discValidation && discValidation.measured ? discValidation.measured.counterweightCOM : (discComponentActive ? (discComponent.com || { x: discComponent.x, y: discComponent.y, z: discComponent.z }) : null),
            rearTerminal: discValidation && discValidation.measured ? discValidation.measured.rearTerminal : null,
            discMount: discValidation && discValidation.measured ? discValidation.measured.discMount : null,
            discMountSource: discValidation && discValidation.measured ? discValidation.measured.discMountSource : null,
            discMountDeltaMm: discValidation && discValidation.measured ? discValidation.measured.discMountDeltaMm : null,
            discCount: discValidation && discValidation.measured ? discValidation.measured.discCount : null,
            discDiameterMm: discValidation && discValidation.measured ? discValidation.measured.discDiameterMm : null,
            discThicknessMm: discValidation && discValidation.measured ? discValidation.measured.discThicknessMm : null,
            discMassEachG: discValidation && discValidation.measured ? discValidation.measured.discMassEachG : null,
            fineTrimMassEquivalentG: discValidation && discValidation.measured ? discValidation.measured.fineTrimMassEquivalentG : null,
            stationBasedEggshellWand: manifest.stationBasedEggshellWand || 'missing',
            structuralStationFilter: manifest.structuralStationFilter || 'missing',
            eggshellWandEnabled: !!(architecture.enabled && architecture.armwand && architecture.armwand.enabled !== false),
            eggshellValidation: eggshellValidation,
            eggshellValidationStatus: eggshellValidation ? eggshellValidation.status : 'missing',
            eggshellStationCount: eggshellValidation ? eggshellValidation.stationCount : null,
            eggshellStructuralStationCount: eggshellValidation ? eggshellValidation.structuralStationCount : null,
            eggshellMinWidthMm: eggshellValidation ? eggshellValidation.minStationWidthMm : null,
            eggshellMinHeightMm: eggshellValidation ? eggshellValidation.minStationHeightMm : null,
            eggshellMinSectionAreaProxyMm2: eggshellValidation ? eggshellValidation.minSectionAreaProxyMm2 : null,
            eggshellMinEIProxy: eggshellValidation ? eggshellValidation.minEIProxy : null,
            eggshellConstantSectionDetected: eggshellValidation ? eggshellValidation.constantSectionDetected : null,
            eggshellCircularTubeDetected: eggshellValidation ? eggshellValidation.circularTubeDetected : null,
            eggshellMonotonicTaperValid: eggshellValidation ? eggshellValidation.monotonicTaperValid : null,
            cobraMechanicalAssembly: manifest.cobraMechanicalAssembly || 'missing',
            mechanicalEnabled: !!(architecture.enabled && architecture.mechanical && architecture.mechanical.enabled !== false),
            mechanicalValidation: mechanicalValidation,
            mechanicalValidationStatus: mechanicalValidation ? mechanicalValidation.status : 'missing',
            mechanicalMassComponentCount: mechanicalValidation && mechanicalValidation.measured ? mechanicalValidation.measured.massComponentCount : null,
            mechanicalPivotZMm: mechanicalValidation && mechanicalValidation.measured ? mechanicalValidation.measured.pivotZMm : null,
            mechanicalTowerDiameterMm: mechanicalValidation && mechanicalValidation.measured ? mechanicalValidation.measured.towerDiameterMm : null,
            mechanicalTowerMassG: mechanicalValidation && mechanicalValidation.measured ? mechanicalValidation.measured.towerMassG : null,
            mechanicalVtaMassG: mechanicalValidation && mechanicalValidation.measured ? mechanicalValidation.measured.vtaMassG : null,
            headshellSlots: manifest.headshellSlots || 'missing',
            headshellSlotsEnabled: !!(architecture.enabled && architecture.headshellSlots && architecture.headshellSlots.enabled !== false),
            headshellSlotsValidation: headshellSlotsValidation,
            headshellSlotsValidationStatus: headshellSlotsValidation ? headshellSlotsValidation.status : 'missing',
            headshellSlotCount: headshellSlotsValidation && headshellSlotsValidation.measured ? headshellSlotsValidation.measured.slotCount : null,
            headshellSlotLengthMinMm: headshellSlotsValidation && headshellSlotsValidation.measured ? headshellSlotsValidation.measured.slotLengthMinMm : null,
            headshellSlotWidthMinMm: headshellSlotsValidation && headshellSlotsValidation.measured ? headshellSlotsValidation.measured.slotWidthMinMm : null,
            headshellSlotSymmetryErrorMm: headshellSlotsValidation && headshellSlotsValidation.measured ? headshellSlotsValidation.measured.slotSymmetryErrorMm : null,
            eiMinNm2: physics && physics.structural ? finiteNumber(
                physics.structural.EI_min_Nm2 !== undefined ? physics.structural.EI_min_Nm2 : physics.structural.EI_min,
                null
            ) : null,
            firstBendingHz: physics && physics.structural ? finiteNumber(physics.structural.firstBendingHz, null) : null,
            exportValidation: getExportValidationStatus(geometry)
        };

        if (architecture.enabled) {
            if (measured.n1p2Mm === null || !Number.isFinite(Number(measured.n1p2Mm))) {
                errors.push('N1-P2 measurement unavailable.');
            } else if (Math.abs(measured.n1p2Mm - architecture.n1p2Mm) > N1P2_TOLERANCE_MM) {
                errors.push('N1-P2 must be ' + architecture.n1p2Mm.toFixed(2) + ' ± ' +
                    N1P2_TOLERANCE_MM.toFixed(2) + ' mm; measured ' + measured.n1p2Mm.toFixed(3) + ' mm.');
            }

            if (measured.totalCOMZMm === null || !Number.isFinite(Number(measured.totalCOMZMm))) {
                errors.push('Total COM Z measurement unavailable.');
            } else if (measured.totalCOMZMm > architecture.constraints.totalCOMZMaxMm) {
                errors.push('totalCOM.z must be <= ' + architecture.constraints.totalCOMZMaxMm.toFixed(2) +
                    ' mm; measured ' + measured.totalCOMZMm.toFixed(3) + ' mm.');
            }

            if (measured.counterweightCOMZMm === null || !Number.isFinite(Number(measured.counterweightCOMZMm))) {
                errors.push('Counterweight COM Z measurement unavailable.');
            } else if (measured.counterweightCOMZMm > architecture.constraints.counterweightCOMZMaxMm) {
                errors.push('counterweightCOM.z must be <= ' + architecture.constraints.counterweightCOMZMaxMm.toFixed(2) +
                    ' mm; measured ' + measured.counterweightCOMZMm.toFixed(3) + ' mm.');
            }

            if (architecture.counterweight &&
                architecture.counterweight.variant === 'configurable_disc_stack' &&
                architecture.counterweight.useRearDiscStack !== false) {
                if (manifest.cobraDiscCounterweightAssembly !== 'loaded') {
                    warnings.push('cobraDiscCounterweightAssembly is required for configurable disc counterweight source.');
                } else if (measured.counterweightCOMSource !== 'rearWeightDiscStack') {
                    errors.push('Counterweight COM source must be rearWeightDiscStack when configurable disc counterweight is enabled; measured ' + measured.counterweightCOMSource + '.');
                } else if (!measured.discCounterweightCOM) {
                    errors.push('rearWeightDiscStack component COM is unavailable despite loaded capability.');
                }
                if (measured.discMountDeltaMm !== null && Number.isFinite(Number(measured.discMountDeltaMm)) && Number(measured.discMountDeltaMm) > 0.25) {
                    errors.push('Disc stack mount is not unified with rear terminal; delta=' + Number(measured.discMountDeltaMm).toFixed(3) + ' mm.');
                }
                if (measured.discMount && measured.rearTerminal &&
                    Number.isFinite(Number(measured.discMount.x)) &&
                    Number.isFinite(Number(measured.rearTerminal.x)) &&
                    Math.abs(Number(measured.discMount.x) - TARGET_N1P2_MM) <= 0.01 &&
                    Math.abs(Number(measured.rearTerminal.x) - TARGET_N1P2_MM) > 0.01) {
                    errors.push('Disc stack is mounted at pivot/apex x=237 instead of actual rear terminal.');
                }
                if (discValidation && discValidation.status !== 'PASS') {
                    errors.push('Cobra disc counterweight validation failed: ' + (discValidation.errors || []).join('; '));
                }
            }

            if (architecture.armwand &&
                architecture.armwand.variant === 'station_based_eggshell' &&
                architecture.armwand.enabled !== false) {
                if (manifest.stationBasedEggshellWand !== 'loaded') {
                    warnings.push('stationBasedEggshellWand is required for Cobra eggshell armwand source.');
                } else if (!eggshellValidation) {
                    errors.push('Cobra eggshell station validation is unavailable despite loaded capability.');
                } else if (eggshellValidation.status !== 'PASS') {
                    errors.push('Cobra eggshell station validation failed: ' + (eggshellValidation.errors || []).join('; '));
                }
                if (manifest.structuralStationFilter !== 'loaded') {
                    warnings.push('structuralStationFilter is required to prevent zero-area / zero-EI station regressions.');
                }
            }

            if (architecture.mechanical &&
                architecture.mechanical.enabled !== false &&
                manifest.cobraMechanicalAssembly === 'loaded') {
                if (!mechanicalValidation || mechanicalValidation.status !== 'PASS') {
                    errors.push('Cobra mechanical assembly validation must PASS when mechanical assembly is enabled.');
                    if (mechanicalValidation && Array.isArray(mechanicalValidation.errors)) {
                        mechanicalValidation.errors.forEach(err => errors.push('mechanical: ' + err));
                    }
                }
            }

            if (architecture.headshellSlots &&
                architecture.headshellSlots.enabled !== false) {
                if (manifest.headshellSlots !== 'loaded') {
                    warnings.push('headshellSlots capability is required for integrated Cobra headshell slots.');
                } else if (!headshellSlotsValidation) {
                    errors.push('HeadshellSlots validation is unavailable despite loaded capability.');
                } else if (headshellSlotsValidation.status !== 'PASS') {
                    errors.push('HeadshellSlots validation must PASS when integrated headshell slots are enabled.');
                    if (Array.isArray(headshellSlotsValidation.errors)) {
                        headshellSlotsValidation.errors.forEach(err => errors.push('headshellSlots: ' + err));
                    }
                }
            }

            if (architecture.constraints.eiMinMustBePositive) {
                if (measured.eiMinNm2 === null || !Number.isFinite(Number(measured.eiMinNm2))) {
                    errors.push('EI_min measurement unavailable.');
                } else if (measured.eiMinNm2 <= 0) {
                    errors.push('EI_min must be > 0 N·m²; measured ' + measured.eiMinNm2.toFixed(3) + ' N·m².');
                }
            }

            if (architecture.constraints.firstBendingHzMustBePositive) {
                if (measured.firstBendingHz === null || !Number.isFinite(Number(measured.firstBendingHz))) {
                    errors.push('First bending mode measurement unavailable.');
                } else if (measured.firstBendingHz <= 0) {
                    errors.push('firstBendingHz must be > 0 Hz; measured ' + measured.firstBendingHz.toFixed(3) + ' Hz.');
                }
            }

            if (architecture.constraints.exportMustPass && measured.exportValidation !== 'PASS') {
                errors.push('Export validation must be PASS; measured ' + (measured.exportValidation || 'unavailable') + '.');
            }

        } else if (context.detected) {
            warnings.push('Cobra context detected while cobraArchitecture.enabled=false. Architecture gate is inactive; do not treat this as a Cobra PASS.');
        }

        let status = 'PASS';
        if (!architecture.enabled && context.detected) status = 'INACTIVE_COBRA_CONTEXT';
        else if (architecture.enabled && missingCapabilities.length > 0) status = 'BLOCKED_BY_CAPABILITY';
        else if (errors.length > 0) status = 'FAIL';

        return {
            status,
            errors,
            warnings,
            measured,
            missingCapabilities,
            cobraContextDetected: context.detected,
            architectureGateActive: architecture.enabled === true,
            gateActivationReason: context.primaryReason || 'none',
            contextReasons: context.reasons
        };
    }

    function validateCobraDeltaCapability(resultOrDelta, options) {
        const opts = options || {};
        const s = getRuntimeState(opts.session);
        const architecture = getCobraArchitecture(s);
        const explicitSpecRegime = getExplicitSelectedSpecRegime(resultOrDelta, opts);
        const inputIsArchitectureResult = isArchitectureAIResult(resultOrDelta);
        const initialDelta = deltaPayloadFrom(resultOrDelta);
        const context = isCobraArchitectureContext(s, Object.assign({}, opts, {
            result: inputIsArchitectureResult ? resultOrDelta : null,
            delta: initialDelta,
            selectedSpecRegime: explicitSpecRegime
        }));
        const result = inputIsArchitectureResult ? resultOrDelta : {
            status: 'ok',
            selectedSpecRegime: explicitSpecRegime || (context.detected ? architecture.specRegime : undefined),
            mustDevelopModules: [],
            hardConstraints: {},
            delta: resultOrDelta,
            unmetRequirements: [],
            validationPlan: []
        };
        const delta = deltaPayloadFrom(result);
        const effectiveArchitecture = validationArchitectureForContext(architecture, context.detected);
        const capabilities = opts.capabilities || getCobraCapabilityManifest();
        const missingCapabilities = context.detected ? missingCapabilitiesFor(effectiveArchitecture, capabilities) : [];
        const unmet = Array.isArray(result.unmetRequirements) ? result.unmetRequirements.slice() : [];
        const mustDevelop = Array.isArray(result.mustDevelopModules) ? result.mustDevelopModules.slice() : [];

        missingCapabilities.forEach(id => {
            if (mustDevelop.indexOf(id) === -1) mustDevelop.push(id);
            if (unmet.indexOf(id) === -1) unmet.push(id);
        });

        const selectedSpecRegimeForOutput = result.selectedSpecRegime ||
            explicitSpecRegime ||
            (context.detected ? architecture.specRegime : undefined);

        const output = {
            status: 'ok',
            selectedSpecRegime: selectedSpecRegimeForOutput,
            mustDevelopModules: mustDevelop,
            hardConstraints: context.detected ? Object.assign({}, effectiveArchitecture.constraints, {
                counterweight: effectiveArchitecture.counterweight,
                n1p2Mm: effectiveArchitecture.n1p2Mm
            }) : {},
            delta: delta || {},
            unmetRequirements: unmet,
            validationPlan: context.detected ? cobraValidationPlan(result.validationPlan) : (Array.isArray(result.validationPlan) ? result.validationPlan.slice() : []),
            cobraContextDetected: context.detected,
            architectureGateActive: architecture.enabled === true,
            gateActivationReason: context.primaryReason || 'none',
            contextReasons: context.reasons
        };

        if (!context.detected) return output;

        if (result.status === 'blocked_by_capability' || result.status === 'source_conflict') {
            output.status = result.status;
            return output;
        }

        if (missingCapabilities.length > 0) {
            output.status = 'blocked_by_capability';
            output.unmetRequirements.push('required Cobra capabilities are missing: ' + missingCapabilities.join(', '));
            return output;
        }

        const counterweightProxyChanged = changedFieldIds(delta, s, FORBIDDEN_COBRA_COUNTERWEIGHT_PROXY_FIELDS);
        if (counterweightProxyChanged.length > 0) {
            output.status = 'source_conflict';
            output.unmetRequirements.push('Cobra configurable disc counterweight may use rearWeightDisc*, but rear/tail shape controls cannot replace the disc counterweight assembly: ' + counterweightProxyChanged.join(', '));
        }

        const armwandProxyChanged = changedFieldIds(delta, s, FORBIDDEN_COBRA_ARMWAND_PROXY_FIELDS);
        if (armwandProxyChanged.length > 0) {
            output.status = 'source_conflict';
            output.unmetRequirements.push('Cobra station-based eggshell armwand cannot be solved through legacy slider controls: ' + armwandProxyChanged.join(', '));
        }

        // Phase 13.1: fine trim fields are canonical disc-stack trim controls and are allowed in Cobra context.
        const fineTrimChanged = [];

        if (output.status === 'source_conflict') {
            output.validationPlan = cobraValidationPlan(output.validationPlan);
        }

        return output;
    }

    root.CobraArchitecture = Object.freeze({
        schema: ARCHITECTURE_SCHEMA,
        defaultCobraArchitecture,
        normalizeCobraArchitecture,
        getCobraArchitecture,
        ensureCobraArchitecture,
        getCobraCapabilityManifest,
        missingCapabilitiesFor,
        getDiscCounterweightComponent,
        getDiscCounterweightValidation,
        getEggshellArmwandValidation,
        getMechanicalAssemblyValidation,
        getHeadshellSlotsValidation,
        discCounterweightEnabled,
        readInput,
        readSelect,
        readCheckbox,
        readStateValue,
        hasExplicitSelectedSpecRegime,
        getExplicitSelectedSpecRegime,
        textContainsCobraArchitectureIntent,
        isCobraArchitectureContext,
        currentCounterweightProxyUse,
        changedFieldIds,
        getN1P2Mm,
        validateCobraArchitecture,
        validateCobraDeltaCapability,
        REQUIRED_CAPABILITIES: REQUIRED_CAPABILITIES.slice(),
        FORBIDDEN_COBRA_PROXY_FIELDS: FORBIDDEN_COBRA_PROXY_FIELDS.slice(),
        FORBIDDEN_COBRA_COUNTERWEIGHT_PROXY_FIELDS: FORBIDDEN_COBRA_COUNTERWEIGHT_PROXY_FIELDS.slice(),
        FORBIDDEN_COBRA_ARMWAND_PROXY_FIELDS: FORBIDDEN_COBRA_ARMWAND_PROXY_FIELDS.slice(),
        FORBIDDEN_DISC_COUNTERWEIGHT_PROXY_FIELDS: FORBIDDEN_DISC_COUNTERWEIGHT_PROXY_FIELDS.slice(),
        PROTECTED_CORE_GEOMETRY_FIELDS: PROTECTED_CORE_GEOMETRY_FIELDS.slice(),
        FINE_TRIM_FIELDS: FINE_TRIM_FIELDS.slice()
    });

    root.AICapabilityGate = Object.freeze({
        validateCobraDeltaCapability
    });

    root.getCobraCapabilityManifest = getCobraCapabilityManifest;
    root.validateCobraArchitecture = validateCobraArchitecture;
})(typeof globalThis !== 'undefined' ? globalThis : window);
