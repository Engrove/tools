/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F ai-modal.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * AI Modal v1.
 *
 * Non-destructive integration layer:
 * - no Cobra CAD geometry generation; only reads Session cobraArchitecture when present
 * - no changes to inputs/selects/checkboxes/flags registries
 * - no changes to geometry, render2d or render3d
 * - applyAIDelta writes allowed values to DOM controls and calls updateState()
 */
(function() {
    const AI_DELTA_SCHEMA = 'tonearm-designer-ai-delta';
    const AI_DELTA_VERSION = 1;
    const APP_VERSION = (window.Session && window.Session.APP_VERSION) ? window.Session.APP_VERSION : 'V28.8.0-Fas20-AIResponseApplyRuntime';
    const MODEL_FAMILIES = ['shape_designer', 'tonearm_3d_form', 'cobra_tonearm', 'ai_vibe_3d_onshape', 'freeform_centerline_ring_loft', 'custom'];
    const STANDARD_STATION_SAMPLE_COUNT = 64;
    const MAX_STATION_SAMPLE_COUNT = 96;
    const TARGET_ONLY_NOT_CURRENT_GEOMETRY = Object.freeze([
        'optional_counterweight_detailing',
        'cobra_specific_canopy_curve',
        'cobraCanopyRidge',
        'finalCadFeaDetails'
    ]);
    const MISSING_GEOMETRY_GATE = 'When the user requests Cobra-specific geometry that is not exposed as dedicated controls (anti-skate, final CAD/FEA details, etc), DO NOT return an empty delta. Implement the best possible partial approximation using available protected/core geometry controls where appropriate and list unsupported non-canonical details in unsupportedAttributes. rearWeightDisc*/rearFineTrim*/counterweightZOffset controls are the canonical rear-terminal top-anchored downward disc-stack counterweight path; canopy ridge, local headshell-slot CSG and sapphire swash-plate geometry are supported in this branch.';
    const SHAPE_CONTEXT_INSTRUCTION = 'You cannot see the canvas. Use shapeFormContext.computedShapeFacts as the primary current-form summary and shapeFormContext.canonicalShapeProfileContext only as supporting raw profile evidence.';
    const AI_VIBE_RESPONSE_SCHEMA = 'tonearm-designer-ai-vibe-3d-response';
    const AI_VIBE_RESPONSE_VERSION = 1;


    const SLIDER_EFFECT_MAP = Object.freeze({
        noseL: { effect: 'lengthens/shortens the front nose', cobraPriority: false },
        padOffset: { effect: 'shifts pad/stylus support relation in the side profile', cobraPriority: false },
        headW: { effect: 'widens/narrows the headshell in top view', cobraPriority: false },
        padL: { effect: 'changes pad/headshell support length', cobraPriority: false },
        headH: { effect: 'changes front/headshell height', cobraPriority: false },
        sculptHeadFlatEnabled: { effect: 'enables exact planar headshell underside sculpting', cobraPriority: false },
        sculptHeadFlatStartX: { effect: 'sets the start of the planar headshell underside zone', cobraPriority: false },
        sculptHeadFlatEndX: { effect: 'sets the end of the planar headshell underside zone', cobraPriority: false },
        sculptHeadBottomZ: { effect: 'sets the local Z plane for the headshell underside', cobraPriority: false },
        sculptHeadBlendLength: { effect: 'sets the smooth blend length from flat headshell underside into the neck', cobraPriority: false },
        sculptHeadFlatWidthFraction: { effect: 'sets how much of the section width is truly planar on the underside', cobraPriority: false },
        sculptStepSuppressor: { effect: 'suppresses local side-profile steps and abrupt stiffness transitions', cobraPriority: false },
        sculptFrontStiffnessRampEnabled: { effect: 'enables a minimum-height front stiffness ramp from headshell into early armwand', cobraPriority: false },
        sculptFrontMinHeight: { effect: 'sets minimum headshell/front section height to avoid ribbon-thin beam behavior', cobraPriority: false },
        sculptFrontRampStartX: { effect: 'sets where the front stiffness-height ramp starts', cobraPriority: false },
        sculptFrontRampEndX: { effect: 'sets where the front stiffness-height ramp reaches target height', cobraPriority: false },
        sculptFrontRampTargetHeight: { effect: 'sets target section height at the end of the front stiffness ramp', cobraPriority: false },
        sculptFrontTopBias: { effect: 'controls whether added front ramp height grows upward from the flat underside or around the old profile', cobraPriority: false },
        neckW: { effect: 'changes neck width and the slenderness of the transition', cobraPriority: false },
        neckL: { effect: 'changes transition length from headshell to body', cobraPriority: false },
        asym: { effect: 'changes asymmetric body bias', cobraPriority: false },
        apex: { effect: 'moves the widest/highest main body point along x', cobraPriority: false },
        maxH: { effect: 'changes main body height', cobraPriority: false },
        maxW: { effect: 'changes main body width', cobraPriority: false },
        bow: { effect: 'changes longitudinal curvature/bow of the body', cobraPriority: false },
        thick: { effect: 'changes wall/body thickness impression', cobraPriority: false },
        rearBlendLength: { effect: 'sets length of transition into rear/tail form', cobraPriority: true },
        rearBendStartX: { effect: 'sets where the Cobra rear bend begins', cobraPriority: true },
        rearBendDropZ: { effect: 'sets vertical Cobra elbow drop', cobraPriority: true },
        rearBendLength: { effect: 'sets bend radius/length impression of the Cobra elbow', cobraPriority: true },
        rearMouthWidth: { effect: 'sets Cobra mouth outer width', cobraPriority: true },
        rearMouthLength: { effect: 'sets Cobra mouth outer length', cobraPriority: true },
        bulge: { effect: 'sets rear/main body fullness', cobraPriority: true },
        tailD: { effect: 'sets protected rear terminal / tail-diameter geometry, not a counterweight mount proxy', cobraPriority: true }
    });

    const AI_MODAL_STATE = {
        modelFamily: 'shape_designer',
        lastValidation: null,
        lastShape3D: null,
        lastPromptCharCount: 0,
        lastPromptFamily: null,
        lastPromptRearMode: null,
        lastPromptCobraActive: null,
        lastPromptBuiltAt: null,
        lastPromptStationCount: 0,
        lastPromptShapeContextIncluded: false,
        lastPromptSignature: null,
        lastApplyResult: null,
        lastSelfTestResult: null,
        lastGeneratedDelta: null,
        lastSmokeReportText: ''
    };

    const SHAPE_CONTROL_ZONES = Object.freeze({
        front_headshell: Object.freeze({
            label: 'Integrated headshell / nose / titanium interface',
            ids: Object.freeze(['padOffset', 'noseL', 'headW', 'padL', 'headH', 'sculptHeadFlatEnabled', 'sculptHeadFlatStartX', 'sculptHeadFlatEndX', 'sculptHeadBottomZ', 'sculptHeadBlendLength', 'sculptHeadFlatWidthFraction', 'sculptStepSuppressor', 'sculptFrontStiffnessRampEnabled', 'sculptFrontMinHeight', 'sculptFrontRampStartX', 'sculptFrontRampEndX', 'sculptFrontRampTargetHeight', 'sculptFrontTopBias', 'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass', 'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset', 'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor']),
            explanation: 'Controls the front pad, nose length, integrated headshell silhouette, TD047 exact planar underside sculpting, TD048 front stiffness-ramp continuity and TD051 titanium interface plate. Cobra target: purposeful cartridge interface and layup-friendly nose/neck transition, not a random bulb and not a loose underside plate.'
        }),
        neck_transition: Object.freeze({
            label: 'Neck / transition',
            ids: Object.freeze(['neckW', 'neckL', 'asym']),
            explanation: 'Controls the narrowed bridge from integrated headshell into the monocoque armwand.'
        }),
        main_body: Object.freeze({
            label: 'Monocoque armwand / canopy',
            ids: Object.freeze(['apex', 'maxH', 'maxW', 'bow', 'thick', 'canopyRidgeHeight', 'canopyRidgeWidthFraction', 'canopyRidgeSharpness']),
            explanation: 'Controls the long low main armwand canopy, height, width, curvature and shell thickness. Cobra target: sleek monocoque, not inflated worm/blob volume.'
        }),
        rear_tail_cobra: Object.freeze({
            label: 'Protected rear transition / terminal geometry',
            ids: Object.freeze(['rearBlendLength', 'rearBendStartX', 'rearBendDropZ', 'rearBendLength', 'rearMouthWidth', 'rearMouthLength', 'bulge', 'tailD']),
            explanation: 'Protected TD026 core geometry controls for the rear blend, bend, mouth and actual rear terminal continuation. In Cobra mode this remains armwand/rear-terminal geometry; the canonical rear-terminal top-anchored downward disc-stack counterweight is controlled separately by rearWeightDisc*/rearFineTrim*.'
        }),
        counterweight_accessory: Object.freeze({
            label: 'Canonical rear-terminal disc stack counterweight',
            ids: Object.freeze(['rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount', 'rearWeightDiscMass', 'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent', 'counterweightZOffset', 'rearSupportBridgeLength', 'rearSupportBridgeRadius', 'rearSupportBridgeOverlap']),
            explanation: 'Controls the canonical counterweight = rear-terminal top-anchored downward disc stack. rearWeightDisc*, rearFineTrim* and counterweightZOffset fields are the active canonical Cobra counterweight controls in this branch. Counterweight Z balance uses vertical offset, not negative mass.'
        })
    });

    const SHAPE_CONTROL_ID_TO_ZONE = (function() {
        const map = {};
        Object.keys(SHAPE_CONTROL_ZONES).forEach(zoneKey => {
            SHAPE_CONTROL_ZONES[zoneKey].ids.forEach(id => { map[id] = zoneKey; });
        });
        return Object.freeze(map);
    })();

    const SELECT_CONTROL_DESCRIPTIONS = Object.freeze({
        exportType: 'Export body type; context for manufacturing/export, not a primary shape edit.',
        exportFormat: 'Export file format; context only for AI shape design.',
        rearMode: 'First-class rear body form selector. classic_tail = Classic Tail; cobra_integrated_tail = Hollow Elbow / Cobra integrated rear tonearm body form. It is not LT Mechanism. Suggest changing it only when the user explicitly asks for Cobra/Hollow Elbow or classic rear form.',
        material: 'Material preset used by mass/physics estimates; not a direct body-shape slider.',
        cartMode: 'Cartridge preset/mode; context for cartridge and physics calculations.',
        alignmentPreset: 'Tracking alignment preset; context for geometry/kinematics, not a body-sculpting control.',
        renderMode: 'Viewport render style; visual display context only.',
        manufacturingMode: 'AI Vibe 3D output intent; Onshape 1:1 keeps scale exact and disables mould/plug compensation.'
    });

    const CHECKBOX_CONTROL_DESCRIPTIONS = Object.freeze({
        showRearCG: 'Display rear center-of-gravity marker.',
        showNeutralLine: 'Display neutral line reference.',
        showTowerClearance: 'Display tower clearance guide.',
        includeRearWeightDiscsInExport: 'Include rear weight discs in exported geometry.',
        showRearWeights: 'Display rear weight discs/accessories.',
        showFineTrimScrew: 'Display fine trim screw accessory.',
        showVerticalPivot: 'Display vertical pivot marker.',
        showTotalCOM: 'Display total center of mass.',
        showRearCOM: 'Display rear center of mass.',
        showCounterweightCOM: 'Display counterweight center of mass.',
        showCartridgeCOM: 'Display cartridge center of mass.',
        showInertiaAxes: 'Display inertia axes.',
        showMeasureLines: 'Display measurement lines.',
        showForce: 'Display static imbalance/load-equivalent overlay.',
        showMass: 'Display mass visualization/values.',
        aiVibeSoftSliverPass: 'Allow tiny manifold slivers below hard-fail threshold when the mesh is otherwise closed and non-degenerate.',
        onshapeMetadataSidecar: 'Download JSON sidecar with session, units, scale, datums and export validation metadata.',
        onshapeStrictOneToOne: 'Enforce exact 1:1 millimetre Onshape reference model behaviour.',
        showInternalWireRoute: 'Display internal wire-route clearance guide.',
        cobraArchitectureEnabled: 'Enable Cobra architecture gate for Cobra acceptance/report paths.',
        enableCobraArchitecture: 'Alias checkbox for Cobra architecture gate; synchronized with cobraArchitectureEnabled.',
        titaniumPlateEnabled: 'Enable the TD051 structural titanium interface plate. This is not headshellSlots.plate and not a loose underside cartridge plate.'
    });

    const FLAG_CONTROL_DESCRIPTIONS = Object.freeze({
        isEstimatedC10: 'Compliance C10 estimate flag used by the physics/resonance panel; not a body-shape control.'
    });

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getParameterMetadata(id) {
        return window.ParameterMetadata && typeof window.ParameterMetadata.get === 'function'
            ? window.ParameterMetadata.get(id)
            : null;
    }

    function getParameterMetadataPromptSummary() {
        return window.ParameterMetadata && typeof window.ParameterMetadata.promptSummary === 'function'
            ? window.ParameterMetadata.promptSummary()
            : null;
    }

    const AI_MODAL_SCULPT_INPUT_IDS = Object.freeze([
        'padOffset', 'noseL', 'headW', 'padL', 'headH',
        'sculptHeadFlatEnabled', 'sculptHeadFlatStartX', 'sculptHeadFlatEndX',
        'sculptHeadBottomZ', 'sculptHeadBlendLength', 'sculptHeadFlatWidthFraction',
        'sculptStepSuppressor', 'sculptFrontStiffnessRampEnabled', 'sculptFrontMinHeight',
        'sculptFrontRampStartX', 'sculptFrontRampEndX', 'sculptFrontRampTargetHeight',
        'sculptFrontTopBias', 'neckW', 'neckL', 'asym',
        'maxH', 'maxW', 'bow', 'thick', 'canopyRidgeHeight',
        'canopyRidgeWidthFraction', 'canopyRidgeSharpness',
        'rearBlendLength', 'rearBendStartX', 'rearBendDropZ', 'rearBendLength',
        'rearMouthWidth', 'rearMouthLength', 'bulge', 'tailD',
        'rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount',
        'rearWeightDiscMass', 'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent',
        'counterweightZOffset', 'rearSupportBridgeLength', 'rearSupportBridgeRadius',
        'rearSupportBridgeOverlap', 'titaniumPlateLength', 'titaniumPlateWidth',
        'titaniumPlateThickness', 'titaniumPlateMass', 'titaniumPlateX',
        'titaniumPlateYOffset', 'titaniumPlateZOffset', 'titaniumAdhesiveThickness',
        'titaniumAdhesiveDampingLossFactor'
    ]);

    const AI_MODAL_PROTECTED_INVARIANT_INPUT_IDS = Object.freeze([
        'apex', 'cartX', 'pivotSpindle', 'customMass', 'customZ', 'comp10', 'comp100',
        'compK', 'nomStylusX', 'pivotOffsetX', 'pivotOffsetY', 'pivotOffsetZ',
        'verticalPivotHeightAboveLP', 'armBodyDatumOffsetZ', 'targetEffectiveMass',
        'targetLFResonance', 'targetVTF', 'targetFirstBendingMode',
        'aiVibePlugSurfaceOffset', 'aiVibeSandingAllowance', 'aiVibeDraftDeg',
        'aiVibeMouldFlangeWidth', 'aiVibeRegistrationPins', 'aiVibeBoltHoles',
        'aiVibeVentChannels', 'aiVibeShrinkagePercent', 'onshapeUnitScale',
        'onshapeChordToleranceMm', 'meshSegments', 'meshStepX', 'draftMinDeg'
    ]);

    function aiSculptInputIdsFromMetadata() {
        const ids = (window.ParameterMetadata && typeof window.ParameterMetadata.aiWritableIds === 'function')
            ? window.ParameterMetadata.aiWritableIds()
            : ((typeof inputs !== 'undefined' && Array.isArray(inputs)) ? inputs.slice() : []);
        return ids.filter(id => AI_MODAL_SCULPT_INPUT_IDS.indexOf(id) !== -1);
    }

    function getAllowedInputs() {
        return aiSculptInputIdsFromMetadata();
    }

    function getAllowedSelects() {
        // TD049: legacy AI deltas are sparse shape patches only. Export/rearMode
        // selectors are changed by semantic AI Vibe actions and apply-time invariants,
        // not by copied full-state passthrough.
        return [];
    }

    function getAllowedCheckboxes() {
        // TD049: checkboxes mostly control display/export diagnostics and Cobra gates.
        // They are protected from external full-state deltas; semantic actions may still
        // set exact Onshape/Cobra invariants through trusted runtime code.
        return [];
    }

    function getCurrentSession() {
        if (window.Session && typeof window.Session.collect === 'function') {
            return window.Session.collect('');
        }
        return {
            schema: 'tonearm-designer-session',
            version: 1,
            app: APP_VERSION,
            timestamp: new Date().toISOString(),
            name: '',
            inputs: {},
            selects: {},
            checkboxes: {},
            flags: {},
            cobraArchitecture: (window.CobraArchitecture && typeof window.CobraArchitecture.getCobraArchitecture === 'function')
                ? window.CobraArchitecture.getCobraArchitecture()
                : { enabled: false }
        };
    }

    function getCobraArchitectureContract(session) {
        if (window.CobraArchitecture && typeof window.CobraArchitecture.getCobraArchitecture === 'function') {
            return window.CobraArchitecture.getCobraArchitecture((session && session.cobraArchitecture) ? { cobraArchitecture: session.cobraArchitecture } : undefined);
        }
        return (session && session.cobraArchitecture) || { enabled: false };
    }

    function getCobraCapabilityManifestForPrompt() {
        if (window.CobraArchitecture && typeof window.CobraArchitecture.getCobraCapabilityManifest === 'function') {
            return window.CobraArchitecture.getCobraCapabilityManifest();
        }
        if (typeof window.getCobraCapabilityManifest === 'function') return window.getCobraCapabilityManifest();
        return null;
    }

    function isArchitectureAIResultObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value) &&
            typeof value.status === 'string' &&
            Object.prototype.hasOwnProperty.call(value, 'delta');
    }

    function validateAIArchitectureGate(resultOrDelta, session, context) {
        if (window.AICapabilityGate && typeof window.AICapabilityGate.validateCobraDeltaCapability === 'function') {
            const opts = Object.assign({ session: session || getCurrentSession() }, context || {});
            return window.AICapabilityGate.validateCobraDeltaCapability(resultOrDelta, opts);
        }
        return { status: 'ok', mustDevelopModules: [], unmetRequirements: [], delta: resultOrDelta };
    }

    function getBrowserUserAgent() {
        if (typeof navigator !== 'undefined' && navigator.userAgent) return navigator.userAgent;
        return 'unknown';
    }

    function expectedSessionKeys() {
        return ['schema', 'version', 'app', 'timestamp', 'name', 'inputs', 'selects', 'checkboxes', 'flags', 'cobraArchitecture'];
    }

    function checkSessionClean(session) {
        const s = session || getCurrentSession();
        const forbidden = ['ltMechanismState', 'ltSolverState', 'ltAutoFixState', 'ltAnimationState', 'ltVisualizerState', 'ltSolverDebug', 'dynamicSvgOverlayState', 'sourceSvgAnimationState', 'adaptivePrompt', 'rolePrompt', 'domainContext', 'parameterMetadata', 'exactControl', 'shape3d', 'aiPrompt', 'zoneMap', 'modelFamily', 'smokeReport', 'browserSmokeAssistant'];
        const topKeys = Object.keys(s || {});
        return {
            ok: s && s.schema === 'tonearm-designer-session' && forbidden.every(key => topKeys.indexOf(key) === -1),
            schema: s ? s.schema : null,
            topKeys,
            forbiddenFound: forbidden.filter(key => topKeys.indexOf(key) !== -1),
            expectedOnly: expectedSessionKeys()
        };
    }

    function uniqueZones(zones) {
        const seen = {};
        const result = [];
        (zones || []).forEach(zone => {
            if (!zone || !zone.tag || seen[zone.tag]) return;
            seen[zone.tag] = true;
            result.push(zone);
        });
        return result;
    }

    function zonesForFamily(zoneMap, modelFamily) {
        const map = zoneMap || window.ZONE_MAP || { common: [], families: {} };
        const common = Array.isArray(map.common) ? map.common : [];
        const familyZones = (map.families && Array.isArray(map.families[modelFamily]))
            ? map.families[modelFamily]
            : [];

        // Cobra uses a dedicated semantic map. It must not be the generic/common map with
        // a different label, because the AI prompt and zone clicks must describe the
        // rear bend, elbow drop, mouth and tail as first-class tonearm form regions.
        if (modelFamily === 'cobra_tonearm' && familyZones.length) return uniqueZones(familyZones);

        return uniqueZones(common.concat(familyZones));
    }

    function modelFamilyLabel(modelFamily) {
        if (modelFamily === 'cobra_tonearm') return 'Cobra / Hollow Elbow tonearm';
        if (modelFamily === 'tonearm_3d_form') return 'Tonearm 3D Form';
        if (modelFamily === 'ai_vibe_3d_onshape') return 'AI Vibe 3D / Onshape handoff';
        if (modelFamily === 'freeform_centerline_ring_loft') return 'AI Vibe 3D Freeform Loft';
        if (modelFamily === 'custom') return 'Custom shape delta';
        return 'Shape Designer';
    }

    function rearModeLabel(value) {
        if (value === 'cobra_integrated_tail') return 'Cobra integrated tail';
        if (value === 'classic_tail') return 'Classic Tail';
        return value || 'unknown';
    }

    function isCobraModelFamily(modelFamily) {
        return modelFamily === 'cobra_tonearm';
    }

    function zoneTagSet(zones) {
        const set = {};
        (zones || []).forEach(zone => {
            if (zone && zone.tag) set[zone.tag] = true;
        });
        return set;
    }

    function zoneDuplicateTags(zones) {
        const seen = {};
        const dupes = {};
        (zones || []).forEach(zone => {
            if (!zone || !zone.tag) return;
            if (seen[zone.tag]) dupes[zone.tag] = true;
            seen[zone.tag] = true;
        });
        return Object.keys(dupes);
    }

    function countZoneTag(zones, tag) {
        return (zones || []).filter(zone => zone && zone.tag === tag).length;
    }

    function ltOnlyZonesForFamily(zoneMap, modelFamily) {
        const map = zoneMap || window.ZONE_MAP || { lt: [], common: [], families: {} };
        const zones = zonesForFamily(map, modelFamily);
        const commonTags = zoneTagSet(map.common || []);
        return zones.filter(zone => zone && zone.tag && !commonTags[zone.tag]);
    }

    function familyModeHint(modelFamily) {
        if (modelFamily === 'tonearm_3d_form') {
            return 'tonearm_3d_form: refine the visible 3D body form using safe left-panel shape controls.';
        }
        if (modelFamily === 'cobra_tonearm') {
            return 'cobra_tonearm: Cobra / Hollow Elbow rear/body form mode. Prioritize rear bend start, elbow drop, Cobra mouth and integrated tail/body controls. This is not LT Mechanism.';
        }
        if (modelFamily === 'ai_vibe_3d_onshape') {
            return 'ai_vibe_3d_onshape: AI Modal orchestrates semantic actions, strict 1:1 Onshape handoff, feature graph, audit and optional legacy delta.';
        }
        if (modelFamily === 'custom') {
            return 'custom: custom body-shape refinement using only listed controls and current runtime bounds.';
        }
        return 'shape_designer: default 3D tonearm body shape mode. Prefer small slider edits in front, neck, main body and rear/tail zones; Cobra remains available only through rearMode.';
    }

    function refreshFamilySummary() {
        const map = window.ZONE_MAP || { common: [], families: {} };
        const family = AI_MODAL_STATE.modelFamily;
        const session = getCurrentSession();
        const zones = zonesForFamily(map, family);
        const duplicates = zoneDuplicateTags(zones);
        const shapeFields = shapePriorityGroups();
        const cobraStatus = buildCobraModeStatus(session, family);

        const summaryEl = $('aiFamilySummary');
        if (summaryEl) {
            summaryEl.textContent = [
                'AI profile: ' + cobraStatus.aiProfile,
                'selected modelFamily: ' + family,
                'Actual rearMode: ' + cobraStatus.actualRearModeLabel + ' (' + cobraStatus.actualRearMode + ')',
                'Cobra active: ' + cobraStatus.cobraActive,
                'Status: ' + cobraStatus.message,
                'zone count: ' + zones.length + (family === 'cobra_tonearm' ? ' (Cobra semantic overlay tags)' : ''),
                'duplicate tag count: ' + duplicates.length,
                'shape groups: ' + shapeFields.map(group => group.label + ' [' + group.fields.join(', ') + ']').join(' | ')
            ].join('\n');
        }

        const hintEl = $('aiFamilyModeHint');
        if (hintEl) {
            hintEl.className = 'ai-family-hint' + (family === 'custom' ? ' custom' : '') + (family === 'cobra_tonearm' ? ' cobra' : '');
            hintEl.textContent = familyModeHint(family);
        }

        const cobraEl = $('aiCobraModeStatus');
        if (cobraEl) {
            cobraEl.hidden = false;
            cobraEl.className = 'ai-cobra-mode-status ' + (cobraStatus.status || 'ok');
            cobraEl.textContent = [
                'AI profile: ' + cobraStatus.aiProfile,
                'Actual rearMode: ' + cobraStatus.actualRearModeLabel,
                'Status: ' + cobraStatus.message,
                cobraStatus.safeAction
            ].join('\n');
        }

        const cobraBtn = $('aiActivateCobraRearModeBtn');
        if (cobraBtn) {
            cobraBtn.hidden = !(family === 'cobra_tonearm' && !cobraStatus.cobraActive);
        }

        const ltEl = $('aiLtOnlyZones');
        if (ltEl) {
            ltEl.textContent = '';
            ltEl.hidden = true;
        }

        renderLTSolverPreview(false);
        return {
            modelFamily: family,
            zoneCount: zones.length,
            duplicateTagCount: duplicates.length,
            duplicateTags: duplicates,
            shapePriorityGroups: shapeFields,
            cobraStatus
        };
    }

    function renderLTSolverPreview(showStatus) {
        const panel = $('aiLtSolverPreviewPanel');
        const host = $('aiLtSolverPreview');
        if (panel) panel.hidden = true;
        if (host) host.textContent = 'LT mechanism preview is intentionally not part of the AI Shape Designer.';
        if (showStatus) setStatus('info', 'AI Shape Designer does not use LT mechanism preview context.');
        return { visible: false, solverStatus: 'not_in_shape_designer', ok: true };
    }

    function insertAtCursor(textarea, text) {
        if (!textarea) return;
        const before = textarea.value.slice(0, textarea.selectionStart || 0);
        const after = textarea.value.slice(textarea.selectionEnd || 0);
        const needsLeadingSpace = before && !/\s$/.test(before);
        const needsTrailingSpace = after && !/^\s/.test(after);
        const insertion = (needsLeadingSpace ? ' ' : '') + text + (needsTrailingSpace ? ' ' : '');
        const start = (textarea.selectionStart || 0) + insertion.length;
        textarea.value = before + insertion + after;
        textarea.focus();
        textarea.setSelectionRange(start, start);
    }

    function round3(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.round(n * 1000) / 1000;
    }

    function sessionInput(session, key, fallback) {
        const inputsMap = session && session.inputs ? session.inputs : {};
        const v = Number(inputsMap[key]);
        if (Number.isFinite(v)) return v;
        if (typeof state !== 'undefined' && Number.isFinite(Number(state[key]))) return Number(state[key]);
        return fallback;
    }

    function availableShapeLength(session) {
        if (typeof GLOBAL_RINGSCache !== 'undefined' && Array.isArray(GLOBAL_RINGSCache) && GLOBAL_RINGSCache.length) {
            const last = GLOBAL_RINGSCache[GLOBAL_RINGSCache.length - 1];
            if (last && last.center && Number.isFinite(last.center.x)) return last.center.x;
            if (last && Number.isFinite(last.virtualX)) return last.virtualX;
        }
        if (typeof LENGTH !== 'undefined' && Number.isFinite(Number(LENGTH))) return Number(LENGTH);
        return Math.max(1, sessionInput(session, 'rearBendStartX', 245) + sessionInput(session, 'rearBendLength', 20));
    }

    function zoneTagForX(x, length, session) {
        const padL = sessionInput(session, 'padL', 40);
        const noseL = sessionInput(session, 'noseL', 18);
        const neckL = sessionInput(session, 'neckL', 20);
        const apex = sessionInput(session, 'apex', Math.max(1, length * 0.7));
        const rearBendStartX = sessionInput(session, 'rearBendStartX', Math.max(apex + 1, length - 36));
        const rearBendLength = sessionInput(session, 'rearBendLength', 20);
        const rearMouthLength = sessionInput(session, 'rearMouthLength', 16);
        const cobraActive = isCobraRearMode(getCurrentSelectValue(session, 'rearMode', 'classic_tail'));
        const rearMouthStart = Math.max(0, length - rearMouthLength);

        if (cobraActive) {
            if (x <= Math.max(1, padL)) return '@front_headshell';
            if (x <= Math.max(padL, padL + neckL)) return '@neck_transition';
            if (x >= rearMouthStart) return '@rear_mouth';
            if (x >= rearBendStartX + Math.max(2, rearBendLength * 0.55)) return '@cobra_tail';
            if (Math.abs(x - rearBendStartX) <= Math.max(2, rearBendLength * 0.2)) return '@rear_bend_start';
            if (x >= rearBendStartX) return '@cobra_elbow';
            return '@main_body';
        }

        if (x <= Math.max(1, noseL)) return '@nose';
        if (x <= Math.max(noseL, padL)) return '@headshell_pad';
        if (x <= Math.max(padL, padL + neckL)) return '@neck';
        if (Math.abs(x - apex) <= Math.max(3, length / 32)) return '@apex';
        if (x >= rearBendStartX && x < length - rearMouthLength) return '@rear_bend';
        if (x >= length - rearMouthLength) return '@rear_mouth';
        return '@main_body';
    }

    function profileFromSessionFallback(x, session, length) {
        const padL = sessionInput(session, 'padL', 40);
        const noseL = sessionInput(session, 'noseL', 18);
        const neckL = sessionInput(session, 'neckL', 20);
        const apex = sessionInput(session, 'apex', Math.max(1, length * 0.7));
        const headH = sessionInput(session, 'headH', 12);
        const headW = sessionInput(session, 'headW', 24);
        const neckW = sessionInput(session, 'neckW', 18);
        const maxH = sessionInput(session, 'maxH', 24);
        const maxW = sessionInput(session, 'maxW', 34);
        const tailD = sessionInput(session, 'tailD', 16);
        const padOffset = sessionInput(session, 'padOffset', 0);

        let t = 0;
        let width = headW;
        let height = headH;

        if (x <= noseL) {
            t = Math.max(0, Math.min(1, x / Math.max(1, noseL)));
            width = Math.max(0.01, headW * Math.sqrt(t));
            height = headH;
        } else if (x <= padL + neckL) {
            t = Math.max(0, Math.min(1, (x - padL) / Math.max(1, neckL)));
            width = headW + (neckW - headW) * t;
            height = headH + (maxH - headH) * Math.max(0, Math.min(1, (x - padL) / Math.max(1, apex - padL)));
        } else if (x <= apex) {
            t = Math.max(0, Math.min(1, (x - (padL + neckL)) / Math.max(1, apex - (padL + neckL))));
            width = neckW + (maxW - neckW) * t;
            height = headH + (maxH - headH) * t;
        } else {
            t = Math.max(0, Math.min(1, (x - apex) / Math.max(1, length - apex)));
            width = maxW + (tailD - maxW) * t;
            height = maxH + (tailD - maxH) * t;
        }

        const zCenter = padOffset;
        return {
            width: width,
            height: height,
            zCenter: zCenter,
            zTop: zCenter + height / 2,
            zBot: zCenter - height / 2,
            source: 'fallback_from_current_session_inputs'
        };
    }

    function getStationFromRing(ring, index, total, length, session) {
        const p = ring && ring.p ? ring.p : {};
        const center = ring && ring.center ? ring.center : {};
        const x = Number.isFinite(Number(center.x)) ? Number(center.x)
            : Number.isFinite(Number(ring && ring.virtualX)) ? Number(ring.virtualX)
            : length * (total <= 1 ? 0 : index / (total - 1));
        const zCenter = Number.isFinite(Number(center.z)) ? Number(center.z) : Number(p.zCenter) || 0;
        const width = Number.isFinite(Number(p.width)) ? Number(p.width) : 0;
        const height = Number.isFinite(Number(p.height)) ? Number(p.height) : 0;
        const zTop = ring && ring.topRim && Number.isFinite(Number(ring.topRim.z)) ? Number(ring.topRim.z) : zCenter + height / 2;
        const zBot = ring && ring.botRim && Number.isFinite(Number(ring.botRim.z)) ? Number(ring.botRim.z) : zCenter - height / 2;
        return {
            x: round3(x),
            center: { x: round3(x), y: round3(center.y || 0), z: round3(zCenter) },
            width: round3(width),
            height: round3(height),
            zTop: round3(zTop),
            zBot: round3(zBot),
            zone: zoneTagForX(x, length, session)
        };
    }

    function getStationFromProfile(x, session, length) {
        let profile = null;
        if (typeof getClassicProfileAtX === 'function') {
            try {
                profile = getClassicProfileAtX(x);
                if (profile) profile.source = 'getClassicProfileAtX';
            } catch (err) {
                profile = null;
            }
        }
        if (!profile) profile = profileFromSessionFallback(x, session, length);
        const zCenter = Number.isFinite(Number(profile.zCenter)) ? Number(profile.zCenter) : 0;
        const width = Number.isFinite(Number(profile.width)) ? Number(profile.width) : 0;
        const height = Number.isFinite(Number(profile.height)) ? Number(profile.height) : 0;
        const zTop = Number.isFinite(Number(profile.zTop)) ? Number(profile.zTop) : zCenter + height / 2;
        const zBot = Number.isFinite(Number(profile.zBot)) ? Number(profile.zBot) : zCenter - height / 2;
        return {
            x: round3(x),
            center: { x: round3(x), y: 0, z: round3(zCenter) },
            width: round3(width),
            height: round3(height),
            zTop: round3(zTop),
            zBot: round3(zBot),
            zone: zoneTagForX(x, length, session)
        };
    }

    function buildAdaptiveSampleXPositions(session, length, targetCount) {
        const padL = sessionInput(session, 'padL', 40);
        const neckL = sessionInput(session, 'neckL', 20);
        const apex = sessionInput(session, 'apex', Math.max(1, length * 0.7));
        const rearBendStartX = sessionInput(session, 'rearBendStartX', Math.max(apex + 1, length - 36));
        const rearBendLength = sessionInput(session, 'rearBendLength', 20);
        const rearMouthLength = sessionInput(session, 'rearMouthLength', 16);
        const rearEndStart = Math.max(0, length - rearMouthLength);

        const ranges = [
            { a: 0, b: Math.max(padL, 1), n: 14 },
            { a: Math.max(0, padL - 4), b: Math.min(length, padL + neckL + 6), n: 14 },
            { a: Math.max(0, padL + neckL), b: Math.min(length, apex), n: 12 },
            { a: Math.max(0, apex - 8), b: Math.min(length, rearBendStartX + 4), n: 8 },
            { a: Math.max(0, rearBendStartX - 6), b: Math.min(length, rearBendStartX + rearBendLength + 8), n: 18 },
            { a: Math.max(0, rearEndStart - 8), b: length, n: 12 }
        ];

        const values = {};
        function add(x) {
            const clamped = Math.max(0, Math.min(length, Number(x) || 0));
            values[round3(clamped)] = true;
        }
        ranges.forEach(range => {
            const count = Math.max(2, range.n);
            for (let i = 0; i < count; i++) {
                const x = range.a + (range.b - range.a) * (count <= 1 ? 0 : i / (count - 1));
                add(x);
            }
        });
        [0, padL, padL + neckL, apex, rearBendStartX, rearBendStartX + rearBendLength, rearEndStart, length].forEach(add);

        let sorted = Object.keys(values).map(Number).sort((a, b) => a - b);
        while (sorted.length < targetCount) {
            let largestGap = -1;
            let insertAt = null;
            for (let i = 1; i < sorted.length; i++) {
                const gap = sorted[i] - sorted[i - 1];
                if (gap > largestGap) {
                    largestGap = gap;
                    insertAt = (sorted[i] + sorted[i - 1]) / 2;
                }
            }
            if (!Number.isFinite(insertAt)) break;
            add(insertAt);
            sorted = Object.keys(values).map(Number).sort((a, b) => a - b);
        }

        if (sorted.length > targetCount) {
            const keep = {};
            [0, sorted.length - 1].forEach(i => { keep[sorted[i]] = true; });
            const reduced = [];
            for (let i = 0; i < targetCount; i++) {
                const idx = Math.round(i * (sorted.length - 1) / Math.max(1, targetCount - 1));
                reduced.push(sorted[idx]);
            }
            sorted = Object.keys(reduced.reduce((acc, x) => { acc[x] = true; return acc; }, keep)).map(Number).sort((a, b) => a - b);
            while (sorted.length < targetCount) {
                const i = Math.min(sorted.length - 1, Math.max(1, Math.floor(sorted.length / 2)));
                add((sorted[i - 1] + sorted[i]) / 2);
                sorted = Object.keys(values).map(Number).sort((a, b) => a - b);
            }
            sorted = sorted.slice(0, targetCount).sort((a, b) => a - b);
        }

        return sorted;
    }

    function sampleStationProfiles(session, maxStations) {
        const length = availableShapeLength(session);
        const maxCount = Math.max(2, Math.min(MAX_STATION_SAMPLE_COUNT, maxStations || STANDARD_STATION_SAMPLE_COUNT));
        const stations = [];

        if (typeof GLOBAL_RINGSCache !== 'undefined' && Array.isArray(GLOBAL_RINGSCache) && GLOBAL_RINGSCache.length) {
            const cache = GLOBAL_RINGSCache;
            const count = Math.min(maxCount, cache.length);
            for (let i = 0; i < count; i++) {
                const idx = Math.round(i * (cache.length - 1) / Math.max(1, count - 1));
                stations.push(getStationFromRing(cache[idx], i, count, length, session));
            }
            return { sourceMethod: 'GLOBAL_RINGSCache_even_' + count + '_of_' + cache.length, stations: stations, length: length, requestedCount: maxCount };
        }

        const xPositions = buildAdaptiveSampleXPositions(session, length, maxCount);
        xPositions.forEach(x => {
            stations.push(getStationFromProfile(x, session, length));
        });

        const sourceMethod = (typeof getClassicProfileAtX === 'function')
            ? 'adaptive_getClassicProfileAtX'
            : 'adaptive_fallback_from_current_session_inputs';
        return { sourceMethod: sourceMethod, stations: stations, length: length, requestedCount: maxCount };
    }

    function boundingBoxFromStations(stations) {
        const box = {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 0, y: 0, z: 0 }
        };
        if (!stations.length) return box;

        box.min.x = Math.min.apply(null, stations.map(s => s.center.x));
        box.max.x = Math.max.apply(null, stations.map(s => s.center.x));
        box.min.y = Math.min.apply(null, stations.map(s => -Math.abs(s.width || 0) / 2));
        box.max.y = Math.max.apply(null, stations.map(s => Math.abs(s.width || 0) / 2));
        box.min.z = Math.min.apply(null, stations.map(s => s.zBot));
        box.max.z = Math.max.apply(null, stations.map(s => s.zTop));

        return {
            min: { x: round3(box.min.x), y: round3(box.min.y), z: round3(box.min.z) },
            max: { x: round3(box.max.x), y: round3(box.max.y), z: round3(box.max.z) }
        };
    }

    function buildZoneGeometryMap(session, length) {
        const padL = sessionInput(session, 'padL', 40);
        const noseL = sessionInput(session, 'noseL', 18);
        const neckL = sessionInput(session, 'neckL', 20);
        const apex = sessionInput(session, 'apex', Math.max(1, length * 0.7));
        const rearBendStartX = sessionInput(session, 'rearBendStartX', Math.max(apex + 1, length - 36));
        const rearBendLength = sessionInput(session, 'rearBendLength', 20);
        const rearMouthLength = sessionInput(session, 'rearMouthLength', 16);
        const cartX = sessionInput(session, 'cartX', 8);

        function interval(a, b) {
            return { type: 'xInterval', x0: round3(Math.max(0, a)), x1: round3(Math.min(length, b)) };
        }
        function point(x) {
            return { type: 'point', x: round3(Math.max(0, Math.min(length, x))) };
        }

        return {
            '@stylus': point(0),
            '@cartridge': interval(0, Math.max(cartX + 22.8, padL)),
            '@headshell_pad': interval(0, padL),
            '@front_headshell': interval(0, Math.max(padL, noseL)),
            '@integrated_headshell': interval(0, Math.max(padL, noseL)),
            '@nose': interval(0, noseL),
            '@neck': interval(padL, padL + neckL),
            '@neck_transition': interval(padL, padL + neckL),
            '@main_body': interval(padL + neckL, apex),
            '@monocoque_armwand': interval(padL, apex),
            '@cobra_canopy': interval(padL + neckL, apex),
            '@apex': point(apex),
            '@rear_bend_start': point(rearBendStartX),
            '@rear_bend': interval(rearBendStartX, rearBendStartX + rearBendLength),
            '@cobra_elbow': interval(rearBendStartX, rearBendStartX + rearBendLength),
            '@rear_transition_to_pivot': interval(rearBendStartX, Math.min(length, rearBendStartX + rearBendLength + rearMouthLength)),
            '@pivot_bearing_area': point(rearBendStartX + rearBendLength),
            '@cobra_tail': interval(rearBendStartX + rearBendLength, Math.max(rearBendStartX + rearBendLength, length - rearMouthLength)),
            '@rear_mouth': interval(Math.max(0, length - rearMouthLength), length),
            '@oval_counterweight': point(rearBendStartX + rearBendLength),
            '@counterweight_underweights': point(rearBendStartX + rearBendLength),
            '@fine_tracking_force_screw': point(Math.min(length, rearBendStartX + rearBendLength + rearMouthLength))
        };
    }

    function buildShape3DContext(currentSession, maxStations) {
        const session = currentSession || getCurrentSession();
        const sampled = sampleStationProfiles(session, maxStations || STANDARD_STATION_SAMPLE_COUNT);
        const stations = sampled.stations;
        const length = sampled.length;
        const boundingBox = boundingBoxFromStations(stations);
        const apex = sessionInput(session, 'apex', Math.max(1, length * 0.7));
        const cartX = sessionInput(session, 'cartX', 8);
        const pivotOffsetX = sessionInput(session, 'pivotOffsetX', 0);
        const pivotOffsetY = sessionInput(session, 'pivotOffsetY', 0);
        const lpTopZ = sessionInput(session, 'lpTopZ', 0);
        const verticalPivotHeightAboveLP = sessionInput(session, 'verticalPivotHeightAboveLP', sessionInput(session, 'pivotOffsetZ', 0));
        const apexStation = nearestStationByX(stations, apex);
        const apexCenterZ = apexStation ? stationCenterZ(apexStation) : (boundingBox.max.z + boundingBox.min.z) / 2;
        const rearEndStation = nearestStationByX(stations, length);
        const rearEndProfileCenterZ = rearEndStation ? stationCenterZ(rearEndStation) : 0;

        return {
            format: 'tonearm-shape-summary-v1',
            units: 'mm',
            source: 'derived_from_current_state',
            sourceMethod: sampled.sourceMethod,
            currentRearMode: getCurrentSelectValue(session, 'rearMode', 'classic_tail'),
            cobraActive: isCobraRearMode(getCurrentSelectValue(session, 'rearMode', 'classic_tail')),
            boundingBox: boundingBox,
            keyPoints: {
                stylus: { x: 0, y: 0, z: 0 },
                cartridgeReference: { x: round3(cartX), y: 0, z: 0 },
                apex: { x: round3(apex), y: 0, z: round3(apexCenterZ) },
                pivotAxis: {
                    x: round3(apex + pivotOffsetX),
                    y: round3(pivotOffsetY),
                    z: round3(lpTopZ + verticalPivotHeightAboveLP)
                },
                rearEnd: { x: round3(length), y: 0, z: round3(rearEndProfileCenterZ) }
            },
            stationProfiles: stations,
            zoneGeometryMap: buildZoneGeometryMap(session, length),
            limits: {
                readOnlyContext: true,
                fullMeshIncluded: false,
                fullStlObjIncluded: false,
                maxStations: STANDARD_STATION_SAMPLE_COUNT,
                note: 'Reduced station/profile summary only; not a full mesh and not a source of new writable geometry fields.'
            }
        };
    }

    function zoneCatalogRecord(tag, modelFamily) {
        const map = window.ZONE_MAP || { common: [], lt: [], families: {} };
        const candidates = [];
        if (modelFamily && map.families && Array.isArray(map.families[modelFamily])) candidates.push.apply(candidates, map.families[modelFamily]);
        if (Array.isArray(map.common)) candidates.push.apply(candidates, map.common);
        if (Array.isArray(map.lt)) candidates.push.apply(candidates, map.lt);
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i] && candidates[i].tag === tag) return candidates[i];
        }
        return null;
    }


    function round3OrNull(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return Math.round(n * 1000) / 1000;
    }

    function stationX(station) {
        if (station && station.center && Number.isFinite(Number(station.center.x))) return Number(station.center.x);
        if (station && Number.isFinite(Number(station.x))) return Number(station.x);
        return null;
    }

    function stationCenterZ(station) {
        if (station && station.center && Number.isFinite(Number(station.center.z))) return Number(station.center.z);
        if (station && Number.isFinite(Number(station.centerZ))) return Number(station.centerZ);
        if (station && Number.isFinite(Number(station.zTop)) && Number.isFinite(Number(station.zBot))) {
            return (Number(station.zTop) + Number(station.zBot)) / 2;
        }
        return 0;
    }

    function nearestStationByX(stations, x) {
        if (!Array.isArray(stations) || !stations.length || !Number.isFinite(Number(x))) return null;
        const targetX = Number(x);
        let best = null;
        let bestDx = Infinity;
        stations.forEach(station => {
            const sx = stationX(station);
            if (!Number.isFinite(sx)) return;
            const dx = Math.abs(sx - targetX);
            if (dx < bestDx) {
                best = station;
                bestDx = dx;
            }
        });
        return best;
    }

    function stationRangeFromMap(map, key, fallback) {
        const rec = map && key && map[key] ? map[key] : null;
        if (rec && rec.type === 'xInterval') return [round3(rec.x0), round3(rec.x1)];
        if (rec && rec.type === 'point') return [round3(rec.x), round3(rec.x)];
        return Array.isArray(fallback) ? [round3(fallback[0]), round3(fallback[1])] : [0, 0];
    }

    function stationsInRange(stations, xRange) {
        if (!Array.isArray(stations) || !Array.isArray(xRange)) return [];
        const x0 = Math.min(Number(xRange[0]), Number(xRange[1]));
        const x1 = Math.max(Number(xRange[0]), Number(xRange[1]));
        return stations
            .filter(station => {
                const x = stationX(station);
                return Number.isFinite(x) && x >= x0 - 1e-9 && x <= x1 + 1e-9;
            })
            .sort((a, b) => stationX(a) - stationX(b));
    }

    function summarizeStationRange(stations, xRange) {
        const samples = stationsInRange(stations, xRange);
        if (!samples.length) {
            return {
                xRange: [round3(xRange[0]), round3(xRange[1])],
                sampleCount: 0,
                maxWidthMm: null,
                xAtMaxWidth: null,
                minWidthMm: null,
                xAtMinWidth: null,
                maxHeightMm: null,
                xAtMaxHeight: null,
                avgWidthMm: null,
                startWidthMm: null,
                endWidthMm: null,
                widthDeltaMm: null,
                startCenterZ: null,
                endCenterZ: null,
                centerDropMm: null,
                startUpperZ: null,
                endUpperZ: null,
                upperDropMm: null,
                startLowerZ: null,
                endLowerZ: null,
                lowerDropMm: null
            };
        }

        let maxWidthStation = samples[0];
        let minWidthStation = samples[0];
        let maxHeightStation = samples[0];
        let widthSum = 0;

        samples.forEach(station => {
            const width = Math.abs(Number(station.width || 0));
            const height = Math.abs(Number(station.height || 0));
            widthSum += Number.isFinite(width) ? width : 0;
            if (width > Math.abs(Number(maxWidthStation.width || 0))) maxWidthStation = station;
            if (width < Math.abs(Number(minWidthStation.width || 0))) minWidthStation = station;
            if (height > Math.abs(Number(maxHeightStation.height || 0))) maxHeightStation = station;
        });

        const start = samples[0];
        const end = samples[samples.length - 1];
        const startWidth = Math.abs(Number(start.width || 0));
        const endWidth = Math.abs(Number(end.width || 0));
        const startCenterZ = stationCenterZ(start);
        const endCenterZ = stationCenterZ(end);
        const startUpperZ = Number(start.zTop);
        const endUpperZ = Number(end.zTop);
        const startLowerZ = Number(start.zBot);
        const endLowerZ = Number(end.zBot);

        return {
            xRange: [round3(xRange[0]), round3(xRange[1])],
            sampleCount: samples.length,
            maxWidthMm: round3(Math.abs(Number(maxWidthStation.width || 0))),
            xAtMaxWidth: round3(stationX(maxWidthStation)),
            minWidthMm: round3(Math.abs(Number(minWidthStation.width || 0))),
            xAtMinWidth: round3(stationX(minWidthStation)),
            maxHeightMm: round3(Math.abs(Number(maxHeightStation.height || 0))),
            xAtMaxHeight: round3(stationX(maxHeightStation)),
            avgWidthMm: round3(widthSum / samples.length),
            startWidthMm: round3(startWidth),
            endWidthMm: round3(endWidth),
            widthDeltaMm: round3(endWidth - startWidth),
            startCenterZ: round3(startCenterZ),
            endCenterZ: round3(endCenterZ),
            centerDropMm: round3(startCenterZ - endCenterZ),
            startUpperZ: round3OrNull(startUpperZ),
            endUpperZ: round3OrNull(endUpperZ),
            upperDropMm: Number.isFinite(startUpperZ) && Number.isFinite(endUpperZ) ? round3(startUpperZ - endUpperZ) : null,
            startLowerZ: round3OrNull(startLowerZ),
            endLowerZ: round3OrNull(endLowerZ),
            lowerDropMm: Number.isFinite(startLowerZ) && Number.isFinite(endLowerZ) ? round3(startLowerZ - endLowerZ) : null
        };
    }

    function buildComputedShapeFacts(session, shape3d, modelFamily) {
        const stations = shape3d && Array.isArray(shape3d.stationProfiles) ? shape3d.stationProfiles : [];
        const length = shape3d && Number.isFinite(Number(shape3d.length)) ? Number(shape3d.length) : availableShapeLength(session);
        const map = shape3d && shape3d.zoneGeometryMap ? shape3d.zoneGeometryMap : buildZoneGeometryMap(session, length);
        const family = modelFamily || AI_MODAL_STATE.modelFamily;
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const padL = sessionInput(session, 'padL', 40);
        const neckL = sessionInput(session, 'neckL', 20);
        const apex = sessionInput(session, 'apex', Math.max(1, length * 0.7));
        const rearBendStartX = sessionInput(session, 'rearBendStartX', Math.max(apex + 1, length - 36));
        const rearBendLength = sessionInput(session, 'rearBendLength', 20);
        const rearMouthLength = sessionInput(session, 'rearMouthLength', 16);

        const frontRange = stationRangeFromMap(map, cobraActive ? '@integrated_headshell' : '@headshell_pad', [0, padL]);
        const neckRange = stationRangeFromMap(map, cobraActive ? '@neck_transition' : '@neck', [padL, padL + neckL]);
        const mainRange = stationRangeFromMap(map, cobraActive ? '@monocoque_armwand' : '@main_body', [padL, apex]);
        const canopyRange = stationRangeFromMap(map, cobraActive ? '@cobra_canopy' : '@main_body', [padL + neckL, apex]);
        const rearTransitionRange = stationRangeFromMap(map, cobraActive ? '@rear_transition_to_pivot' : '@rear_bend', [rearBendStartX, Math.min(length, rearBendStartX + rearBendLength + rearMouthLength)]);
        const rearMouthRange = stationRangeFromMap(map, '@rear_mouth', [Math.max(0, length - rearMouthLength), length]);

        const front = summarizeStationRange(stations, frontRange);
        const neck = summarizeStationRange(stations, neckRange);
        const main = summarizeStationRange(stations, mainRange);
        const canopy = summarizeStationRange(stations, canopyRange);
        const rearTransition = summarizeStationRange(stations, rearTransitionRange);
        const rearMouth = summarizeStationRange(stations, rearMouthRange);

        front.controlMaxWidthMm = round3(sessionInput(session, 'headW', 0));
        front.metricMeaning = 'maxWidthMm is computed over the integrated headshell x-range, not from the x=0 stylus tip sample.';
        neck.controlWaistWidthMm = round3(sessionInput(session, 'neckW', 0));
        main.controlMaxWidthMm = round3(sessionInput(session, 'maxW', 0));
        main.controlMaxHeightMm = round3(sessionInput(session, 'maxH', 0));
        main.lengthToMaxWidth = main.maxWidthMm ? round3(Math.max(0, main.xRange[1] - main.xRange[0]) / main.maxWidthMm) : null;
        canopy.controlBowMm = round3(sessionInput(session, 'bow', 0));
        rearTransition.controlBendStartX = round3(rearBendStartX);
        rearTransition.controlBendDropZ = round3(sessionInput(session, 'rearBendDropZ', 0));
        rearTransition.controlBendLength = round3(rearBendLength);
        rearTransition.notCounterweight = true;
        rearMouth.controlMouthWidthMm = round3(sessionInput(session, 'rearMouthWidth', 0));
        rearMouth.controlMouthLengthMm = round3(sessionInput(session, 'rearMouthLength', 0));
        rearMouth.controlTailD = round3(sessionInput(session, 'tailD', 0));
        rearMouth.notCounterweight = true;

        return {
            format: 'tonearm-computed-shape-facts-v1',
            source: 'main_window_profile_data',
            sourceMethod: shape3d && shape3d.sourceMethod ? shape3d.sourceMethod : 'unknown',
            units: 'mm',
            currentGeometryOnly: true,
            modelFamily: family,
            currentRearMode: currentRearMode,
            cobraActive: cobraActive,
            profileLengthMm: round3(length),
            profileBounds: shape3d && shape3d.boundingBox ? shape3d.boundingBox : boundingBoxFromStations(stations),
            zones: {
                frontHeadshell: front,
                neckTransition: neck,
                monocoqueArmwand: main,
                cobraCanopy: canopy,
                rearTransitionToPivot: rearTransition,
                rearMouthTailProxy: rearMouth
            },
            derivedDiagnosis: {
                headshellWidthSource: 'max over frontHeadshell.xRange',
                headshellWidthMm: front.maxWidthMm,
                armwandSlendernessLengthToMaxWidth: main.maxWidthMm ? round3(length / main.maxWidthMm) : null,
                rearUpperDropMm: rearTransition.upperDropMm,
                rearCenterDropMm: rearTransition.centerDropMm,
                rearEndWidthMm: rearMouth.endWidthMm,
                rearEndIsCounterweight: false,
                rearTransitionIsCounterweight: false,
                cobraReferenceFit: cobraActive ? 'partial_armwand_fit_only_until_missing_product_geometry_exists' : 'not_active_cobra_rear_mode'
            },
            missingTargetGeometry: [
                'anti_skate_mechanism',
                'final_cad_fea_details'
            ],
            aiDecisionGuidance: [
                'Use shapeFormContext.computedShapeFacts first for current dimensions and shape zones.',
                'Use shapeFormContext.canonicalShapeProfileContext raw arrays only as supporting evidence.',
                'Do not treat rearTransitionToPivot or rearMouthTailProxy as the Cobra configurable disc-stack counterweight.',
                MISSING_GEOMETRY_GATE
            ]
        };
    }

    function zoneOverlayStatus(annotation, session, modelFamily) {
        const zone = annotation && annotation.zone ? annotation.zone : '';
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const cobraProfile = isCobraModelFamily(modelFamily || AI_MODAL_STATE.modelFamily);
        const controls = annotation && Array.isArray(annotation.primaryControls) ? annotation.primaryControls : [];

        if (zone === 'oval_counterweight' || zone === 'counterweight_underweights') {
            return {
                status: 'canonical_disc_stack_control',
                source: 'current_disc_stack_controls',
                writableRole: 'canonical_control',
                writable: true,
                note: 'Canonical Cobra counterweight is the configurable rear disc stack in this branch; use rearWeightDisc* and rearFineTrim* controls.'
            };
        }

        if (zone === 'fine_tracking_force_screw') {
            return {
                status: 'current_disc_stack_control',
                source: 'current_disc_stack_control',
                writableRole: 'canonical_control',
                writable: controls.length > 0,
                note: 'Current app exposes fine-trim controls but no real Cobra 8g screw geometry.'
            };
        }

        if (zone === 'pivot_bearing_area') {
            return {
                status: 'read_only_reference',
                source: 'current_profile_reference',
                writableRole: 'read_only',
                writable: false,
                note: 'Reference area derived from current profile/pivot context; not a dedicated writable geometry object.'
            };
        }

        if (cobraProfile && !cobraActive && zone === 'rear_transition_to_pivot') {
            return {
                status: 'current_classic_tail_with_cobra_target_reference',
                source: 'current_profile',
                writableRole: controls.length ? 'writable_after_mode_switch_or_proxy' : 'read_only',
                writable: controls.length > 0,
                note: 'Cobra AI profile is selected, but current rearMode is Classic Tail. Do not treat this as active Cobra geometry.'
            };
        }

        return {
            status: 'current_profile_geometry',
            source: 'current_profile',
            writableRole: controls.length ? 'writable' : 'read_only',
            writable: controls.length > 0,
            note: 'Overlay is positioned from current profile x-range and acts only as an annotation.'
        };
    }

    function buildProfileMetrics(session, shape3d) {
        const stations = shape3d && Array.isArray(shape3d.stationProfiles) ? shape3d.stationProfiles : [];
        const length = shape3d && Number.isFinite(Number(shape3d.length)) ? Number(shape3d.length) : availableShapeLength(session);
        const widths = stations.map(s => Math.abs(Number(s.width || 0))).filter(Number.isFinite);
        const heights = stations.map(s => Math.abs(Number(s.height || 0))).filter(Number.isFinite);
        const maxWidth = widths.length ? Math.max.apply(null, widths) : sessionInput(session, 'maxW', 0);
        const maxHeight = heights.length ? Math.max.apply(null, heights) : sessionInput(session, 'maxH', 0);
        const tail = stations.length ? stations[stations.length - 1] : null;
        const map = shape3d && shape3d.zoneGeometryMap ? shape3d.zoneGeometryMap : buildZoneGeometryMap(session, length);
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const frontRange = stationRangeFromMap(map, isCobraRearMode(currentRearMode) ? '@integrated_headshell' : '@headshell_pad', [0, sessionInput(session, 'padL', 40)]);
        const frontSummary = summarizeStationRange(stations, frontRange);
        return {
            lengthMm: round3(length),
            maxWidthMm: round3(maxWidth),
            maxHeightMm: round3(maxHeight),
            slendernessRatio: maxWidth > 0 ? round3(length / maxWidth) : null,
            maxHeightToLength: length > 0 ? round3(maxHeight / length) : null,
            maxWidthToLength: length > 0 ? round3(maxWidth / length) : null,
            tailWidthEnd: tail ? round3(tail.width || 0) : round3(sessionInput(session, 'tailD', 0)),
            headshellWidth: frontSummary.maxWidthMm !== null ? frontSummary.maxWidthMm : round3(sessionInput(session, 'headW', 0)),
            headshellWidthSource: 'max current profile width over integrated/headshell range, not the x=0 stylus-tip sample',
            headshellWidthXAtMax: frontSummary.xAtMaxWidth
        };
    }

    function buildCurrentVisualDiagnosis(session, shape3d, modelFamily) {
        const family = modelFamily || AI_MODAL_STATE.modelFamily;
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const cobraProfile = isCobraModelFamily(family);
        const profileMetrics = buildProfileMetrics(session, shape3d);
        const readsAs = [];
        const riskFlags = [];

        readsAs.push(cobraActive ? 'cobra_integrated_tail current profile' : 'classic_tail current profile');
        if (cobraProfile && !cobraActive) readsAs.push('current Classic Tail shape, Cobra target reference active');
        if (profileMetrics.slendernessRatio !== null) {
            readsAs.push('profile slenderness length/maxWidth = ' + profileMetrics.slendernessRatio);
        }

        if (cobraProfile && !cobraActive) riskFlags.push('not_cobra_because_rearMode_classic_tail');
        if (profileMetrics.slendernessRatio !== null && profileMetrics.slendernessRatio < 7) riskFlags.push('blob_like_if_width_height_ratio_excessive');
        if (profileMetrics.maxHeightToLength !== null && profileMetrics.maxHeightToLength > 0.12) riskFlags.push('side_profile_too_tall_for_long_low_cobra_reference');
        if (profileMetrics.maxWidthToLength !== null && profileMetrics.maxWidthToLength > 0.16) riskFlags.push('top_profile_too_wide_or_worm_like');
        riskFlags.push('disc_counterweight_available');

        let cobraReferenceFit = 'unknown_visual_fit';
        if (cobraProfile && !cobraActive) {
            cobraReferenceFit = 'not_cobra_because_rearMode_classic_tail';
        } else if (cobraActive && riskFlags.length <= 1) {
            cobraReferenceFit = 'partial_armwand_fit_only';
        } else if (cobraActive) {
            cobraReferenceFit = 'disc_counterweight_available_partial_armwand_fit';
        }

        return {
            currentRearMode: currentRearMode,
            cobraActive: cobraActive,
            cobraProfileSelected: cobraProfile,
            readsAs: readsAs,
            riskFlags: riskFlags,
            profileMetrics: profileMetrics,
            cobraReferenceFit: cobraReferenceFit,
            currentProductCompletenessAssessment: cobraProfile ? [
                'Current profile can describe a coarse long/low Cobra-like side/top envelope when rearMode is cobra_integrated_tail.',
                'It is not a complete Cobra product model because final CAD/FEA detailing, richer canopy surface definition and optional visual refinements remain; canonical disc counterweight, mechanical assembly and headshell slot capabilities are represented in this branch.',
                'Correct Cobra product modeling requires new parametric geometry, not only prompt text or slider changes.'
            ] : [],
            visualSource: 'main_window_profile_data',
            note: 'This diagnosis is derived from actual sampled profile ratios, not from a decorative zone-map drawing.'
        };
    }

    function buildCanonicalShapeProfileContext(session, shape3d, modelFamily) {
        const family = modelFamily || AI_MODAL_STATE.modelFamily;
        const stations = shape3d && Array.isArray(shape3d.stationProfiles) ? shape3d.stationProfiles : [];
        const sideUpper = stations.map(station => [round3(station.x), round3(station.zTop)]);
        const sideLower = stations.map(station => [round3(station.x), round3(station.zBot)]);
        const topHalf = stations.map(station => [round3(station.x), round3(Math.abs(station.width || 0) / 2)]);
        const topMirror = topHalf.map(p => [p[0], round3(-p[1])]);
        const stationSummary = stations.map(station => {
            const zone = visualZoneForStation(station);
            const tag = station && station.zone ? station.zone : '';
            return {
                x: round3(station.x),
                widthY: round3(station.width || 0),
                heightZ: round3(station.height || 0),
                centerZ: round3(station.center && Number.isFinite(Number(station.center.z)) ? station.center.z : 0),
                zone: zone,
                sourceTag: tag,
                localRole: localRoleForStationTag(tag, isCobraRearMode(getCurrentSelectValue(session, 'rearMode', 'classic_tail'))),
                notes: stationNoteForZone(zone, isCobraRearMode(getCurrentSelectValue(session, 'rearMode', 'classic_tail')))
            };
        });
        const zoneAnnotations = buildZoneAnnotations(session, shape3d, family).map(annotation => {
            const status = zoneOverlayStatus(annotation, session, family);
            const catalog = zoneCatalogRecord(annotation.tag, family);
            return {
                zone: annotation.zone,
                tag: annotation.tag,
                label: catalog && catalog.label ? catalog.label : annotation.zone,
                description: catalog && catalog.description ? catalog.description : annotation.purpose,
                xRange: annotation.xRange,
                source: status.source,
                status: status.status,
                writableRole: status.writableRole,
                writable: status.writable,
                note: status.note,
                primaryControls: Array.isArray(annotation.primaryControls) ? annotation.primaryControls.slice() : [],
                purpose: annotation.purpose,
                currentGeometrySupport: annotation.currentGeometrySupport || (status.status.indexOf('missing') !== -1 ? 'missing_shape_control' : 'current_profile_or_reference')
            };
        });
        const allZ = sideUpper.concat(sideLower).map(p => p[1]).filter(Number.isFinite);
        const allY = topHalf.map(p => Math.abs(p[1])).filter(Number.isFinite);
        const length = shape3d && Number.isFinite(Number(shape3d.length)) ? Number(shape3d.length) : availableShapeLength(session);
        return {
            format: 'tonearm-profile-context-v3',
            source: 'main_window_profile_data',
            sourceMethod: shape3d && shape3d.sourceMethod ? shape3d.sourceMethod : 'unknown',
            units: 'mm',
            description: 'Canonical current shape profile derived from the same sampled current geometry/profile data used by the main Side Profile (Z-X) and Top View (Y-X) charts.',
            sideProfileZX: {
                source: 'same data as main Side Profile (Z-X)',
                description: 'orthographic side silhouette; x along tonearm, z vertical; upper/lower are sampled polylines',
                upper: sideUpper,
                lower: sideLower
            },
            topProfileYX: {
                source: 'same data as main Top View (Y-X)',
                description: 'orthographic top silhouette; x along tonearm, y is positive/negative half-width; mirror describes full current width',
                positiveHalfWidth: topHalf,
                negativeHalfWidth: topMirror
            },
            stationSummary: stationSummary,
            stationSampleCount: stationSummary.length,
            zoneAnnotations: zoneAnnotations,
            profileBounds: {
                xMin: 0,
                xMax: round3(length),
                zMin: allZ.length ? round3(Math.min.apply(null, allZ)) : 0,
                zMax: allZ.length ? round3(Math.max.apply(null, allZ)) : 0,
                yHalfMax: allY.length ? round3(Math.max.apply(null, allY)) : 0
            }
        };
    }

    function buildCompactShapeVisualContext(shapeFormContext) {
        const canonical = shapeFormContext && shapeFormContext.canonicalShapeProfileContext;
        return {
            format: 'tonearm-shape-visual-context-v3-compact',
            source: 'main_window_profile_data',
            canonicalProfileRef: 'shapeFormContext.canonicalShapeProfileContext',
            profileSourceTruth: shapeFormContext ? shapeFormContext.profileSourceTruth : null,
            visualTrustPolicy: shapeFormContext ? shapeFormContext.visualTrustPolicy : [],
            actualRearMode: shapeFormContext ? shapeFormContext.actualRearMode : null,
            cobraActive: shapeFormContext ? shapeFormContext.cobraActive : false,
            currentVisualDiagnosis: shapeFormContext ? shapeFormContext.currentVisualDiagnosis : null,
            computedShapeFactsRef: 'shapeFormContext.computedShapeFacts',
            targetOnlyNotCurrentGeometry: shapeFormContext ? shapeFormContext.targetOnlyNotCurrentGeometry : [],
            stationSampleCount: canonical ? canonical.stationSampleCount : 0,
            zoneAnnotationCount: canonical && Array.isArray(canonical.zoneAnnotations) ? canonical.zoneAnnotations.length : 0,
            note: 'Compact compatibility wrapper only. Full side/top arrays are intentionally not duplicated here.'
        };
    }

    function buildProfileMapData(session, shape3d, modelFamily) {
        const shapeContext = buildCanonicalShapeProfileContext(session, shape3d || buildShape3DContext(session, STANDARD_STATION_SAMPLE_COUNT), modelFamily || AI_MODAL_STATE.modelFamily);
        return {
            format: 'tonearm-profile-map-data-v1',
            source: 'main_window_profile_data',
            sideProfileZX: shapeContext.sideProfileZX,
            topProfileYX: shapeContext.topProfileYX,
            profileBounds: shapeContext.profileBounds,
            zoneAnnotations: shapeContext.zoneAnnotations,
            stationSampleCount: shapeContext.stationSampleCount,
            sourceMethod: shapeContext.sourceMethod
        };
    }


    function getCurrentSelectValue(session, id, fallback) {
        const selectMap = session && session.selects ? session.selects : {};
        if (Object.prototype.hasOwnProperty.call(selectMap, id)) return selectMap[id];
        if (typeof state !== 'undefined' && state && Object.prototype.hasOwnProperty.call(state, id)) return state[id];
        const el = $(id);
        return el ? el.value : fallback;
    }

    function isCobraRearMode(value) {
        const cobraValue = (typeof REAR_MODES !== 'undefined' && REAR_MODES && REAR_MODES.COBRA_GOOSE)
            ? REAR_MODES.COBRA_GOOSE
            : 'cobra_integrated_tail';
        return value === cobraValue || value === 'cobra_integrated_tail';
    }

    function visualZoneForStation(station) {
        const tag = station && station.zone ? station.zone : '';
        if (tag === '@integrated_headshell' || tag === '@front_headshell' || tag === '@nose' || tag === '@headshell_pad' || tag === '@cartridge' || tag === '@stylus') return 'front_headshell';
        if (tag === '@neck_transition' || tag === '@neck') return 'neck_transition';
        if (tag === '@monocoque_armwand' || tag === '@cobra_canopy' || tag === '@main_body' || tag === '@apex') return 'main_body';
        if (tag === '@rear_transition_to_pivot' || tag === '@pivot_bearing_area' || tag === '@rear_bend_start' || tag === '@cobra_elbow' || tag === '@cobra_tail' || tag === '@rear_bend' || tag === '@rear_mouth') return 'rear_tail_cobra';
        if (tag === '@oval_counterweight' || tag === '@counterweight_underweights' || tag === '@fine_tracking_force_screw' || tag === '@counterweight_stack' || tag === '@trim_screw') return 'counterweight_accessory';
        return 'unknown';
    }

    function stationNoteForZone(zone, cobraActive) {
        if (zone === 'front_headshell') return 'integrated headshell/nose silhouette; use padOffset, noseL, headW, padL and headH for purposeful flattened front proportions';
        if (zone === 'neck_transition') return 'neck transition; use neckW, neckL and asym to smooth the bridge into the monocoque armwand';
        if (zone === 'main_body') return 'monocoque armwand/canopy; use apex, maxH, maxW, bow and thick for long low sleek volume rather than worm/blob swelling';
        if (zone === 'rear_tail_cobra') return cobraActive
            ? 'active Cobra/Hollow Elbow rear transition; tune bend/drop/mouth/tail only as an armwand-to-pivot transition, not as the configurable disc-stack counterweight'
            : 'rear tail region; Cobra controls are available but rearMode is currently classic_tail';
        if (zone === 'counterweight_accessory') return cobraActive
            ? 'canonical Cobra disc counterweight control area; rearWeightDisc* controls define the active configurable disc stack'
            : 'rear counterweight/fine-trim accessory controls';
        return 'sampled body station';
    }

    function zoneAnnotationRange(map, key, fallback) {
        const rec = map && map[key] ? map[key] : null;
        if (rec && rec.type === 'xInterval') return [round3(rec.x0), round3(rec.x1)];
        if (rec && rec.type === 'point') return [round3(rec.x), round3(rec.x)];
        return fallback;
    }

    function rearTerminalDiscMountAnnotation(session, length) {
        const semantic = {
            x: round3(Number.isFinite(Number(length)) ? Number(length) : availableShapeLength(session)),
            z: null,
            source: 'semantic_actual_rear_terminal',
            available: false
        };

        try {
            if (typeof CobraDiscCounterweightAssembly !== 'undefined' &&
                CobraDiscCounterweightAssembly &&
                typeof CobraDiscCounterweightAssembly.getDiscMountPoint === 'function' &&
                typeof state !== 'undefined') {
                const mount = CobraDiscCounterweightAssembly.getDiscMountPoint(state);
                if (mount && mount.available === true && Number.isFinite(Number(mount.x))) {
                    return {
                        x: round3(Number(mount.x)),
                        z: Number.isFinite(Number(mount.z)) ? round3(Number(mount.z)) : null,
                        source: mount.source || 'actual_rear_terminal_disc_mount',
                        available: true
                    };
                }
            }
        } catch (err) {
            // Keep AI-context generation read-only and resilient; fall back to semantic rear terminal.
        }

        try {
            if (typeof getUnifiedRearTerminal === 'function' && typeof state !== 'undefined') {
                const terminal = getUnifiedRearTerminal(state);
                if (terminal && terminal.available === true && Number.isFinite(Number(terminal.x))) {
                    return {
                        x: round3(Number(terminal.x)),
                        z: Number.isFinite(Number(terminal.z)) ? round3(Number(terminal.z)) : null,
                        source: terminal.source || 'actual_unified_rear_terminal',
                        available: true
                    };
                }
            }
        } catch (err) {
            // Keep AI-context generation read-only and resilient; fall back to semantic rear terminal.
        }

        return semantic;
    }

    function buildZoneAnnotations(session, shape3d, modelFamily) {
        const map = shape3d && shape3d.zoneGeometryMap ? shape3d.zoneGeometryMap : {};
        const stations = shape3d && Array.isArray(shape3d.stationProfiles) ? shape3d.stationProfiles : [];
        const xValues = stations.map(station => station.x).filter(x => Number.isFinite(Number(x)));
        const length = xValues.length ? Math.max.apply(null, xValues) : availableShapeLength(session);
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const cobraContext = cobraActive || isCobraModelFamily(modelFamily || AI_MODAL_STATE.modelFamily);
        const padL = round3(sessionInput(session, 'padL', 40));
        const neckL = round3(sessionInput(session, 'neckL', 20));
        const apex = round3(sessionInput(session, 'apex', length * 0.7));
        const rearStart = round3(sessionInput(session, 'rearBendStartX', Math.max(0, length - 36)));
        const pivotX = round3(rearStart + sessionInput(session, 'rearBendLength', 20));
        const rearTerminalDiscMount = rearTerminalDiscMountAnnotation(session, length);
        const rearTerminalDiscMountX = rearTerminalDiscMount.x;

        return [
            {
                zone: 'integrated_headshell',
                tag: cobraContext ? '@integrated_headshell' : '@headshell_pad',
                xRange: zoneAnnotationRange(map, cobraContext ? '@integrated_headshell' : '@headshell_pad', [0, padL]),
                purpose: 'integrated one-piece headshell and controlled flattened cartridge-end/nose; should not read as a random bulb',
                primaryControls: SHAPE_CONTROL_ZONES.front_headshell.ids.slice(),
                source: 'current_profile'
            },
            {
                zone: 'neck_transition',
                tag: '@neck_transition',
                xRange: zoneAnnotationRange(map, '@neck_transition', [padL, round3(padL + neckL)]),
                purpose: 'transition from headshell into the armwand; useful for a smoother long low Cobra-like flow',
                primaryControls: SHAPE_CONTROL_ZONES.neck_transition.ids.slice(),
                source: 'current_profile'
            },
            {
                zone: 'monocoque_armwand',
                tag: cobraContext ? '@monocoque_armwand' : '@main_body',
                xRange: zoneAnnotationRange(map, cobraContext ? '@monocoque_armwand' : '@main_body', [padL, apex]),
                purpose: 'long low monocoque canopy/armwand volume; reduce excessive worm/blob swelling',
                primaryControls: SHAPE_CONTROL_ZONES.main_body.ids.slice(),
                source: 'current_profile'
            },
            {
                zone: 'cobra_canopy',
                tag: cobraContext ? '@cobra_canopy' : '@apex',
                xRange: zoneAnnotationRange(map, cobraContext ? '@cobra_canopy' : '@apex', [round3(padL + neckL), apex]),
                purpose: 'upper canopy curve and disciplined organic arch; visually slim rather than inflated',
                primaryControls: SHAPE_CONTROL_ZONES.main_body.ids.slice(),
                source: 'current_profile'
            },
            {
                zone: 'rear_transition_to_pivot',
                tag: cobraContext ? '@rear_transition_to_pivot' : '@rear_bend',
                xRange: zoneAnnotationRange(map, cobraContext ? '@rear_transition_to_pivot' : '@rear_bend', [rearStart, round3(length)]),
                purpose: cobraActive
                    ? 'armwand rear transition toward pivot/bearing region; must look mechanically connected and must not become a detached decorative hook'
                    : (cobraContext ? 'current profile is Classic Tail while Cobra target reference is active; do not claim this region is current Cobra geometry' : 'classic rear/tail region'),
                primaryControls: SHAPE_CONTROL_ZONES.rear_tail_cobra.ids.slice(),
                source: cobraActive ? 'current_profile' : (cobraContext ? 'current_classic_profile_with_cobra_target_reference' : 'current_profile')
            },
            {
                zone: 'pivot_bearing_area',
                tag: '@pivot_bearing_area',
                xRange: zoneAnnotationRange(map, '@pivot_bearing_area', [pivotX, pivotX]),
                purpose: 'read-only pivot/tower/bearing mechanical reference only; not a counterweight mount and not LT Mechanism',
                primaryControls: [],
                source: 'read_only_reference'
            },
            {
                zone: 'disc_counterweight',
                tag: '@counterweight_stack',
                xRange: zoneAnnotationRange(map, '@counterweight_stack', [rearTerminalDiscMountX, rearTerminalDiscMountX]),
                purpose: 'canonical counterweight = rear-terminal top-anchored downward disc stack; controlled by rearWeightDisc*/rearFineTrim* canonical controls',
                primaryControls: SHAPE_CONTROL_ZONES.counterweight_accessory.ids.slice(),
                source: rearTerminalDiscMount.source,
                mountReference: rearTerminalDiscMount,
                currentGeometrySupport: 'loaded_canonical'
            },
            {
                zone: 'counterweight_trim',
                tag: '@trim_screw',
                xRange: zoneAnnotationRange(map, '@trim_screw', [rearTerminalDiscMountX, rearTerminalDiscMountX]),
                purpose: 'fine-trim screw controls for the canonical rear-terminal top-anchored downward disc stack',
                primaryControls: ['rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent'],
                source: 'current_disc_stack_controls',
                currentGeometrySupport: 'loaded_canonical'
            },
            {
                zone: 'fine_tracking_force_screw',
                tag: '@fine_tracking_force_screw',
                xRange: zoneAnnotationRange(map, '@fine_tracking_force_screw', [round3(length), round3(length)]),
                purpose: 'Cobra fine-trim screw reference; current fine-trim controls are canonical configurable trim controls for this branch',
                primaryControls: ['rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent'],
                source: 'current_disc_stack_control',
                currentGeometrySupport: 'canonical_control'
            }
        ];
    }
    function domText(id) {
        const el = $(id);
        return el ? String(el.textContent || el.value || '').trim() : null;
    }

    function collectMassResonanceSummary() {
        const summary = {
            available: false,
            mass: domText('calcMass'),
            resonance10Hz: domText('calcResonance'),
            totalCOM: domText('dataTotalCOM'),
            rearCOM: domText('dataRearCOM'),
            counterweightCOM: domText('dataCounterweightCOM'),
            cartridgeCOM: domText('dataCartridgeCOM'),
            inertiaVerticalIzz: domText('dataIzz'),
            inertiaHorizontalIyy: domText('dataIyy'),
            radiusOfGyrationVertical: domText('dataKzz')
        };
        summary.available = Object.keys(summary).some(key => key !== 'available' && !!summary[key]);
        summary.note = summary.available
            ? 'Read from current DOM calculation panels when present; use as context only for body-form decisions.'
            : 'Mass/resonance DOM summary not available in this runtime snapshot.';
        return summary;
    }

    function localRoleForStationTag(tag, cobraActive) {
        if (tag === '@integrated_headshell' || tag === '@front_headshell' || tag === '@headshell_pad' || tag === '@nose' || tag === '@cartridge' || tag === '@stylus') return 'integrated headshell / controlled cartridge-end nose';
        if (tag === '@neck_transition' || tag === '@neck') return 'neck transition from headshell into monocoque armwand';
        if (tag === '@monocoque_armwand' || tag === '@cobra_canopy' || tag === '@main_body' || tag === '@apex') return 'long low monocoque canopy / armwand';
        if (tag === '@rear_bend_start') return 'start of rear transition toward pivot';
        if (tag === '@rear_transition_to_pivot' || tag === '@cobra_elbow' || tag === '@rear_bend') return cobraActive ? 'Cobra armwand rear transition toward pivot/bearing area' : 'classic rear bend/tail transition';
        if (tag === '@pivot_bearing_area') return 'pivot/tower/bearing area reference; not LT Mechanism';
        if (tag === '@rear_mouth') return cobraActive ? 'rear mouth/tail transition; not the disc-stack counterweight' : 'rear mouth / tail end';
        if (tag === '@oval_counterweight') return 'legacy oval/capsule counterweight annotation is non-canonical; canonical path is rear-terminal disc stack via rearWeightDisc*';
        if (tag === '@counterweight_underweights') return 'optional counterweight visual/detailing reference; canonical disc stack is controlled by rearWeightDisc*';
        if (tag === '@fine_tracking_force_screw') return 'fine stylus-load trim screw control';
        if (tag === '@cobra_tail' || tag === '@counterweight_stack' || tag === '@trim_screw') return 'actual rear terminal / rear-terminal disc-stack control area';
        return 'sampled tonearm body station';
    }

    function classifyByThreshold(value, shallowLimit, deepLimit, labels) {
        const v = Number(value);
        if (!Number.isFinite(v)) return labels[1];
        if (v < shallowLimit) return labels[0];
        if (v > deepLimit) return labels[2];
        return labels[1];
    }

    function buildCobraModeStatus(session, modelFamily) {
        const actualRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(actualRearMode);
        const cobraProfileSelected = isCobraModelFamily(modelFamily || AI_MODAL_STATE.modelFamily);
        let status = 'ok';
        let message = 'Cobra profile is not selected; current rear/body form is ' + rearModeLabel(actualRearMode) + '.';

        if (cobraProfileSelected && cobraActive) {
            message = 'Cobra AI profile selected and actual rearMode is Cobra integrated tail.';
        } else if (cobraProfileSelected && !cobraActive) {
            status = 'mismatch';
            message = 'Cobra AI profile selected, but current rearMode is Classic Tail. Current geometry is not Cobra.';
        } else if (!cobraProfileSelected && cobraActive) {
            status = 'cobra-active-profile-not-selected';
            message = 'Actual rearMode is Cobra, but AI profile is not Cobra. Consider selecting Cobra / Hollow Elbow tonearm for rear/body form work.';
        }

        return {
            aiProfile: modelFamilyLabel(modelFamily || AI_MODAL_STATE.modelFamily),
            modelFamily: modelFamily || AI_MODAL_STATE.modelFamily,
            actualRearMode,
            actualRearModeLabel: rearModeLabel(actualRearMode),
            cobraActive,
            status,
            message,
            hardMismatch: cobraProfileSelected && !cobraActive,
            profileMapLabel: cobraProfileSelected && !cobraActive
                ? 'Current Classic Tail shape, Cobra target reference active.'
                : (cobraActive ? 'Current Cobra integrated-tail profile.' : 'Current profile.'),
            safeAction: cobraProfileSelected && !cobraActive
                ? 'Primary safe action: use the visible "Activate Cobra rear mode" action to prepare a valid AI delta with selects.rearMode = "cobra_integrated_tail"; then Validate and Apply. Do not switch rearMode silently.'
                : 'Preserve current rearMode unless the user explicitly asks for a different rear/body form.'
        };
    }


    function cobraTextTrigger(userIntentText) {
        const text = String(userIntentText || '');
        if (!text.trim()) return false;
        if (window.CobraArchitecture &&
            typeof window.CobraArchitecture.textContainsCobraArchitectureIntent === 'function') {
            return window.CobraArchitecture.textContainsCobraArchitectureIntent(text);
        }
        if (/\b(?:cobra|copperhead|eggshell|custom_237_05)\b|\b(?:caliburn|continuum)\s+cobra\b|compound\s+curve|\bn1\s*[-–—]?\s*p2\s*(?:=|:)?\s*237[.,]05\b|\b237[.,]05\b/i.test(text)) {
            return true;
        }
        const hasMonocoque = /\bmonocoque\b/i.test(text);
        const hasArmwand = /\barmwand\b/i.test(text);
        const hasOval = /\b(?:oval|avl[aå]ng|avlang|rund)\b/i.test(text);
        const hasCounterweight = /\b(?:counterweight|motvikt)\b/i.test(text);
        return (hasMonocoque && hasArmwand) || (hasOval && hasCounterweight);
    }

    function shouldIncludeCobraReferenceContext(session, family, userIntentText) {
        const actualRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        return isCobraModelFamily(family || AI_MODAL_STATE.modelFamily) ||
            isCobraRearMode(actualRearMode) ||
            cobraTextTrigger(userIntentText);
    }

    function cobraTargetReferenceContext() {
        return {
            source: 'Attached Cobra owners manual and reference images encoded as text design rules; no image generation, no screenshot workflow, no computer-vision runtime dependency.',
            sourceRole: 'target_reference_grammar_only_not_current_geometry',
            sourceInterpretation: [
                'Cobra images/manual facts describe desired design grammar and missing target semantics.',
                'They are not evidence that the current app mesh contains pivot/tower hardware, configurable disc-stack counterweight, headshell slots, screws, underside weights, carbon weave or mechanical details.',
                'Current geometry is summarized primarily by shapeFormContext.computedShapeFacts, supported by shapeFormContext.canonicalShapeProfileContext raw side/top samples, and writable only through leftPanelControlMap.'
            ],
            targetIdentity: {
                productFamily: 'Continuum Cobra-inspired tonearm form reference',
                designIntent: 'long low monocoque tonearm wand with integrated headshell and rear-terminal configurable disc-stack counterweight',
                notLiteralCopy: true,
                note: 'Use as design grammar/reference. Do not claim exact Continuum geometry unless explicitly provided.'
            },
            targetFormGrammar: {
                armWand: [
                    'unique monocoque construction',
                    'advanced fibre/resin technology design language',
                    'shape optimized to reduce resonance',
                    'long, low, sleek monocoque canopy',
                    'smooth continuous upper surface',
                    'controlled taper from main body toward integrated headshell',
                    'not worm-like, not blob-like, not inflated'
                ],
                headshell: [
                    'integrated one-piece headshell',
                    'flattened, purposeful cartridge end',
                    'front does not become random nose bulb',
                    'sleek and mechanically intentional front'
                ],
                mainBody: [
                    'organic but disciplined arch',
                    'wide enough for structure but visually slim',
                    'no excessive mid-body swelling',
                    'glossy smooth canopy impression when rendered'
                ],
                rearTransition: [
                    'rear transition reaches the actual rear terminal and remains separate from the counterweight stack',
                    'drop/curve must look mechanically connected to bearing area',
                    'not a decorative hook detached from pivot logic',
                    'do not blend counterweight into armwand as one unstructured worm tail'
                ],
                counterweight: [
                    'canonical counterweight = rear-terminal top-anchored downward disc stack',
                    'actual rear terminal / unified rear-terminal disc stack',
                    'disc count, disc mass, disc diameter and disc thickness adjustable through rearWeightDisc* controls',
                    'fine-trim screw length and mass-equivalent adjustable through rearFineTrim* controls',
                    'may allow skewing adjustment in azimuth plane',
                    'not an oval/capsule add-on replacing the verified disc stack',
                    'not blended into monocoque armwand as the tail of a worm'
                ]
            },
            strictCurrentVsTargetSeparation: {
                currentGeometrySource: 'shapeFormContext.computedShapeFacts primary summary plus shapeFormContext.canonicalShapeProfileContext supporting raw evidence / main_window_profile_data',
                targetReferenceSource: 'cobraTargetReferenceContext text rules',
                missingGeometryPolicy: 'Do not fake missing Cobra product details with existing sliders. ' + MISSING_GEOMETRY_GATE,
                explicitNoFakeRules: [
                    'Do not infer or claim carbon weave, screws, slots, pivot tower or bearing assembly as current mesh geometry unless represented by current controls/context. The canonical counterweight is represented only by rearWeightDisc*/rearFineTrim* rear-terminal disc-stack controls/context.',
                    'Use rearWeightDisc*/rearFineTrim* as canonical rear-terminal top-anchored downward disc-stack counterweight controls for this design branch.',
                    'Do not use rearBend*, rearMouth*, tailD or bulge controls to fake a configurable disc-stack counterweight.'
                ]
            },
            neutralBalanceAndPivotReference: {
                useAsDesignContextOnly: true,
                rules: [
                    'Cobra uses neutral balance to minimize stylus-load variation over warps.',
                    'Front-end center of mass, vertical pivot and tail-end center of mass should conceptually lie on a straight line.',
                    'The arm vertical pivot should be at record-surface height.',
                    'Do not add a new physics solver unless existing writable data supports it.'
                ]
            },
            geometrySpecReference: {
                useAsReferenceContextOnly: true,
                effectiveLengthMm: 239,
                overhangMm: 17.3,
                mountingDistanceSpindleToPivotMm: 221.7,
                offsetDeg: 23,
                radialClearanceForCounterweightMm: 90,
                instruction: 'Do not force current app geometry to these values unless the user explicitly asks for geometry/spec tuning.'
            },
            targetAvoidList: [
                'Barbapapa silhouette',
                'worm-like continuous tube',
                'fat blob body',
                'counterweight pointing straight backward',
                'oval/capsule add-on replacing the verified disc stack',
                'Cobra mode looking same as classic mode',
                'tail geometry blended into one unstructured mass',
                'counterweight treated as LT Mechanism'
            ]
        };
    }

    function missingCobraGeometryControls() {
        return [
            {
                id: 'cobraCanopyRidge',
                reason: 'Optional future canopy ridge/detail control; current station-based eggshell wand remains the active armwand model.',
                writable: false,
                suggestionOnly: true
            },
            {
                id: 'finalCadFeaDetails',
                reason: 'Production CAD, full FEA and richer visual detailing remain future work. The current branch has canonical disc counterweight controls through rearWeightDisc*.',
                writable: false,
                suggestionOnly: true
            }
        ];
    }

    function cobraGeometryAvailability(session) {
        const discCount = sessionInput(session, 'rearWeightDiscCount', 0);
        return {
            armWandShape: {
                support: 'partial',
                supportedByProtectedCoreGeometryControls: ['apex', 'maxH', 'maxW', 'bow', 'thick', 'neckW', 'neckL', 'headW', 'headH', 'noseL', 'padL', 'padOffset'],
                limitations: [
                    'Existing cross-section controls can make the armwand lower/slimmer but do not directly sculpt a Cobra-specific upper canopy curve.',
                    'Existing main-body controls may still produce continuous worm/blob mass if pushed too wide or tall.'
                ]
            },
            headshellShape: {
                support: 'partial',
                supportedByProtectedCoreGeometryControls: ['padOffset', 'noseL', 'headW', 'padL', 'headH'],
                limitations: [
                    'Can flatten and proportion the front envelope, but no dedicated cartridge-mount slot, screw or one-piece headshell detail control exists.'
                ]
            },
            rearTransitionShape: {
                support: 'partial',
                supportedByProtectedCoreGeometryControls: SHAPE_CONTROL_ZONES.rear_tail_cobra.ids.slice(),
                limitations: [
                    'Can tune protected rear bend/drop/mouth/terminal envelope only; this is not a counterweight assembly model and must not be used to fake or replace the rear-terminal disc-stack counterweight.'
                ]
            },
            counterweightAssembly: {
                support: 'loaded_canonical',
                existingRearWeightDiscControls: SHAPE_CONTROL_ZONES.counterweight_accessory.ids.slice(),
                currentRearWeightDiscCount: round3(discCount),
                limitation: 'Canonical counterweight = rear-terminal top-anchored downward disc stack implemented through rearWeightDisc*/rearFineTrim* controls. Remaining limitations are balance tuning, final CAD/FEA and optional richer visual detailing; protected rear bend/mouth controls are core geometry, not counterweight controls.',
                rearDiscStackDemoted: false,
                canModelDiscCounterweightNow: true
            }
        };
    }

    function buildCobraPartSeparation(session) {
        return {
            armWandShape: {
                targetRole: 'long low monocoque armwand/canopy',
                protectedCoreGeometryControls: SHAPE_CONTROL_ZONES.main_body.ids.concat(SHAPE_CONTROL_ZONES.neck_transition.ids),
                currentControlFamily: 'body cross-section and longitudinal profile sliders'
            },
            headshellShape: {
                targetRole: 'integrated one-piece flattened headshell/nose',
                protectedCoreGeometryControls: SHAPE_CONTROL_ZONES.front_headshell.ids.slice(),
                currentControlFamily: 'front pad/nose/headshell sliders'
            },
            rearTransitionShape: {
                targetRole: 'protected mechanically connected rear transition into pivot/bearing area and actual rear terminal',
                protectedCoreGeometryControls: SHAPE_CONTROL_ZONES.rear_tail_cobra.ids.slice(),
                currentControlFamily: 'existing rear bend/mouth/tail continuation sliders'
            },
            counterweightAssembly: {
                targetRole: 'canonical counterweight = rear-terminal top-anchored downward disc stack with optional fine-trim screw',
                protectedCoreGeometryControls: SHAPE_CONTROL_ZONES.counterweight_accessory.ids.slice(),
                canonicalControls: SHAPE_CONTROL_ZONES.counterweight_accessory.ids.slice(),
                instruction: 'Use rearWeightDisc* and rearFineTrim* as canonical rear-terminal disc-stack counterweight controls. rearBend*, rearMouth*, bulge, maxW, maxH, neckW, neckL and tailD are protected/core TD026 geometry controls; do not misuse them as proxy hacks to fake or replace the disc stack.',
                missingGeometryControls: missingCobraGeometryControls().map(item => item.id)
            }
        };
    }

    function buildCurrentVsCobraTargetDiagnosis(session, shape3d, modelFamily) {
        const family = modelFamily || AI_MODAL_STATE.modelFamily;
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const visualDiagnosis = buildCurrentVisualDiagnosis(session, shape3d, family);
        const profileMetrics = visualDiagnosis.profileMetrics || {};
        const maxWidth = Number(profileMetrics.maxWidthMm || sessionInput(session, 'maxW', 0));
        const maxHeight = Number(profileMetrics.maxHeightMm || sessionInput(session, 'maxH', 0));
        const slenderness = Number(profileMetrics.slendernessRatio || 0);
        const headW = sessionInput(session, 'headW', 0);
        const rearMouthWidth = sessionInput(session, 'rearMouthWidth', 0);
        const tailD = sessionInput(session, 'tailD', 0);
        const discCount = sessionInput(session, 'rearWeightDiscCount', 0);
        const discDiameter = sessionInput(session, 'rearWeightDiscDiameter', 0);
        const currentReadsAs = [];
        const mismatchWarnings = [];

        currentReadsAs.push(cobraActive ? 'current rearMode is cobra_integrated_tail, so the generated rear body uses the existing Cobra/Hollow Elbow bend controls' : 'current rearMode is Classic Tail; generated body is not current Cobra geometry');
        currentReadsAs.push('AI Modal profile map is derived from main_window_profile_data, not a standalone schematic drawing');
        currentReadsAs.push('current max profile width/height approximately ' + round3(maxWidth) + ' mm / ' + round3(maxHeight) + ' mm');
        if (slenderness) currentReadsAs.push('current length-to-max-width slenderness approximately ' + round3(slenderness));
        currentReadsAs.push('current headshell/front width control is about ' + round3(headW) + ' mm');
        currentReadsAs.push('existing counterweight representation is the canonical rear disc/fine-trim stack');

        if (isCobraModelFamily(family) && !cobraActive) mismatchWarnings.push('Cobra AI profile selected but current rearMode is Classic Tail. Current geometry is not Cobra; prompt must not imply it is.');
        if (maxWidth >= 40 || (slenderness && slenderness < 7)) mismatchWarnings.push('current top silhouette may read too wide, worm-like or blob-like for the target long low Cobra armwand');
        if (maxHeight >= 30) mismatchWarnings.push('current side silhouette may read too tall/bulbous rather than low sleek canopy');
        if (rearMouthWidth > Math.max(18, tailD * 1.4)) mismatchWarnings.push('rear mouth/tail may read as a swollen blob rather than a mechanically connected pivot transition');
        if (discCount > 0 && discDiameter > 0) mismatchWarnings.push('current rearWeightDisc* controls define the canonical configurable Cobra disc stack');
        mismatchWarnings.push('canonical configurable disc-stack counterweight is available through rearWeightDisc*; optional richer counterweight visual detailing remains future work.');
        mismatchWarnings.push('disc stack counterweight is separated from armwand by the rearWeightDisc* control path; avoid faking it with rear bend/mouth sliders.');

        return {
            active: shouldIncludeCobraReferenceContext(session, family, null),
            profileSourceTruth: {
                source: 'main_window_profile_data',
                schematicZoneMapUsedAsShapeTruth: false
            },
            currentVisualDiagnosis: visualDiagnosis,
            currentReadsAs: currentReadsAs,
            targetReadsAs: [
                'long low monocoque armwand',
                'integrated one-piece headshell with flattened purposeful cartridge end',
                'organic but disciplined canopy without excessive mid-body swelling',
                'rear transition mechanically connected to pivot/bearing area',
                'rear-terminal canonical disc-stack counterweight controlled by rearWeightDisc*/rearFineTrim*'
            ],
            mismatchWarnings: mismatchWarnings,
            recommendedCorrectionStrategy: [
                'treat shapeFormContext.computedShapeFacts as primary current-form truth and shapeFormContext.canonicalShapeProfileContext as supporting raw profile evidence',
                'treat cobraTargetReferenceContext as desired grammar only',
                'separate armwand shape from counterweight assembly',
                'make armwand lower, sleeker and more controlled where sliders permit',
                'reduce excessive body swelling and top-view width if current values are high',
                'use rearWeightDisc*/rearFineTrim* as the canonical Cobra disc-stack counterweight target',
                'do not use oval/capsule add-ons or rearBend*/rearMouth*/tailD/bulge sliders to fake the counterweight',
                MISSING_GEOMETRY_GATE
            ],
            targetOnlyNotCurrentGeometry: TARGET_ONLY_NOT_CURRENT_GEOMETRY,
            missingGeometryGate: MISSING_GEOMETRY_GATE
        };
    }

    function buildCobraDiagnosis(session, modelFamily) {
        const actualRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(actualRearMode);
        const cobraProfileSelected = isCobraModelFamily(modelFamily || AI_MODAL_STATE.modelFamily);
        const bendStartX = sessionInput(session, 'rearBendStartX', 245);
        const dropZ = sessionInput(session, 'rearBendDropZ', 0);
        const bendLength = sessionInput(session, 'rearBendLength', 20);
        const mouthWidth = sessionInput(session, 'rearMouthWidth', 14);
        const mouthLength = sessionInput(session, 'rearMouthLength', 16);
        const rearBlendLength = sessionInput(session, 'rearBlendLength', 20);
        const bulge = sessionInput(session, 'bulge', 0);
        const tailD = sessionInput(session, 'tailD', 16);
        const maxW = sessionInput(session, 'maxW', 34);
        const maxH = sessionInput(session, 'maxH', 24);
        const rearWeightDiscCount = sessionInput(session, 'rearWeightDiscCount', 0);
        const warnings = [];

        if (cobraProfileSelected && !cobraActive) warnings.push('Cobra AI profile selected but actual rearMode is classic_tail. Do not claim the geometry is Cobra until rearMode is switched by an explicit user request or valid AI delta.');
        if (!cobraActive && [bendStartX, dropZ, bendLength, mouthWidth, mouthLength].some(v => Number.isFinite(Number(v)))) warnings.push('Cobra-related parameters are readable, but they do not define the active rear form while rearMode is classic_tail.');
        if (cobraActive && Math.abs(dropZ) < 6) warnings.push('Cobra drop is shallow; the rear may read as a normal tail rather than a transition toward pivot/bearing area.');
        if (cobraActive && Math.abs(dropZ) > 36) warnings.push('Cobra drop is deep; check for an overly abrupt or heavy elbow.');
        if (cobraActive && bendLength < 12) warnings.push('Short bend length may make the rear transition look abrupt or kinked.');
        if (cobraActive && mouthLength < 8) warnings.push('Short rear mouth may look blunt.');
        if (cobraActive && mouthWidth > Math.max(18, tailD * 1.35)) warnings.push('Rear mouth is wide relative to tail diameter and may look bulbous or worm-like.');
        if (cobraActive && maxW >= 40) warnings.push('Main body width is high for a Cobra-like long low armwand; current silhouette may read blob/worm-like.');
        if (cobraActive && maxH >= 30) warnings.push('Main body height is high for a Cobra-like low canopy; current side silhouette may read bulbous.');
        if (cobraProfileSelected && rearWeightDiscCount > 0) warnings.push('Existing rearWeightDisc controls are the canonical configurable Cobra disc counterweight controls for this branch.');
        warnings.push('Current controls use rearWeightDisc* as the canonical configurable Cobra disc counterweight.');

        const cobraReferenceFit = cobraProfileSelected && !cobraActive
            ? 'not_cobra_because_rearMode_classic_tail'
            : (cobraActive && maxW < 40 && maxH < 30 && mouthWidth <= Math.max(18, tailD * 1.35)
                ? 'partial_armwand_fit_only'
                : (cobraActive ? 'disc_counterweight_available_partial_armwand_fit' : 'unknown_visual_fit'));

        return {
            active: cobraActive,
            profileSelected: cobraProfileSelected,
            actualRearMode,
            bendStartX: round3(bendStartX),
            dropZ: round3(dropZ),
            bendLength: round3(bendLength),
            mouthWidth: round3(mouthWidth),
            mouthLength: round3(mouthLength),
            rearBlendLength: round3(rearBlendLength),
            bulge: round3(bulge),
            tailD: round3(tailD),
            visualCharacter: {
                elbowDepth: classifyByThreshold(Math.abs(dropZ), 10, 26, ['shallow elbow', 'medium elbow', 'deep elbow']),
                mouthLength: classifyByThreshold(mouthLength, 10, 24, ['short mouth', 'medium mouth', 'long mouth']),
                rearMouthWidth: classifyByThreshold(mouthWidth, Math.max(8, tailD * 0.75), Math.max(18, tailD * 1.25), ['narrow rear mouth', 'balanced rear mouth', 'wide rear mouth']),
                neckToRearTransition: (rearBlendLength >= 22 && bendLength >= 20) ? 'smooth neck-to-rear transition' : 'abrupt neck-to-rear transition',
                cobraReferenceFit: cobraReferenceFit
            },
            counterweightSemantics: {
                existingRearWeightDiscsAreCanonicalCobraCounterweight: true,
                existingRearWeightDiscsRole: 'canonical rear-terminal top-anchored downward disc-stack counterweight',
                targetCobraCounterweight: 'canonical counterweight = rear-terminal top-anchored downward disc stack; custom_237_05 uses rearWeightDisc*/rearFineTrim* controls, not oval/capsule add-on and not pivot/tower mounting',
                currentGeometrySupport: 'supported by canonical rear-terminal rearWeightDisc* and rearFineTrim* controls'
            },
            warnings
        };
    }
    function buildFormDiagnosis(session, shape3d, modelFamily) {
        const length = shape3d && Number.isFinite(Number(shape3d.length)) ? Number(shape3d.length) : availableShapeLength(session);
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const headW = sessionInput(session, 'headW', 24);
        const neckW = sessionInput(session, 'neckW', 18);
        const maxW = sessionInput(session, 'maxW', 34);
        const maxH = sessionInput(session, 'maxH', 24);
        const rearBendStartX = sessionInput(session, 'rearBendStartX', Math.max(1, length - 36));
        const rearMouthWidth = sessionInput(session, 'rearMouthWidth', 14);
        const rearBendDropZ = sessionInput(session, 'rearBendDropZ', 0);
        const discCount = sessionInput(session, 'rearWeightDiscCount', 0);

        return {
            headshellShape: 'Front/headshell width is about ' + round3(headW) + ' mm; Cobra target is an integrated one-piece flattened headshell/nose, not a random bulb.',
            armWandShape: maxW >= 40 || maxH >= 30
                ? 'Main body target width/height are about ' + round3(maxW) + ' mm / ' + round3(maxH) + ' mm; risk: too bulbous/worm-like for a long low Cobra canopy.'
                : 'Main body target width/height are about ' + round3(maxW) + ' mm / ' + round3(maxH) + ' mm; current controls can keep the canopy relatively low/sleek if not over-expanded.',
            neck: neckW < headW * 0.72
                ? 'Neck reads slender relative to headshell; use neckW/neckL for a smoother bridge if needed.'
                : 'Neck reads broad or continuous; use neckW/neckL/asym to tune the transition.',
            rearTransitionShape: cobraActive
                ? 'Rear is in Cobra integrated tail mode; bend begins near x=' + round3(rearBendStartX) + ', rear mouth width is about ' + round3(rearMouthWidth) + ' mm, vertical drop is about ' + round3(rearBendDropZ) + ' mm. Treat this as armwand-to-pivot transition only.'
                : 'Rear is in Classic Tail mode; Cobra sliders may be present as context but should not be described as active geometry.',
            counterweightAssembly: discCount > 0
                ? 'Existing canonical rear-terminal top-anchored downward disc stack count is ' + round3(discCount) + '. This is the canonical counterweight = rear-terminal top-anchored downward disc stack for this branch.'
                : 'No rear-terminal disc stack is active; enable rearWeightDisc* controls for the canonical rear-terminal top-anchored downward disc-stack counterweight.',
            cobra: cobraActive
                ? 'Cobra/Hollow Elbow active with vertical drop about ' + round3(rearBendDropZ) + ' mm; tune rear transition carefully. ' + MISSING_GEOMETRY_GATE
                : (isCobraModelFamily(modelFamily) ? 'Cobra AI profile selected while actual rearMode is Classic Tail; resolve mismatch before Cobra-specific form claims.' : 'Cobra not active.')
        };
    }
    function buildShapeVisualContext(currentSession, shape3dContext, modelFamily) {
        const session = currentSession || getCurrentSession();
        const family = MODEL_FAMILIES.indexOf(modelFamily) !== -1 ? modelFamily : AI_MODAL_STATE.modelFamily;
        const shape3d = shape3dContext || buildShape3DContext(session, STANDARD_STATION_SAMPLE_COUNT);
        const currentRearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        const cobraActive = isCobraRearMode(currentRearMode);
        const currentMaterial = getCurrentSelectValue(session, 'material', null);
        const currentCartMode = getCurrentSelectValue(session, 'cartMode', null);
        const canonicalShapeProfileContext = buildCanonicalShapeProfileContext(session, shape3d, family);
        const currentVisualDiagnosis = buildCurrentVisualDiagnosis(session, shape3d, family);
        const computedShapeFacts = buildComputedShapeFacts(session, shape3d, family);
        const cobraDiagnosis = buildCobraDiagnosis(session, family);
        const currentVsCobraTargetDiagnosis = buildCurrentVsCobraTargetDiagnosis(session, shape3d, family);
        const cobraPartSeparation = buildCobraPartSeparation(session);
        const cobraGeometrySupport = cobraGeometryAvailability(session);
        const profileSourceTruth = {
            source: 'main_window_profile_data',
            sideProfileZXSource: 'same data as main Side Profile (Z-X)',
            topProfileYXSource: 'same data as main Top View (Y-X)',
            aiModalVisualSource: 'actual profile map with zone overlays',
            schematicZoneMapUsedAsShapeTruth: false
        };
        const visualTrustPolicy = [
            'AI Modal visual profile is derived from actual current profile data.',
            'Zone overlays are annotations only; they are not additional mesh geometry.',
            'Do not infer shape from decorative schematic drawings.',
            'Side/top profile is actual current geometry envelope; Cobra images/manual rules are target grammar only.',
            'Do not infer carbon weave, pivot/tower hardware, screws, headshell slots, configurable disc-stack counterweight or underside weights as current geometry unless represented by current controls/context.',
            'If profile data and target grammar conflict, profile data describes current shape and target grammar describes desired direction.'
        ];
        const hardMismatchWarning = (isCobraModelFamily(family) && !cobraActive)
            ? 'Cobra AI profile selected, but current rearMode is Classic Tail. Current geometry is not Cobra.'
            : null;

        return {
            format: 'tonearm-shape-form-context-v3',
            units: 'mm',
            source: 'canonical non-image orthographic profile summary generated from current runtime geometry/state',
            shapeContextInstruction: 'You cannot see the canvas. Use shapeFormContext.computedShapeFacts as the primary current-form summary and shapeFormContext.canonicalShapeProfileContext only as supporting raw profile evidence. Do not use decorative schematic drawings as shape truth.',
            profileSourceTruth: profileSourceTruth,
            visualTrustPolicy: visualTrustPolicy,
            coordinateConventions: {
                x: 'length along tonearm from stylus/front toward rear',
                y: 'half-width in top view; positive values are mirrored across y=0',
                z: 'height/thickness in side view; positive z is upward',
                origin: 'x=0 at stylus/front reference when available; values are current runtime millimetres'
            },
            selectedModelFamily: family,
            selectedModelFamilyLabel: modelFamilyLabel(family),
            actualRearMode: currentRearMode,
            currentRearMode: currentRearMode,
            actualRearModeLabel: rearModeLabel(currentRearMode),
            cobraActive: cobraActive,
            hardMismatchWarning: hardMismatchWarning,
            currentShapeLabel: hardMismatchWarning ? 'Current Classic Tail shape, Cobra target reference active.' : (cobraActive ? 'Current Cobra integrated-tail profile.' : 'Current non-Cobra profile.'),
            selectedMaterial: currentMaterial,
            currentMaterial: currentMaterial,
            selectedCartridgeMode: currentCartMode,
            currentCartMode: currentCartMode,
            massResonanceSummary: collectMassResonanceSummary(),
            canonicalShapeProfileContext: canonicalShapeProfileContext,
            sideProfileZX: {
                ref: 'canonicalShapeProfileContext.sideProfileZX',
                source: 'main_window_profile_data',
                stationCount: canonicalShapeProfileContext.stationSampleCount
            },
            topProfileYX: {
                ref: 'canonicalShapeProfileContext.topProfileYX',
                source: 'main_window_profile_data',
                stationCount: canonicalShapeProfileContext.stationSampleCount
            },
            stationSummary: {
                ref: 'canonicalShapeProfileContext.stationSummary',
                count: canonicalShapeProfileContext.stationSampleCount
            },
            stationSampleCount: canonicalShapeProfileContext.stationSampleCount,
            zoneAnnotations: {
                ref: 'canonicalShapeProfileContext.zoneAnnotations',
                count: canonicalShapeProfileContext.zoneAnnotations.length
            },
            targetOnlyNotCurrentGeometry: TARGET_ONLY_NOT_CURRENT_GEOMETRY,
            currentVisualDiagnosis: currentVisualDiagnosis,
            computedShapeFacts: computedShapeFacts,
            sliderEffectMap: { ref: 'sliderEffectMap' },
            cobraSemantics: {
                active: cobraActive,
                profileSelected: isCobraModelFamily(family),
                explanation: 'Cobra/Hollow Elbow is a rear/body integrated elbow/tail tonearm form selected by selects.rearMode. It is not LT Mechanism and is not P1/P2/P3/STATOR/L23.',
                actualRearMode: currentRearMode,
                classicRearModeValue: 'classic_tail',
                cobraRearModeValue: 'cobra_integrated_tail',
                modelFamily: 'cobra_tonearm',
                writableCobraInputs: SHAPE_CONTROL_ZONES.rear_tail_cobra.ids.slice(),
                selectRule: 'If Cobra is not active, suggest selects.rearMode = "cobra_integrated_tail" only when the user explicitly asks for Cobra or Hollow Elbow form or explicitly wants to fix a Cobra profile mismatch. Otherwise preserve current rearMode.',
                shapeRules: [
                    'Profile data describes current shape; Cobra target grammar describes desired direction.',
                    'Prioritize Cobra target grammar when modelFamily is cobra_tonearm: long low monocoque armwand, integrated headshell, rear-terminal configurable disc-stack counterweight.',
                    'Preserve integrated rear transition character when active, but do not confuse rear transition/mouth sliders with the target counterweight.',
                    'Use rearBendStartX, rearBendDropZ and rearBendLength to tune armwand-to-pivot transition only.',
                    'Use rearMouthWidth/rearMouthLength, bulge and tailD to tune rear transition massing; avoid bulbous worm/blob tail.',
                    'Existing rearWeightDisc* controls are canonical configurable Cobra disc counterweight controls.',
                    'Do not use rearBend*, rearMouth*, bulge or tailD sliders to fake a configurable disc-stack counterweight.',
                    MISSING_GEOMETRY_GATE
                ]
            },
            cobraModeStatus: buildCobraModeStatus(session, family),
            cobraDiagnosis: cobraDiagnosis,
            cobraPartSeparation: cobraPartSeparation,
            cobraGeometrySupport: cobraGeometrySupport,
            currentVsCobraTargetDiagnosis: currentVsCobraTargetDiagnosis,
            missingCobraGeometryControls: missingCobraGeometryControls(),
            formDiagnosis: buildFormDiagnosis(session, shape3d, family),
            interpretationRules: [
                SHAPE_CONTEXT_INSTRUCTION,
                'Do not assume any geometry not represented in the prompt.',
                'Prefer small, reversible changes.',
                'Use shapeFormContext.computedShapeFacts.zones first, with shapeFormContext.canonicalShapeProfileContext.sideProfileZX as supporting evidence, to reason about vertical silhouette and rear drop.',
                'Use shapeFormContext.computedShapeFacts.zones first, with shapeFormContext.canonicalShapeProfileContext.topProfileYX as supporting evidence, to reason about width, bulk, necking and rear mouth/tail proportions.',
                'Do not return fields that are not writable in leftPanelControlMap.',
                'Do not represent target-only Cobra details as current geometry; use missingCobraGeometryControls and unsupportedAttributes to document gaps while still delivering a best-effort writable-control delta.'
            ]
        };
    }

    function shapeZoneForInput(id) {
        return SHAPE_CONTROL_ID_TO_ZONE[id] || null;
    }

    function shapeZoneLabel(zoneKey) {
        return zoneKey && SHAPE_CONTROL_ZONES[zoneKey] ? SHAPE_CONTROL_ZONES[zoneKey].label : null;
    }

    function addUniqueId(list, id) {
        if (!id || list.indexOf(id) !== -1) return;
        list.push(id);
    }

    function getAllInputIds(session) {
        const ids = [];
        if (typeof inputs !== 'undefined' && Array.isArray(inputs)) {
            inputs.forEach(id => addUniqueId(ids, id));
        }
        if (window.Session && Array.isArray(window.Session.EXTRA_INPUT_IDS)) {
            window.Session.EXTRA_INPUT_IDS.forEach(id => addUniqueId(ids, id));
        }
        if (window.ParameterMetadata && typeof window.ParameterMetadata.all === 'function') {
            window.ParameterMetadata.all().forEach(meta => addUniqueId(ids, meta && meta.id));
        }
        const inputMap = session && session.inputs ? session.inputs : {};
        Object.keys(inputMap).forEach(id => addUniqueId(ids, id));
        return ids;
    }

    function domNumericAttr(el, name, fallback) {
        if (!el || typeof el.getAttribute !== 'function') return fallback;
        const raw = el.getAttribute(name);
        if (raw == null || raw === '') return fallback;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function inputCurrentValue(id, session, el) {
        const inputMap = session && session.inputs ? session.inputs : {};
        if (Object.prototype.hasOwnProperty.call(inputMap, id)) return inputMap[id];
        if (!el) return null;
        const parsed = Number(el.value);
        return Number.isFinite(parsed) ? parsed : el.value;
    }


    function cobraControlInterpretation(id) {
        if (SHAPE_CONTROL_ZONES.counterweight_accessory.ids.indexOf(id) !== -1) {
            return {
                cobraRole: 'canonical_disc_counterweight_control',
                canonicalCobraCounterweight: true,
                instruction: 'Use this rear disc/fine-trim control as part of the canonical Cobra configurable disc-stack counterweight.'
            };
        }
        if (SHAPE_CONTROL_ZONES.rear_tail_cobra.ids.indexOf(id) !== -1) {
            return {
                cobraRole: 'rear_transition_shape',
                canonicalCobraCounterweight: false,
                protectedCoreGeometryControl: true,
                instruction: 'Use for protected armwand-to-pivot/rear-terminal geometry only; do not fake a configurable rear-terminal disc-stack counterweight with this control.'
            };
        }
        if (SHAPE_CONTROL_ZONES.main_body.ids.indexOf(id) !== -1) {
            return {
                cobraRole: 'armwand_canopy_shape',
                instruction: 'Use to move toward long low monocoque canopy while avoiding blob/worm swelling.'
            };
        }
        if (SHAPE_CONTROL_ZONES.front_headshell.ids.indexOf(id) !== -1) {
            return {
                cobraRole: 'integrated_headshell_shape',
                instruction: 'Use to keep the front/headshell controlled and flattened.'
            };
        }
        return undefined;
    }

    function inputControlRecord(id, session, allowedInputs) {
        const el = $(id);
        const meta = getParameterMetadata(id);
        const metaMin = meta && Number.isFinite(Number(meta.min)) ? Number(meta.min) : null;
        const metaMax = meta && Number.isFinite(Number(meta.max)) ? Number(meta.max) : null;
        const metaStep = meta && Number.isFinite(Number(meta.step)) ? Number(meta.step) : null;
        const min = domNumericAttr(el, 'min', metaMin);
        const max = domNumericAttr(el, 'max', metaMax);
        const step = domNumericAttr(el, 'step', metaStep);
        const writable = !!(meta && meta.aiWritable === true && allowedInputs.indexOf(id) !== -1);
        const locked = !!(meta && meta.aiWritable === false);
        const zoneKey = shapeZoneForInput(id);

        return {
            id,
            path: meta && meta.path ? meta.path : 'inputs.' + id,
            label: meta && meta.label ? meta.label : id,
            currentValue: inputCurrentValue(id, session, el),
            min,
            max,
            step,
            precision: meta && Number.isInteger(meta.precision) ? meta.precision : null,
            writable,
            locked,
            contextOnly: !writable && !locked,
            category: meta && meta.category ? meta.category : 'uncategorized',
            shapeZone: zoneKey,
            shapeZoneLabel: shapeZoneLabel(zoneKey),
            affects: meta && meta.description ? meta.description : 'Left-panel numeric control.',
            notes: meta && meta.notes ? meta.notes : undefined,
            cobraInterpretation: cobraControlInterpretation(id),
            boundsSource: el ? 'DOM/current runtime' : (meta ? 'parameter metadata' : 'unknown')
        };
    }

    function selectControlRecord(id, session) {
        const el = $(id);
        const options = el && el.options ? Array.from(el.options).map(option => ({
            value: option.value,
            label: option.textContent
        })) : [];
        const selectMap = session && session.selects ? session.selects : {};
        const writable = getAllowedSelects().indexOf(id) !== -1;
        return {
            id,
            path: 'selects.' + id,
            label: id,
            currentValue: Object.prototype.hasOwnProperty.call(selectMap, id) ? selectMap[id] : (el ? el.value : null),
            options,
            writable,
            affects: SELECT_CONTROL_DESCRIPTIONS[id] || 'Left-panel select control.'
        };
    }

    function checkboxControlRecord(id, session) {
        const el = $(id);
        const checkboxMap = session && session.checkboxes ? session.checkboxes : {};
        const writable = getAllowedCheckboxes().indexOf(id) !== -1;
        return {
            id,
            path: 'checkboxes.' + id,
            label: id,
            currentValue: Object.prototype.hasOwnProperty.call(checkboxMap, id) ? !!checkboxMap[id] : !!(el && el.checked),
            writable,
            affects: CHECKBOX_CONTROL_DESCRIPTIONS[id] || 'Left-panel checkbox/display control.'
        };
    }

    function flagControlRecord(id, session) {
        const flags = session && session.flags ? session.flags : {};
        const writable = id === 'isEstimatedC10';
        return {
            id,
            path: 'flags.' + id,
            label: id,
            currentValue: Object.prototype.hasOwnProperty.call(flags, id) ? !!flags[id] : false,
            writable,
            affects: FLAG_CONTROL_DESCRIPTIONS[id] || 'Runtime/session flag.'
        };
    }

    function buildLeftPanelControlMap(session) {
        const s = session || getCurrentSession();
        const allowedInputs = getAllowedInputs();
        const writableInputs = [];
        const contextOnlyInputs = [];
        const lockedInputs = [];

        getAllInputIds(s).forEach(id => {
            const record = inputControlRecord(id, s, allowedInputs);
            if (record.writable) writableInputs.push(record);
            else if (record.locked) lockedInputs.push(record);
            else contextOnlyInputs.push(record);
        });

        return {
            source: 'main left panel DOM + Session + ParameterMetadata',
            rule: 'AI may read every listed control as context. AI may write only controls with writable=true. For default shape design, prefer small slider changes in writableInputs and leave selects, checkboxes and flags empty unless the user explicitly asks for them. For Cobra targets, rearWeightDisc* controls are canonical configurable disc-stack counterweight controls.',
            writableInputs,
            contextOnlyInputs,
            lockedInputs,
            selects: getAllowedSelects().map(id => selectControlRecord(id, s)),
            checkboxes: getAllowedCheckboxes().map(id => checkboxControlRecord(id, s)),
            flags: ['isEstimatedC10'].map(id => flagControlRecord(id, s)),
            cobraControlInterpretation: {
                rearWeightDiscControls: 'canonical configurable Cobra disc counterweight controls',
                rearTransitionControls: 'armwand-to-pivot transition only; do not fake a configurable disc-stack counterweight',
                missingCobraGeometryControls: missingCobraGeometryControls()
            }
        };
    }

    function shapePriorityGroups() {
        return Object.keys(SHAPE_CONTROL_ZONES).map(zoneKey => ({
            zone: zoneKey,
            label: SHAPE_CONTROL_ZONES[zoneKey].label,
            fields: SHAPE_CONTROL_ZONES[zoneKey].ids.slice(),
            explanation: SHAPE_CONTROL_ZONES[zoneKey].explanation
        }));
    }

    function promptRoleText() {
        return 'You are the TonearmDesigner AI Shape Designer. You cannot see the canvas. Your task is to compare current shape context against the target reference grammar when provided, then propose small, safe slider/select changes using shapeFormContext.computedShapeFacts as primary current-form truth, shapeFormContext.canonicalShapeProfileContext as supporting raw evidence, and leftPanelControlMap for writable controls. Return only a strict JSON delta.';
    }

    function promptPurpose() {
        return [
            'Propose small, safe slider changes to improve the tonearm 3D body shape.',
            'You cannot see the canvas. Use shapeFormContext.computedShapeFacts as the primary current-form summary and shapeFormContext.canonicalShapeProfileContext only as supporting raw profile evidence; use leftPanelControlMap as the source of writable controls.',
            'Do not assume any geometry not represented in the prompt.',
            'Prefer small, reversible changes.',
            'Default to shape/form controls: front/headshell, neck/transition, main body and rear/tail/cobra.',
            'Use tracking, cartridge and physics controls only as readable context unless the user explicitly asks for mass, resonance, compliance, cartridge or alignment tuning.',
            'Do not suggest changes to the LT Mechanism, P1, P2, P3, STATOR, STATOR_TRACK, L23 or mechanism animation controls.',
            'Do not generate images, screenshots, prose, comments or markdown.',
            'If the user request exceeds available writable controls, still deliver the best possible partial implementation using writable controls and document unsupported geometry in unsupportedAttributes.',
            MISSING_GEOMETRY_GATE
        ];
    }

    function domainContext() {
        return {
            project: 'Engrove TonearmDesigner',
            toolType: 'Parametric tonearm 3D body shape designer and review tool.',
            modelScope: [
                'The AI Modal is focused on the visible 3D tonearm body form.',
                'The external AI does not see the canvas. The prompt must be read as the complete text/JSON source of shape truth.',
                'The left panel contains the editable source controls. The prompt includes each control with current value, runtime min/max/step where applicable, readable/writable status and a short explanation.',
                'shapeFormContext.computedShapeFacts is the primary current-form summary; shapeFormContext.canonicalShapeProfileContext provides supporting non-image orthographic side/top profile samples, station summaries and zone annotations.',
                'The parameter metadata registry and current DOM are the authorities for units, valid ranges, precision, runtime bounds and AI-writable status.',
                'AI context, prompt payloads, diagnostics and shape3d summaries are not saved to normal session files.'
            ],
            coordinateConventions: {
                x: 'longitudinal axis from stylus/front toward rear/tail',
                y: 'left/right half-width axis in top view',
                z: 'vertical side-view axis'
            },
            writableRule: 'Only fields with writable=true in the leftPanelControlMap may be changed in the JSON delta.',
            forbiddenContext: 'Do not modify, tune or reason primarily about LT Mechanism, P1/P2/P3/STATOR/L23 or mechanism animation in this AI Shape Designer prompt. Cobra/Hollow Elbow is a tonearm rear/body form mode and is not LT Mechanism.'
        };
    }

    function modelFamilyContexts() {
        return {
            shape_designer: {
                role: 'Default tonearm 3D form/shape design context.',
                guidance: [
                    'Prefer small body-shape slider deltas.',
                    'Prioritize the shapePriorityGroups in the prompt.',
                    'Keep all values within current runtime bounds and respect dependent constraints after apply.'
                ]
            },
            tonearm_3d_form: {
                role: 'Tonearm 3D body form refinement context.',
                guidance: [
                    'Focus on sculptural continuity, safe proportions and smooth transitions across front, neck, main body and rear/tail zones.',
                    'Avoid physics/alignment edits unless explicitly requested.',
                    'Return empty delta rather than inventing missing geometry controls.'
                ]
            },
            cobra_tonearm: {
                role: 'Cobra-inspired tonearm target-reference mode.',
                guidance: [
                    'Cobra is a first-class rear/body tonearm form mode selected by rearMode = cobra_integrated_tail; it is not LT Mechanism.',
                    'Compare current generated shape against cobraTargetReferenceContext and cobraArchitecture: long low monocoque armwand, integrated headshell, and the canonical configurable rear disc-stack counterweight. In the custom_237_05 regime the counterweight target is the rearWeightDisc*/rearFineTrim* controlled disc stack, rear-terminal mounted and Z0/under-Z0 oriented; do not use oval/capsule add-ons or rearBend*/tailD/bulge/maxW/maxH/neckW/neckL as counterweight proxies.',
                    'Use rearBlendLength, rearBendStartX, rearBendDropZ, rearBendLength, rearMouthWidth, rearMouthLength, bulge and tailD only for the armwand-to-pivot rear transition.',
                    'Use rearWeightDisc* controls as the canonical configurable Cobra disc counterweight path.',
                    'Always compare selected modelFamily against actualRearMode/cobraModeStatus before claiming Cobra geometry is active.',
                    'If Cobra is inactive, suggest selects.rearMode = "cobra_integrated_tail" only when the user explicitly asks for Cobra/Hollow Elbow form or asks to fix the mismatch.',
                    MISSING_GEOMETRY_GATE
                ]
            },
            ai_vibe_3d_onshape: {
                role: 'AI Vibe 3D Onshape handoff orchestrator.',
                guidance: [
                    'Primary goal: exact 1:1 positive tonearm reference model for Onshape downstream modelling.',
                    'Prefer the tonearm-designer-ai-vibe-3d-response schema with semantic actions plus optional legacy full-passthrough delta.',
                    'Do not request mould flanges, registration pins, draft changes, shrinkage or split-mould output unless explicitly asked.',
                    'Preserve stylus, pivot, LP top plane and millimetre scale as protected datums.',
                    'Use featureGraph, onshapeHandoffTarget, printabilityAudit and allowedActions before choosing slider changes.'
                ]
            },
            freeform_centerline_ring_loft: {
                role: 'Freeform centerline/ring loft mode for TD052.',
                guidance: [
                    'Freeform centerline/ring loft mode: use bendable centerline + abstract form rings + separate feature objects.',
                    'Return tonearm-designer-ai-freeform-loft-response, not the legacy slider delta schema.',
                    'Do not return STL/OBJ/mesh triangles; the local deterministic loft kernel builds geometry.',
                    'Protected datums remain locked: stylus point, pivot point, LP plane, N1-P2/effective length, cartridge datum and headshell plane.',
                    'Use unsupportedAttributes for geometry outside the TD052 freeform schema.'
                ]
            },
            custom: {
                role: 'Custom body-shape design context.',
                guidance: [
                    'Use only listed controls and current shape3d context.',
                    'Keep changes small and reversible.',
                    'Do not assume hidden geometry, extra mechanisms or external design data.'
                ]
            }
        };
    }

    function geometryAssumptionsAndLimits() {
        return [
            'The AI cannot see the canvas; use shapeFormContext.computedShapeFacts as primary current-form truth, shapeFormContext.canonicalShapeProfileContext as supporting raw profile evidence, and leftPanelControlMap as writable-control truth.',
            'shape3d is reduced read-only context, not a full mesh.',
            'Full STL/OBJ data and full mesh topology are not included in this prompt.',
            'Do not assume hidden dimensions, hidden parts, invisible clearances or unlisted constraints.',
            'Do not create unknown geometry fields, hidden controls, solver behavior or new physics models.',
            'You may only propose changes to fields explicitly marked writable=true in leftPanelControlMap.',
            'If the requested goal depends on unavailable geometry or unavailable writable controls, do not invent fields; deliver the best partial writable-control implementation and list the missing attributes in unsupportedAttributes.',
            MISSING_GEOMETRY_GATE
        ];
    }


    function readEmbeddedDocumentText(id) {
        const el = $(id);
        if (!el) return '';
        return String(el.textContent || '').trim();
    }

    function readEmbeddedJsonDocument(id) {
        const text = readEmbeddedDocumentText(id);
        if (!text) return null;
        try { return JSON.parse(text); }
        catch (err) { return { parseError: err && err.message ? err.message : String(err), rawText: text }; }
    }

    function aiVibeSculptReferenceDocuments() {
        return {
            purpose: 'Embedded complete TD051 AI Vibe 3D response schema and Markdown sculpt-form specification. This is included in every Copy full AI prompt output so an external AI agent has the exact TD051 output contract: sparse shape patches only, protected-state filtering, no full-state passthrough, Cobra invariants after sanitize/apply, front-ramp continuity audit and titaniumMountPlate/headshellSlots semantic separation.',
            schemaFormat: 'JSON Schema draft 2020-12 object under aiVibe3DSculptReferenceDocuments.schemaJson',
            markdownSpecFormat: 'Plain Markdown string under aiVibe3DSculptReferenceDocuments.markdownSpec',
            schemaJson: readEmbeddedJsonDocument('aiVibeSculptRuntimeSchema'),
            markdownSpec: readEmbeddedDocumentText('aiVibeSculptFormSpec')
        };
    }

    function buildCobraExample(session) {
        const allowedInputs = getAllowedInputs();
        const desiredInputs = {
            sculptHeadFlatEnabled: 1,
            sculptHeadFlatStartX: 0,
            sculptHeadFlatEndX: 36,
            sculptHeadBottomZ: -3,
            sculptHeadBlendLength: 22,
            sculptHeadFlatWidthFraction: 0.72,
            sculptStepSuppressor: 1,
            sculptFrontStiffnessRampEnabled: 1,
            sculptFrontMinHeight: 5.8,
            sculptFrontRampStartX: 0,
            sculptFrontRampEndX: 78,
            sculptFrontRampTargetHeight: 10,
            sculptFrontTopBias: 0.95,
            headH: 6.2,
            neckW: 16
        };
        const inputs = {};
        Object.keys(desiredInputs).forEach(k => {
            if (allowedInputs.indexOf(k) !== -1) inputs[k] = desiredInputs[k];
        });

        return {
            schema: AI_DELTA_SCHEMA,
            version: AI_DELTA_VERSION,
            app: APP_VERSION,
            modelFamily: 'cobra_tonearm',
            name: 'cobra_sparse_shape_patch',
            inputs,
            selects: {},
            checkboxes: {},
            flags: {},
            unsupportedAttributes: [
                'underside_weight_pocket',
                'anti_skate_mechanism'
            ]
        };
    }

    function outputContractForPrompt(family, includeCobraReference, session) {
        return {
            strict: true,
            returnOnly: 'minified sparse shape-patch JSON object; no markdown, prose, comments, code fences or explanations',
            schema: AI_DELTA_SCHEMA,
            version: AI_DELTA_VERSION,
            app: APP_VERSION,
            modelFamily: family,
            allowedTopLevelFields: ['schema', 'version', 'app', 'modelFamily', 'name', 'inputs', 'selects', 'checkboxes', 'flags', 'unsupportedAttributes'],
            architectureGateResultFormat: {
                enabledWhen: 'Cobra context detected by enabled architecture, Cobra model family, Cobra rearMode, explicit custom_237_05 spec regime, or Cobra-specific user intent; default architecture.specRegime alone is not a context signal',
                topLevelFields: ['status', 'selectedSpecRegime', 'mustDevelopModules', 'hardConstraints', 'delta', 'unmetRequirements', 'validationPlan'],
                statusValues: ['ok', 'blocked_by_capability', 'source_conflict'],
                requiredRule: 'If required Cobra capabilities are missing, return status="blocked_by_capability" and list mustDevelopModules. Do not place a pretend ok Cobra delta in delta{}.',
                discCounterweightRule: 'For selectedSpecRegime custom_237_05 and counterweight.variant configurable_disc_stack, use rearWeightDiscDiameter, rearWeightDiscThickness, rearWeightDiscCount, rearWeightDiscMass, rearFineTrimScrewLength, rearFineTrimScrewMassEquivalent and counterweightZOffset as canonical configurable Cobra disc counterweight controls; mass fields must remain non-negative; do not solve counterweight through rearBend*, tailD, bulge, maxW, maxH, neckW or neckL.',
                requiredValidationPlan: ['apply canonical Cobra preset', 'run CobraAcceptance.runStaticAcceptance known_good', 'run runtime measured acceptance when browser/UI is available', 'reject if N1-P2 != 237.05', 'reject if counterweightCOM.z > 0', 'reject if EI_min <= 0', 'reject if exportValidation != PASS', 'reject Cobra proxy deltas that mutate rearBend*, tailD, bulge, maxW, maxH, neckW or neckL; rearWeightDisc*/rearFineTrim*/counterweightZOffset are canonical configurable Cobra disc counterweight controls']
            },
            notesAllowed: false,
            rationaleOutsideJsonAllowed: false,
            unknownFieldsAllowed: false,
            rearModeSelectPolicy: 'TD049 protected-state rule: external AI shape patches must not write selects.rearMode. Cobra rearMode is established by trusted semantic actions and post-sanitize Cobra invariants, not by external full-state passthrough.',
            sparsePatchRule: {
                description: 'TD049: AI deltas MUST be sparse patches. Include only fields that are intentionally changed. Do not return full-state passthrough objects.',
                rationale: 'Sparse patches prevent accidental mutation of alignment, datum, Cobra gate, checkbox, counterweight and diagnostic state.',
                enforcement: 'validateAIDelta does not auto-fill omitted controls. Non-sculpt inputs, selects, checkboxes and flags are ignored or rejected before apply.',
                exception: 'A genuine no-op template is permitted only with name "no_interpretable_request" and empty inputs/selects/checkboxes/flags.'
            },
            titaniumMountPlateContract: {
                version: 'TD051',
                rule: 'Titanium mounting plate is a structural laminated interface between the carbon armwand / integrated headshell structure and the cartridge / tonehead mounting surface. It must not be placed as a loose underside plate below the cartridge or headshell.',
                semanticSeparation: 'headshellSlots.plate/slotCarrierPlate is slot-carrier/reference geometry for M2.5 cartridge slots; titaniumMountPlate is the structural titanium interface plate.',
                writableControls: ['titaniumPlateEnabled', 'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass', 'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset', 'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor'],
                runtimeBinding: 'TitaniumMountPlate.resolveTitaniumMountPlatePose consumes titaniumPlateX/Y/ZOffset and clamps X to the headshell-to-neck interface zone. If titaniumPlateEnabled=false, render/export must not emit a titaniumMountPlate.'
            },
            unsupportedAttributesSchema: {
                description: 'Optional array of strings naming geometric or mechanical Cobra attributes that the requested design implies but that are NOT exposed as writable controls. The AI lists them here for transparency. Listing an attribute here does NOT excuse the AI from making a best-effort partial implementation.',
                arrayOf: 'string',
                examples: [
                    'underside_weight_pocket',
                    'pivot_tower_separation',
                    'anti_skate_mechanism'
                ],
                forbiddenAsExcuse: 'unsupportedAttributes MUST NOT be used as a justification for empty inputs/selects/checkboxes blocks. Best-effort partial delta is mandatory.'
            },
            preferredAIVibe3DResponse: {
                schema: AI_VIBE_RESPONSE_SCHEMA,
                version: AI_VIBE_RESPONSE_VERSION,
                app: APP_VERSION,
                intent: 'onshape_ready_exact_positive_model',
                actions: [
                    { op: 'set_onshape_1to1' },
                    { op: 'fix_export_slivers', strategy: 'soft_pass_sub_001_mm2_when_manifold' },
                    { op: 'preserve_reference_datums', datums: ['stylus_point', 'pivot_point', 'lp_top_plane', 'x_length_axis', 'y_mirror_axis', 'z_vertical_axis'] },
                    { op: 'flatten_headshell_underside', startX: 0, endX: 36, zMm: -3, blendLengthMm: 22, widthFraction: 0.72, minHeightMm: 5.8, rampEndX: 78, targetHeightMm: 10.0 },
                    { op: 'stiffen_front_ramp', startX: 0, endX: 78, minHeightMm: 5.8, targetHeightMm: 10.0, topBias: 0.95 }
                ],
                delta: null,
                validationTargets: {
                    units: 'mm',
                    scale: 1,
                    geometryKind: 'positive_reference_mesh',
                    exportType: 'onshape_1to1',
                    exactOneToOne: true,
                    boundaryEdgesMax: 0,
                    nonManifoldEdgesMax: 0,
                    degenerateTrianglesMax: 0,
                    sliverTrianglesPreferredMax: 0,
                    minTriangleAreaPreferredMm2: 0.00001,
                    preserveScale1To1: true,
                    preserveCurrentCoordinateFrame: true,
                    requiredDatums: ['stylus_point', 'pivot_point', 'lp_top_plane', 'x_length_axis', 'y_mirror_axis', 'z_vertical_axis'],
                    forbiddenTransformations: ['mould_offset', 'draft_modification', 'shrinkage_compensation', 'split_mould_flange', 'registration_pins', 'pour_gates', 'vent_channels']
                }
            },
            requiredShape: {
                schema: AI_DELTA_SCHEMA,
                version: AI_DELTA_VERSION,
                app: APP_VERSION,
                modelFamily: family,
                name: 'short_descriptive_name',
                inputs: {},
                selects: {},
                checkboxes: {},
                flags: {},
                unsupportedAttributes: []
            },
            cobraSpecificExample: family === 'cobra_tonearm' ? buildCobraExample(session || getCurrentSession()) : undefined,
            emptyDeltaWhenRequestUninterpretable: {
                schema: AI_DELTA_SCHEMA,
                version: AI_DELTA_VERSION,
                app: APP_VERSION,
                modelFamily: family,
                name: 'no_interpretable_request',
                inputs: {},
                selects: {},
                checkboxes: {},
                flags: {},
                unsupportedAttributes: []
            },
            emptyDeltaWhenRequestUninterpretablePolicy: 'emptyDeltaWhenRequestUninterpretable is reserved for genuinely unparseable user intent. It MUST NOT be used when the user requests something that requires geometry not exposed as writable controls — in that case, deliver the best partial implementation and list the unsupported attributes in unsupportedAttributes.',
            forbidden: [
                'No markdown.',
                'No comments.',
                'No explanations inside returned JSON.',
                'No unknown fields.',
                'No image generation.',
                'No LT mechanism fields.',
                'No invented parameters.',
                'No full-state examples or full-state passthrough.',
                'Do not return copied session selects, checkboxes or flags.',
                'Do not write protected alignment/cart/physics/mass/export/global fields such as apex, cartX, rearMode, counterweight mass controls, export toggles or diagnostic gates.',
                'Do not switch selects.rearMode unless the user explicitly requests Cobra/Hollow/Classic Tail OR the request requires it. When in doubt, keep current rearMode and note the implication in unsupportedAttributes.',
                'Use rearWeightDisc* as canonical disc counterweight controls. Do not use rearBend*, tailD, bulge, maxW, maxH, neckW or neckL as Cobra proxy controls.',
                'Do not use rearBend*, rearMouth*, bulge or tailD sliders to fake a configurable disc-stack counterweight.',
                'Do not infer carbon weave, pivot/tower, screws, headshell slots or mechanical details as current geometry.',
                'When user-requested Cobra-specific geometry is not writable, deliver the best partial implementation and document the gap in unsupportedAttributes. Do NOT return empty inputs/selects/checkboxes.',
                MISSING_GEOMETRY_GATE
            ]
        };
    }

    function currentValueSummary(session, controlMap) {
        const values = {};
        const map = controlMap || buildLeftPanelControlMap(session);
        (map.writableInputs || []).concat(map.contextOnlyInputs || [], map.lockedInputs || []).forEach(record => {
            values[record.id] = record.currentValue;
        });
        return values;
    }

    function promptControlSummary(controlMap) {
        const map = controlMap || buildLeftPanelControlMap(getCurrentSession());
        return {
            inventoryFormat: 'leftPanelControlMap contains sparse-patch writableInputs plus contextOnlyInputs, lockedInputs, protected selects, protected checkboxes and protected flags. Each entry includes currentValue, readable/writable/locked/contextOnly status, bounds where applicable and affects/explanation.',
            rearModeProductNote: 'selects.rearMode is a first-class body form selector: classic_tail or cobra_integrated_tail / Hollow Elbow Cobra.',
            writableInputCount: map.writableInputs.length,
            contextOnlyInputCount: map.contextOnlyInputs.length,
            lockedInputCount: map.lockedInputs.length,
            selectCount: map.selects.length,
            checkboxCount: map.checkboxes.length,
            flagCount: map.flags.length
        };
    }

    function buildEngineeringTargets(session) {
        const src = (session && session.inputs) || {};
        const read = function(id, fallback) {
            if (src[id] !== undefined && Number.isFinite(Number(src[id]))) return Number(src[id]);
            if (typeof state !== 'undefined' && state[id] !== undefined && Number.isFinite(Number(state[id]))) return Number(state[id]);
            const el = $(id);
            if (el && Number.isFinite(Number(el.value))) return Number(el.value);
            return fallback;
        };
        const targetEffectiveMassG = read('targetEffectiveMass', 12.0);
        const targetLFResonanceHz = read('targetLFResonance', 9.0);
        const targetVTFG = read('targetVTF', 2.0);
        const targetFirstBendingModeHz = read('targetFirstBendingMode', 200.0);
        const slenderMin = read('targetSlendernessMin', 7.0);
        const slenderMax = read('targetSlendernessMax', 10.0);

        return {
            source: 'Design Goals panel',
            role: 'engineering target context for AI deltas; targets are constraints/goals, not proof of current performance',
            targetEffectiveMassG,
            targetLFResonanceHz,
            acceptableLFResonanceHz: { min: 8, max: 12 },
            targetVTFG,
            targetFirstBendingModeHz,
            targetSlendernessRange: { min: slenderMin, max: slenderMax },
            instruction: 'Prefer sparse deltas that move the current form toward these targets without violating shape/moldability constraints. If visual target and engineering target conflict, return the safest sparse best-effort delta and explain unsupported geometry in unsupportedAttributes.'
        };
    }

    function buildAIPrompt(currentSession, zoneMap, modelFamily, userIntentText) {
        const family = MODEL_FAMILIES.indexOf(modelFamily) !== -1 ? modelFamily : AI_MODAL_STATE.modelFamily;
        const session = currentSession || getCurrentSession();
        if (family === 'freeform_centerline_ring_loft' && window.FreeformLoftKernel && typeof window.FreeformLoftKernel.buildFreeformPrompt === 'function') {
            return window.FreeformLoftKernel.buildFreeformPrompt(
                (session && session.freeformLoft) || (window.FreeformLoftKernel.getCurrentFreeformState && window.FreeformLoftKernel.getCurrentFreeformState()),
                userIntentText || ''
            );
        }
        const cobraArchitecture = getCobraArchitectureContract(session);
        const cobraCapabilityManifest = getCobraCapabilityManifestForPrompt();
        const cobraPromptContext = (window.CobraArchitecture &&
            typeof window.CobraArchitecture.isCobraArchitectureContext === 'function')
            ? window.CobraArchitecture.isCobraArchitectureContext(session, { modelFamily: family, userIntentText: userIntentText })
            : { detected: !!(cobraArchitecture && cobraArchitecture.enabled) };
        const cobraGatePreviewPayload = cobraPromptContext.detected
            ? { status: 'ok', selectedSpecRegime: cobraArchitecture.specRegime, delta: {} }
            : { status: 'ok', delta: {} };
        const cobraGatePreview = validateAIArchitectureGate(
            cobraGatePreviewPayload,
            session,
            { modelFamily: family, userIntentText: userIntentText }
        );
        const map = zoneMap || window.ZONE_MAP || { version: 1, common: [], families: {} };
        const zones = zonesForFamily(map, family);
        const shape3d = buildShape3DContext(session, STANDARD_STATION_SAMPLE_COUNT);
        const shapeFormContext = buildShapeVisualContext(session, shape3d, family);
        const shapeVisualContext = buildCompactShapeVisualContext(shapeFormContext);
        const familyContexts = modelFamilyContexts();
        const leftPanelControlMap = buildLeftPanelControlMap(session);
        const currentRearMode = shapeFormContext.actualRearMode;
        const cobraActive = !!shapeFormContext.cobraActive;
        const promptBuiltAt = new Date().toISOString();
        const stationCount = shapeFormContext.stationSampleCount || (shapeFormContext.canonicalShapeProfileContext ? shapeFormContext.canonicalShapeProfileContext.stationSampleCount : 0);
        const includeCobraReference = shouldIncludeCobraReferenceContext(session, family, userIntentText);
        const hardMismatch = isCobraModelFamily(family) && !cobraActive;
        const promptMetadata = {
            promptBuiltAt,
            builtFromModelFamily: family,
            builtFromModelFamilyLabel: modelFamilyLabel(family),
            builtFromRearMode: currentRearMode,
            builtFromRearModeLabel: rearModeLabel(currentRearMode),
            cobraActive,
            stationSamplesIncluded: stationCount,
            shapeContextIncluded: true,
            shapeContextFormat: shapeFormContext.format,
            canonicalProfileFormat: shapeFormContext.canonicalShapeProfileContext ? shapeFormContext.canonicalShapeProfileContext.format : null,
            profileSourceTruth: { ref: 'shapeFormContext.profileSourceTruth' },
            cobraTargetReferenceContextIncluded: includeCobraReference,
            hardMismatch: hardMismatch
        };

        const cobraReference = includeCobraReference ? cobraTargetReferenceContext() : null;
        const currentVsCobraTargetDiagnosis = includeCobraReference ? buildCurrentVsCobraTargetDiagnosis(session, shape3d, family) : null;
        if (currentVsCobraTargetDiagnosis) {
            currentVsCobraTargetDiagnosis.active = true;
            currentVsCobraTargetDiagnosis.includedBecause = 'modelFamily, rearMode or user intent requested Cobra target reference context';
        }
        const cobraMissingControls = includeCobraReference ? missingCobraGeometryControls() : [];
        const cobraParts = includeCobraReference ? buildCobraPartSeparation(session) : null;
        const cobraAvailability = includeCobraReference ? cobraGeometryAvailability(session) : null;
        const aiVibe3DContext = (window.AIVibe3D && typeof window.AIVibe3D.buildAIModalContext === 'function')
            ? window.AIVibe3D.buildAIModalContext(state)
            : null;

        const promptPayload = {
            adaptivePromptVersion: 'TD051',
            role: promptRoleText(),
            defaultTask: 'Propose small, safe slider/select changes to improve the tonearm 3D body shape.',
            selfContainedPromptRules: [
                SHAPE_CONTEXT_INSTRUCTION,
                'The external AI agent only sees this prompt; do not rely on screenshots, canvas, app UI or previous context.',
                'Do not assume any geometry not represented in shapeFormContext, shapeVisualContext or leftPanelControlMap.',
                'AI Modal visual/source is main_window_profile_data. Decorative schematic zone maps are not shape truth.',
                'Strict separation: current geometry = sampled side/top profile and controls; Cobra reference images/manual = target grammar; missing geometry = not writable and must not be faked.',
                'Do not hallucinate carbon weave, pivot/tower, configurable disc-stack counterweight, headshell slots, screws or mechanical details as existing geometry.',
                'Prefer small, reversible changes.',
                'Use engineeringTargets as quantitative design goals; do not sacrifice geometry safety or outputContract validity to chase a target.',
                'Return strict JSON only.',
                hardMismatch ? 'Hard mismatch: Cobra AI profile selected, but current rearMode is Classic Tail. Current geometry is not Cobra. Make this impossible to miss.' : 'No Cobra/classic rearMode mismatch detected.',
                includeCobraReference ? 'Cobra target reference context is included; compare current generated shape against target grammar before choosing any delta.' : 'No Cobra target reference context is active unless user/model/rearMode asks for it.',
                includeCobraReference ? MISSING_GEOMETRY_GATE : 'If requested goal requires missing geometry, deliver a best-effort writable-control delta and list unsupported attributes rather than returning empty blocks.'
            ],
            promptMetadata,
            cobraArchitecture,
            cobraCapabilityManifest,
            cobraAICapabilityGate: {
                status: cobraGatePreview.status,
                mustDevelopModules: cobraGatePreview.mustDevelopModules || [],
                unmetRequirements: cobraGatePreview.unmetRequirements || [],
                rule: 'If Cobra context is detected by enabled architecture, Cobra model family, Cobra rearMode, explicit custom_237_05 spec regime, or Cobra-specific user intent, and required modules are missing, the AI result status must be blocked_by_capability. Default architecture.specRegime alone is not a Cobra-context signal. Do not return status ok for a Cobra delta in a missing-capability state. When all capabilities are loaded, validate through CobraAcceptance with known_good plus runtime_measured when browser/UI metrics are available.',
                validationPlan: ['apply canonical Cobra preset', 'run CobraAcceptance.runStaticAcceptance known_good', 'run runtime measured acceptance when browser/UI is available', 'reject if N1-P2 != 237.05', 'reject if counterweightCOM.z > 0', 'reject if EI_min <= 0', 'reject if exportValidation != PASS', 'reject Cobra proxy deltas that mutate rearBend*, tailD, bulge, maxW, maxH, neckW or neckL; rearWeightDisc*/rearFineTrim*/counterweightZOffset are canonical configurable Cobra disc counterweight controls']
            },
            engagementPolicy: {
                rule: 'When the user describes a design that exceeds the writable controls, the AI MUST deliver its best partial implementation using all available writable controls. The AI MUST NOT use empty deltas as a passive safety mechanism.',
                deliverable: 'A complete, valid sparse AI delta that changes only the necessary writable shape controls. Document missing geometric features in unsupportedAttributes (string array). The user reads unsupportedAttributes to understand the gap; they do NOT read it as an excuse for inaction.',
                forbiddenPatterns: [
                    'Returning empty inputs/selects/checkboxes blocks while citing missing controls.',
                    'Returning a delta named "no_safe_cobra_delta_' + 'missing_geometry".',
                    'Stopping at one or two slider changes when the user requested an ambitious design.'
                ],
                requiredPatterns: [
                    'Sparse patch: include changed writable shape inputs only; never echo full current state.',
                    'Use the minimum necessary shape controls aggressively enough to approximate the requested design without full-state passthrough.',
                    'unsupportedAttributes lists the missing geometric features in snake_case.',
                    'name field describes what the AI actually delivered, e.g. "cobra_partial_canopy_and_rear_transition".'
                ]
            },
            purpose: promptPurpose(),
            domainContext: domainContext(),
            selectedModelFamily: family,
            selectedModelFamilyLabel: modelFamilyLabel(family),
            selectedModelFamilyContext: familyContexts[family],
            modelFamilyContextCatalog: familyContexts,
            profileSourceTruth: { ref: 'shapeFormContext.profileSourceTruth' },
            visualTrustPolicy: { ref: 'shapeFormContext.visualTrustPolicy' },
            targetOnlyNotCurrentGeometry: { ref: 'shapeFormContext.targetOnlyNotCurrentGeometry' },
            currentVisualDiagnosis: { ref: 'shapeFormContext.currentVisualDiagnosis' },
            computedShapeFacts: { ref: 'shapeFormContext.computedShapeFacts', primaryCurrentFormTruth: true },
            currentVsTargetSeparationPolicy: {
                currentGeometry: 'shapeFormContext.computedShapeFacts primary summary plus shapeFormContext.canonicalShapeProfileContext supporting raw profile evidence; source=main_window_profile_data',
                targetReferenceGrammar: 'cobraTargetReferenceContext when included',
                missingGeometry: 'missingCobraGeometryControls; not writable; must not be represented as current mesh',
                returnWhenMissing: 'never use a missing-geometry gap as a reason for an empty Cobra delta; deliver best-effort writable controls and list gaps in unsupportedAttributes'
            },
            hallucinationGuard: {
                enabled: true,
                rule: 'Do not convert target reference imagery into claimed current geometry or writable deltas.',
                commonExternalAIMistakesToAvoid: [
                    'carbon weave treated as geometry proof',
                    'invented pivot/tower hardware',
                    'invented oval/capsule add-on replacing the verified rearWeightDisc* disc stack',
                    'invented headshell slots, screws and mechanical details',
                    'using rear bend/mouth sliders to fake counterweight hardware'
                ]
            },
            currentContext: {
                appPurpose: 'Parametric 3D tonearm body shape designer.',
                coordinateConventions: shapeFormContext.coordinateConventions,
                actualRearMode: currentRearMode,
                currentRearMode: currentRearMode,
                cobraActive: cobraActive,
                selectedMaterial: shapeFormContext.selectedMaterial,
                selectedCartridgeMode: shapeFormContext.selectedCartridgeMode,
                massResonanceSummary: shapeFormContext.massResonanceSummary,
                currentSelects: session.selects || {},
                userIntentTriggerText: userIntentText || '',
                cobraReferenceContextActive: includeCobraReference,
                profileSourceTruth: { ref: 'shapeFormContext.profileSourceTruth' },
                hardMismatchWarning: shapeFormContext.hardMismatchWarning,
                currentShapeLabel: shapeFormContext.currentShapeLabel,
                promptMustNotImplyCurrentGeometryIsCobra: hardMismatch
            },
            engineeringTargets: buildEngineeringTargets(session),
            aiVibe3DContext: aiVibe3DContext,
            onshapeHandoffTarget: aiVibe3DContext ? aiVibe3DContext.onshapeHandoffTarget : null,
            printabilityAudit: aiVibe3DContext ? aiVibe3DContext.audit : null,
            allowedSemanticActions: aiVibe3DContext ? aiVibe3DContext.allowedActions : [],
            shapePriorityGroups: shapePriorityGroups(),
            sliderEffectMap: { ref: 'sliderEffectMap' },
            cobraModePolicy: {
                cobraIsBodyFormMode: true,
                rearBodyFormMode: true,
                notLTMechanism: true,
                actualRearMode: currentRearMode,
                cobraActive: cobraActive,
                cobraModelFamily: 'cobra_tonearm',
                cobraRearModeValue: 'cobra_integrated_tail',
                classicRearModeValue: 'classic_tail',
                cobraWritableInputs: SHAPE_CONTROL_ZONES.rear_tail_cobra.ids.slice(),
                cobraPriorityControls: Object.keys(SLIDER_EFFECT_MAP).filter(id => SLIDER_EFFECT_MAP[id].cobraPriority),
                rearModeWriteRule: 'Only include selects.rearMode = "cobra_integrated_tail" when the user explicitly asks for Cobra/Hollow Elbow form or explicitly asks to fix the visible Cobra profile/rearMode mismatch. Do not silently switch design mode.',
                counterweightWriteRule: 'Use rearWeightDisc* as canonical Cobra disc counterweight controls. Never use rearBend*, tailD, bulge, maxW, maxH, neckW or neckL as proxy controls for Cobra counterweight or station-based eggshell armwand.',
                missingGeometryReturnRule: MISSING_GEOMETRY_GATE,
                activateCobraRearModePrimaryWhenMismatch: hardMismatch
            },
            cobraModeStatus: shapeFormContext.cobraModeStatus,
            cobraDiagnosis: shapeFormContext.cobraDiagnosis,
            cobraTargetReferenceContext: cobraReference,
            currentVsCobraTargetDiagnosis: currentVsCobraTargetDiagnosis,
            cobraPartSeparation: cobraParts,
            cobraGeometryAvailability: cobraAvailability,
            missingCobraGeometryControls: cobraMissingControls,
            formDiagnosis: shapeFormContext.formDiagnosis,
            geometryAssumptionsAndLimits: geometryAssumptionsAndLimits(),
            outputContract: outputContractForPrompt(family, includeCobraReference, session),
            aiVibe3DSculptReferenceDocuments: aiVibeSculptReferenceDocuments(),
            leftPanelControlMap,
            controlInventorySummary: promptControlSummary(leftPanelControlMap),
            currentValues: {
                inputs: currentValueSummary(session, leftPanelControlMap),
                selects: session.selects || {},
                checkboxes: session.checkboxes || {},
                flags: session.flags || {}
            },
            zoneContext: {
                modelFamily: family,
                zoneCount: zones.length,
                dedicatedCobraZoneMap: family === 'cobra_tonearm',
                visualZonesAreOverlaysOnActualProfile: true,
                zones: zones.map(z => ({ tag: z.tag, label: z.label, description: z.description }))
            },
            shapeFormContext: shapeFormContext,
            shapeVisualContext: { ref: 'shapeFormContext.canonicalShapeProfileContext', note: 'Compatibility key retained; raw side/top/station arrays are stored once under shapeFormContext.canonicalShapeProfileContext.' },
            canonicalShapeProfileContext: {
                ref: 'shapeFormContext.canonicalShapeProfileContext',
                note: 'Canonical side/top/station arrays are intentionally stored once under shapeFormContext to avoid duplicate massive arrays.'
            },
            shape3dContext: {
                readOnly: true,
                source: shape3d.source,
                sourceMethod: shape3d.sourceMethod,
                stationSampleCount: stationCount,
                boundingBox: shape3d.boundingBox,
                keyPoints: shape3d.keyPoints,
                zoneGeometryMap: shape3d.zoneGeometryMap,
                limits: [
                    'shape3d is a compact read-only context summary.',
                    'It is not full mesh, STL, OBJ or complete physical geometry.',
                    'Use shapeFormContext.computedShapeFacts first; use shapeFormContext.canonicalShapeProfileContext for supporting side/top raw silhouette and station reasoning.',
                    'Do not infer hidden dimensions or create geometry from shape3d.'
                ]
            }
        };

        AI_MODAL_STATE.lastPromptBuiltAt = promptBuiltAt;
        AI_MODAL_STATE.lastPromptFamily = family;
        AI_MODAL_STATE.lastPromptRearMode = currentRearMode;
        AI_MODAL_STATE.lastPromptCobraActive = cobraActive;
        AI_MODAL_STATE.lastPromptStationCount = stationCount;
        AI_MODAL_STATE.lastPromptShapeContextIncluded = true;

        return [
            family === 'ai_vibe_3d_onshape' ? 'TonearmDesigner FAS19 AI Modal Onshape Handoff prompt/payload.' : 'TonearmDesigner TD051 AI Vibe 3D sparse sculpt prompt/payload.',
            family === 'ai_vibe_3d_onshape' ? 'Task: Return an AI Vibe 3D response for exact 1:1 positive Onshape reference-model handoff. Use semantic actions first and legacy full-state delta only when needed.' : 'Task: Return a sparse TD051 shape patch. Titanium plate controls are valid only for the structural interface plate; do not describe or place a loose underside plate.',
            SHAPE_CONTEXT_INSTRUCTION,
            'The external AI agent does not see the app, canvas, screenshots or previous context; this prompt is the complete shape source.',
            'The AI Modal visual is an actual profile map derived from main_window_profile_data with annotation overlays; decorative schematic drawings are not shape truth.',
            'Strict separation: current geometry is the actual side/top profile and writable controls; Cobra reference material is target grammar; missing Cobra details must not be faked.',
            hardMismatch ? 'HARD MISMATCH: Cobra AI profile selected, but current rearMode is Classic Tail. Current geometry is not Cobra. The Activate Cobra rear mode delta is the primary safe action if the user wants Cobra geometry.' : 'No Cobra/classic rearMode hard mismatch detected.',
            family === 'ai_vibe_3d_onshape' ? 'Read the full payload below, then return only a strict JSON object matching outputContract.preferredAIVibe3DResponse. Include semantic actions; include a legacy tonearm-designer-ai-delta full-passthrough in delta only if slider/select changes are required.' : 'Read the full payload below, then return only the strict sparse JSON delta described by outputContract. Include only intended shape changes in inputs; leave selects, checkboxes and flags empty unless the contract explicitly permits them. Use unsupportedAttributes for missing Cobra/mechanical features rather than empty blocks.',
            family === 'ai_vibe_3d_onshape' ? 'Use aiVibe3DContext.featureGraph, onshapeHandoffTarget, printabilityAudit, allowedSemanticActions and currentValues. Preserve scale=1, units=mm, stylus datum, pivot datum and LP top plane.' : 'Use only writable=true sparse shape-patch fields from leftPanelControlMap. Do not return full-state passthrough. titaniumPlateX/Y/ZOffset are writable only because runtime TitaniumMountPlate.resolveTitaniumMountPlatePose uses them for actual interface-plate geometry. Prefer computedShapeFacts, engineeringTargets, shapePriorityGroups, sliderEffectMap, canonicalShapeProfileContext and cobraTargetReferenceContext when present.',
            'Cobra / Hollow Elbow is a rear/body tonearm form mode controlled by selects.rearMode, not LT Mechanism.',
            includeCobraReference ? 'Cobra target: long low monocoque armwand, integrated headshell and rear-terminal canonical disc-stack counterweight controlled by rearWeightDisc*; not worm/blob and not oval/capsule add-on. These are target grammar, not proof that current mesh has those details.' : 'Cobra target context is inactive for this prompt.',
            'Do not modify LT Mechanism, P1/P2/P3/STATOR/L23 or mechanism animation controls.',
            'The full prompt payload embeds the complete JSON Schema and Markdown form specification under aiVibe3DSculptReferenceDocuments.schemaJson and aiVibe3DSculptReferenceDocuments.markdownSpec. Use those embedded documents as the normative AI Vibe 3D output contract.',
            'Do not return markdown, comments, explanations, notes, rationale text, images or any unknown fields.',
            '',
            JSON.stringify(promptPayload, null, 2),
            '',
            family === 'ai_vibe_3d_onshape' ? 'Final reminder: output must be exactly one minified JSON object matching outputContract.preferredAIVibe3DResponse. No markdown or prose.' : 'Final reminder: output must be exactly one minified JSON object matching outputContract.requiredShape. Use outputContract.emptyDeltaWhenRequestUninterpretable only for genuinely unparseable user intent.'
        ].join('\n');
    }

    function safeNumericDeltaField() {
        const preferred = ['maxW', 'neckW', 'maxH', 'headW'];
        for (let i = 0; i < preferred.length; i++) {
            const id = preferred[i];
            const el = $(id);
            if (!el) continue;
            const current = Number(el.value);
            if (!Number.isFinite(current)) continue;
            const min = Number.isFinite(parseFloat(el.min)) ? parseFloat(el.min) : -Infinity;
            const max = Number.isFinite(parseFloat(el.max)) ? parseFloat(el.max) : Infinity;
            let next = id === 'maxW' ? 38 : current + 1;
            if (String(current) === String(next)) next = current + 1;
            if (next > max) next = current - 1;
            if (next < min || next > max || next === current) continue;
            return {
                id,
                current,
                next,
                min: Number.isFinite(min) ? min : null,
                max: Number.isFinite(max) ? max : null
            };
        }
        return {
            id: 'maxW',
            current: null,
            next: 38,
            min: null,
            max: null
        };
    }

    function makeValidTestDelta() {
        const field = safeNumericDeltaField();
        return {
            schema: AI_DELTA_SCHEMA,
            version: AI_DELTA_VERSION,
            app: APP_VERSION,
            modelFamily: AI_MODAL_STATE.modelFamily,
            name: 'developer_diagnostic_valid_delta',
            inputs: Object.assign({}, { [field.id]: field.next }),
            selects: {},
            checkboxes: {},
            flags: {}
        };
    }

    function makeInvalidTestDelta() {
        return {
            schema: AI_DELTA_SCHEMA,
            version: AI_DELTA_VERSION,
            app: APP_VERSION,
            modelFamily: AI_MODAL_STATE.modelFamily,
            name: 'developer_diagnostic_invalid_delta',
            inputs: { NOPE: 1 },
            selects: {},
            checkboxes: {},
            flags: {}
        };
    }

    function prepareCobraActivationDelta() {
        const delta = {
            schema: AI_DELTA_SCHEMA,
            version: AI_DELTA_VERSION,
            app: APP_VERSION,
            modelFamily: 'cobra_tonearm',
            name: 'activate_cobra_rear_mode',
            inputs: {},
            selects: {},
            checkboxes: {},
            flags: {}
        };
        AI_MODAL_STATE.modelFamily = 'cobra_tonearm';
        const familyEl = $('aiModelFamily');
        if (familyEl) familyEl.value = 'cobra_tonearm';
        setAIResponseDelta(delta);
        AI_MODAL_STATE.lastValidation = validateAIDelta(delta);
        renderZoneMap();
        refreshFamilySummary();
        updatePromptStaleWarning();
        setStatus(AI_MODAL_STATE.lastValidation.ok ? 'info' : 'error', AI_MODAL_STATE.lastValidation.ok ? [
            'Prepared Cobra rear-mode activation as a strict AI delta.',
            'This did not change rearMode yet.',
            'Review, Validate, then Apply delta to switch selects.rearMode to cobra_integrated_tail.'
        ] : AI_MODAL_STATE.lastValidation.errors);
        return delta;
    }

    function setAIResponseDelta(delta) {
        const el = $('aiResponseText');
        const text = JSON.stringify(delta);
        if (el) {
            el.value = text;
            el.focus();
        }
        AI_MODAL_STATE.lastGeneratedDelta = delta;
        return text;
    }

    function extractFirstJSONObject(text) {
        const raw = String(text == null ? '' : text).trim();
        if (!raw) throw new Error('AI response is empty.');
        let cleaned = raw;
        const fenceMatch = cleaned.match(/```(?:json|javascript|js)?[^\n]*\n([\s\S]*?)```/i);
        if (fenceMatch) cleaned = fenceMatch[1].trim();
        const start = cleaned.indexOf('{');
        if (start < 0) throw new Error('No JSON object found in AI response.');
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < cleaned.length; i += 1) {
            const ch = cleaned[i];
            if (inString) {
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') { inString = true; continue; }
            if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) return cleaned.slice(start, i + 1);
            }
        }
        throw new Error('JSON object is not balanced.');
    }

    function parseDelta(deltaOrText) {
        if (typeof deltaOrText === 'string') {
            return JSON.parse(extractFirstJSONObject(deltaOrText));
        }
        return deltaOrText;
    }

    function hasPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function pushWarning(warnings, text) {
        if (warnings.indexOf(text) === -1) warnings.push(text);
    }

    function sanitizeAIDeltaForRuntime(delta, warnings) {
        if (!hasPlainObject(delta)) return delta;
        const allowedInputs = getAllowedInputs();
        const allowedSelects = getAllowedSelects();
        const allowedCheckboxes = getAllowedCheckboxes();
        ['inputs', 'selects', 'checkboxes', 'flags'].forEach(section => {
            if (delta[section] !== undefined && !hasPlainObject(delta[section])) {
                pushWarning(warnings, 'Ignoring non-object section: ' + section);
                delta[section] = {};
            }
        });
        if (!hasPlainObject(delta.inputs)) delta.inputs = {};
        if (!hasPlainObject(delta.selects)) delta.selects = {};
        if (!hasPlainObject(delta.checkboxes)) delta.checkboxes = {};
        if (!hasPlainObject(delta.flags)) delta.flags = {};

        if (delta.checkboxes.enableCobraArchitecture === true) delta.checkboxes.cobraArchitectureEnabled = true;
        if (delta.checkboxes.cobraArchitectureEnabled === true) delta.checkboxes.enableCobraArchitecture = true;

        Object.keys(delta.inputs).forEach(id => {
            const el = $(id);
            if (allowedInputs.indexOf(id) === -1 || !el) {
                pushWarning(warnings, 'Ignoring non-writable or missing input field: ' + id);
                delete delta.inputs[id];
            }
        });
        Object.keys(delta.selects).forEach(id => {
            const el = $(id);
            if (allowedSelects.indexOf(id) === -1 || !el) {
                pushWarning(warnings, 'Ignoring non-writable or missing select field: ' + id);
                delete delta.selects[id];
            }
        });
        Object.keys(delta.checkboxes).forEach(id => {
            const el = $(id);
            if (allowedCheckboxes.indexOf(id) === -1 || !el) {
                pushWarning(warnings, 'Ignoring non-writable or missing checkbox field: ' + id);
                delete delta.checkboxes[id];
            }
        });
        Object.keys(delta.flags).forEach(id => {
            if (id !== 'isEstimatedC10') {
                pushWarning(warnings, 'Ignoring unknown flag field: ' + id);
                delete delta.flags[id];
            }
        });
        return delta;
    }

    function validateNoUnknownTopLevel(delta, errors) {
        const allowedTop = ['schema', 'version', 'app', 'modelFamily', 'name', 'inputs', 'selects', 'checkboxes', 'flags', 'unsupportedAttributes'];
        Object.keys(delta).forEach(key => {
            if (allowedTop.indexOf(key) === -1) errors.push('Unknown top-level field: ' + key);
        });
    }

    function validateAIDelta(deltaOrText) {
        const errors = [];
        const warnings = [];
        let delta;

        try {
            delta = parseDelta(deltaOrText);
        } catch (err) {
            return {
                ok: false,
                errors: ['Invalid JSON: ' + (err && err.message ? err.message : String(err))],
                warnings: [],
                delta: null
            };
        }

        if (!hasPlainObject(delta)) {
            return { ok: false, errors: ['AI delta must be a JSON object.'], warnings: [], delta: null };
        }

        const originalAIResult = isArchitectureAIResultObject(delta) ? delta : null;
        if (originalAIResult) {
            const gate = validateAIArchitectureGate(originalAIResult, getCurrentSession(), {
                modelFamily: originalAIResult.modelFamily || (originalAIResult.delta && originalAIResult.delta.modelFamily),
                selectedSpecRegime: originalAIResult.selectedSpecRegime
            });
            if (gate.status !== 'ok') {
                return {
                    ok: false,
                    errors: ['AI capability gate returned ' + gate.status + ': ' + ((gate.unmetRequirements || []).join('; ') || 'blocked')],
                    warnings: (gate.mustDevelopModules && gate.mustDevelopModules.length) ? ['Must develop modules: ' + gate.mustDevelopModules.join(', ')] : [],
                    delta: null,
                    aiResult: originalAIResult,
                    capabilityGate: gate
                };
            }
            delta = originalAIResult.delta;
            if (!hasPlainObject(delta)) {
                return { ok: false, errors: ['AI result delta must be an object when status is ok.'], warnings: [], delta: null };
            }
        }

        sanitizeAIDeltaForRuntime(delta, warnings);

        validateNoUnknownTopLevel(delta, errors);

        if (delta.schema !== AI_DELTA_SCHEMA) errors.push('schema must be "' + AI_DELTA_SCHEMA + '".');
        if (delta.version !== AI_DELTA_VERSION) errors.push('version must be ' + AI_DELTA_VERSION + '.');
        const ACCEPTED_DELTA_APPS = ['V28.3.' + '12', 'V28.3.' + '13', 'V28.3.' + '14', 'V28.3.' + '15', 'V28.3.' + '16', 'V28.4.4-Fas16.1c-CounterweightSupportBridge', 'V28.6.1-Fas18b-Onshape1To1ExactModel', 'V28.7.0-Fas19-AIModalOnshapeHandoff', APP_VERSION];
        if (!ACCEPTED_DELTA_APPS.includes(delta.app)) {
            errors.push('app must be one of ' + ACCEPTED_DELTA_APPS.join(', ') + ' (got "' + delta.app + '").');
        } else if (delta.app !== APP_VERSION) {
            console.info('[TD051] Accepting legacy delta from ' + delta.app + ', migrating to ' + APP_VERSION);
        }
        if (MODEL_FAMILIES.indexOf(delta.modelFamily) === -1) {
            errors.push('modelFamily must be one of: ' + MODEL_FAMILIES.join(', '));
        }

        ['inputs', 'selects', 'checkboxes', 'flags'].forEach(section => {
            if (typeof delta[section] === 'undefined') return;
            if (!hasPlainObject(delta[section])) errors.push(section + ' must be an object.');
        });

        const allowedInputs = getAllowedInputs();
        const allowedSelects = getAllowedSelects();
        const allowedCheckboxes = getAllowedCheckboxes();

        const inputMap = hasPlainObject(delta.inputs) ? delta.inputs : {};
        Object.keys(inputMap).forEach(id => {
            const meta = getParameterMetadata(id);
            if (meta && meta.aiWritable === false) {
                errors.push('AI-locked input field: ' + id);
                return;
            }
            if (allowedInputs.indexOf(id) === -1) {
                pushWarning(warnings, 'Ignoring unknown input field: ' + id);
                delete inputMap[id];
                return;
            }
            const value = inputMap[id];
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                errors.push('Input "' + id + '" must be a finite number.');
                return;
            }
            const el = $(id);
            if (!el) {
                pushWarning(warnings, 'Ignoring input control not found in DOM: ' + id);
                delete inputMap[id];
                return;
            }
            const bounds = inputBoundsFromMetadataOrDOM(id, el);
            if (Number.isFinite(bounds.min) && value < bounds.min) {
                errors.push('Input "' + id + '" is below min ' + bounds.min + '.');
                return;
            }
            if (Number.isFinite(bounds.max) && value > bounds.max) {
                errors.push('Input "' + id + '" is above max ' + bounds.max + '.');
                return;
            }
            const normalized = normalizeInputValue(id, el, value);
            if (normalized.rounded) {
                warnings.push('Input "' + id + '" will be rounded to nearest step: ' + normalized.text + '.');
            }
        });

        const selectMap = hasPlainObject(delta.selects) ? delta.selects : {};
        Object.keys(selectMap).forEach(id => {
            if (allowedSelects.indexOf(id) === -1) {
                pushWarning(warnings, 'Ignoring unknown select field: ' + id);
                delete selectMap[id];
                return;
            }
            const el = $(id);
            if (!el) {
                pushWarning(warnings, 'Ignoring select control not found in DOM: ' + id);
                delete selectMap[id];
                return;
            }
            const value = selectMap[id];
            if (typeof value !== 'string') {
                errors.push('Select "' + id + '" must be a string.');
                return;
            }
            const options = Array.from(el.options || []).map(o => o.value);
            if (options.indexOf(value) === -1) {
                errors.push('Invalid option for "' + id + '": ' + value);
            }
        });

        const checkboxMap = hasPlainObject(delta.checkboxes) ? delta.checkboxes : {};
        Object.keys(checkboxMap).forEach(id => {
            if (allowedCheckboxes.indexOf(id) === -1) {
                pushWarning(warnings, 'Ignoring unknown checkbox field: ' + id);
                delete checkboxMap[id];
                return;
            }
            if (typeof checkboxMap[id] !== 'boolean') {
                errors.push('Checkbox "' + id + '" must be boolean.');
            }
        });

        const flagMap = hasPlainObject(delta.flags) ? delta.flags : {};
        Object.keys(flagMap).forEach(id => {
            if (id !== 'isEstimatedC10') {
                pushWarning(warnings, 'Ignoring unknown flag field: ' + id);
                delete flagMap[id];
                return;
            }
            if (typeof flagMap[id] !== 'boolean') {
                errors.push('Flag "isEstimatedC10" must be boolean.');
            }
        });

        if (delta.unsupportedAttributes !== undefined) {
            if (!Array.isArray(delta.unsupportedAttributes)) {
                errors.push('unsupportedAttributes must be an array of strings.');
            } else {
                delta.unsupportedAttributes.forEach((s, i) => {
                    if (typeof s !== 'string') {
                        errors.push('unsupportedAttributes[' + i + '] must be a string.');
                    }
                });
            }
        }

        // TD049: sparse patch policy. Do not auto-fill omitted controls.
        const isEmptyTemplate = (delta.name === 'no_interpretable_request');
        if (!isEmptyTemplate && errors.length === 0) {
            const submittedInputs = Object.keys(inputMap).length;
            const submittedSelects = Object.keys(selectMap).length;
            const submittedCheckboxes = Object.keys(checkboxMap).length;
            if (submittedInputs === 0 && submittedSelects === 0 && submittedCheckboxes === 0) {
                warnings.push('Sparse delta contains no writable shape changes; only semantic AI Vibe actions or unsupportedAttributes may have effect.');
            }
        }

        if (errors.length === 0) {
            const gateSession = getCurrentSession();
            const gateArchitecture = getCobraArchitectureContract(gateSession);
            const gateContext = (window.CobraArchitecture &&
                typeof window.CobraArchitecture.isCobraArchitectureContext === 'function')
                ? window.CobraArchitecture.isCobraArchitectureContext(gateSession, {
                    result: originalAIResult,
                    delta,
                    modelFamily: delta.modelFamily
                })
                : { detected: !!(gateArchitecture && gateArchitecture.enabled) };
            const gatePayload = originalAIResult || (gateContext.detected
                ? { status: 'ok', selectedSpecRegime: gateArchitecture.specRegime, delta }
                : { status: 'ok', delta });
            const gateOptions = { modelFamily: delta.modelFamily };
            if (originalAIResult &&
                Object.prototype.hasOwnProperty.call(originalAIResult, 'selectedSpecRegime') &&
                originalAIResult.selectedSpecRegime !== undefined &&
                originalAIResult.selectedSpecRegime !== null) {
                gateOptions.selectedSpecRegime = originalAIResult.selectedSpecRegime;
            }
            const gate = validateAIArchitectureGate(gatePayload, gateSession, gateOptions);
            if (gate.status !== 'ok') {
                errors.push('AI capability gate returned ' + gate.status + ': ' +
                    ((gate.unmetRequirements || []).join('; ') || 'blocked'));
                if (gate.mustDevelopModules && gate.mustDevelopModules.length) {
                    warnings.push('Must develop modules: ' + gate.mustDevelopModules.join(', '));
                }
            }
        }

        return {
            ok: errors.length === 0,
            errors,
            warnings,
            delta: errors.length === 0 ? delta : null
        };
    }

    function decimalsFromStep(step) {
        const text = String(step == null ? '' : step);
        if (text.indexOf('e-') !== -1) return Number(text.split('e-')[1]) || 0;
        const i = text.indexOf('.');
        return i === -1 ? 0 : text.length - i - 1;
    }

    function precisionForMetadata(meta, el) {
        const p = meta ? Number(meta.precision) : NaN;
        if (Number.isInteger(p) && p >= 0) return p;
        const step = meta ? meta.step : (el ? el.step : null);
        return decimalsFromStep(step);
    }

    function inputBoundsFromMetadataOrDOM(id, el) {
        const meta = getParameterMetadata(id);
        const min = meta ? Number(meta.min) : parseFloat(el.min);
        const max = meta ? Number(meta.max) : parseFloat(el.max);
        return { min, max };
    }

    function normalizeInputValue(id, el, value) {
        const meta = getParameterMetadata(id);
        const bounds = inputBoundsFromMetadataOrDOM(id, el);
        const precision = precisionForMetadata(meta, el);
        const step = meta ? Number(meta.step) : parseFloat(el.step);
        let next = Number(value);

        if (Number.isFinite(step) && step > 0) {
            const base = Number.isFinite(bounds.min) ? bounds.min : 0;
            next = base + Math.round((next - base) / step) * step;
        }

        const factor = Math.pow(10, precision);
        next = Math.round((next + Number.EPSILON) * factor) / factor;

        if (Number.isFinite(bounds.min)) next = Math.max(bounds.min, next);
        if (Number.isFinite(bounds.max)) next = Math.min(bounds.max, next);

        return {
            value: next,
            text: Number(next).toFixed(precision),
            rounded: Math.abs(next - Number(value)) > Math.max(1e-12, Math.abs(step || 0) * 1e-9)
        };
    }

    function dispatchControlEvent(el, eventName) {
        if (!el || typeof el.dispatchEvent !== 'function') return;
        el.dispatchEvent(new Event(eventName, { bubbles: true }));
    }

    function readControlValue(group, id) {
        const el = $(id);
        if (group === 'inputs') {
            if (!el) return null;
            const n = Number(el.value);
            return Number.isFinite(n) ? n : el.value;
        }
        if (group === 'selects') return el ? el.value : null;
        if (group === 'checkboxes') return !!(el && el.checked);
        if (group === 'flags') {
            const session = getCurrentSession();
            return !!(session.flags && session.flags[id]);
        }
        return null;
    }

    function valueChanged(a, b) {
        if (typeof a === 'number' || typeof b === 'number') {
            const na = Number(a);
            const nb = Number(b);
            if (Number.isFinite(na) && Number.isFinite(nb)) {
                return Math.abs(na - nb) > 1e-9;
            }
        }
        return String(a) !== String(b);
    }

    function formatValueForReport(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(6));
        return value;
    }

    function applyControlValue(group, id, value) {
        const el = $(id);
        if (group === 'inputs') {
            if (!el) return { ok: false, reason: 'input control not found' };
            const next = normalizeInputValue(id, el, value);
            el.value = next.text;
            if (typeof state !== 'undefined' && state) state[id] = next.value;
            const valEl = $('val_' + id);
            if (valEl) valEl.innerText = next.text;
            dispatchControlEvent(el, 'input');
            dispatchControlEvent(el, 'change');
            return { ok: true, requestedValue: value, candidateValue: next.value, candidateText: next.text, roundedBeforeEvents: !!next.rounded };
        }
        if (group === 'selects') {
            if (!el) return { ok: false, reason: 'select control not found' };
            el.value = value;
            if (typeof state !== 'undefined' && state) state[id] = value;
            dispatchControlEvent(el, 'change');
            return { ok: true, requestedValue: value, candidateValue: el.value };
        }
        if (group === 'checkboxes') {
            if (!el) return { ok: false, reason: 'checkbox control not found' };
            el.checked = !!value;
            if (typeof state !== 'undefined' && state) state[id] = !!value;
            if ((id === 'cobraArchitectureEnabled' || id === 'enableCobraArchitecture') && typeof state !== 'undefined' && state) {
                state.cobraArchitectureEnabled = !!value;
                state.enableCobraArchitecture = !!value;
                const aliasId = id === 'cobraArchitectureEnabled' ? 'enableCobraArchitecture' : 'cobraArchitectureEnabled';
                const aliasEl = $(aliasId);
                if (aliasEl) aliasEl.checked = !!value;
                if (state.cobraArchitecture && typeof state.cobraArchitecture === 'object') state.cobraArchitecture.enabled = !!value;
            }
            dispatchControlEvent(el, 'change');
            return { ok: true, requestedValue: !!value, candidateValue: !!el.checked };
        }
        if (group === 'flags' && id === 'isEstimatedC10' && typeof window.Session_setIsEstimatedC10 === 'function') {
            const nextValue = !!value;
            window.Session_setIsEstimatedC10(nextValue);
            return { ok: true, requestedValue: nextValue, candidateValue: nextValue };
        }
        return { ok: false, reason: 'unsupported control group' };
    }

    function recordAppliedChange(changes, group, id, oldValue, requestedValue, candidateValue, finalValue, note) {
        const requestedChanged = valueChanged(oldValue, requestedValue);
        const finalChanged = valueChanged(oldValue, finalValue);
        const corrected = valueChanged(requestedValue, finalValue);
        if (!requestedChanged && !finalChanged && !corrected) return;
        changes.push({
            group,
            id,
            field: group + '.' + id,
            oldValue: formatValueForReport(oldValue),
            requestedValue: formatValueForReport(requestedValue),
            candidateValue: formatValueForReport(candidateValue),
            finalValue: formatValueForReport(finalValue),
            newValue: formatValueForReport(finalValue),
            changed: finalChanged,
            clampedOrCorrected: corrected,
            note: note || (corrected ? 'Final value differs from requested value after normal UI validation/updateState.' : 'Applied without post-update correction.')
        });
    }

    function cobraInvariantActiveForApply(modelFamily) {
        const s = getCurrentSession();
        const selects = (s && s.selects) || {};
        return modelFamily === 'cobra_tonearm' || selects.rearMode === 'cobra_integrated_tail' || (typeof state !== 'undefined' && state && state.rearMode === 'cobra_integrated_tail');
    }

    function cobraInvariantEdits(modelFamily) {
        if (!cobraInvariantActiveForApply(modelFamily)) return [];
        return [
            { group: 'selects', id: 'rearMode', value: 'cobra_integrated_tail', reason: 'TD049 Cobra invariant: preserve Cobra rear/body mode.' },
            { group: 'inputs', id: 'apex', value: 237, reason: 'TD049 Cobra invariant: custom_237_05 uses apex=237 and cartX=-0.05.' },
            { group: 'inputs', id: 'cartX', value: -0.05, reason: 'TD049 Cobra invariant: preserve N1-P2=237.05 instead of shape-AI effective-length drift.' },
            { group: 'checkboxes', id: 'cobraArchitectureEnabled', value: true, reason: 'TD049 Cobra invariant: keep Cobra architecture gate active.' },
            { group: 'checkboxes', id: 'enableCobraArchitecture', value: true, reason: 'TD049 Cobra invariant: keep Cobra architecture gate alias active.' },
            { group: 'inputs', id: 'headH', value: Math.max(5.8, Number(readControlValue('inputs', 'headH')) || 0), reason: 'TD049 Cobra invariant: headshell base height cannot collapse to a blade.' },
            { group: 'inputs', id: 'neckW', value: Math.max(16, Number(readControlValue('inputs', 'neckW')) || 0), reason: 'TD049 Cobra invariant: neck width cannot collapse into a getingmidja.' },
            { group: 'inputs', id: 'rearWeightDiscDiameter', value: Math.max(21, Number(readControlValue('inputs', 'rearWeightDiscDiameter')) || 0), reason: 'TD049 Cobra invariant: canonical external disc-stack counterweight must exist.' },
            { group: 'inputs', id: 'rearWeightDiscThickness', value: Math.max(5, Number(readControlValue('inputs', 'rearWeightDiscThickness')) || 0), reason: 'TD049 Cobra invariant: canonical external disc-stack counterweight must exist.' },
            { group: 'inputs', id: 'rearWeightDiscCount', value: Math.max(4, Math.round(Number(readControlValue('inputs', 'rearWeightDiscCount')) || 0)), reason: 'TD049 Cobra invariant: disc count cannot be zero.' },
            { group: 'inputs', id: 'rearWeightDiscMass', value: Math.max(22, Number(readControlValue('inputs', 'rearWeightDiscMass')) || 0), reason: 'TD049 Cobra invariant: rear disc mass cannot be zero.' },
            { group: 'inputs', id: 'rearFineTrimScrewMassEquivalent', value: Math.max(7, Number(readControlValue('inputs', 'rearFineTrimScrewMassEquivalent')) || 0), reason: 'TD049 Cobra invariant: fine trim mass cannot be zero.' },
            { group: 'checkboxes', id: 'includeRearWeightDiscsInExport', value: true, reason: 'TD049 Cobra invariant: export the real external counterweight, not an empty proxy.' },
            { group: 'inputs', id: 'rearSupportBridgeLength', value: Math.max(7, Number(readControlValue('inputs', 'rearSupportBridgeLength')) || 0), reason: 'TD049 Cobra invariant: counterweight support bridge must reach the external disc stack.' },
            { group: 'inputs', id: 'rearSupportBridgeRadius', value: Math.max(3.6, Number(readControlValue('inputs', 'rearSupportBridgeRadius')) || 0), reason: 'TD049 Cobra invariant: support bridge radius cannot collapse.' },
            { group: 'inputs', id: 'rearSupportBridgeOverlap', value: Math.max(1.1, Number(readControlValue('inputs', 'rearSupportBridgeOverlap')) || 0), reason: 'TD049 Cobra invariant: support bridge overlap cannot collapse.' }
        ];
    }

    function applyAIDelta(deltaOrText) {
        const validation = validateAIDelta(deltaOrText);
        if (!validation.ok) return validation;

        const delta = validation.delta;
        const pending = [];
        const changes = [];

        const inputMap = hasPlainObject(delta.inputs) ? delta.inputs : {};
        Object.keys(inputMap).forEach(id => {
            pending.push({
                group: 'inputs',
                id,
                oldValue: readControlValue('inputs', id),
                requestedValue: inputMap[id],
                result: applyControlValue('inputs', id, inputMap[id])
            });
        });

        const selectMap = hasPlainObject(delta.selects) ? delta.selects : {};
        Object.keys(selectMap).forEach(id => {
            pending.push({
                group: 'selects',
                id,
                oldValue: readControlValue('selects', id),
                requestedValue: selectMap[id],
                result: applyControlValue('selects', id, selectMap[id])
            });
        });

        const checkboxMap = hasPlainObject(delta.checkboxes) ? delta.checkboxes : {};
        Object.keys(checkboxMap).forEach(id => {
            pending.push({
                group: 'checkboxes',
                id,
                oldValue: readControlValue('checkboxes', id),
                requestedValue: !!checkboxMap[id],
                result: applyControlValue('checkboxes', id, !!checkboxMap[id])
            });
        });

        const flagMap = hasPlainObject(delta.flags) ? delta.flags : {};
        if (Object.prototype.hasOwnProperty.call(flagMap, 'isEstimatedC10')) {
            pending.push({
                group: 'flags',
                id: 'isEstimatedC10',
                oldValue: readControlValue('flags', 'isEstimatedC10'),
                requestedValue: !!flagMap.isEstimatedC10,
                result: applyControlValue('flags', 'isEstimatedC10', !!flagMap.isEstimatedC10)
            });
        }

        cobraInvariantEdits(delta.modelFamily).forEach(edit => {
            const oldValue = readControlValue(edit.group, edit.id);
            const result = applyControlValue(edit.group, edit.id, edit.value);
            pending.push({
                group: edit.group,
                id: edit.id,
                oldValue,
                requestedValue: edit.value,
                result,
                invariantReason: edit.reason
            });
        });

        AI_MODAL_STATE.modelFamily = delta.modelFamily;
        const familyEl = $('aiModelFamily');
        if (familyEl) {
            familyEl.value = delta.modelFamily;
            dispatchControlEvent(familyEl, 'change');
        }
        renderZoneMap();

        let updateStateCalled = false;
        if (typeof updateState === 'function') {
            updateState();
            updateStateCalled = true;
        }

        pending.forEach(item => {
            const result = item.result || {};
            const finalValue = readControlValue(item.group, item.id);
            recordAppliedChange(
                changes,
                item.group,
                item.id,
                item.oldValue,
                item.requestedValue,
                result.candidateValue,
                finalValue,
                item.invariantReason || (result.ok ? null : result.reason)
            );
        });

        return {
            ok: true,
            errors: [],
            warnings: validation.warnings,
            delta,
            applied: true,
            appliedFieldCount: changes.length,
            requestedFieldCount: pending.length,
            changes,
            updateStateCalled
        };
    }


    function parseAIResponse(responseOrText) {
        return parseDelta(responseOrText);
    }

    function isAIVibe3DResponseObject(value) {
        return hasPlainObject(value) && value.schema === AI_VIBE_RESPONSE_SCHEMA;
    }

    function validateAIResponse(responseOrText) {
        let parsed;
        try {
            parsed = parseAIResponse(responseOrText);
        } catch (err) {
            return {
                ok: false,
                errors: ['Invalid JSON: ' + (err && err.message ? err.message : String(err))],
                warnings: [],
                response: null
            };
        }
        if (isAIVibe3DResponseObject(parsed)) {
            const nativeValidation = (window.AIVibe3D && typeof window.AIVibe3D.validateAIVibeResponse === 'function')
                ? window.AIVibe3D.validateAIVibeResponse(parsed)
                : { ok: false, errors: ['AIVibe3D module not loaded.'], warnings: [] };
            const deltaValidation = hasPlainObject(parsed.delta) ? validateAIDelta(parsed.delta) : null;
            const errors = (nativeValidation.errors || []).slice();
            const warnings = (nativeValidation.warnings || []).slice();
            if (deltaValidation && !deltaValidation.ok) errors.push.apply(errors, deltaValidation.errors.map(e => 'delta: ' + e));
            if (deltaValidation && deltaValidation.warnings && deltaValidation.warnings.length) warnings.push.apply(warnings, deltaValidation.warnings.map(w => 'delta: ' + w));
            const preview = (window.AIVibe3D && typeof window.AIVibe3D.previewAIVibeResponse === 'function')
                ? window.AIVibe3D.previewAIVibeResponse(parsed)
                : null;
            return {
                ok: errors.length === 0,
                errors,
                warnings,
                response: parsed,
                aiVibeResponse: true,
                preview,
                deltaValidation
            };
        }
        const legacy = validateAIDelta(parsed);
        return Object.assign({}, legacy, { response: parsed, aiVibeResponse: false });
    }

    function applyAIResponse(responseOrText) {
        const validation = validateAIResponse(responseOrText);
        if (!validation.ok) return validation;
        if (!validation.aiVibeResponse) return applyAIDelta(validation.response);

        const response = validation.response;
        const beforeAudit = (window.AIVibe3D && typeof window.AIVibe3D.runPrintabilityAudit === 'function') ? window.AIVibe3D.runPrintabilityAudit(state) : null;
        const actionResult = (window.AIVibe3D && typeof window.AIVibe3D.applyActions === 'function')
            ? window.AIVibe3D.applyActions(response.actions || [])
            : { applied: [] };
        let deltaResult = null;
        if (hasPlainObject(response.delta)) {
            deltaResult = applyAIDelta(response.delta);
            if (!deltaResult.ok) {
                return Object.assign({}, validation, {
                    ok: false,
                    errors: ['Semantic actions applied, but embedded delta failed:'].concat(deltaResult.errors || []),
                    actionResult,
                    deltaResult,
                    beforeAudit
                });
            }
        } else if (typeof updateState === 'function') {
            updateState();
        }
        const afterAudit = (window.AIVibe3D && typeof window.AIVibe3D.runPrintabilityAudit === 'function') ? window.AIVibe3D.runPrintabilityAudit(state) : null;
        return Object.assign({}, validation, {
            ok: true,
            applied: true,
            actionResult,
            deltaResult,
            beforeAudit,
            afterAudit,
            appliedFieldCount: deltaResult ? deltaResult.appliedFieldCount : 0,
            requestedFieldCount: (response.actions || []).length + (deltaResult ? deltaResult.requestedFieldCount : 0),
            updateStateCalled: true
        });
    }

    function formatAIVibePreviewLines(result) {
        if (!result) return ['No validation result.'];
        if (!result.aiVibeResponse) return result.ok ? ['Valid legacy AI delta.'] : result.errors;
        const preview = result.preview || {};
        const p = preview.beforeAudit && preview.beforeAudit.printability ? preview.beforeAudit.printability : {};
        const actions = preview.plannedActions || [];
        const lines = [
            'Valid AI Vibe 3D Onshape response.',
            'intent: ' + (result.response && result.response.intent),
            'plannedActions: ' + actions.length,
            'hasLegacyDelta: ' + !!preview.hasLegacyDelta,
            'current manifold: ' + (p.manifold === undefined ? 'n/a' : p.manifold),
            'current sliverTriangles: ' + (p.sliverTriangles === undefined ? 'n/a' : p.sliverTriangles),
            'target: exact 1:1 positive Onshape reference mesh in mm'
        ];
        if (result.warnings && result.warnings.length) lines.push.apply(lines, result.warnings);
        return lines;
    }

    function formatAIVibeApplyLines(result) {
        if (!result || !result.aiVibeResponse) return appliedStatusLines(result);
        const before = result.beforeAudit && result.beforeAudit.printability ? result.beforeAudit.printability : {};
        const after = result.afterAudit && result.afterAudit.printability ? result.afterAudit.printability : {};
        const appliedActions = result.actionResult && result.actionResult.applied ? result.actionResult.applied : [];
        const lines = [
            'Applied AI Vibe 3D Onshape response.',
            'actions applied: ' + appliedActions.length,
            'embedded delta applied: ' + !!result.deltaResult,
            'before slivers: ' + (before.sliverTriangles === undefined ? 'n/a' : before.sliverTriangles),
            'after slivers: ' + (after.sliverTriangles === undefined ? 'n/a' : after.sliverTriangles),
            'after manifold: ' + (after.manifold === undefined ? 'n/a' : after.manifold)
        ];
        if (result.warnings && result.warnings.length) lines.push.apply(lines, result.warnings);
        return lines;
    }

    function setStatus(kind, lines) {
        const el = $('aiValidationResult');
        if (!el) return;
        el.className = 'ai-modal-status ' + (kind || '');
        if (Array.isArray(lines)) {
            el.textContent = lines.join('\n');
        } else {
            el.textContent = lines || '';
        }
    }

    function setSmokeSummary(kind, lines) {
        const el = $('aiSmokeReportSummary');
        if (!el) return;
        el.className = 'ai-modal-status ai-smoke-report-summary ' + (kind || '');
        el.textContent = Array.isArray(lines) ? lines.join('\n') : (lines || '');
    }

    function formatResult(result) {
        if (!result) return 'not run';
        return result.ok ? 'ok' : 'issue';
    }

    function buildSmokeReportText() {
        const sessionClean = checkSessionClean(getCurrentSession());
        const report = [
            'TonearmDesigner Developer Diagnostic Report',
            'timestamp: ' + new Date().toISOString(),
            'userAgent: ' + getBrowserUserAgent(),
            'modelFamily: ' + AI_MODAL_STATE.modelFamily,
            'validationResult: ' + formatResult(AI_MODAL_STATE.lastValidation),
            'applyResult: ' + formatResult(AI_MODAL_STATE.lastApplyResult),
            'updateStateCalled: ' + (AI_MODAL_STATE.lastApplyResult ? !!AI_MODAL_STATE.lastApplyResult.updateStateCalled : 'not run'),
            'appliedFieldCount: ' + (AI_MODAL_STATE.lastApplyResult ? AI_MODAL_STATE.lastApplyResult.appliedFieldCount : 'not run'),
            'sessionClean: ' + (sessionClean.ok ? 'ok' : 'issue'),
            'sessionSchema: ' + sessionClean.schema,
            'sessionForbiddenFound: ' + (sessionClean.forbiddenFound.length ? sessionClean.forbiddenFound.join(', ') : 'none'),
            'selfTest: ' + (AI_MODAL_STATE.lastSelfTestResult ? (AI_MODAL_STATE.lastSelfTestResult.ok ? 'ok' : 'issue') : 'not run')
        ];
        if (AI_MODAL_STATE.lastApplyResult && Array.isArray(AI_MODAL_STATE.lastApplyResult.changes)) {
            AI_MODAL_STATE.lastApplyResult.changes.forEach(change => {
                report.push('appliedChange: ' + change.field + ': ' + change.oldValue + ' -> ' + change.newValue);
            });
        }
        AI_MODAL_STATE.lastSmokeReportText = report.join('\n');
        return AI_MODAL_STATE.lastSmokeReportText;
    }

    function formatBox(box) {
        if (!box || !box.min || !box.max) return 'n/a';
        return 'min(' + box.min.x + ', ' + box.min.y + ', ' + box.min.z + ') / ' +
            'max(' + box.max.x + ', ' + box.max.y + ', ' + box.max.z + ')';
    }

    function setPromptStale(isStale, reason) {
        const el = $('aiPromptStaleWarning');
        if (!el) return;
        el.hidden = !isStale;
        if (isStale) {
            el.textContent = 'Prompt needs rebuild' + (reason ? ': ' + reason : '') + '. Rebuild prompt to refresh modelFamily, rearMode, sliders and shape context.';
        }
    }

    function promptBuildSignature(session, family) {
        const s = session || getCurrentSession();
        return JSON.stringify({
            modelFamily: family || AI_MODAL_STATE.modelFamily,
            rearMode: getCurrentSelectValue(s, 'rearMode', 'classic_tail'),
            cobraActive: isCobraRearMode(getCurrentSelectValue(s, 'rearMode', 'classic_tail')),
            inputs: s.inputs || {},
            selects: s.selects || {},
            checkboxes: s.checkboxes || {},
            flags: s.flags || {}
        });
    }

    function updatePromptBuildMeta() {
        const el = $('aiPromptBuildMeta');
        if (!el) return;
        const lines = [
            'Prompt built at: ' + (AI_MODAL_STATE.lastPromptBuiltAt || 'not built'),
            'Built from modelFamily: ' + (AI_MODAL_STATE.lastPromptFamily || 'not built'),
            'Built from rearMode: ' + (AI_MODAL_STATE.lastPromptRearMode || 'not built'),
            'Cobra active: ' + (AI_MODAL_STATE.lastPromptBuiltAt ? !!AI_MODAL_STATE.lastPromptCobraActive : 'not built'),
            'Station samples included: ' + (AI_MODAL_STATE.lastPromptBuiltAt ? AI_MODAL_STATE.lastPromptStationCount : 'not built'),
            'Shape context included: ' + (AI_MODAL_STATE.lastPromptBuiltAt ? !!AI_MODAL_STATE.lastPromptShapeContextIncluded : 'not built')
        ];
        el.textContent = lines.join('\n');
    }

    function markPromptBuilt() {
        const session = getCurrentSession();
        const family = AI_MODAL_STATE.modelFamily;
        const rearMode = getCurrentSelectValue(session, 'rearMode', 'classic_tail');
        AI_MODAL_STATE.lastPromptFamily = family;
        AI_MODAL_STATE.lastPromptRearMode = rearMode;
        AI_MODAL_STATE.lastPromptCobraActive = isCobraRearMode(rearMode);
        AI_MODAL_STATE.lastPromptSignature = promptBuildSignature(session, family);
        if (!AI_MODAL_STATE.lastPromptBuiltAt) AI_MODAL_STATE.lastPromptBuiltAt = new Date().toISOString();
        if (!AI_MODAL_STATE.lastPromptStationCount && AI_MODAL_STATE.lastShape3D && Array.isArray(AI_MODAL_STATE.lastShape3D.stationProfiles)) {
            AI_MODAL_STATE.lastPromptStationCount = AI_MODAL_STATE.lastShape3D.stationProfiles.length;
        }
        AI_MODAL_STATE.lastPromptShapeContextIncluded = true;
        setPromptStale(false);
        updatePromptBuildMeta();
    }

    function updatePromptStaleWarning() {
        const promptEl = $('aiPromptText');
        const hasPrompt = promptEl && promptEl.value.trim().length > 0;
        if (!hasPrompt || !AI_MODAL_STATE.lastPromptSignature) {
            setPromptStale(false);
            updatePromptBuildMeta();
            return false;
        }
        const session = getCurrentSession();
        const currentSignature = promptBuildSignature(session, AI_MODAL_STATE.modelFamily);
        let reason = '';
        if (AI_MODAL_STATE.lastPromptFamily !== AI_MODAL_STATE.modelFamily) reason = 'modelFamily changed';
        else if (AI_MODAL_STATE.lastPromptRearMode !== getCurrentSelectValue(session, 'rearMode', 'classic_tail')) reason = 'rearMode changed';
        else if (AI_MODAL_STATE.lastPromptSignature !== currentSignature) reason = 'controls or shape context changed';
        const stale = !!reason;
        setPromptStale(stale, reason);
        updatePromptBuildMeta();
        return stale;
    }

    function bindPromptInvalidationWatchers() {
        const session = getCurrentSession();
        const ids = [];
        getAllInputIds(session).forEach(id => addUniqueId(ids, id));
        getAllowedSelects().forEach(id => addUniqueId(ids, id));
        getAllowedCheckboxes().forEach(id => addUniqueId(ids, id));
        ids.forEach(id => {
            const el = $(id);
            if (!el || el.getAttribute('data-ai-prompt-watch') === '1') return;
            el.setAttribute('data-ai-prompt-watch', '1');
            const onChange = () => {
                if (id === 'rearMode') {
                    refreshFamilySummary();
                    refreshShape3DSummary(false);
                }
                updatePromptStaleWarning();
            };
            el.addEventListener('input', onChange);
            el.addEventListener('change', onChange);
        });
    }

    function updatePromptCharCount() {
        const promptEl = $('aiPromptText');
        const counter = $('aiPromptCharCount');
        const count = promptEl ? promptEl.value.length : 0;
        AI_MODAL_STATE.lastPromptCharCount = count;
        if (counter) counter.textContent = count + ' characters';
        updatePromptStaleWarning();
        return count;
    }

    function shape3DSummaryLines(shape3d) {
        if (!shape3d) return ['shape3d: not built'];
        const count = Array.isArray(shape3d.stationProfiles) ? shape3d.stationProfiles.length : 0;
        return [
            'format: ' + shape3d.format,
            'sourceMethod: ' + (shape3d.sourceMethod || 'unknown'),
            'rearMode: ' + (shape3d.currentRearMode || 'unknown') + ' / cobraActive: ' + !!shape3d.cobraActive,
            'stationCount: ' + count,
            'boundingBox: ' + formatBox(shape3d.boundingBox),
            'keyPoints: ' + (shape3d.keyPoints ? Object.keys(shape3d.keyPoints).join(', ') : 'none'),
            'zoneGeometryMap: ' + (shape3d.zoneGeometryMap ? Object.keys(shape3d.zoneGeometryMap).join(', ') : 'none'),
            'fullMeshIncluded: ' + !!(shape3d.limits && shape3d.limits.fullMeshIncluded),
            'promptChars: ' + updatePromptCharCount()
        ];
    }

    function refreshShape3DSummary(showStatus) {
        const el = $('aiShape3DSummary');
        try {
            const shape3d = buildShape3DContext(getCurrentSession(), STANDARD_STATION_SAMPLE_COUNT);
            AI_MODAL_STATE.lastShape3D = shape3d;
            if (el) {
                el.className = 'ai-modal-status ai-shape3d-summary success';
                el.textContent = shape3DSummaryLines(shape3d).join('\n');
            }
            if (showStatus) setStatus('success', 'shape3d summary refreshed.');
            return shape3d;
        } catch (err) {
            AI_MODAL_STATE.lastShape3D = null;
            const message = 'shape3d build failed: ' + (err && err.message ? err.message : String(err));
            if (el) {
                el.className = 'ai-modal-status ai-shape3d-summary error';
                el.textContent = message;
            }
            if (showStatus) setStatus('error', message);
            return null;
        }
    }

    function copyTextToClipboard(text) {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text);
        }
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.left = '-9999px';
        document.body.appendChild(fallback);
        fallback.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(fallback);
        return ok ? Promise.resolve() : Promise.reject(new Error('clipboard API unavailable'));
    }

    function generateValidTestDelta() {
        const delta = makeValidTestDelta();
        setAIResponseDelta(delta);
        AI_MODAL_STATE.lastValidation = validateAIDelta(delta);
        setSmokeSummary('info', [
            'Generated valid diagnostic delta.',
            'field: ' + Object.keys(delta.inputs)[0],
            'modelFamily: ' + delta.modelFamily,
            'Click Validate, then Apply delta. Verify that the left-panel control changed and that the model redrew.'
        ]);
        setStatus('info', 'Generated valid diagnostic delta. Click Validate, then Apply delta.');
        return delta;
    }

    function generateInvalidTestDelta() {
        const delta = makeInvalidTestDelta();
        setAIResponseDelta(delta);
        AI_MODAL_STATE.lastValidation = validateAIDelta(delta);
        setSmokeSummary('info', [
            'Generated invalid diagnostic delta.',
            'expected validation: issue',
            'unknown field: inputs.NOPE'
        ]);
        setStatus('info', 'Generated invalid diagnostic delta. Validate must reject inputs.NOPE.');
        return delta;
    }

    function runValidationSelfTest() {
        const valid = makeValidTestDelta();
        const invalid = makeInvalidTestDelta();
        const validResult = validateAIDelta(valid);
        const invalidResult = validateAIDelta(invalid);
        const ok = !!(validResult.ok && !invalidResult.ok);
        const result = {
            ok,
            validResult,
            invalidResult,
            modelFamily: AI_MODAL_STATE.modelFamily,
            timestamp: new Date().toISOString()
        };
        AI_MODAL_STATE.lastSelfTestResult = result;
        setSmokeSummary(ok ? 'success' : 'error', [
            'Validation self-test: ' + (ok ? 'ok' : 'issue'),
            'valid delta validation: ' + (validResult.ok ? 'ok' : 'issue'),
            'invalid delta rejection: ' + (!invalidResult.ok ? 'ok' : 'issue'),
            'model mutated: no'
        ]);
        setStatus(ok ? 'success' : 'error', 'Validation self-test ' + (ok ? 'ok' : 'issue') + '. Model was not mutated.');
        return result;
    }

    function copySmokeReport() {
        const text = buildSmokeReportText();
        return copyTextToClipboard(text)
            .then(() => {
                setSmokeSummary('success', ['Smoke report copied.', text]);
                return { ok: true, text };
            })
            .catch(err => {
                const message = 'Could not copy smoke report: ' + (err && err.message ? err.message : err);
                setSmokeSummary('error', [message, 'Manual copy fallback text:', text]);
                return { ok: false, error: message, text };
            });
    }


    function zoneIsLTOnly(zone, ltTags) {
        return !!(zone && zone.tag && ltTags && ltTags[zone.tag]);
    }

    function zoneKindLabel(isLTOnly) {
        if (isLTOnly) return 'LT-only semantic zone';
        if (AI_MODAL_STATE.modelFamily === 'cobra_tonearm') return 'Cobra tonearm form zone';
        return 'General tonearm zone';
    }

    function zonePoint(zone) {
        const s = zone && zone.svg ? zone.svg : {};
        if (Number.isFinite(s.cx) && Number.isFinite(s.cy)) return { x: s.cx, y: s.cy };
        if (Number.isFinite(s.x) && Number.isFinite(s.y)) return { x: s.x + (Number(s.w) || 0) / 2, y: s.y + (Number(s.h) || 0) / 2 };
        if (Number.isFinite(s.x1) && Number.isFinite(s.y1) && Number.isFinite(s.x2) && Number.isFinite(s.y2)) return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
        if (typeof s.d === 'string') {
            const nums = s.d.match(/-?\d+(?:\.\d+)?/g);
            if (nums && nums.length >= 2) return { x: Number(nums[0]), y: Number(nums[1]) };
        }
        return { x: 350, y: 155 };
    }

    function zoneDescription(zone) {
        return zone && zone.description ? zone.description : 'Semantic zone marker.';
    }

    function tooltipHTML(zone, isLTOnly) {
        const lines = [
            '<strong>' + escapeHTML(zone.tag) + '</strong>',
            '<span>' + escapeHTML(zone.label || '') + '</span>',
            '<span>' + escapeHTML(zoneKindLabel(isLTOnly)) + '</span>',
            '<span>' + escapeHTML(zoneDescription(zone)) + '</span>'
        ];
        if (zone.xRange) lines.push('<span>x-range: ' + escapeHTML(zone.xRange[0] + '–' + zone.xRange[1] + ' mm') + '</span>');
        if (zone.source) lines.push('<span>source: ' + escapeHTML(zone.source) + '</span>');
        if (zone.status) lines.push('<span>status: ' + escapeHTML(zone.status) + '</span>');
        if (zone.writableRole) lines.push('<span>writable: ' + escapeHTML(zone.writableRole) + '</span>');
        lines.push('<em>click to insert tag</em>');
        return lines.join('');
    }

    function selectedZoneHTML(zone, isLTOnly) {
        const controls = zone && Array.isArray(zone.primaryControls) && zone.primaryControls.length
            ? zone.primaryControls.join(', ')
            : 'none';
        const lines = [
            '<strong>Selected zone: ' + escapeHTML(zone.tag) + '</strong>',
            '<span>' + escapeHTML(zone.label || '') + '</span>',
            '<span>' + escapeHTML(zoneKindLabel(isLTOnly)) + '</span>',
            '<span>' + escapeHTML(zoneDescription(zone)) + '</span>'
        ];
        if (zone.xRange) lines.push('<span>current x-range: ' + escapeHTML(zone.xRange[0] + '–' + zone.xRange[1] + ' mm') + '</span>');
        if (zone.source) lines.push('<span>source: ' + escapeHTML(zone.source) + '</span>');
        if (zone.status) lines.push('<span>status: ' + escapeHTML(zone.status) + '</span>');
        if (zone.writableRole) lines.push('<span>writable/proxy state: ' + escapeHTML(zone.writableRole) + '</span>');
        lines.push('<span>primary controls: ' + escapeHTML(controls) + '</span>');
        if (zone.note) lines.push('<span>note: ' + escapeHTML(zone.note) + '</span>');
        lines.push('<em>Tag inserted into User intent. This inserts a semantic form tag into User intent; it is not a screenshot or 3D-picking workflow.</em>');
        return lines.join('');
    }

    function showZoneTooltip(zone, isLTOnly, event) {
        const tooltip = $('aiZoneTooltip');
        if (!tooltip || !zone) return;
        tooltip.innerHTML = tooltipHTML(zone, isLTOnly);
        tooltip.hidden = false;
        const host = $('aiZoneMapHost');
        if (host && event && typeof event.clientX === 'number') {
            const box = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0 };
            tooltip.style.left = Math.max(8, event.clientX - box.left + 14) + 'px';
            tooltip.style.top = Math.max(8, event.clientY - box.top + 14) + 'px';
        }
    }

    function hideZoneTooltip() {
        const tooltip = $('aiZoneTooltip');
        if (tooltip) tooltip.hidden = true;
    }

    function setSelectedZone(zone, isLTOnly) {
        const el = $('aiSelectedZoneInfo');
        if (el && zone) el.innerHTML = selectedZoneHTML(zone, isLTOnly);
    }

    function renderZoneMap() {
        const host = $('aiZoneMapHost');
        if (!host) return;

        const family = AI_MODAL_STATE.modelFamily;
        const session = getCurrentSession();
        const shape3d = buildShape3DContext(session, STANDARD_STATION_SAMPLE_COUNT);
        AI_MODAL_STATE.lastShape3D = shape3d;
        const profileMap = buildProfileMapData(session, shape3d, family);
        const zones = Array.isArray(profileMap.zoneAnnotations) ? profileMap.zoneAnnotations : [];
        const ltTags = zoneTagSet((window.ZONE_MAP && window.ZONE_MAP.lt) || []);
        const cobraStatus = buildCobraModeStatus(session, family);
        const bounds = profileMap.profileBounds || {};
        const xMin = Number.isFinite(Number(bounds.xMin)) ? Number(bounds.xMin) : 0;
        const xMax = Number.isFinite(Number(bounds.xMax)) && Number(bounds.xMax) > xMin ? Number(bounds.xMax) : Math.max(1, availableShapeLength(session));
        const zMinRaw = Number.isFinite(Number(bounds.zMin)) ? Number(bounds.zMin) : -20;
        const zMaxRaw = Number.isFinite(Number(bounds.zMax)) ? Number(bounds.zMax) : 20;
        const zPad = Math.max(4, (zMaxRaw - zMinRaw) * 0.18);
        const zMin = zMinRaw - zPad;
        const zMax = zMaxRaw + zPad;
        const yHalfRaw = Number.isFinite(Number(bounds.yHalfMax)) ? Math.max(1, Number(bounds.yHalfMax)) : 20;
        const yHalf = Math.max(4, yHalfRaw * 1.25);
        const sideUpper = (profileMap.sideProfileZX && Array.isArray(profileMap.sideProfileZX.upper)) ? profileMap.sideProfileZX.upper : [];
        const sideLower = (profileMap.sideProfileZX && Array.isArray(profileMap.sideProfileZX.lower)) ? profileMap.sideProfileZX.lower : [];
        const topUpper = (profileMap.topProfileYX && Array.isArray(profileMap.topProfileYX.positiveHalfWidth)) ? profileMap.topProfileYX.positiveHalfWidth : [];
        const topLower = (profileMap.topProfileYX && Array.isArray(profileMap.topProfileYX.negativeHalfWidth)) ? profileMap.topProfileYX.negativeHalfWidth : [];

        if (!sideUpper.length || !sideLower.length || !topUpper.length || !topLower.length) {
            host.innerHTML = '<div class="ai-profile-map-empty">Profile map unavailable: current profile data has not been generated.</div>';
            refreshFamilySummary();
            return;
        }

        const viewW = 700;
        const viewH = 430;
        const plotX = 42;
        const plotW = 620;
        const sideY = cobraStatus.hardMismatch ? 80 : 54;
        const sideH = 136;
        const topY = sideY + sideH + 72;
        const topH = 124;

        const clampX = x => Math.max(xMin, Math.min(xMax, Number(x)));
        const sx = x => plotX + ((clampX(x) - xMin) / Math.max(1e-9, xMax - xMin)) * plotW;
        const sySide = z => sideY + sideH - ((Number(z) - zMin) / Math.max(1e-9, zMax - zMin)) * sideH;
        const syTop = y => topY + topH / 2 - (Number(y) / Math.max(1e-9, yHalf)) * (topH / 2);

        const pathFromPoints = (pts, mapper) => pts.map((p, i) => {
            const xy = mapper(p);
            return (i === 0 ? 'M' : 'L') + round3(xy.x) + ' ' + round3(xy.y);
        }).join(' ');

        const sidePath = pathFromPoints(sideUpper, p => ({ x: sx(p[0]), y: sySide(p[1]) })) +
            ' ' + pathFromPoints(sideLower.slice().reverse(), p => ({ x: sx(p[0]), y: sySide(p[1]) })).replace(/^M/, 'L') + ' Z';
        const topPath = pathFromPoints(topUpper, p => ({ x: sx(p[0]), y: syTop(p[1]) })) +
            ' ' + pathFromPoints(topLower.slice().reverse(), p => ({ x: sx(p[0]), y: syTop(p[1]) })).replace(/^M/, 'L') + ' Z';

        const centerSide = sideUpper.map((p, i) => {
            const lower = sideLower[i] || p;
            return [p[0], ((Number(p[1]) || 0) + (Number(lower[1]) || 0)) / 2];
        });
        const centerSidePath = pathFromPoints(centerSide, p => ({ x: sx(p[0]), y: sySide(p[1]) }));

        function zoneRange(zone) {
            const range = zone && Array.isArray(zone.xRange) ? zone.xRange : [xMin, xMin];
            let a = Number(range[0]);
            let b = Number(range[1]);
            if (!Number.isFinite(a)) a = xMin;
            if (!Number.isFinite(b)) b = a;
            a = clampX(a);
            b = clampX(b);
            if (b < a) {
                const tmp = a;
                a = b;
                b = tmp;
            }
            return { x0: a, x1: b, mid: (a + b) / 2 };
        }

        const zoneVisualOverlays = zones.map((zone, index) => {
            const r = zoneRange(zone);
            const x0 = sx(r.x0);
            const x1 = sx(r.x1);
            const w = Math.max(8, x1 - x0);
            const markerX = sx(r.mid);
            const targetOnly = zone.status === 'target_only_missing_geometry' || zone.status === 'current_disc_stack_control';
            const isLTOnly = zoneIsLTOnly(zone, ltTags);
            const cls = 'ai-profile-zone-overlay' +
                (targetOnly ? ' target-only' : '') +
                (zone.status === 'read_only_reference' ? ' read-only' : '') +
                (cobraStatus.hardMismatch ? ' mismatch-context' : '') +
                (isLTOnly ? ' ai-zone-lt-only-marker' : '');
            const labelY = (index % 2 === 0) ? (sideY - 8) : (topY + topH + 16);
            const bandOpacity = targetOnly ? '0.03' : '0.10';
            const visual = targetOnly
                ? [
                    '<line class="' + cls + '" pointer-events="none" x1="' + round3(markerX) + '" y1="' + (sideY - 8) + '" x2="' + round3(markerX) + '" y2="' + (topY + topH + 8) + '"></line>'
                ].join('')
                : [
                    '<rect class="' + cls + '" pointer-events="none" x="' + round3(x0) + '" y="' + (sideY - 6) + '" width="' + round3(w) + '" height="' + (sideH + 12) + '" opacity="' + bandOpacity + '"></rect>',
                    '<rect class="' + cls + '" pointer-events="none" x="' + round3(x0) + '" y="' + (topY - 6) + '" width="' + round3(w) + '" height="' + (topH + 12) + '" opacity="' + bandOpacity + '"></rect>'
                ].join('');
            return [
                '<g class="ai-profile-zone-annotation" pointer-events="none" aria-hidden="true" data-zone-tag="' + escapeHTML(zone.tag) + '">',
                visual,
                '<text class="ai-profile-zone-label' + (targetOnly ? ' target-only' : '') + '" pointer-events="none" x="' + round3(markerX + 8) + '" y="' + round3(labelY) + '">' + escapeHTML(zone.tag) + '</text>',
                '</g>'
            ].join('');
        }).join('');

        const zoneHitMarkers = zones.map((zone, index) => {
            const r = zoneRange(zone);
            const markerX = sx(r.mid);
            const targetOnly = zone.status === 'target_only_missing_geometry' || zone.status === 'current_disc_stack_control';
            const markerY = targetOnly ? round3(topY + topH / 2) : round3(sideY + sideH / 2);
            const markerClass = 'ai-profile-zone-marker' + (targetOnly ? ' target-only' : '');
            return [
                '<g class="ai-zone-hit ai-profile-zone-hit ai-profile-zone-marker-hit" data-zone-role="profile-point" data-zone-index="' + index + '" data-zone-tag="' + escapeHTML(zone.tag) + '" tabindex="0" role="button" aria-label="' + escapeHTML(zone.tag + ' ' + (zone.label || '') + ' profile point click to insert tag') + '">',
                '<circle class="ai-profile-zone-hitbox" pointer-events="all" cx="' + round3(markerX) + '" cy="' + markerY + '" r="13"></circle>',
                '<circle class="' + markerClass + '" pointer-events="auto" cx="' + round3(markerX) + '" cy="' + markerY + '" r="7"></circle>',
                '</g>'
            ].join('');
        }).join('');

        const zoneOverlays = [
            '<g class="ai-profile-zone-overlay-layer" pointer-events="none" aria-hidden="true">',
            zoneVisualOverlays,
            '</g>',
            '<g class="ai-profile-zone-hit-layer">',
            zoneHitMarkers,
            '</g>'
        ].join('');

        const mismatchBanner = cobraStatus.hardMismatch
            ? '<g class="ai-profile-mismatch-banner"><rect x="30" y="28" width="640" height="34" rx="7"></rect><text x="44" y="50">Cobra AI profile selected, but current rearMode is Classic Tail. Current geometry is not Cobra.</text></g>'
            : '';

        const profileLabel = cobraStatus.profileMapLabel || 'Current profile.';
        host.innerHTML =
            '<svg class="ai-zone-svg ai-profile-map-svg" viewBox="0 0 ' + viewW + ' ' + viewH + '" role="img" aria-label="Shape Profile Map rendered from current profile data with clickable zone overlays">' +
            '<rect x="18" y="14" width="664" height="402" rx="18" class="ai-profile-map-bg"></rect>' +
            mismatchBanner +
            '<text class="ai-profile-map-title" x="34" y="' + (cobraStatus.hardMismatch ? 76 : 34) + '">Shape Profile Map — rendered from current profile data, same source as main Side Profile / Top View</text>' +
            '<text class="ai-profile-map-subtitle" x="34" y="' + (cobraStatus.hardMismatch ? 94 : 52) + '">' + escapeHTML(profileLabel) + '</text>' +
            '<text class="ai-profile-view-title" x="34" y="' + (sideY - 14) + '">Actual Side Profile (Z-X)</text>' +
            '<rect class="ai-profile-plot-frame" x="' + (plotX - 8) + '" y="' + (sideY - 10) + '" width="' + (plotW + 16) + '" height="' + (sideH + 20) + '" rx="8"></rect>' +
            '<line class="ai-profile-axis" x1="' + plotX + '" y1="' + round3(sySide(0)) + '" x2="' + (plotX + plotW) + '" y2="' + round3(sySide(0)) + '"></line>' +
            '<path class="ai-profile-shape side" d="' + sidePath + '"></path>' +
            '<path class="ai-profile-centerline" d="' + centerSidePath + '"></path>' +
            '<text class="ai-profile-view-title" x="34" y="' + (topY - 14) + '">Actual Top View (Y-X)</text>' +
            '<rect class="ai-profile-plot-frame" x="' + (plotX - 8) + '" y="' + (topY - 10) + '" width="' + (plotW + 16) + '" height="' + (topH + 20) + '" rx="8"></rect>' +
            '<line class="ai-profile-axis" x1="' + plotX + '" y1="' + round3(syTop(0)) + '" x2="' + (plotX + plotW) + '" y2="' + round3(syTop(0)) + '"></line>' +
            '<path class="ai-profile-shape top" d="' + topPath + '"></path>' +
            zoneOverlays +
            '<text class="ai-profile-map-footnote" x="34" y="402">Zone overlays are annotations only. Target-only/missing zones are dashed and are not current mesh geometry.</text>' +
            '</svg>';

        host.querySelectorAll('[data-zone-role="profile-point"][data-zone-index]').forEach(el => {
            const index = Number(el.getAttribute('data-zone-index'));
            const zone = zones[index];
            const isLTOnly = zoneIsLTOnly(zone, ltTags);
            const insert = evt => {
                insertAtCursor($('aiUserIntent'), zone.tag);
                setSelectedZone(zone, isLTOnly);
                host.querySelectorAll('.ai-zone-hit').forEach(hit => hit.classList.remove('selected'));
                el.classList.add('selected');
                showZoneTooltip(zone, isLTOnly, evt || {});
            };
            el.addEventListener('click', insert);
            el.addEventListener('mouseenter', evt => showZoneTooltip(zone, isLTOnly, evt));
            el.addEventListener('mousemove', evt => showZoneTooltip(zone, isLTOnly, evt));
            el.addEventListener('mouseleave', hideZoneTooltip);
            el.addEventListener('focus', evt => {
                setSelectedZone(zone, isLTOnly);
                showZoneTooltip(zone, isLTOnly, evt);
            });
            el.addEventListener('blur', hideZoneTooltip);
            el.addEventListener('keydown', evt => {
                if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    insert(evt);
                }
            });
        });

        refreshFamilySummary();
    }

    function openModal() {
        const modal = $('aiModalBackdrop');
        if (!modal) return;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        const familyEl = $('aiModelFamily');
        if (familyEl) familyEl.value = AI_MODAL_STATE.modelFamily;
        bindPromptInvalidationWatchers();
        renderZoneMap();
        renderLTSolverPreview(false);
        const promptEl = $('aiPromptText');
        if (promptEl && !promptEl.value.trim()) {
            promptEl.value = buildAIPrompt(getCurrentSession(), window.ZONE_MAP, AI_MODAL_STATE.modelFamily, ($('aiUserIntent') && $('aiUserIntent').value) || '');
            markPromptBuilt();
        }
        updatePromptCharCount();
        refreshShape3DSummary(false);
        setTimeout(() => {
            const first = $('aiUserIntent');
            if (first) first.focus();
        }, 0);
    }

    function closeModal() {
        const modal = $('aiModalBackdrop');
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
    }

    function appliedStatusLines(result) {
        const count = Number(result && result.appliedFieldCount) || 0;
        const requested = Number(result && result.requestedFieldCount) || 0;
        const lines = [
            'Applied ' + count + ' changed field' + (count === 1 ? '' : 's') + ' from ' + requested + ' requested field' + (requested === 1 ? ':' : 's:')
        ];
        if (result && Array.isArray(result.changes) && result.changes.length) {
            result.changes.forEach(change => {
                const correction = change.clampedOrCorrected ? ' (clamped/corrected)' : '';
                lines.push(change.field + ': requested ' + change.requestedValue + ' -> final ' + change.finalValue + correction);
            });
        } else {
            lines.push('(No final values changed; delta matched current controls or normal UI validation restored current values.)');
        }
        lines.push('updateState: ' + (result && result.updateStateCalled ? 'called' : 'not available'));
        lines.push('Report uses final post-update DOM/session values.');
        if (result && result.warnings && result.warnings.length) lines.push.apply(lines, result.warnings);
        return lines;
    }

    function bindModalUI() {
        const openBtn = $('aiModalOpenBtn');
        const closeBtn = $('aiModalCloseBtn');
        const backdrop = $('aiModalBackdrop');
        const familyEl = $('aiModelFamily');
        const buildBtn = $('aiBuildPromptBtn');
        const copyPromptBtn = $('aiCopyPromptBtn');
        const refreshShapeBtn = $('aiRefreshShape3DBtn');
        const copyShapeBtn = $('aiCopyShape3DBtn');
        const activateCobraBtn = $('aiActivateCobraRearModeBtn');
        const validateBtn = $('aiValidateDeltaBtn');
        const applyBtn = $('aiApplyDeltaBtn');
        const generateValidBtn = $('aiGenerateValidDeltaBtn');
        const generateInvalidBtn = $('aiGenerateInvalidDeltaBtn');
        const selfTestBtn = $('aiRunSelfTestBtn');
        const copySmokeBtn = $('aiCopySmokeReportBtn');
        const promptElForCount = $('aiPromptText');

        bindPromptInvalidationWatchers();

        if (openBtn) openBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        if (backdrop) {
            backdrop.addEventListener('click', evt => {
                if (evt.target === backdrop) closeModal();
            });
        }

        document.addEventListener('keydown', evt => {
            if (evt.key === 'Escape' && backdrop && !backdrop.hidden) closeModal();
        });

        if (familyEl) {
            familyEl.addEventListener('change', () => {
                AI_MODAL_STATE.modelFamily = familyEl.value;
                renderZoneMap();
                renderLTSolverPreview(false);
                refreshShape3DSummary(false);
                updatePromptStaleWarning();
                setSmokeSummary('info', [
                    'modelFamily changed to ' + AI_MODAL_STATE.modelFamily + '.',
                    familyModeHint(AI_MODAL_STATE.modelFamily),
                    'Rebuild prompt before copying if the prompt may be stale.'
                ]);
            });
        }

        if (buildBtn) {
            buildBtn.addEventListener('click', () => {
                const promptEl = $('aiPromptText');
                const intentEl = $('aiUserIntent');
                const intent = intentEl && intentEl.value.trim()
                    ? '\n\nUser intent:\n' + intentEl.value.trim()
                    : '';
                if (promptEl) {
                    promptEl.value = buildAIPrompt(getCurrentSession(), window.ZONE_MAP, AI_MODAL_STATE.modelFamily, intentEl ? intentEl.value.trim() : '') + intent;
                    markPromptBuilt();
                    updatePromptCharCount();
                    refreshShape3DSummary(false);
                    renderLTSolverPreview(false);
                    promptEl.focus();
                }
                setStatus('info', 'Prompt rebuilt from current session, zone map and shape3d summary.');
            });
        }

        if (promptElForCount) {
            promptElForCount.addEventListener('input', updatePromptCharCount);
            updatePromptCharCount();
        }

        if (refreshShapeBtn) {
            refreshShapeBtn.addEventListener('click', () => refreshShape3DSummary(true));
        }

        if (copyShapeBtn) {
            copyShapeBtn.addEventListener('click', () => {
                const session = getCurrentSession();
                const shape3d = AI_MODAL_STATE.lastShape3D || refreshShape3DSummary(false);
                if (!shape3d) return;
                const shapeFormContext = buildShapeVisualContext(session, shape3d, AI_MODAL_STATE.modelFamily);
                copyTextToClipboard(JSON.stringify({
                    shapeFormContext,
                    cobraTargetReferenceContext: shouldIncludeCobraReferenceContext(session, AI_MODAL_STATE.modelFamily, ($('aiUserIntent') && $('aiUserIntent').value) || '') ? cobraTargetReferenceContext() : null,
                    currentVsCobraTargetDiagnosis: shapeFormContext.currentVsCobraTargetDiagnosis,
                    missingCobraGeometryControls: shapeFormContext.missingCobraGeometryControls,
                    shape3d
                }, null, 2))
                    .then(() => setStatus('success', 'Shape context JSON copied to clipboard.'))
                    .catch(err => setStatus('error', 'Could not copy shape context JSON: ' + (err && err.message ? err.message : err)));
            });
        }

        if (copyPromptBtn) {
            copyPromptBtn.addEventListener('click', () => {
                const promptEl = $('aiPromptText');
                const text = promptEl ? promptEl.value : '';
                updatePromptCharCount();
                copyTextToClipboard(text)
                    .then(() => setStatus('success', 'Full AI prompt copied to clipboard.'))
                    .catch(err => setStatus('error', 'Could not copy full AI prompt: ' + (err && err.message ? err.message : err)));
            });
        }

        if (activateCobraBtn) activateCobraBtn.addEventListener('click', prepareCobraActivationDelta);

        if (generateValidBtn) generateValidBtn.addEventListener('click', generateValidTestDelta);
        if (generateInvalidBtn) generateInvalidBtn.addEventListener('click', generateInvalidTestDelta);
        if (selfTestBtn) selfTestBtn.addEventListener('click', runValidationSelfTest);
        if (copySmokeBtn) copySmokeBtn.addEventListener('click', () => copySmokeReport());

        if (validateBtn) {
            validateBtn.addEventListener('click', () => {
                const result = validateAIResponse(($('aiResponseText') || {}).value || '');
                AI_MODAL_STATE.lastValidation = result;
                if (result.ok) {
                    const lines = result.aiVibeResponse ? formatAIVibePreviewLines(result) : ['Valid AI delta.'];
                    if (!result.aiVibeResponse && result.warnings.length) lines.push.apply(lines, result.warnings);
                    setStatus(result.warnings.length ? 'info' : 'success', lines);
                    setSmokeSummary('success', ['Validation result: ok', result.aiVibeResponse ? 'schema: ai-vibe-3d-response' : ('modelFamily: ' + result.delta.modelFamily)]);
                } else {
                    setStatus('error', result.errors);
                    setSmokeSummary('error', ['Validation result: issue', result.errors.join('\n')]);
                }
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const result = applyAIResponse(($('aiResponseText') || {}).value || '');
                AI_MODAL_STATE.lastValidation = result;
                if (result.ok) {
                    AI_MODAL_STATE.lastApplyResult = result;
                    setStatus(result.warnings.length ? 'info' : 'success', result.aiVibeResponse ? formatAIVibeApplyLines(result) : appliedStatusLines(result));
                    setSmokeSummary(result.updateStateCalled ? 'success' : 'info', [
                        'Apply diagnostic captured',
                        'responseSchema: ' + (result.aiVibeResponse ? 'ai-vibe-3d' : 'legacy-delta'),
                        'appliedFieldCount: ' + result.appliedFieldCount,
                        'updateStateCalled: ' + result.updateStateCalled,
                        'Verify that the left-panel control changed and that the model redrew.'
                    ]);
                    refreshFamilySummary();
                    refreshShape3DSummary(false);
                    updatePromptStaleWarning();
                } else {
                    setStatus('error', result.errors);
                    setSmokeSummary('error', ['Apply result: issue', result.errors.join('\n')]);
                }
            });
        }
    }

    window.AI_MODAL_STATE = AI_MODAL_STATE;
    window.buildAIPrompt = buildAIPrompt;
    window.buildShape3DContext = buildShape3DContext;
    window.validateAIDelta = validateAIDelta;
    window.applyAIDelta = applyAIDelta;
    window.validateAIResponse = validateAIResponse;
    window.applyAIResponse = applyAIResponse;
    window.refreshShape3DSummary = refreshShape3DSummary;
    window.refreshFamilySummary = refreshFamilySummary;
    window.refreshLTSolverPreview = renderLTSolverPreview;
    window.generateValidTestDelta = generateValidTestDelta;
    window.generateInvalidTestDelta = generateInvalidTestDelta;
    window.runValidationSelfTest = runValidationSelfTest;
    window.buildSmokeReportText = buildSmokeReportText;
    window.checkSessionClean = checkSessionClean;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindModalUI);
    } else {
        bindModalUI();
    }
})();
