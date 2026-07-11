/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-disc-counterweight.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-disc-counterweight.js
 * Phase 13.1 canonical Cobra configurable disc counterweight assembly.
 *
 * This module deliberately restores the verified configurable rear-disc stack
 * as the active Cobra counterweight path. It is not an oval/capsule add-on and
 * it is not a proxy: rearWeightDisc* are the canonical Cobra disc counterweight
 * controls for this application branch.
 */
(function(root) {
    'use strict';

    const FEATURE_CODE = 'cobraDiscCounterweightAssembly';
    const TARGET_N1P2_MM = 237.05;
    const DEFAULT_DISC = Object.freeze({
        diameterMm: 14,
        thicknessMm: 4,
        count: 4,
        massEachG: 18,
        zOffsetMm: 0,
        xMm: null,
        yMm: 0,
        zMm: null
    });
    const SUPPORT_BRIDGE_LENGTH_MM = 2.0;
    const SUPPORT_BRIDGE_RADIUS_MM = 1.25;
    const SUPPORT_BRIDGE_OVERLAP_MM = 0.25;

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function finite(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function readInput(source, id, fallback) {
        if (source && Object.prototype.hasOwnProperty.call(source, id)) return source[id];
        if (source && source.inputs && Object.prototype.hasOwnProperty.call(source.inputs, id)) return source.inputs[id];
        return fallback;
    }

    function readCheckbox(source, id, fallback) {
        if (source && Object.prototype.hasOwnProperty.call(source, id)) return source[id];
        if (source && source.checkboxes && Object.prototype.hasOwnProperty.call(source.checkboxes, id)) return source.checkboxes[id];
        return fallback;
    }

    function getDefaultSpec() {
        return {
            variant: 'configurable_disc_stack',
            enabled: true,
            role: 'rear_terminal_balance_mass',
            mountSource: 'unifiedRearTerminal',
            useRearDiscStack: true,
            useRearDiscProxy: false,
            discStack: clone(DEFAULT_DISC),
            fineTrim: {
                enabled: true,
                lengthMm: 18,
                massEquivalentG: 0,
                zOffsetMm: 0
            },
            targetCOMZMaxMm: 0,
            targetCOMZPreferredMm: -2.9
        };
    }

    function normalizeCounterweightBlock(source) {
        const incoming = isObject(source) ? source : {};
        const out = getDefaultSpec();

        out.enabled = incoming.enabled === false ? false : true;
        out.variant = incoming.variant === 'configurable_disc_stack' ? 'configurable_disc_stack' : 'configurable_disc_stack';
        out.role = (typeof incoming.role === 'string' && incoming.role.trim()) ? incoming.role : out.role;
        out.mountSource = (typeof incoming.mountSource === 'string' && incoming.mountSource.trim()) ? incoming.mountSource : out.mountSource;
        out.useRearDiscStack = incoming.useRearDiscStack !== false;
        out.useRearDiscProxy = false;

        const ds = isObject(incoming.discStack) ? incoming.discStack : {};
        out.discStack.diameterMm = finite(ds.diameterMm !== undefined ? ds.diameterMm : ds.diameter, out.discStack.diameterMm);
        out.discStack.thicknessMm = finite(ds.thicknessMm !== undefined ? ds.thicknessMm : ds.thickness, out.discStack.thicknessMm);
        out.discStack.count = Math.max(0, Math.round(finite(ds.count, out.discStack.count)));
        out.discStack.massEachG = Math.max(0, finite(ds.massEachG !== undefined ? ds.massEachG : ds.mass, out.discStack.massEachG));
        out.discStack.zOffsetMm = finite(ds.zOffsetMm, out.discStack.zOffsetMm);
        out.discStack.xMm = finite(ds.xMm, out.discStack.xMm);
        out.discStack.yMm = finite(ds.yMm, out.discStack.yMm);
        out.discStack.zMm = finite(ds.zMm, out.discStack.zMm);

        const ft = isObject(incoming.fineTrim) ? incoming.fineTrim : {};
        out.fineTrim.enabled = ft.enabled === false ? false : true;
        out.fineTrim.lengthMm = finite(ft.lengthMm !== undefined ? ft.lengthMm : ft.xOffsetMm, out.fineTrim.lengthMm);
        out.fineTrim.massEquivalentG = Math.max(0, finite(ft.massEquivalentG, out.fineTrim.massEquivalentG));
        out.fineTrim.zOffsetMm = finite(ft.zOffsetMm, out.fineTrim.zOffsetMm);

        out.targetCOMZMaxMm = finite(incoming.targetCOMZMaxMm, out.targetCOMZMaxMm);
        out.targetCOMZPreferredMm = finite(incoming.targetCOMZPreferredMm, out.targetCOMZPreferredMm);
        return out;
    }

    function getUnifiedTerminal(source) {
        if (root.getUnifiedRearTerminal && typeof root.getUnifiedRearTerminal === 'function') {
            return root.getUnifiedRearTerminal(source || {});
        }
        return {
            available: false,
            source: 'missing_unified_rear_terminal_api',
            geometrySource: 'missing',
            x: null,
            y: null,
            z: null,
            error: 'getUnifiedRearTerminal unavailable'
        };
    }

    function getDiscMountPoint(source) {
        const terminal = getUnifiedTerminal(source || {});
        if (!terminal || terminal.available !== true ||
            !Number.isFinite(Number(terminal.x)) ||
            !Number.isFinite(Number(terminal.z))) {
            return {
                available: false,
                source: 'missing_unified_rear_terminal',
                geometrySource: terminal && terminal.geometrySource ? terminal.geometrySource : 'missing',
                x: null,
                y: null,
                z: null,
                rearTerminal: terminal || null
            };
        }

        /*
         * FAS16.1c:
         * FAS16.1b placed the disc stack top exactly on the rear-terminal cap.
         * That fixed the visible 10 mm air gap but created an STL T/contact
         * non-manifold in the browser final export audit.
         *
         * Keep the real rear terminal cap as the anchor, but bridge down to the
         * disc stack with a small explicit support boss. The disc stack is no
         * longer coplanar/tangent with the TD026 end cap, and the support boss
         * slightly overlaps both solids so the visual/mechanical support is
         * continuous without an exact edge/vertex weld.
         */
        const terminalHeight = Number.isFinite(Number(terminal.heightMm)) ? Math.max(0, Number(terminal.heightMm)) : 0;
        const contactZ = Number(terminal.z);
        return {
            available: true,
            source: 'unifiedRearTerminalCapContact',
            terminalSource: terminal.source || 'GLOBAL_RINGSCache.lastFiniteRing',
            geometrySource: terminal.geometrySource || 'td026_full_ring_geometry',
            x: Number(terminal.x),
            y: Number(terminal.y || 0),
            z: contactZ,
            rearTerminal: terminal,
            terminalCenterZ: Number(terminal.z),
            terminalHeightMm: terminalHeight,
            clearanceMm: 0,
            supportGapMm: 0,
            mountRelation: 'rear_terminal_cap_contact'
        };
    }

    function buildDownwardDiscStackGeometry(mount, count, thickness, zOffsetMm, supportOptions) {
        const support = supportOptions || {};
        const offset = finite(zOffsetMm, 0);
        const anchorZ = (mount && mount.available === true && Number.isFinite(Number(mount.z))) ? Number(mount.z) + offset : null;
        const safeCount = Math.max(0, Math.round(finite(count, 0)));
        const safeThickness = finite(thickness, 0);
        const geometryReady = anchorZ !== null && safeThickness > 0;
        const bridgeLengthMm = (geometryReady && safeCount > 0) ? Math.max(0.1, finite(support.lengthMm, SUPPORT_BRIDGE_LENGTH_MM)) : 0;
        const bridgeRadiusMm = Math.max(0.1, finite(support.radiusMm, SUPPORT_BRIDGE_RADIUS_MM));
        const bridgeOverlapMm = Math.max(0.01, finite(support.overlapMm, SUPPORT_BRIDGE_OVERLAP_MM));
        const stackTopZ = geometryReady ? anchorZ - bridgeLengthMm : null;
        const stackBottomZ = geometryReady ? stackTopZ - (safeCount * safeThickness) : null;
        const stackCOMZ = (geometryReady && safeCount > 0) ? stackTopZ - ((safeCount * safeThickness) / 2) : null;
        const discCenterZList = [];

        if (geometryReady && safeCount > 0) {
            for (let i = 0; i < safeCount; i += 1) {
                discCenterZList.push(stackTopZ - (safeThickness / 2) - (i * safeThickness));
            }
        }

        const supportBridge = {
            enabled: geometryReady && safeCount > 0 && bridgeLengthMm > 0,
            role: 'rear_terminal_to_disc_stack_support_boss',
            source: 'explicit_support_bridge',
            topZ: geometryReady ? anchorZ + bridgeOverlapMm : null,
            bottomZ: geometryReady ? stackTopZ - bridgeOverlapMm : null,
            centerZ: geometryReady ? (anchorZ + stackTopZ) / 2 : null,
            lengthMm: bridgeLengthMm,
            overlapMm: bridgeOverlapMm,
            radiusMm: bridgeRadiusMm,
            visibleSupportGapMm: 0
        };

        return {
            anchorZ,
            stackTopZ,
            stackBottomZ,
            stackCOMZ,
            discCenterZList,
            supportBridgeLengthMm: bridgeLengthMm,
            supportBridgeRadiusMm: bridgeRadiusMm,
            supportBridgeOverlapMm: bridgeOverlapMm,
            supportBridge
        };
    }

    function getDiscStackState(source) {
        const arch = source && source.cobraArchitecture ? source.cobraArchitecture : {};
        const cw = normalizeCounterweightBlock(arch.counterweight);

        const diameter = finite(readInput(source, 'rearWeightDiscDiameter', cw.discStack.diameterMm), cw.discStack.diameterMm);
        const thickness = finite(readInput(source, 'rearWeightDiscThickness', cw.discStack.thicknessMm), cw.discStack.thicknessMm);
        const count = Math.max(0, Math.round(finite(readInput(source, 'rearWeightDiscCount', cw.discStack.count), cw.discStack.count)));
        const massEach = Math.max(0, finite(readInput(source, 'rearWeightDiscMass', cw.discStack.massEachG), cw.discStack.massEachG));
        const fineTrimLength = finite(readInput(source, 'rearFineTrimScrewLength', cw.fineTrim.lengthMm), cw.fineTrim.lengthMm);
        const fineTrimMass = Math.max(0, finite(readInput(source, 'rearFineTrimScrewMassEquivalent', cw.fineTrim.massEquivalentG), cw.fineTrim.massEquivalentG));
        const zOffsetMm = finite(readInput(source, 'counterweightZOffset', cw.discStack.zOffsetMm), cw.discStack.zOffsetMm);
        const supportOptions = {
            lengthMm: finite(readInput(source, 'rearSupportBridgeLength', SUPPORT_BRIDGE_LENGTH_MM), SUPPORT_BRIDGE_LENGTH_MM),
            radiusMm: finite(readInput(source, 'rearSupportBridgeRadius', SUPPORT_BRIDGE_RADIUS_MM), SUPPORT_BRIDGE_RADIUS_MM),
            overlapMm: finite(readInput(source, 'rearSupportBridgeOverlap', SUPPORT_BRIDGE_OVERLAP_MM), SUPPORT_BRIDGE_OVERLAP_MM)
        };

        const mount = getDiscMountPoint(source || {});
        const stackGeometry = buildDownwardDiscStackGeometry(mount, count, thickness, zOffsetMm, supportOptions);
        return Object.assign({
            enabled: cw.enabled !== false,
            variant: 'configurable_disc_stack',
            stackingMode: 'terminal_support_bridge_downward',
            diameterMm: diameter,
            thicknessMm: thickness,
            count,
            massEachG: massEach,
            totalDiscMassG: count * massEach,
            fineTrimLengthMm: fineTrimLength,
            fineTrimMassEquivalentG: fineTrimMass,
            zOffsetMm,
            includeInExport: readCheckbox(source, 'includeRearWeightDiscsInExport', source && source.includeRearWeightDiscsInExport !== undefined ? source.includeRearWeightDiscsInExport : true) === true,
            showRearWeights: readCheckbox(source, 'showRearWeights', source && source.showRearWeights !== undefined ? source.showRearWeights : true) !== false,
            showFineTrimScrew: readCheckbox(source, 'showFineTrimScrew', source && source.showFineTrimScrew !== undefined ? source.showFineTrimScrew : false) === true,
            xMm: mount.available ? mount.x : null,
            yMm: mount.available ? mount.y : 0,
            zMm: stackGeometry.stackCOMZ,
            mount,
            mountSource: mount.source,
            geometrySource: mount.geometrySource,
            targetCOMZMaxMm: cw.targetCOMZMaxMm
        }, stackGeometry);
    }

    function getMassComponent(source) {
        const d = getDiscStackState(source || {});
        const mass = d.totalDiscMassG;
        return {
            name: 'rearWeightDiscStack',
            source: 'rearWeightDiscStack',
            enabled: d.enabled && mass > 0 && d.count > 0 && d.mount && d.mount.available === true && Number.isFinite(Number(d.stackCOMZ)),
            massG: mass,
            mass: mass,
            x: d.xMm,
            y: d.yMm,
            z: d.stackCOMZ,
            com: { x: d.xMm, y: d.yMm, z: d.stackCOMZ },
            discMount: d.mount,
            mountSource: d.mountSource,
            geometrySource: d.geometrySource,
            stackingMode: d.stackingMode,
            anchorZ: d.anchorZ,
            stackTopZ: d.stackTopZ,
            stackBottomZ: d.stackBottomZ,
            stackCOMZ: d.stackCOMZ,
            discCenterZList: d.discCenterZList,
            discCount: d.count,
            discDiameterMm: d.diameterMm,
            discThicknessMm: d.thicknessMm,
            discMassEachG: d.massEachG,
            fineTrimMassEquivalentG: d.fineTrimMassEquivalentG
        };
    }

    function validateCounterweight(source) {
        const d = getDiscStackState(source || {});
        const errors = [];
        const warnings = [];
        const measured = {
            implementation: 'configurable_disc_stack',
            discCount: d.count,
            discDiameterMm: d.diameterMm,
            discThicknessMm: d.thicknessMm,
            discMassEachG: d.massEachG,
            totalDiscMassG: d.totalDiscMassG,
            fineTrimMassEquivalentG: d.fineTrimMassEquivalentG,
            zOffsetMm: d.zOffsetMm,
            counterweightCOMSource: 'rearWeightDiscStack',
            counterweightCOM: { x: d.xMm, y: d.yMm, z: d.stackCOMZ },
            counterweightCOMZMm: d.stackCOMZ,
            stackingMode: d.stackingMode,
            anchorZ: d.anchorZ,
            stackTopZ: d.stackTopZ,
            stackBottomZ: d.stackBottomZ,
            stackCOMZ: d.stackCOMZ,
            discCenterZList: d.discCenterZList,
            supportBridge: d.supportBridge || null,
            supportBridgeLengthMm: d.supportBridgeLengthMm,
            supportBridgeRadiusMm: d.supportBridgeRadiusMm,
            rearTerminal: d.mount && d.mount.rearTerminal ? d.mount.rearTerminal : null,
            discMount: d.mount,
            discMountSource: d.mountSource,
            discMountDeltaMm: d.mount && d.mount.rearTerminal && Number.isFinite(Number(d.xMm)) && Number.isFinite(Number(d.mount.rearTerminal.x))
                ? Math.abs(Number(d.xMm) - Number(d.mount.rearTerminal.x))
                : null,
            includeRearWeightDiscsInExport: d.includeInExport,
            showRearWeights: d.showRearWeights
        };

        if (!d.enabled) errors.push('configurable disc counterweight is disabled.');
        if (d.count <= 0) errors.push('disc count must be > 0.');
        if (d.diameterMm <= 0) errors.push('disc diameter must be > 0.');
        if (d.thicknessMm <= 0) errors.push('disc thickness must be > 0.');
        if (d.massEachG <= 0) errors.push('disc mass each must be > 0.');
        if (d.totalDiscMassG <= 0) errors.push('total disc mass must be > 0.');
        if (!d.mount || d.mount.available !== true) errors.push('disc mount requires getUnifiedRearTerminal/full ring geometry.');
        if (!Number.isFinite(Number(d.xMm)) || !Number.isFinite(Number(d.anchorZ))) errors.push('disc mount coordinates unavailable.');
        if (d.count > 0 && !Number.isFinite(Number(d.stackCOMZ))) errors.push('downward disc stack COM unavailable.');
        if (Number.isFinite(Number(d.stackCOMZ)) && d.stackCOMZ > d.targetCOMZMaxMm) errors.push('counterweightCOM.z must be <= ' + d.targetCOMZMaxMm.toFixed(2) + ' mm; measured ' + d.stackCOMZ.toFixed(3) + ' mm.');
        if (d.mount && d.mount.rearTerminal && Number.isFinite(Number(d.xMm)) && Number.isFinite(Number(d.mount.rearTerminal.x))) {
            const dx = Math.abs(Number(d.xMm) - Number(d.mount.rearTerminal.x));
            if (dx > 0.25) errors.push('disc mount x differs from rear terminal by ' + dx.toFixed(3) + ' mm.');
            const terminalZ = Number(d.mount.rearTerminal.z);
            const anchorZ = Number(d.anchorZ);
            const stackTopZ = Number(d.stackTopZ);
            const bridge = d.supportBridge || {};
            const supportGapMm = (bridge.enabled === true && Number.isFinite(Number(bridge.visibleSupportGapMm)))
                ? Number(bridge.visibleSupportGapMm)
                : (Number.isFinite(terminalZ) && Number.isFinite(anchorZ) ? Math.max(0, terminalZ - anchorZ) : Infinity);
            measured.supportGapMm = supportGapMm;
            measured.rawTerminalToStackTopMm = Number.isFinite(terminalZ) && Number.isFinite(stackTopZ) ? Math.max(0, terminalZ - stackTopZ) : null;
            if (supportGapMm > 0.25) errors.push('disc stack has visible vertical gap from rear terminal: ' + supportGapMm.toFixed(3) + ' mm.');
            if (bridge.enabled !== true) errors.push('disc stack requires explicit rear-terminal support bridge.');
            if (bridge.enabled === true && !(Number.isFinite(Number(bridge.topZ)) && Number.isFinite(Number(bridge.bottomZ)) && Number(bridge.topZ) > terminalZ && Number(bridge.bottomZ) < stackTopZ)) {
                errors.push('support bridge must overlap both rear terminal and disc stack to avoid visual air gap without tangent STL contact.');
            }
        }
        if (Number.isFinite(Number(d.xMm)) && Math.abs(Number(d.xMm) - TARGET_N1P2_MM) <= 0.01 &&
            !(d.mount && d.mount.rearTerminal && Number.isFinite(Number(d.mount.rearTerminal.x)) && Math.abs(Number(d.mount.rearTerminal.x) - TARGET_N1P2_MM) <= 0.01)) {
            errors.push('disc mount is using pivot/apex x=237 instead of actual rear terminal.');
        }
        if (!d.includeInExport) warnings.push('includeRearWeightDiscsInExport=false; disc stack mass remains canonical but export solids may be excluded.');

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings,
            measured
        };
    }

    function toReportBlock(source) {
        const validation = validateCounterweight(source || {});
        return {
            feature: FEATURE_CODE,
            capability: 'loaded',
            validation
        };
    }

    function getFeatureManifest() {
        return {
            feature: FEATURE_CODE,
            status: 'loaded',
            schema: 'cobra-disc-counterweight-assembly-v1',
            featureCount: 1,
            features: [
                'configurable_disc_stack',
                'rearWeightDiscDiameter',
                'rearWeightDiscThickness',
                'rearWeightDiscCount',
                'rearWeightDiscMass',
                'rearFineTrimScrewLength',
                'rearFineTrimScrewMassEquivalent',
                'counterweightZOffset',
                'rearTerminalSupportBridge'
            ]
        };
    }

    root.CobraDiscCounterweightAssembly = Object.freeze({
        featureCode: FEATURE_CODE,
        getFeatureManifest,
        getDefaultSpec,
        defaultCounterweightBlock: getDefaultSpec,
        normalizeCounterweightBlock,
        getDiscMountPoint,
        getDiscStackState,
        getMassComponent,
        validateCounterweight,
        toReportBlock
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
