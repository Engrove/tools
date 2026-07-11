// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * AI-CODING NOTE:
 * Responsibility: Own TD053F constants, deterministic defaults, and the explicit empty design lifecycle state.
 * Inputs: Static engineering defaults plus validated operator/session/import updates.
 * Outputs: Canonical global state consumed by geometry, UI, analysis, session, report, and export modules.
 * Safe edits: Add backward-compatible fields with matching consumer and regression updates.
 * Do not: Treat defaults as an active startup design or weaken numeric sanitization.
 * Verification: npm test and browser empty-session smoke test.
 *
 * js/config.js
 * Global constants, material library, and application state.
 */

const GOLDRING1042 = {
    anchors: { tipToTop: 17.3, tipToMountX: 10.2, mountHoleSpacing: 12.7, cantileverAngleDeg: 24 },
    inferred: { bodyLength: 22.8, maxBodyWidth: 16.9, plateLength: 20.0, plateWidth: 17.2, plateThickness: 2.65, seamX: 13.10, rearFaceX: 22.80 },
    plate: { x0: 3.15, x1: 23.15, z0: 14.65, z1: 17.30, halfWidth: 8.60, cornerR: 1.05, holeRadius: 1.20, holeCenters: [{ x: 10.20, y: -6.35 }, { x: 10.20, y: 6.35 }] },
    side: {
        top: [
            [[0.00, 4.85], [0.90, 6.30], [3.80, 11.50], [7.10, 14.55]],
            [[7.10, 14.55], [9.40, 14.58], [14.80, 14.52], [18.60, 14.40]],
            [[18.60, 14.40], [20.10, 14.30], [21.35, 13.95], [22.10, 13.25]],
            [[22.10, 13.25], [22.35, 12.95], [22.55, 12.65], [22.80, 12.40]]
        ],
        bottom: [
            [[0.00, 0.00], [0.18, 0.10], [0.42, 0.90], [0.95, 1.20]],
            [[0.95, 1.20], [2.30, 0.95], [6.80, 0.92], [10.20, 0.95]],
            [[10.20, 0.95], [14.80, 0.95], [18.50, 1.00], [20.60, 1.35]],
            [[20.60, 1.35], [21.50, 1.48], [22.20, 1.72], [22.80, 1.95]]
        ]
    },
    plan: {
        halfWidth: [
            [[0.00, 0.55], [0.35, 2.40], [1.60, 5.20], [4.20, 6.60]],
            [[4.20, 6.60], [6.30, 7.35], [8.40, 8.10], [10.20, 8.45]],
            [[10.20, 8.45], [13.20, 8.58], [17.20, 8.55], [20.10, 8.28]],
            [[20.10, 8.28], [21.20, 8.12], [22.10, 7.82], [22.80, 7.40]]
        ]
    },
    rearPins: { x: 22.80, length: 4.20, radius: 0.55, centers: [{ y: -6.35, z: 10.15 }, { y: 6.35, z: 10.15 }, { y: -6.35, z: 7.10 }, { y: 6.35, z: 7.10 }] },
    frontBadge: { x: 2.20, trapezoidYZ: [[-4.25, 2.85], [-3.10, 10.70], [3.10, 10.70], [4.25, 2.85]] },
    mass_cart: 6.3,
    mass_fixings: 1.3
};

const MATERIAL_LIB = {
    carbon: { name: 'Kolfiber/Epoxy', density: 1.55, E: 135000, G: 5000 },
    glass: { name: 'Glasfiber/Epoxy', density: 1.90, E: 45000, G: 4000 },
    kevlar: { name: 'Kevlar/Epoxy', density: 1.38, E: 75000, G: 2000 },
    flax: { name: 'Linfiber/Epoxy', density: 1.30, E: 30000, G: 1500 }
};

const KINEMATICS_PRESETS = {
    baerwald_iec: { n1: 66.0, n2: 120.9 },
    lofgrenB_iec: { n1: 70.3, n2: 116.6 },
    stevenson_iec: { n1: 60.325, n2: 117.4 }
};

const EXPORT_TYPES = {
    HOLLOW: 'hollow',
    SOLID: 'solid',
    ONSHAPE_1TO1: 'onshape_1to1',
    SPLIT_VERTICAL: 'split_vertical',
    SPLIT_HORIZONTAL: 'split_horizontal'
};

const REAR_MODES = {
    CLASSIC: 'classic_tail',
    COBRA_GOOSE: 'cobra_integrated_tail'
};

const REAR_WEIGHT_MOUNT_TYPES = {
    THREADED_STACK: 'threaded_stack'
};

const LENGTH = 281;
const DATUM_VERSION = 'TD044-v1';

