/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F ai-vibe-3d.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/ai-vibe-3d.js
 * FAS19.0 AI Modal Onshape handoff layer.
 *
 * Purpose: expose Onshape 1:1 intent, feature graph, handoff audit, semantic action primitives, and AI Modal response validation so the app can operate as an AI Vibe 3D orchestrator rather than a slider editor.
 */
(function(root) {
    'use strict';

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj || {}));
    }

    function getCurrentState() {
        return (typeof root.state !== 'undefined') ? root.state : {};
    }


    const AI_VIBE_RESPONSE_SCHEMA = 'tonearm-designer-ai-vibe-3d-response';
    const AI_VIBE_RESPONSE_VERSION = 1;
    const DEFAULT_ONSHAPE_INTENT = 'onshape_ready_exact_positive_model';

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function hasPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function getAllowedActions() {
        return [
            { op: 'set_onshape_1to1', purpose: 'Select 1:1 millimetre positive reference model output with zero offsets/draft/shrinkage.' },
            { op: 'enforce_exact_1to1', purpose: 'Force all legacy mould/plug compensation controls to neutral values for exact Onshape reference export.' },
            { op: 'fix_export_slivers', purpose: 'Enable safe tiny-sliver handling for closed, non-degenerate mesh exports.' },
            { op: 'preserve_reference_datums', purpose: 'Declare stylus, pivot and LP plane as protected datums during optimization.' },
            { op: 'stiffen_zone', purpose: 'Raise wall/ridge support in a named zone without inventing new geometry.' },
            { op: 'balance_about_pivot', purpose: 'Ensure rear disc-stack counterweight is enabled for pivot-balance exploration.' },
            { op: 'extend_support_bridge', purpose: 'Increase rear support bridge continuity toward the counterweight stack.' },
            { op: 'normalize_onshape_handoff', purpose: 'Normalize unit scale, sidecar metadata and Onshape target constraints.' },
            { op: 'activate_cobra_architecture_gate', purpose: 'Enable the runtime Cobra architecture gate used by Cobra acceptance and report paths.' },
            { op: 'lock_n1p2', purpose: 'Lock effective length / N1-P2 target by writing the apex control to the requested millimetre value.' },
            { op: 'flatten_headshell_underside', purpose: 'Force a true planar headshell underside over a specified X range and blend smoothly into the neck.' },
            { op: 'smooth_profile_step', purpose: 'Suppress local side-profile steps by extending the flat-to-neck blend, enabling front height continuity and reducing abrupt ridge/height changes.' },
            { op: 'stiffen_front_ramp', purpose: 'Raise minimum section height from headshell into early armwand so the front cannot become a ribbon-thin beam.' },
            { op: 'sculpt_surface_zone', purpose: 'Generic AI sculpting command for writable planar surface zones; currently supports headshell_underside and front_stiffness_ramp.' }
        ];
    }

    function getOnshapeHandoffTarget(source) {
        const s = source || getCurrentState();
        return {
            schema: 'tonearm-designer-onshape-handoff-target-v1',
            intent: DEFAULT_ONSHAPE_INTENT,
            geometryKind: 'positive_reference_mesh',
            units: 'mm',
            scale: finite(s.onshapeUnitScale, 1),
            exactOneToOne: s.onshapeStrictOneToOne !== false,
            exportType: 'onshape_1to1',
            preferredFormat: 'binary_stl_with_sidecar_json',
            forbiddenTransformations: ['mould_offset', 'draft_modification', 'shrinkage_compensation', 'split_mould_flange', 'registration_pins', 'pour_gates', 'vent_channels'],
            requiredDatums: ['stylus_point', 'pivot_point', 'lp_top_plane', 'x_length_axis', 'y_mirror_axis', 'z_vertical_axis'],
            qualityTargets: {
                boundaryEdgesMax: 0,
                nonManifoldEdgesMax: 0,
                degenerateTrianglesMax: 0,
                sliverTrianglesPreferredMax: 0,
                minTriangleAreaPreferredMm2: Math.max(0.00001, finite(s.aiVibeMinTriangleHardFailArea, 0.00001)),
                preserveScale1To1: true,
                preserveCurrentCoordinateFrame: true
            },
            downstreamCAD: {
                targetApp: 'Onshape',
                importRole: 'reference mesh for downstream modelling / surface rebuild',
                warning: 'This is not STEP/BREP and does not create a parametric Onshape feature tree.'
            }
        };
    }

    function buildAIModalContext(source) {
        const s = source || getCurrentState();
        return {
            schema: 'tonearm-designer-ai-modal-onshape-context-v1',
            app: (root.Session && root.Session.APP_VERSION) ? root.Session.APP_VERSION : 'V28.8.0-Fas20-AIResponseApplyRuntime',
            role: 'AI Modal is the AI Vibe 3D orchestrator for exact 1:1 Onshape handoff, not a mould generator.',
            featureGraph: getFeatureGraph(s),
            onshapeHandoffTarget: getOnshapeHandoffTarget(s),
            audit: runPrintabilityAudit(s),
            allowedActions: getAllowedActions(),
            responseContract: {
                preferredSchema: AI_VIBE_RESPONSE_SCHEMA,
                version: AI_VIBE_RESPONSE_VERSION,
                requiredTopLevel: ['schema', 'version', 'app', 'intent', 'actions', 'delta', 'validationTargets'],
                deltaCompatibility: 'delta may contain a sparse legacy tonearm-designer-ai-delta patch only when additional slider changes are required; actions are applied before delta. Full-state passthrough is forbidden.',
                strictJsonOnly: true,
                noMarkdown: true,
                examples: [
                    {
                        schema: AI_VIBE_RESPONSE_SCHEMA,
                        version: AI_VIBE_RESPONSE_VERSION,
                        app: (root.Session && root.Session.APP_VERSION) ? root.Session.APP_VERSION : 'V28.8.0-Fas20-AIResponseApplyRuntime',
                        intent: DEFAULT_ONSHAPE_INTENT,
                        actions: [
                            { op: 'set_onshape_1to1' },
                            { op: 'fix_export_slivers', strategy: 'soft_pass_sub_001_mm2_when_manifold' },
                            { op: 'preserve_reference_datums', datums: ['stylus_point', 'pivot_point', 'lp_top_plane'] }
                        ],
                        delta: null,
                        validationTargets: getOnshapeHandoffTarget(s).qualityTargets
                    }
                ]
            }
        };
    }

    function isAIVibeResponse(value) {
        return hasPlainObject(value) && value.schema === AI_VIBE_RESPONSE_SCHEMA;
    }

    function validateAIVibeResponse(value) {
        const errors = [];
        const warnings = [];
        if (!isAIVibeResponse(value)) errors.push('schema must be ' + AI_VIBE_RESPONSE_SCHEMA + '.');
        if (value && value.version !== AI_VIBE_RESPONSE_VERSION) errors.push('version must be ' + AI_VIBE_RESPONSE_VERSION + '.');
        if (!value || typeof value.intent !== 'string' || !value.intent) errors.push('intent must be a non-empty string.');
        if (value && value.intent && value.intent !== DEFAULT_ONSHAPE_INTENT) warnings.push('intent is not the preferred Onshape exact-positive-model intent: ' + value.intent);
        const allowedOps = getAllowedActions().map(a => a.op);
        asArray(value && value.actions).forEach((action, index) => {
            if (!hasPlainObject(action)) {
                errors.push('actions[' + index + '] must be an object.');
                return;
            }
            if (allowedOps.indexOf(action.op) === -1) errors.push('actions[' + index + '].op is not allowed: ' + action.op);
        });
        if (value && value.delta !== null && value.delta !== undefined && !hasPlainObject(value.delta)) {
            errors.push('delta must be null, omitted, or a legacy tonearm-designer-ai-delta object.');
        }
        if (value && !hasPlainObject(value.validationTargets)) warnings.push('validationTargets missing; using current Onshape handoff target.');
        return { ok: errors.length === 0, errors, warnings, response: value };
    }

    function previewAIVibeResponse(value) {
        const validation = validateAIVibeResponse(value);
        const before = runPrintabilityAudit();
        return {
            ok: validation.ok,
            errors: validation.errors,
            warnings: validation.warnings,
            response: value,
            beforeAudit: before,
            plannedActions: asArray(value && value.actions),
            hasLegacyDelta: hasPlainObject(value && value.delta),
            onshapeHandoffTarget: getOnshapeHandoffTarget()
        };
    }

    function getFeatureGraph(source) {
        const s = source || getCurrentState();
        return {
            schema: 'tonearm-designer-semantic-feature-graph-v1',
            root: 'TonearmDesign',
            nodes: [
                { id: 'ArmwandShell', role: 'primary monocoque body', controls: ['apex', 'maxH', 'maxW', 'bow', 'thick', 'canopyRidgeHeight', 'canopyRidgeWidthFraction', 'canopyRidgeSharpness'], current: { apex: s.apex, maxH: s.maxH, maxW: s.maxW, bow: s.bow, thick: s.thick } },
                { id: 'HeadshellPad', role: 'integrated cartridge mounting nose', controls: ['headH', 'headW', 'noseL', 'padL', 'padOffset', 'sculptHeadFlatEnabled', 'sculptHeadFlatStartX', 'sculptHeadFlatEndX', 'sculptHeadBottomZ', 'sculptHeadBlendLength', 'sculptHeadFlatWidthFraction', 'sculptStepSuppressor', 'sculptFrontStiffnessRampEnabled', 'sculptFrontMinHeight', 'sculptFrontRampStartX', 'sculptFrontRampEndX', 'sculptFrontRampTargetHeight', 'sculptFrontTopBias'], current: { headH: s.headH, headW: s.headW, noseL: s.noseL, padL: s.padL, padOffset: s.padOffset, sculptFlat: s.sculptHeadFlatEnabled, flatStartX: s.sculptHeadFlatStartX, flatEndX: s.sculptHeadFlatEndX, flatBottomZ: s.sculptHeadBottomZ, flatBlendLength: s.sculptHeadBlendLength, flatWidthFraction: s.sculptHeadFlatWidthFraction, stepSuppressor: s.sculptStepSuppressor, frontRampEnabled: s.sculptFrontStiffnessRampEnabled, frontMinHeight: s.sculptFrontMinHeight, frontRampStartX: s.sculptFrontRampStartX, frontRampEndX: s.sculptFrontRampEndX, frontRampTargetHeight: s.sculptFrontRampTargetHeight, frontTopBias: s.sculptFrontTopBias } },
                { id: 'TitaniumMountPlate', role: 'TD051 structural laminated interface plate between carbon armwand/integrated headshell and cartridge mounting surface; not a loose underside plate and not headshellSlots.plate', controls: ['titaniumPlateEnabled', 'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass', 'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset', 'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor'], current: { enabled: !!s.titaniumPlateEnabled, length: s.titaniumPlateLength, width: s.titaniumPlateWidth, thickness: s.titaniumPlateThickness, mass: s.titaniumPlateMass, x: s.titaniumPlateX, yOffset: s.titaniumPlateYOffset, zOffset: s.titaniumPlateZOffset } },
                { id: 'CartridgeSlots', role: 'half-inch/M2.5 cartridge adjustment slots using headshellSlots.slotCarrierPlate/reference geometry; semantically separate from TitaniumMountPlate', controls: ['headshellSlots'], current: { mode: 'cobraArchitecture.headshellSlots' } },
                { id: 'InternalWireDuct', role: 'wire clearance intent path', controls: ['wireRouteRadius', 'wireRouteYOffset', 'wireRouteZOffset'], current: { radius: s.wireRouteRadius, y: s.wireRouteYOffset, z: s.wireRouteZOffset } },
                { id: 'RearElbow', role: 'Cobra rear transition and bend', controls: ['rearBendStartX', 'rearBlendLength', 'rearBendDropZ', 'rearBendLength', 'rearMouthWidth', 'rearMouthLength'], current: { startX: s.rearBendStartX, blend: s.rearBlendLength, drop: s.rearBendDropZ, length: s.rearBendLength } },
                { id: 'CounterweightBridge', role: 'explicit rear terminal to disc stack support', controls: ['rearSupportBridgeLength', 'rearSupportBridgeRadius', 'rearSupportBridgeOverlap'], current: { length: s.rearSupportBridgeLength, radius: s.rearSupportBridgeRadius, overlap: s.rearSupportBridgeOverlap } },
                { id: 'CounterweightStack', role: 'rear-terminal downward disc stack balance mass', controls: ['rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount', 'rearWeightDiscMass', 'rearFineTrimScrewMassEquivalent', 'counterweightZOffset'], current: { diameter: s.rearWeightDiscDiameter, thickness: s.rearWeightDiscThickness, count: s.rearWeightDiscCount, massEach: s.rearWeightDiscMass, fineTrimMass: s.rearFineTrimScrewMassEquivalent, zOffset: s.counterweightZOffset } },
                { id: 'OnshapeExactModel', role: '1:1 millimetre exact mesh reference for downstream Onshape modelling', controls: ['exportType', 'manufacturingMode', 'onshapeUnitScale', 'onshapeStrictOneToOne', 'onshapeMetadataSidecar'], current: { exportType: s.exportType, mode: s.manufacturingMode, unitScale: s.onshapeUnitScale, strictOneToOne: s.onshapeStrictOneToOne, sidecar: s.onshapeMetadataSidecar } },
                { id: 'MeshQuality', role: 'closed mesh reference audit for Onshape import', controls: ['aiVibeSoftSliverPass', 'aiVibeMinTriangleHardFailArea', 'onshapeChordToleranceMm'], current: { softSliverPass: s.aiVibeSoftSliverPass, hardFailArea: s.aiVibeMinTriangleHardFailArea, chordToleranceMm: s.onshapeChordToleranceMm } },
                { id: 'LegacyManufacturingIntent', role: 'inactive legacy mould/plug planning fields retained for backward compatibility only', controls: ['aiVibePlugSurfaceOffset', 'aiVibeSandingAllowance', 'aiVibeShrinkagePercent', 'aiVibeDraftDeg', 'aiVibeMouldFlangeWidth'], current: { offset: s.aiVibePlugSurfaceOffset, allowance: s.aiVibeSandingAllowance, shrinkagePercent: s.aiVibeShrinkagePercent, draftDeg: s.aiVibeDraftDeg, flangeWidth: s.aiVibeMouldFlangeWidth } }
            ]
        };
    }

    function classifyRisk(value, low, high) {
        const v = finite(value, 0);
        if (v <= low) return 'low';
        if (v <= high) return 'medium';
        return 'high';
    }

    function runPrintabilityAudit(source) {
        const s = source || getCurrentState();
        const originalExportType = s.exportType;
        const result = {
            schema: 'tonearm-designer-onshape-1to1-audit-v1',
            outputIntent: s.manufacturingMode || 'onshape_1to1',
            currentExportType: originalExportType,
            featureGraph: getFeatureGraph(s),
            audits: {},
            recommendedFixes: []
        };

        if (typeof root.validateExportGeometry === 'function') {
            try {
                result.audits.current = root.validateExportGeometry(originalExportType, s);
            } catch (err) {
                result.audits.current = { isValid: false, errorMsg: err && err.message ? err.message : String(err), metrics: {} };
            }
            try {
                result.audits.solidPlug = root.validateExportGeometry('solid', Object.assign({}, s, { exportType: 'solid' }));
            } catch (err) {
                result.audits.solidPlug = { isValid: false, errorMsg: err && err.message ? err.message : String(err), metrics: {} };
            }
        }

        const metrics = (result.audits.current && result.audits.current.metrics) || {};
        const formAudit = (typeof root.analyzeProfileContinuity === 'function')
            ? root.analyzeProfileContinuity((typeof root.getUnifiedRingCache === 'function') ? root.getUnifiedRingCache() : [], { xMax: Math.min(130, finite(s.apex, 120)) })
            : null;
        const sliverCount = finite(metrics.sliverCount || metrics.finalSliverTriangleCount, 0);
        const minArea = finite(metrics.minTriangleAreaMm2 || metrics.finalMinTriangleAreaMm2, 0);
        const draftViolations = finite(metrics.draftViolations, 0);
        const undercutCount = finite(metrics.undercutCount, 0);
        result.printability = {
            manifold: !(metrics.boundaryEdgeCount > 0 || metrics.nonManifoldEdgeCount > 0 || metrics.finalBoundaryEdgeCount > 0 || metrics.finalNonManifoldEdgeCount > 0),
            sliverTriangles: sliverCount,
            minTriangleAreaMm2: minArea,
            draftViolations,
            undercutCount,
            overhangRisk: classifyRisk(draftViolations, 0, 20),
            supportRemovalRisk: classifyRisk(undercutCount + draftViolations, 0, 20),
            sliverRisk: classifyRisk(sliverCount, 0, 40),
            formContinuityOk: formAudit ? !!formAudit.ok : null,
            formContinuityFailures: formAudit ? formAudit.failures : [],
            formContinuityMetrics: formAudit ? formAudit.metrics : null
        };

        if (formAudit && !formAudit.ok) result.recommendedFixes.push({ op: 'smooth_profile_step', reason: 'Front profile continuity audit failed: ' + formAudit.failures.join('; ') });
        if (sliverCount > 0) result.recommendedFixes.push({ op: 'fix_export_slivers', strategy: 'soft_pass_sub_001_mm2_when_manifold', reason: 'Tiny cap slivers should not block an otherwise closed 1:1 Onshape reference mesh.' });
        if ((s.exportType || '') !== 'onshape_1to1') result.recommendedFixes.push({ op: 'set_onshape_1to1', mode: 'onshape_1to1', reason: 'Downstream Onshape modelling needs a 1:1 millimetre reference mesh with no mould offset, shrinkage or draft modification.' });
        if (finite(s.aiVibePlugSurfaceOffset, 0) !== 0 || finite(s.aiVibeSandingAllowance, 0) !== 0 || finite(s.aiVibeShrinkagePercent, 0) !== 0) result.recommendedFixes.push({ op: 'enforce_exact_1to1', reason: 'Offsets, sanding allowance and shrinkage must be zero for exact Onshape reference export.' });
        if (finite(s.thick, 0) < 1.2) result.recommendedFixes.push({ op: 'stiffen_zone', zone: 'armwand', method: 'increase_wall_to_1_2_minimum' });
        if (finite(s.rearSupportBridgeLength, 0) < 2) result.recommendedFixes.push({ op: 'extend_support_bridge', target: 'counterweight_stack_contact' });
        return result;
    }

    function setInputValue(id, value) {
        const s = getCurrentState();
        const el = root.document ? root.document.getElementById(id) : null;
        const v = finite(value, s[id]);
        s[id] = v;
        if (el) {
            el.value = String(v);
            const valEl = root.document.getElementById('val_' + id);
            if (valEl) valEl.innerText = String(Math.round(v * 1000) / 1000);
        }
    }

    function setCheckboxValue(id, value) {
        const s = getCurrentState();
        const el = root.document ? root.document.getElementById(id) : null;
        const v = !!value;
        s[id] = v;
        if (el) el.checked = v;
    }

    function setSelectValue(id, value) {
        const s = getCurrentState();
        const el = root.document ? root.document.getElementById(id) : null;
        s[id] = value;
        if (el) el.value = value;
    }

    function isCobraRuntimeActive() {
        const s = getCurrentState();
        return !!(s && (s.rearMode === 'cobra_integrated_tail' || s.cobraArchitectureEnabled === true || s.enableCobraArchitecture === true || (s.cobraArchitecture && s.cobraArchitecture.enabled === true)));
    }

    function enforceCobraRuntimeInvariants() {
        if (!isCobraRuntimeActive()) return [];
        const edits = [];
        function setInputMin(id, minValue) {
            const current = finite(getCurrentState()[id], NaN);
            if (!Number.isFinite(current) || current < minValue) {
                setInputValue(id, minValue);
                edits.push({ id, value: minValue });
            }
        }
        setSelectValue('rearMode', 'cobra_integrated_tail');
        setCheckboxValue('cobraArchitectureEnabled', true);
        setCheckboxValue('enableCobraArchitecture', true);
        const s = getCurrentState();
        if (s.cobraArchitecture && typeof s.cobraArchitecture === 'object') s.cobraArchitecture.enabled = true;
        setInputValue('apex', 237);
        setInputValue('cartX', -0.05);
        setInputMin('headH', 5.8);
        setInputMin('neckW', 16);
        setInputMin('rearWeightDiscDiameter', 21);
        setInputMin('rearWeightDiscThickness', 5);
        setInputMin('rearWeightDiscCount', 4);
        setInputMin('rearWeightDiscMass', 22);
        setInputMin('rearFineTrimScrewMassEquivalent', 7);
        setCheckboxValue('includeRearWeightDiscsInExport', true);
        setInputMin('rearSupportBridgeLength', 7);
        setInputMin('rearSupportBridgeRadius', 3.6);
        setInputMin('rearSupportBridgeOverlap', 1.1);
        return edits;
    }

    function applyActions(actions) {
        const applied = [];
        (Array.isArray(actions) ? actions : []).forEach(action => {
            const op = action && action.op;
            if (op === 'activate_cobra_architecture_gate') {
                setCheckboxValue('cobraArchitectureEnabled', true);
                setCheckboxValue('enableCobraArchitecture', true);
                const s = getCurrentState();
                s.cobraArchitectureEnabled = true;
                s.enableCobraArchitecture = true;
                if (s.cobraArchitecture && typeof s.cobraArchitecture === 'object') s.cobraArchitecture.enabled = true;
                applied.push(action);
            } else if (op === 'lock_n1p2') {
                const target = finite(action.targetMm, finite(action.n1p2Mm, finite(action.valueMm, 237.05)));
                setInputValue('apex', target);
                applied.push(action);
            } else if (op === 'fix_export_slivers') {
                setCheckboxValue('aiVibeSoftSliverPass', true);
                setInputValue('aiVibeMinTriangleHardFailArea', 0.00001);
                applied.push(action);
            } else if (op === 'set_onshape_1to1' || op === 'enforce_exact_1to1') {
                setSelectValue('manufacturingMode', 'onshape_1to1');
                setSelectValue('exportType', 'onshape_1to1');
                setInputValue('aiVibePlugSurfaceOffset', 0);
                setInputValue('aiVibeSandingAllowance', 0);
                setInputValue('aiVibeShrinkagePercent', 0);
                setInputValue('aiVibeDraftDeg', 0);
                setInputValue('aiVibeMouldFlangeWidth', 0);
                setInputValue('aiVibeRegistrationPins', 0);
                setInputValue('aiVibeBoltHoles', 0);
                setInputValue('aiVibeVentChannels', 0);
                setInputValue('onshapeUnitScale', 1);
                setCheckboxValue('onshapeStrictOneToOne', true);
                setCheckboxValue('onshapeMetadataSidecar', true);
                applied.push(action);
            } else if (op === 'set_manufacturing_mode' || op === 'optimize_parting_line') {
                setSelectValue('manufacturingMode', action.mode || 'onshape_1to1');
                if ((action.mode || '') === 'onshape_1to1') setSelectValue('exportType', 'onshape_1to1');
                applied.push(action);
            } else if (op === 'add_draft') {
                setInputValue('aiVibeDraftDeg', finite(action.minDeg, 3));
                setInputValue('draftMinDeg', finite(action.minDeg, 3));
                applied.push(action);
            } else if (op === 'stiffen_zone') {
                const zone = String(action.zone || 'armwand');
                if (zone.indexOf('neck') !== -1) {
                    setInputValue('neckW', Math.max(finite(getCurrentState().neckW, 15), finite(action.neckWMin, 17)));
                    setInputValue('canopyRidgeHeight', Math.max(finite(getCurrentState().canopyRidgeHeight, 1.2), finite(action.ridgeHeightMin, 2.0)));
                    setInputValue('thick', Math.max(finite(getCurrentState().thick, 1.2), finite(action.wallMin, 1.7)));
                } else if (zone.indexOf('rear') !== -1) {
                    setInputValue('rearSupportBridgeRadius', Math.max(finite(getCurrentState().rearSupportBridgeRadius, 1.25), finite(action.bridgeRadiusMin, 1.6)));
                    setInputValue('tailD', Math.max(finite(getCurrentState().tailD, 12), finite(action.tailDMin, 12)));
                    setInputValue('thick', Math.max(finite(getCurrentState().thick, 1.2), finite(action.wallMin, 1.6)));
                } else {
                    setInputValue('thick', Math.max(finite(getCurrentState().thick, 1.2), finite(action.wallMin, 1.6)));
                    setInputValue('canopyRidgeHeight', Math.max(finite(getCurrentState().canopyRidgeHeight, 1.2), finite(action.ridgeHeightMin, 1.8)));
                }
                applied.push(action);
            } else if (op === 'balance_about_pivot') {
                setCheckboxValue('includeRearWeightDiscsInExport', true);
                setInputValue('rearWeightDiscCount', Math.max(1, Math.round(finite(getCurrentState().rearWeightDiscCount, 4))));
                applied.push(action);
            } else if (op === 'extend_support_bridge') {
                setInputValue('rearSupportBridgeLength', Math.max(finite(getCurrentState().rearSupportBridgeLength, 2), finite(action.lengthMm, 2.5)));
                setInputValue('rearSupportBridgeOverlap', Math.max(finite(getCurrentState().rearSupportBridgeOverlap, 0.25), finite(action.overlapMm, 0.3)));
                applied.push(action);
            } else if (op === 'flatten_headshell_underside' || (op === 'sculpt_surface_zone' && (action.zone === 'headshell_underside' || action.surface === 'headshell_underside'))) {
                const currentHeadH = finite(getCurrentState().headH, 6);
                const currentPadL = finite(getCurrentState().padL, 30);
                const targetZ = Number.isFinite(Number(action.zMm)) ? Number(action.zMm) : (Number.isFinite(Number(action.bottomZMm)) ? Number(action.bottomZMm) : -currentHeadH / 2);
                setInputValue('sculptHeadFlatEnabled', 1);
                setInputValue('sculptHeadFlatStartX', Number.isFinite(Number(action.startX)) ? Number(action.startX) : 0);
                setInputValue('sculptHeadFlatEndX', Number.isFinite(Number(action.endX)) ? Number(action.endX) : currentPadL);
                setInputValue('sculptHeadBottomZ', targetZ);
                setInputValue('sculptHeadBlendLength', Number.isFinite(Number(action.blendLengthMm)) ? Math.max(Number(action.blendLengthMm), 24) : 24);
                setInputValue('sculptHeadFlatWidthFraction', Number.isFinite(Number(action.widthFraction)) ? Number(action.widthFraction) : 0.70);
                setInputValue('sculptStepSuppressor', 1);
                setInputValue('sculptFrontStiffnessRampEnabled', 1);
                if (Number.isFinite(Number(action.minHeightMm))) setInputValue('sculptFrontMinHeight', Number(action.minHeightMm));
                else setInputValue('sculptFrontMinHeight', Math.max(finite(getCurrentState().sculptFrontMinHeight, 5.8), 5.8));
                if (Number.isFinite(Number(action.rampEndX))) setInputValue('sculptFrontRampEndX', Math.max(Number(action.rampEndX), 86));
                if (Number.isFinite(Number(action.targetHeightMm))) setInputValue('sculptFrontRampTargetHeight', Number(action.targetHeightMm));
                setInputValue('padOffset', 0);
                applied.push(action);
            } else if (op === 'smooth_profile_step') {
                setInputValue('sculptStepSuppressor', Number.isFinite(Number(action.strength)) ? Number(action.strength) : 1);
                setInputValue('sculptHeadBlendLength', Math.max(finite(getCurrentState().sculptHeadBlendLength, 12), Number.isFinite(Number(action.blendLengthMinMm)) ? Number(action.blendLengthMinMm) : 22));
                setInputValue('sculptFrontStiffnessRampEnabled', 1);
                setInputValue('sculptFrontRampEndX', Math.max(finite(getCurrentState().sculptFrontRampEndX, 86), Number.isFinite(Number(action.rampEndXMinMm)) ? Number(action.rampEndXMinMm) : 86));
                setInputValue('sculptFrontMinHeight', Math.max(finite(getCurrentState().sculptFrontMinHeight, 5.8), Number.isFinite(Number(action.minHeightMm)) ? Number(action.minHeightMm) : 5.8));
                setInputValue('sculptFrontRampTargetHeight', Math.max(finite(getCurrentState().sculptFrontRampTargetHeight, 10), Number.isFinite(Number(action.targetHeightMm)) ? Number(action.targetHeightMm) : 10));
                if (Number.isFinite(Number(action.neckLengthMinMm))) setInputValue('neckL', Math.max(finite(getCurrentState().neckL, 45), Number(action.neckLengthMinMm)));
                if (Number.isFinite(Number(action.ridgeHeightMaxMm))) setInputValue('canopyRidgeHeight', Math.min(finite(getCurrentState().canopyRidgeHeight, 1.4), Number(action.ridgeHeightMaxMm)));
                applied.push(action);
            } else if (op === 'stiffen_front_ramp' || (op === 'sculpt_surface_zone' && (action.zone === 'front_stiffness_ramp' || action.surface === 'front_stiffness_ramp'))) {
                setInputValue('sculptFrontStiffnessRampEnabled', 1);
                setInputValue('sculptFrontRampStartX', Number.isFinite(Number(action.startX)) ? Number(action.startX) : 0);
                setInputValue('sculptFrontRampEndX', Number.isFinite(Number(action.endX)) ? Math.max(Number(action.endX), 86) : 86);
                setInputValue('sculptFrontMinHeight', Number.isFinite(Number(action.minHeightMm)) ? Number(action.minHeightMm) : 5.8);
                setInputValue('sculptFrontRampTargetHeight', Number.isFinite(Number(action.targetHeightMm)) ? Number(action.targetHeightMm) : 10.0);
                setInputValue('sculptFrontTopBias', Number.isFinite(Number(action.topBias)) ? Number(action.topBias) : 0.95);
                setInputValue('sculptStepSuppressor', 1);
                applied.push(action);
            } else if (op === 'normalize_onshape_handoff' || op === 'preserve_reference_datums') {
                setSelectValue('manufacturingMode', 'onshape_1to1');
                setSelectValue('exportType', 'onshape_1to1');
                setInputValue('onshapeUnitScale', 1);
                setCheckboxValue('onshapeStrictOneToOne', true);
                setCheckboxValue('onshapeMetadataSidecar', true);
                applied.push(action);
            }
        });
        const invariantEdits = enforceCobraRuntimeInvariants();
        if (typeof root.rebuild === 'function') root.rebuild();
        return { applied, invariantEdits };
    }

    function downloadJSON(obj, filename) {
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 200);
    }

    function installUI() {
        const auditBtn = document.getElementById('aiVibeAuditBtn');
        const defaultsBtn = document.getElementById('aiVibeSafePlugBtn');
        const jsonBtn = document.getElementById('aiVibeJsonBtn');
        const status = document.getElementById('aiVibeStatus');
        if (auditBtn) auditBtn.addEventListener('click', () => {
            const audit = runPrintabilityAudit();
            if (status) {
                const p = audit.printability || {};
                status.textContent = 'Audit: manifold=' + p.manifold + ', slivers=' + p.sliverTriangles + ', minArea=' + p.minTriangleAreaMm2 + ', fixes=' + audit.recommendedFixes.length;
            }
            root.LAST_AI_VIBE_3D_AUDIT = audit;
        });
        if (defaultsBtn) defaultsBtn.addEventListener('click', () => {
            applyActions([
                { op: 'set_onshape_1to1', mode: 'onshape_1to1' },
                { op: 'fix_export_slivers', strategy: 'soft_pass_sub_001_mm2_when_manifold' },
                { op: 'stiffen_zone', zone: 'armwand' }
            ]);
            if (status) status.textContent = 'Applied Onshape 1:1 defaults; exportType=onshape_1to1, unit scale=1 mm, offsets/shrinkage/draft=0, sidecar metadata enabled.';
        });
        if (jsonBtn) jsonBtn.addEventListener('click', () => {
            const audit = runPrintabilityAudit();
            root.LAST_AI_VIBE_3D_AUDIT = audit;
            downloadJSON(audit, 'tonearm_ai_vibe_3d_audit.json');
        });
    }

    root.AIVibe3D = Object.freeze({
        getFeatureGraph,
        runPrintabilityAudit,
        applyActions,
        getAllowedActions,
        getOnshapeHandoffTarget,
        buildAIModalContext,
        isAIVibeResponse,
        validateAIVibeResponse,
        previewAIVibeResponse
    });

    if (root.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUI);
        else installUI();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