const inputs = [
    'apex', 'maxH', 'maxW', 'headH', 'headW', 'neckW', 'neckL', 'noseL',
    'bow', 'bulge', 'tailD', 'asym', 'padL', 'thick', 'padOffset',
    'sculptHeadFlatEnabled', 'sculptHeadFlatStartX', 'sculptHeadFlatEndX',
    'sculptHeadBottomZ', 'sculptHeadBlendLength', 'sculptHeadFlatWidthFraction',
    'sculptStepSuppressor', 'sculptFrontStiffnessRampEnabled', 'sculptFrontMinHeight',
    'sculptFrontRampStartX', 'sculptFrontRampEndX', 'sculptFrontRampTargetHeight',
    'sculptFrontTopBias', 'cartX',
    'customMass', 'customZ', 'comp10', 'comp100', 'compK', 'nomStylusX',
    'pivotSpindle', 'fullLength', 'pivotOffsetX', 'pivotOffsetY', 'pivotOffsetZ',
    'verticalPivotHeightAboveLP', 'armBodyDatumOffsetZ',
    'rearBendStartX', 'rearBlendLength', 'rearBendDropZ', 'rearBendLength',
    'rearMouthWidth', 'rearMouthLength',
    'rearWeightDiscDiameter', 'rearWeightDiscThickness',
    'rearWeightDiscCount', 'rearWeightDiscMass',
    'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent', 'counterweightZOffset',
    'rearSupportBridgeLength', 'rearSupportBridgeRadius', 'rearSupportBridgeOverlap',
    'canopyRidgeHeight', 'canopyRidgeWidthFraction', 'canopyRidgeSharpness',
    'wireRouteRadius', 'wireRouteYOffset', 'wireRouteZOffset',
    'titaniumPlateLength', 'titaniumPlateWidth', 'titaniumPlateThickness', 'titaniumPlateMass',
    'titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset',
    'titaniumAdhesiveThickness', 'titaniumAdhesiveDampingLossFactor',
    'aiVibePlugSurfaceOffset', 'aiVibeSandingAllowance', 'aiVibeDraftDeg',
    'aiVibeMouldFlangeWidth', 'aiVibeRegistrationPins', 'aiVibeBoltHoles',
    'aiVibeVentChannels', 'aiVibeShrinkagePercent', 'aiVibeMinTriangleHardFailArea',
    'onshapeUnitScale', 'onshapeChordToleranceMm'
];

const NON_NEGATIVE_MASS_INPUT_IDS = Object.freeze([
    'customMass',
    'selectedCartridgeMassG',
    'rearWeightDiscMass',
    'rearFineTrimScrewMassEquivalent'
]);

function sanitizeFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function isNonNegativeMassInput(id) {
    return NON_NEGATIVE_MASS_INPUT_IDS.indexOf(id) !== -1 || /Mass(G|Kg)?$|MassEquivalent$/i.test(String(id || ''));
}

function sanitizeInputValue(id, value, fallback) {
    const safeFallback = sanitizeFiniteNumber(fallback, 0);
    const n = sanitizeFiniteNumber(value, safeFallback);
    return isNonNegativeMassInput(id) ? Math.max(0, n) : n;
}

function sanitizeMassFieldsOnObject(target) {
    if (!target || typeof target !== 'object') return target;
    Object.keys(target).forEach(key => {
        const value = target[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            sanitizeMassFieldsOnObject(value);
        } else if (isNonNegativeMassInput(key)) {
            target[key] = sanitizeInputValue(key, value, 0);
        }
    });
    NON_NEGATIVE_MASS_INPUT_IDS.forEach(id => {
        if (Object.prototype.hasOwnProperty.call(target, id)) target[id] = sanitizeInputValue(id, target[id], 0);
    });
    return target;
}

const state = {
    // Port contract: defaults remain available for explicit parametric creation,
    // but a new browser session has no active geometry and must render nothing.
    designLoaded: false,
    designSource: null,
    manualTraceImport: null,
    exportType: EXPORT_TYPES.HOLLOW,
    exportFormat: 'stl_binary',
    // TD052B: global geometry source switch. parametric preserves TD051B/Cobra/Classic; freeform consumes state.freeformLoft.
    geometryMode: 'parametric',
    freeformLoft: null,
    freeformLastAnalysis: null,
    // TD043: reserved for future split-base / alignment-key features (TD045+).
    // Currently unused by any export or rendering pipeline.
    splitBase: 'solid',
    splitClearance: 0.0,
    meshSegments: 60,
    meshStepX: 1.0,
    draftMinDeg: 1.0,
    manufacturingMode: 'onshape_1to1',
    aiVibeSoftSliverPass: true,
    aiVibePlugSurfaceOffset: 0.0,
    aiVibeSandingAllowance: 0.0,
    aiVibeDraftDeg: 0.0,
    aiVibeMouldFlangeWidth: 0.0,
    aiVibeRegistrationPins: 0,
    aiVibeBoltHoles: 0,
    aiVibeVentChannels: 0,
    aiVibeShrinkagePercent: 0.0,
    aiVibeMinTriangleHardFailArea: 0.00001,
    onshapeUnitScale: 1.0,
    onshapeChordToleranceMm: 0.01,
    onshapeMetadataSidecar: true,
    onshapeStrictOneToOne: true,
    addAlignmentKeys: false,
    keyDiameter: 4.0,
    keyDepth: 4.0,
    keyCount: 3,

    // TD026/Fase 14: core geometry controls are protected runtime geometry
    // inputs. Keep browser DOM and standalone acceptance/runtime defaults in
    // sync so the TD026 full ring source can be generated without proxy data.
    apex: 231.0,
    maxH: 24.0,
    maxW: 34.0,
    headH: 6.0,
    headW: 22.0,
    neckW: 11.0,
    neckL: 45.0,
    noseL: 16.0,
    bow: 5.0,
    bulge: 2.0,
    tailD: 6.0,
    asym: 0.9,
    padL: 26.0,
    thick: 1.5,
    padOffset: 0.0,
    // TD047: AI Vibe sculpting controls. These are numeric rather than free-form
    // geometry commands so sessions, legacy full deltas and local-file workflows
    // remain deterministic. They let AI force a true planar headshell underside
    // and smooth the transition into the monocoque without adding impossible
    // carbon-layup passages.
    sculptHeadFlatEnabled: 0.0,
    sculptHeadFlatStartX: 0.0,
    sculptHeadFlatEndX: 34.0,
    sculptHeadBottomZ: -3.0,
    sculptHeadBlendLength: 14.0,
    sculptHeadFlatWidthFraction: 0.70,
    sculptStepSuppressor: 1.0,
    // TD048: front stiffness-ramp sculpt controls. The TD047 flat underside only
    // controlled the lower chord; these fields also control minimum section
    // height and the front-to-hump stiffness gradient so AI cannot leave a
    // ribbon-thin headshell/neck or a one-station geometry step.
    sculptFrontStiffnessRampEnabled: 0.0,
    sculptFrontMinHeight: 5.8,
    sculptFrontRampStartX: 0.0,
    sculptFrontRampEndX: 78.0,
    sculptFrontRampTargetHeight: 10.0,
    sculptFrontTopBias: 0.95,
    cartX: 0.0,

    rearMode: REAR_MODES.CLASSIC,
    rearBlendLength: 28.0,
    rearBendStartX: 236.0,
    rearBendDropZ: 25.0,
    rearBendLength: 30.0,
    rearMouthWidth: 11.0,
    rearMouthLength: 12.0,

    rearWeightMountType: REAR_WEIGHT_MOUNT_TYPES.THREADED_STACK,
    rearWeightDiscDiameter: 14.0,
    rearWeightDiscThickness: 4.0,
    rearWeightDiscCount: 0,
    rearWeightDiscMass: 18.0,
    rearFineTrimScrewLength: 18.0,
    rearFineTrimScrewMassEquivalent: 0.0,
    counterweightZOffset: 0.0,
    rearSupportBridgeLength: 2.0,
    rearSupportBridgeRadius: 1.25,
    rearSupportBridgeOverlap: 0.25,
    canopyRidgeHeight: 1.4,
    canopyRidgeWidthFraction: 0.22,
    canopyRidgeSharpness: 3.0,
    wireRouteRadius: 0.65,
    wireRouteYOffset: 0.0,
    wireRouteZOffset: -2.0,
    titaniumPlateLength: 24.0,
    titaniumPlateWidth: 18.0,
    titaniumPlateThickness: 1.5,
    titaniumPlateMass: 2.85,
    // TD051: titaniumMountPlate is a structural laminated interface
    // plate in the headshell-to-neck transition zone, not the M2.5
    // slot-carrier/reference plate at the cartridge mounting datum.
    titaniumPlateX: 32.0,
    titaniumPlateYOffset: 0.0,
    titaniumPlateZOffset: 0.0,
    titaniumAdhesiveThickness: 0.08,
    titaniumAdhesiveDampingLossFactor: 0.18,

    includeRearWeightDiscsInExport: false,
    showRearWeights: true,
    showFineTrimScrew: false,
    showInternalWireRoute: false,
    cobraArchitectureEnabled: false,
    enableCobraArchitecture: false,
    titaniumPlateEnabled: false,
    showRearCG: true,
    showNeutralLine: true,
    showTowerClearance: false,
    showMechanicalAssemblyDebug: false,
    useCobraEggshellWandDebug: false,
    useCobraEggshellExportDebug: false,

    targetEffectiveMass: 12.0,
    targetLFResonance: 10.0,
    targetVTF: 2.0,
    targetFirstBendingMode: 600.0,
    targetSlendernessMin: 8.0,
    targetSlendernessMax: 25.0,

    fullLength: LENGTH,

    // TD043: Vertical reference frame. The scene z=0 plane is by convention the LP top.
    //   - lpTopZ           : record-surface datum, frozen at 0 in this release.
    //                        Reserved as a state field for future LP-thickness / mat configurations.
    //   - verticalPivotHeightAboveLP : signed mm above LP. Cobra-correct default 0.
    //   - armBodyDatumOffsetZ : signed mm of body envelope above LP. Independent of pivot.
    // pivotOffsetZ is preserved for backward compatibility but is now derived from
    // verticalPivotHeightAboveLP (see Session.apply migration).
    //
    // TD044: Playback datum hierarchy.
    // stylus.z is the canonical zero of the playback z-axis. All other Z values
    // are derived from stylus.z plus an explicit relationship to it:
    //   lpTopZ              = stylus.z during playback
    //   pivot.z             = lpTopZ + verticalPivotHeightAboveLP
    //   cartridge_top.z     = stylus.z + cartridge tip-to-top distance
    //   headshell_pad.z     = cartridge_top.z
    //   body_envelope.z(x)  = auto-shifted so headshell underside meets cartridge top.
    // The user adjusts body shape via maxH/bow/apex/etc. When stylusLockedToLP is true
    // the system auto-solves armBodyDatumOffsetZ so the stylus stays glued to lpTopZ.
    // The user retains direct control over verticalPivotHeightAboveLP (= VTA tower height).
    lpTopZ: 0.0,
    verticalPivotHeightAboveLP: 0.0,
    armBodyDatumOffsetZ: 0.0,
    stylusLockedToLP: true,

    pivotOffsetX: 0.0,
    pivotOffsetY: 0.0,
    pivotOffsetZ: 0.0,

    showVerticalPivot: true,
    showTotalCOM: true,
    showRearCOM: true,
    showCounterweightCOM: true,
    showCartridgeCOM: true,
    showInertiaAxes: true,
    showMeasureLines: true,
    showLpTopPlane: true,
    material: 'carbon',
    cartMode: 'g1042',
    selectedCartridgeId: 'goldring-1042',
    selectedCartridgeName: 'Goldring 1042',
    selectedCartridgeManufacturer: 'Goldring',
    selectedCartridgeModel: '1042',
    selectedCartridgeType: 'MM',
    selectedCartridgeMassG: 6.3,
    selectedCartridgeCompliance10HzCu: 11.0,
    selectedCartridgeComplianceEstimated: false,
    selectedCartridgeTrackingForceMinG: 1.5,
    selectedCartridgeTrackingForceMaxG: 2.0,
    selectedCartridgeTrackingForceRecommendedG: 1.75,
    selectedCartridgeStylus: '',
    selectedCartridgeCantilever: '',
    selectedCartridgeOutputMv: null,
    alignmentPreset: 'baerwald_iec',
    renderMode: 'cad',
    showForce: true,
    showMass: true,

    // Phase 1 Cobra architecture contract. Disabled by default so legacy and
    // non-Cobra sessions preserve their existing behavior. Sessions may opt in
    // by persisting cobraArchitecture.enabled=true.
    cobraArchitecture: {
        schema: 'tonearm-designer-cobra-architecture-v1',
        enabled: false,
        specRegime: 'custom_237_05',
        n1p2Mm: 237.05,
        counterweight: {
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
            lengthMm: 237.05,
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
        headshellSlots: {
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
                {
                    id: 'slot_left',
                    lengthMm: 8,
                    widthMm: 2.6,
                    centerXMm: 10.2,
                    centerYMm: -5.4,
                    angleDeg: 0
                },
                {
                    id: 'slot_right',
                    lengthMm: 8,
                    widthMm: 2.6,
                    centerXMm: 10.2,
                    centerYMm: 5.4,
                    angleDeg: 0
                }
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
        capabilitiesRequired: [
            'cobraControls',
            'cobraDiscCounterweightAssembly',
            'cobraMechanicalAssembly',
            'headshellSlots',
            'stationBasedEggshellWand',
            'structuralStationFilter'
        ]
    }
};

let scene, camera, renderer, controls, tonearmMesh, cartGroup, rearAccessoriesGroup, physGroupGlobal;
let insetScene, insetCamera, insetRenderer, axesHelper;


// TD053F: expose the canonical browser state object for Freeform live-state binding.
// Top-level `const state` is not guaranteed to be reachable as window.state from later scripts.
if (typeof window !== 'undefined' && typeof state !== 'undefined') {
    window.state = state;
    window.__tonearmCanonicalState = state;
}
