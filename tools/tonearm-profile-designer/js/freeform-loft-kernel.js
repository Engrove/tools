// SPDX-License-Identifier: 0BSD
// TD053 AI Vibe 3D Freeform Centerline/Ring Loft kernel.
// Runtime-integration candidate: state-based geometry source, schema prompt embedding and strict validation.
// AI-CODING NOTE: Manual Trace sourceProvenance may own validated protected endpoint values; AI response patches still cannot move protected datums.

(function(root) {
    'use strict';

    const RESPONSE_SCHEMA = 'tonearm-designer-ai-freeform-loft-response';
    const RESPONSE_VERSION = 1;
    const MODE = 'freeform_centerline_ring_loft';
    const APP_VERSION = 'V28.8.0-Fas20-AIResponseApplyRuntime';

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

    function getCenterlineAPI() {
        return root.FreeformCenterline;
    }

    function getRingsAPI() {
        return root.FreeformRings;
    }

    function getFeaturesAPI() {
        return root.FreeformFeatures;
    }

    function preset(name) {
        const key = String(name || 'long_low_cobra_monocoque');
        const cApi = getCenterlineAPI();
        const rApi = getRingsAPI();
        const fApi = getFeaturesAPI();
        const cPresets = cApi && cApi.presets ? cApi.presets() : {};
        const rPresets = rApi && rApi.presets ? rApi.presets() : {};
        const fPresets = fApi && fApi.presets ? fApi.presets() : {};
        return {
            schema: 'tonearm-designer-freeform-loft-state-v1',
            preset: key,
            centerline: clone(cPresets[key] || (cApi && cApi.defaultCenterline ? cApi.defaultCenterline() : { curveType: 'catmull_rom', points: [] })),
            rings: clone(rPresets[key] || (rApi && rApi.defaultRings ? rApi.defaultRings() : [])),
            features: clone(fPresets[key] || (fApi && fApi.defaultFeatures ? fApi.defaultFeatures() : {}))
        };
    }

    function defaultState(name) {
        return preset(name || 'long_low_cobra_monocoque');
    }

    function getCurrentFreeformState() {
        const state = root.state && root.state.freeformLoft ? root.state.freeformLoft : (root.LAST_FREEFORM_LOFT_STATE || null);
        return state || defaultState();
    }

    function sanitizeState(value) {
        const cApi = getCenterlineAPI();
        const rApi = getRingsAPI();
        const fApi = getFeaturesAPI();
        const base = value || defaultState();
        const provenance = base.sourceProvenance && base.sourceProvenance.sourceKind === 'engrove_manual_trace'
            ? clone(base.sourceProvenance)
            : null;
        const sanitized = {
            schema: 'tonearm-designer-freeform-loft-state-v1',
            preset: base.preset || 'custom',
            designIntent: typeof base.designIntent === 'string' ? base.designIntent : '',
            targets: clone(base.targets || {}),
            analysisTargets: clone(base.analysisTargets || {}),
            analysisRequests: Array.isArray(base.analysisRequests) ? clone(base.analysisRequests) : [],
            aiEstimates: clone(base.aiEstimates || {}),
            analysisPolicy: clone(base.analysisPolicy || {}),
            assumptions: Array.isArray(base.assumptions) ? clone(base.assumptions) : [],
            centerline: cApi.sanitizeCenterline(base.centerline, provenance ? { base: base.centerline } : undefined),
            rings: rApi.sanitizeRings(base.rings),
            features: fApi.sanitizeFeaturePatch(base.features)
        };
        if (provenance) sanitized.sourceProvenance = provenance;
        return sanitized;
    }

    function applyPreset(name) {
        const next = sanitizeState(preset(name));
        if (root.state) { root.state.freeformLoft = clone(next); root.state.geometryMode = 'freeform'; }
        root.LAST_FREEFORM_LOFT_STATE = clone(next);
        return next;
    }

    function applyResponse(current, response) {
        const validation = validateResponse(response);
        if (!validation.ok) return { ok: false, errors: validation.errors, warnings: validation.warnings, state: sanitizeState(current || getCurrentFreeformState()) };
        const cApi = getCenterlineAPI();
        const rApi = getRingsAPI();
        const fApi = getFeaturesAPI();
        const base = sanitizeState(current || getCurrentFreeformState());
        const next = {
            schema: 'tonearm-designer-freeform-loft-state-v1',
            preset: 'ai_response_' + String(response.name || 'freeform').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40),
            centerline: cApi.applyCenterlinePatch(base.centerline, response.centerlinePatch || {}),
            rings: rApi.applyRingPatch(base.rings, response.ringPatch || {}),
            features: fApi.applyFeaturePatch(base.features, response.featurePatch || {}),
            designIntent: typeof response.designIntent === 'string' ? response.designIntent : base.designIntent,
            targets: clone(response.targets || base.targets || {}),
            analysisTargets: clone(response.analysisTargets || base.analysisTargets || {}),
            analysisRequests: Array.isArray(response.analysisRequests) ? clone(response.analysisRequests) : clone(base.analysisRequests || []),
            aiEstimates: clone(response.aiEstimates || {}),
            analysisPolicy: clone(response.analysisPolicy || base.analysisPolicy || {}),
            assumptions: Array.isArray(response.assumptions) ? clone(response.assumptions) : clone(base.assumptions || [])
        };
        if (base.sourceProvenance && base.sourceProvenance.sourceKind === 'engrove_manual_trace') {
            next.sourceProvenance = clone(base.sourceProvenance);
        }
        const clean = sanitizeState(next);
        if (root.state) { root.state.freeformLoft = clone(clean); root.state.geometryMode = 'freeform'; }
        root.LAST_FREEFORM_LOFT_STATE = clone(clean);
        return { ok: true, errors: [], warnings: validation.warnings, unsupportedAttributes: clone(response.unsupportedAttributes || []), state: clean };
    }

    function unsupportedPolicy() {
        return [
            'unsupportedAttributes is required as an array.',
            'List requested geometry or behavior that cannot be represented by centerlinePatch, ringPatch, featurePatch or analysisTargets.',
            'Do not use unsupportedAttributes as a reason to return an empty patch when a partial valid patch is possible.',
            'Do not put invented mesh triangles, STL, OBJ or BREP data in unsupportedAttributes.'
        ];
    }

    function writableFieldSpec() {
        const cApi = getCenterlineAPI();
        const rApi = getRingsAPI();
        return {
            schema: RESPONSE_SCHEMA,
            version: RESPONSE_VERSION,
            mode: MODE,
            centerlinePatch: {
                curveType: ['catmull_rom'],
                points: {
                    count: cApi.limits.count,
                    writableFields: {
                        id: 'string, non-protected point ids only for movement',
                        s: cApi.limits.s,
                        x: cApi.limits.x,
                        y: cApi.limits.y,
                        z: cApi.limits.z
                    },
                    protectedDatums: cApi.protectedDatums
                }
            },
            ringPatch: {
                rings: {
                    count: rApi.limits.stationCount,
                    shapeFamily: rApi.shapeFamilies,
                    writableFields: {
                        s: rApi.limits.s,
                        widthMm: rApi.limits.widthMm,
                        heightMm: rApi.limits.heightMm,
                        wallThicknessMm: rApi.limits.wallThicknessMm,
                        rotationDeg: rApi.limits.rotationDeg,
                        tiltDeg: rApi.limits.tiltDeg,
                        cornerSharpness: rApi.limits.cornerSharpness,
                        superellipseExponent: rApi.limits.superellipseExponent,
                        asymmetryY: rApi.limits.asymmetryY,
                        asymmetryZ: rApi.limits.asymmetryZ,
                        topRidgeHeightMm: rApi.limits.topRidgeHeightMm,
                        bottomFlatness: rApi.limits.bottomFlatness,
                        crescentCutDepth: rApi.limits.crescentCutDepth,
                        controlPoints: rApi.limits.controlPointsCount
                    }
                }
            },
            featurePatch: {
                featureTypes: getFeaturesAPI().featureTypes,
                rules: [
                    'titaniumMountPlate.type must remain structural_laminated_interface_plate and looseUndersidePlate=false.',
                    'cartridgeSlots must remain a separate slot feature.',
                    'counterweightStack must remain a separate rear-terminal assembly.',
                    'counterweight may not be faked with ring shape, tail or rear bend.',
                    'headshell mount is integrated in standard modes.'
                ]
            }
        };
    }

    function engineeringTargets(currentState) {
        const state = currentState || getCurrentFreeformState();
        return {
            units: 'mm_g_Hz',
            designIntent: 'low-mass high-stiffness tonearm form with preserved cartridge/headshell datums and counterweight relation',
            massContext: {
                targetBodyMassG: 18,
                targetTotalMovingMassG: 28,
                densityAssumptionGPerCm3: 1.25,
                titaniumDensityGPerCm3: 4.43
            },
            COM_COG_context: {
                preferredBodyCOMS: { min: 0.35, max: 0.68 },
                keepCOGNearCenterlineYMm: { min: -4, max: 4 },
                keepCOGAboveLPZMm: { min: 0, max: 18 }
            },
            resonanceContext: {
                acceptableVerticalHz: { min: 8, max: 12 },
                acceptableHorizontalHz: { min: 8, max: 12 },
                compliance10HzAssumption: finite(state && state.analysisTargets && state.analysisTargets.compliance10Hz, 12)
            },
            physicalAuditContext: [
                'mass',
                'volume',
                'COM/COG',
                'inertia tensor',
                'effective mass proxy',
                'vertical/horizontal resonance estimate',
                'EI / first bending proxy',
                'wire duct clearance',
                'cartridge datum',
                'headshell datum',
                'counterweight relation',
                'printability/export audit',
                'Onshape 1:1 audit'
            ]
        };
    }


    let RUNTIME_SCHEMA_CACHE = null;

    function getRuntimeJsonSchema() {
        if (root.TONEARM_DESIGNER_AI_FREEFORM_LOFT_SCHEMA) return root.TONEARM_DESIGNER_AI_FREEFORM_LOFT_SCHEMA;
        if (RUNTIME_SCHEMA_CACHE) return RUNTIME_SCHEMA_CACHE;
        if (typeof require === 'function') {
            try {
                const fs = require('fs');
                const path = require('path');
                const schemaPath = path.resolve(__dirname || '.', '..', 'tonearm_designer_ai_freeform_loft.schema.json');
                RUNTIME_SCHEMA_CACHE = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                root.TONEARM_DESIGNER_AI_FREEFORM_LOFT_SCHEMA = RUNTIME_SCHEMA_CACHE;
                return RUNTIME_SCHEMA_CACHE;
            } catch (err) {
                // Browser builds should load js/freeform-schema.js before this kernel.
            }
        }
        return {
            $id: 'tonearm_designer_ai_freeform_loft.schema.json',
            $defs: {}
        };
    }

    function schemaDef(name) {
        const schema = getRuntimeJsonSchema();
        return schema && schema.$defs ? schema.$defs[name] || {} : {};
    }

    function propSchema(defName, propName) {
        const def = schemaDef(defName);
        return def && def.properties ? def.properties[propName] || {} : {};
    }

    function pushNumberConstraint(errors, path, value, prop) {
        if (value === undefined) return;
        const n = Number(value);
        if (!Number.isFinite(n)) {
            errors.push(path + ' must be finite number');
            return;
        }
        if (prop.type === 'integer' && Math.round(n) !== n) errors.push(path + ' must be integer');
        if (prop.minimum !== undefined && n < Number(prop.minimum)) errors.push(path + ' below schema minimum ' + prop.minimum);
        if (prop.maximum !== undefined && n > Number(prop.maximum)) errors.push(path + ' above schema maximum ' + prop.maximum);
    }

    function pushConstConstraint(errors, path, value, prop) {
        if (!prop || prop.const === undefined || value === undefined) return;
        if (value !== prop.const) errors.push(path + ' must be schema const ' + String(prop.const));
    }

    function validateSchemaBackedObject(errors, path, obj, defName, allowedExtra) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            errors.push(path + ' must be object');
            return;
        }
        const def = schemaDef(defName);
        const props = def.properties || {};
        const allowed = Object.keys(props).concat(allowedExtra || []);
        Object.keys(obj).forEach(k => {
            if (allowed.indexOf(k) === -1) errors.push('unknown schema field: ' + path + '.' + k);
            const prop = props[k];
            if (!prop) return;
            if (prop.type === 'number' || prop.type === 'integer') pushNumberConstraint(errors, path + '.' + k, obj[k], prop);
            if (prop.enum && obj[k] !== undefined && prop.enum.indexOf(obj[k]) === -1) errors.push(path + '.' + k + ' not in schema enum');
            pushConstConstraint(errors, path + '.' + k, obj[k], prop);
            if (prop.type === 'boolean' && obj[k] !== undefined && typeof obj[k] !== 'boolean') errors.push(path + '.' + k + ' must be boolean');
        });
    }


    function resolveRuntimeSchemaRef(ref) {
        const schema = getRuntimeJsonSchema();
        if (!ref || ref.indexOf('#/$defs/') !== 0) return null;
        const name = ref.slice('#/$defs/'.length);
        return schema && schema.$defs ? schema.$defs[name] || null : null;
    }

    function isSchemaNodeMatched(value, node) {
        const temp = [];
        validateRuntimeSchemaNode(temp, '$if', value, node || {});
        return temp.length === 0;
    }

    function validateRuntimeSchemaNode(errors, path, value, node) {
        if (!node || typeof node !== 'object') return;

        if (node.$ref) {
            const resolved = resolveRuntimeSchemaRef(node.$ref);
            if (!resolved) errors.push(path + ' has unresolved schema ref ' + node.$ref);
            else validateRuntimeSchemaNode(errors, path, value, resolved);
            return;
        }

        if (node.oneOf) {
            let passCount = 0;
            let firstFailure = [];
            node.oneOf.forEach(candidate => {
                const tmp = [];
                validateRuntimeSchemaNode(tmp, path, value, candidate);
                if (tmp.length === 0) passCount += 1;
                else if (!firstFailure.length) firstFailure = tmp;
            });
            if (passCount !== 1) {
                errors.push(path + ' must match exactly one schema branch; matched ' + passCount);
                firstFailure.slice(0, 8).forEach(err => errors.push(path + ' oneOf branch detail: ' + err));
            }
            return;
        }

        if (node.anyOf) {
            let anyPass = false;
            node.anyOf.forEach(candidate => {
                const tmp = [];
                validateRuntimeSchemaNode(tmp, path, value, candidate);
                if (tmp.length === 0) anyPass = true;
            });
            if (!anyPass) errors.push(path + ' must match at least one schema branch');
            return;
        }

        if (node.not) {
            const tmp = [];
            validateRuntimeSchemaNode(tmp, path, value, node.not);
            if (tmp.length === 0) errors.push(path + ' matches forbidden schema branch');
        }

        if (node.allOf) {
            node.allOf.forEach(candidate => {
                if (candidate && candidate.if) {
                    if (isSchemaNodeMatched(value, candidate.if) && candidate.then) validateRuntimeSchemaNode(errors, path, value, candidate.then);
                    if (!isSchemaNodeMatched(value, candidate.if) && candidate.else) validateRuntimeSchemaNode(errors, path, value, candidate.else);
                } else {
                    validateRuntimeSchemaNode(errors, path, value, candidate);
                }
            });
        }

        if (node.const !== undefined && value !== undefined && value !== node.const) {
            errors.push(path + ' must equal schema const ' + JSON.stringify(node.const));
        }
        if (node.enum && value !== undefined && node.enum.indexOf(value) === -1) {
            errors.push(path + ' must be one of schema enum values');
        }

        const nodeIsObjectLike = node.type === 'object' || !!node.properties || !!node.required || node.additionalProperties !== undefined;
        if (node.type || nodeIsObjectLike) {
            if (nodeIsObjectLike) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    errors.push(path + ' must be object');
                    return;
                }
            } else if (node.type === 'array') {
                if (!Array.isArray(value)) {
                    errors.push(path + ' must be array');
                    return;
                }
            } else if (node.type === 'number') {
                if (typeof value !== 'number' || !Number.isFinite(value)) {
                    errors.push(path + ' must be finite number');
                    return;
                }
            } else if (node.type === 'integer') {
                if (typeof value !== 'number' || !Number.isFinite(value) || Math.round(value) !== value) {
                    errors.push(path + ' must be integer');
                    return;
                }
            } else if (node.type === 'string') {
                if (typeof value !== 'string') {
                    errors.push(path + ' must be string');
                    return;
                }
            } else if (node.type === 'boolean') {
                if (typeof value !== 'boolean') {
                    errors.push(path + ' must be boolean');
                    return;
                }
            }
        }

        if ((node.type === 'number' || node.type === 'integer') && typeof value === 'number') {
            if (node.minimum !== undefined && value < Number(node.minimum)) errors.push(path + ' below schema minimum ' + node.minimum);
            if (node.maximum !== undefined && value > Number(node.maximum)) errors.push(path + ' above schema maximum ' + node.maximum);
        }

        if (node.type === 'string' && typeof value === 'string') {
            if (node.minLength !== undefined && value.length < Number(node.minLength)) errors.push(path + ' below schema minLength ' + node.minLength);
            if (node.maxLength !== undefined && value.length > Number(node.maxLength)) errors.push(path + ' above schema maxLength ' + node.maxLength);
        }

        if (node.type === 'array' && Array.isArray(value)) {
            if (node.minItems !== undefined && value.length < Number(node.minItems)) errors.push(path + ' below schema minItems ' + node.minItems);
            if (node.maxItems !== undefined && value.length > Number(node.maxItems)) errors.push(path + ' above schema maxItems ' + node.maxItems);
            if (node.items) value.forEach((item, idx) => validateRuntimeSchemaNode(errors, path + '[' + idx + ']', item, node.items));
        }

        if ((node.type === 'object' || node.properties || node.required || node.additionalProperties !== undefined) && value && typeof value === 'object' && !Array.isArray(value)) {
            const props = node.properties || {};
            (node.required || []).forEach(k => {
                if (value[k] === undefined) errors.push(path + '.' + k + ' is required by schema');
            });
            if (node.additionalProperties === false) {
                Object.keys(value).forEach(k => {
                    if (!Object.prototype.hasOwnProperty.call(props, k)) errors.push(path + '.' + k + ' is forbidden by additionalProperties:false');
                });
            }
            Object.keys(props).forEach(k => {
                if (value[k] !== undefined) validateRuntimeSchemaNode(errors, path + '.' + k, value[k], props[k]);
            });
        }
    }

    function validateResponseAgainstEmbeddedJsonSchema(value) {
        const schema = getRuntimeJsonSchema();
        const schemaErrors = [];
        if (!schema || !schema.$defs || !schema.$defs.FreeformLoftResponse) {
            schemaErrors.push('runtime JSON schema is not loaded');
            return schemaErrors;
        }
        validateRuntimeSchemaNode(schemaErrors, '$', value, schema);
        return schemaErrors;
    }

    function validateRuntimeSchemaEnvelope(value, errors) {
        const deepSchemaErrors = validateResponseAgainstEmbeddedJsonSchema(value);
        deepSchemaErrors.forEach(err => errors.push('runtime schema: ' + err));
        const runtimeSchema = getRuntimeJsonSchema();
        if (!runtimeSchema || !runtimeSchema.$defs || !runtimeSchema.$defs.FreeformLoftResponse) return;
        const requiredTop = ['schema','version','app','mode','name','centerlinePatch','ringPatch','featurePatch','analysisTargets','unsupportedAttributes'];
        requiredTop.forEach(k => {
            if (value[k] === undefined) errors.push('missing required top-level field: ' + k);
        });

        const cPointProps = schemaDef('CenterlinePointPatch').properties || {};
        const rItemProps = schemaDef('RingPatchItem').properties || {};
        const analysisProps = schemaDef('AnalysisTargets').properties || {};

        if (value.centerlinePatch && typeof value.centerlinePatch === 'object') {
            (Array.isArray(value.centerlinePatch.points) ? value.centerlinePatch.points : []).forEach((p, i) => {
                ['s','x','y','z'].forEach(field => pushNumberConstraint(errors, 'centerlinePatch.points[' + i + '].' + field, p && p[field], cPointProps[field] || {}));
            });
        }

        if (value.ringPatch && typeof value.ringPatch === 'object') {
            (Array.isArray(value.ringPatch.rings) ? value.ringPatch.rings : []).forEach((r, i) => {
                Object.keys(r || {}).forEach(k => {
                    const prop = rItemProps[k];
                    if (!prop) return;
                    if (prop.type === 'number' || prop.type === 'integer') pushNumberConstraint(errors, 'ringPatch.rings[' + i + '].' + k, r[k], prop);
                    if (prop.enum && r[k] !== undefined && prop.enum.indexOf(r[k]) === -1) errors.push('ringPatch.rings[' + i + '].' + k + ' not in schema enum');
                });
                const cps = r && r.controlPoints;
                if (cps !== undefined) {
                    if (!Array.isArray(cps)) errors.push('ringPatch.rings[' + i + '].controlPoints must be array');
                    else {
                        const cpProp = rItemProps.controlPoints || {};
                        if (cpProp.minItems !== undefined && cps.length < cpProp.minItems) errors.push('ringPatch.rings[' + i + '].controlPoints below minItems ' + cpProp.minItems);
                        if (cpProp.maxItems !== undefined && cps.length > cpProp.maxItems) errors.push('ringPatch.rings[' + i + '].controlPoints above maxItems ' + cpProp.maxItems);
                    }
                }
            });
        }

        if (value.featurePatch && typeof value.featurePatch === 'object') {
            const featureDefs = {
                integratedHeadshell: 'IntegratedHeadshellFeature',
                sideBentHeadshellMount: 'SideBentHeadshellMountFeature',
                titaniumMountPlate: 'TitaniumMountPlateFeature',
                cartridgeSlots: 'CartridgeSlotsFeature',
                wireDuct: 'WireDuctFeature',
                rearTerminal: 'RearTerminalFeature',
                counterweightStack: 'CounterweightStackFeature'
            };
            Object.keys(value.featurePatch).forEach(name => {
                if (!featureDefs[name]) {
                    errors.push('unknown featurePatch field: ' + name);
                    return;
                }
                validateSchemaBackedObject(errors, 'featurePatch.' + name, value.featurePatch[name], featureDefs[name]);
            });
        }

        if (value.analysisTargets && typeof value.analysisTargets === 'object') {
            Object.keys(value.analysisTargets).forEach(k => {
                if (!analysisProps[k]) errors.push('unknown analysisTargets field: ' + k);
                else pushNumberConstraint(errors, 'analysisTargets.' + k, value.analysisTargets[k], analysisProps[k]);
            });
        }
    }

    function buildFreeformPrompt(currentState, userIntentText) {
        const state = sanitizeState(currentState || getCurrentFreeformState());
        const contract = {
            schema: RESPONSE_SCHEMA,
            version: RESPONSE_VERSION,
            app: APP_VERSION,
            mode: MODE,
            name: 'short_name',
            designIntent: 'low_mass_high_stiffness_cobra_freeform',
            targets: {
                effectiveMassVerticalG: 12,
                effectiveMassHorizontalG: 13,
                lfResonanceHz: 10,
                firstBendingModeHzMin: 600,
                torsionModeHzMin: 800,
                counterweightBalanceResidualMaxGmm: 50
            },
            centerlinePatch: {},
            ringPatch: {},
            featurePatch: {},
            analysisTargets: {},
            analysisRequests: ['mass','COM','inertia','LF_resonance','EI_distribution','torsion_proxy','export_audit'],
            aiEstimates: {
                reasoningSummary: 'optional AI estimate only; app/kernel computes deterministicAnalysis truth'
            },
            analysisPolicy: {
                deterministicAuthority: 'app_kernel',
                aiRole: 'design_intent_targets_and_estimates_only',
                claimBoundary: 'AI estimates are not final physical analysis; app/kernel calculates deterministic proxy analysis'
            },
            assumptions: [],
            unsupportedAttributes: []
        };
        const prompt = {
            title: 'TD053 — AI Vibe 3D Freeform Physical Analysis Model',
            surface: 'AI Vibe 3D Freeform Loft',
            actions: ['Copy Freeform AI Prompt', 'Apply Freeform AI Response'],
            purpose: 'Create a free 3D tonearm form through bendable centerline + abstract station rings + separate feature objects + deterministic physical-analysis model. AI proposes form, targets and estimates; app/kernel calculates final mass/COM/inertia/effective mass/resonance/stiffness/audit. This complements Parametric Cobra / Classic; it does not replace it.',
            promptCoverage: [
                'all writable fields',
                'all min/max/enum constraints',
                'engineering targets',
                'mass/COM/COG context',
                'cartridge/headshell datum context',
                'counterweight context',
                'Onshape/export audit context',
                'complete JSON schema',
                'Markdown spec',
                'unsupportedAttributes policy'
            ],
            strictRules: [
                'Return strict JSON only.',
                'Use sparse patch only.',
                'Do not return full state passthrough.',
                'Do not emit STL, OBJ, BREP, mesh vertices, faces or triangles.',
                'no direct STL/OBJ/mesh triangles',
                'Do not move protected datums: stylus point, pivot point, LP plane, N1-P2/effective length, cartridge datum, headshell plane.',
                'no protected datum movement',
                'Do not write LT mechanism/P1/P2/P3/STATOR/L23 fields.',
                'no LT mechanism/P1/P2/P3/STATOR/L23 writes',
                'Do not use unknown fields.',
                'All numeric fields must respect supplied min/max.',
                'All enums must use supplied values.',
                'Unsupported geometry must be listed in unsupportedAttributes.',
                'AI may write targets, assumptions, analysisRequests and aiEstimates only as estimates.',
                'AI may write long designIntent, assumptions, unsupportedAttributes and aiEstimates.reasoningSummary. Do not shorten technical intent to fit arbitrary UI length.',
                'Text length is not used as physics or safety control; physical numeric min/max and contract constraints remain strict.',
                'AI must not write analysis.massG, analysis.COM, analysis.effectiveMassVerticalG, analysis.resonanceVerticalHz, analysis.status or any deterministicAnalysis result fields.',
                'The app/kernel is the only authority for final mass, COM/COG, inertia, effective mass, resonance, stiffness, balance and export/manifold audit.'
            ],
            currentCenterline: state.centerline,
            currentRings: state.rings,
            currentFeatures: state.features,
            writableFieldSpec: writableFieldSpec(),
            engineeringTargets: engineeringTargets(state),
            datumContext: {
                cartridgeDatum: 'read-only context; preserved by integrated headshell and cartridgeSlots feature',
                headshellPlane: 'read-only context; preserved by integrated headshell standard modes',
                counterweightContext: 'counterweightStack is a separate rear-terminal assembly; do not fake with ring/rear bend'
            },
            deterministicVsAiModel: {
                aiCreates: ['centerline','rings','features','designIntent','targets','analysisRequests','aiEstimates'],
                appKernelCalculates: ['mass','COM/COG','inertia','effectiveMassVerticalG','effectiveMassHorizontalG','LF resonance','EI/GJ distribution','balance','clearance','export/manifold audit'],
                boundary: 'AI estimates are advisory only and must never be treated as deterministic physical-analysis truth.'
            },
            exportAuditContext: {
                onshape: 'Onshape/export audit is downstream context only; AI response cannot claim Onshape verification.',
                meshPolicy: 'The app/kernel builds deterministic loft geometry from patches. External AI must not send mesh triangles.',
                physicalAnalysisPolicy: 'App/kernel computes deterministicAnalysis after applying AI sparse patches. AI may request analyses but may not supply final analysis results.'
            },
            jsonResponseContract: contract,
            completeJsonSchema: getRuntimeJsonSchema(),
            schemaEmbeddingSource: 'tonearm_designer_ai_freeform_loft.schema.json via js/freeform-schema.js',
            runtimeValidationSource: 'same embedded JSON schema object used by validateResponse()',
            markdownSpec: [
                '# Freeform grammar',
                '- centerlinePatch changes control points along s=0..1.',
                '- ringPatch changes abstract section/ring stations, including circle/ellipse/superellipse/rounded_rectangle/sharp_polygon/triangle/trapezoid/asymmetric_egg/flat_bottom_headshell/crescent/custom_bezier_loop/custom_polar_profile.',
                '- featurePatch changes separate mechanical/semantic features only.',
                '- analysisTargets/targets/analysisRequests may request mass/resonance/stiffness context, but do not override protected datums.\n- aiEstimates are advisory and separate from deterministicAnalysis; app/kernel calculates final physical values.'
            ].join('\n'),
            unsupportedAttributesPolicy: unsupportedPolicy(),
            userIntent: String(userIntentText || '').trim()
        };
        return JSON.stringify(prompt, null, 2);
    }

    function knownGoodResponse() {
        return {
            schema: RESPONSE_SCHEMA,
            version: RESPONSE_VERSION,
            app: APP_VERSION,
            mode: MODE,
            name: 'known_good_td053_freeform_patch',
            designIntent: 'low_mass_high_stiffness_cobra_freeform',
            targets: {
                effectiveMassVerticalG: 12,
                effectiveMassHorizontalG: 13,
                lfResonanceHz: 10,
                firstBendingModeHzMin: 600,
                torsionModeHzMin: 800,
                counterweightBalanceResidualMaxGmm: 50
            },
            analysisRequests: ['mass','COM','inertia','LF_resonance','EI_distribution','torsion_proxy','export_audit'],
            aiEstimates: {
                massG: 24,
                effectiveMassVerticalG: 12,
                reasoningSummary: 'AI estimate only; deterministicAnalysis is calculated by the app/kernel.',
                confidence: 0.42
            },
            analysisPolicy: {
                deterministicAuthority: 'app_kernel',
                aiRole: 'design_intent_targets_and_estimates_only',
                claimBoundary: 'AI estimates are not final physical analysis; app/kernel calculates deterministic proxy analysis'
            },
            assumptions: ['local proxy material assumptions may be refined by app/kernel analysis'],
            centerlinePatch: {
                points: [
                    { id: 'headshell_interface', s: 0.14, x: 34, y: -2, z: 2.5 },
                    { id: 'mid_armwand', s: 0.50, x: 125, y: 0, z: 5.8 },
                    { id: 'rear_terminal', s: 0.90, x: 220, y: 0, z: 1.4 }
                ]
            },
            ringPatch: {
                rings: [
                    { id: 'ring_front_triangle_transition', s: 0.14, shapeFamily: 'triangle', widthMm: 17, heightMm: 6.4, wallThicknessMm: 1.25 },
                    { id: 'ring_mid_superellipse', s: 0.45, shapeFamily: 'superellipse', widthMm: 13, heightMm: 7, wallThicknessMm: 1.25, superellipseExponent: 2.8 },
                    { id: 'ring_rear_crescent', s: 0.78, shapeFamily: 'crescent', widthMm: 13.4, heightMm: 7, wallThicknessMm: 1.35, crescentCutDepth: 0.28 }
                ]
            },
            featurePatch: {
                titaniumMountPlate: { enabled: true, type: 'structural_laminated_interface_plate', looseUndersidePlate: false, xMm: 32, zMm: 3.83 },
                cartridgeSlots: { enabled: true, separateFeature: true, slotCount: 2 },
                counterweightStack: { enabled: true, separateFeature: true, discCount: 4, discDiameterMm: 24 }
            },
            analysisTargets: {
                targetBodyMassG: 18,
                targetVerticalResonanceHz: 10,
                targetFirstBendingModeHz: 120
            },
            unsupportedAttributes: []
        };
    }

    function validateResponse(value) {
        const errors = [];
        const warnings = [];
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false, errors: ['response must be an object'], warnings: [] };
        }
        const allowedTop = ['schema','version','app','mode','name','designIntent','targets','centerlinePatch','ringPatch','featurePatch','analysisTargets','analysisRequests','aiEstimates','analysisPolicy','assumptions','unsupportedAttributes'];
        Object.keys(value).forEach(k => {
            if (allowedTop.indexOf(k) === -1) errors.push('unknown top-level field: ' + k);
            if (/mesh|triangles|vertices|faces|stl|obj/i.test(k)) errors.push('direct mesh/STL/OBJ field is forbidden: ' + k);
        });
        if (value.schema !== RESPONSE_SCHEMA) errors.push('schema must be ' + RESPONSE_SCHEMA);
        if (value.version !== RESPONSE_VERSION) errors.push('version must be ' + RESPONSE_VERSION);
        if (value.mode !== MODE) errors.push('mode must be ' + MODE);
        if (typeof value.name !== 'string' || !value.name || value.name.length > 80) errors.push('name must be a short string');
        if (!Array.isArray(value.unsupportedAttributes)) errors.push('unsupportedAttributes must be an array');
        const cApi = getCenterlineAPI();
        const rApi = getRingsAPI();
        const fApi = getFeaturesAPI();
        if (!cApi || !rApi || !fApi) errors.push('freeform module dependencies are not loaded');
        validateRuntimeSchemaEnvelope(value, errors);
        if (value.centerlinePatch && typeof value.centerlinePatch === 'object') {
            const cp = value.centerlinePatch;
            Object.keys(cp).forEach(k => {
                if (['curveType','points'].indexOf(k) === -1) errors.push('unknown centerlinePatch field: ' + k);
            });
            if (cp.curveType !== undefined && cp.curveType !== 'catmull_rom') errors.push('centerlinePatch.curveType must be catmull_rom');
            (Array.isArray(cp.points) ? cp.points : []).forEach((p, i) => {
                if (!p || typeof p !== 'object') errors.push('centerlinePatch.points[' + i + '] must be object');
                const id = p && p.id;
                if (id && cApi && cApi.isProtectedPointId && cApi.isProtectedPointId(id) &&
                    (p.x !== undefined || p.y !== undefined || p.z !== undefined || p.s !== undefined)) {
                    errors.push('protected datum movement rejected: ' + id);
                }
                Object.keys(p || {}).forEach(k => {
                    if (['id','s','x','y','z'].indexOf(k) === -1) errors.push('unknown centerline point field: ' + k);
                });
            });
        }
        if (value.ringPatch && typeof value.ringPatch === 'object') {
            const rp = value.ringPatch;
            Object.keys(rp).forEach(k => {
                if (['rings','removeRingIds'].indexOf(k) === -1) errors.push('unknown ringPatch field: ' + k);
            });
            (Array.isArray(rp.rings) ? rp.rings : []).forEach((r, i) => {
                Object.keys(r || {}).forEach(k => {
                    if (['id','s','shapeFamily','widthMm','heightMm','wallThicknessMm','rotationDeg','tiltDeg','cornerSharpness','superellipseExponent','asymmetryY','asymmetryZ','topRidgeHeightMm','bottomFlatness','crescentCutDepth','controlPoints'].indexOf(k) === -1) errors.push('unknown ring field: ' + k);
                });
                if (r && r.shapeFamily && rApi && rApi.shapeFamilies.indexOf(r.shapeFamily) === -1) errors.push('unknown ring shapeFamily: ' + r.shapeFamily);
            });
        }
        const featureValidation = fApi && fApi.validateFeatureSeparation ? fApi.validateFeatureSeparation(value.featurePatch || {}) : { ok: true, errors: [] };
        if (featureValidation && !featureValidation.ok) errors.push.apply(errors, featureValidation.errors);
        return { ok: errors.length === 0, errors, warnings };
    }

    function normalizeVec(v) {
        const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) || 1;
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    function cross(a, b) {
        return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x };
    }

    function frameForTangent(tangent) {
        const t = normalizeVec(tangent || { x: 1, y: 0, z: 0 });
        const worldZ = { x: 0, y: 0, z: 1 };
        let nY = cross(worldZ, t);
        if (Math.sqrt(nY.x*nY.x + nY.y*nY.y + nY.z*nY.z) < 1e-6) nY = { x: 0, y: 1, z: 0 };
        nY = normalizeVec(nY);
        const nZ = normalizeVec(cross(t, nY));
        return { tangent: t, normalY: nY, normalZ: nZ };
    }

    function addVec(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    }

    function scaleVec(v, s) {
        return { x: v.x * s, y: v.y * s, z: v.z * s };
    }

    function makeVertex(center, frame, ringPoint) {
        const p = addVec(addVec(center, scaleVec(frame.normalY, ringPoint.y)), scaleVec(frame.normalZ, ringPoint.z));
        return { x: round(p.x, 6), y: round(p.y, 6), z: round(p.z, 6) };
    }

    function buildLoftMesh(freeformState, options) {
        const state = sanitizeState(freeformState || getCurrentFreeformState());
        const cApi = getCenterlineAPI();
        const rApi = getRingsAPI();
        const stationCount = Math.max(4, Math.min(64, Math.round(finite(options && options.stationCount, Math.max(12, state.rings.length * 3)))));
        const segmentCount = Math.max(8, Math.min(128, Math.round(finite(options && options.segmentCount, 32))));
        const stations = [];
        const vertices = [];
        const faces = [];

        for (let i = 0; i < stationCount; i++) {
            const s = i / (stationCount - 1);
            const evalResult = cApi.evaluate(state.centerline, s);
            const ring = rApi.interpolateRing(state.rings, s);
            const pts = rApi.generateRingPoints(ring, segmentCount);
            const frame = frameForTangent(evalResult.tangent);
            const startIndex = vertices.length;
            pts.forEach(rp => vertices.push(makeVertex(evalResult.point, frame, rp)));
            stations.push({
                s: round(s, 6),
                center: evalResult.point,
                tangent: evalResult.tangent,
                frame,
                ring,
                startIndex,
                segmentCount
            });
        }

        for (let i = 0; i < stationCount - 1; i++) {
            const a = stations[i].startIndex;
            const b = stations[i + 1].startIndex;
            for (let j = 0; j < segmentCount; j++) {
                const j2 = (j + 1) % segmentCount;
                faces.push([a + j, b + j, b + j2]);
                faces.push([a + j, b + j2, a + j2]);
            }
        }

        const startCenterIndex = vertices.length;
        const firstCenter = stations[0].center;
        vertices.push({ x: firstCenter.x, y: firstCenter.y, z: firstCenter.z });
        for (let j = 0; j < segmentCount; j++) {
            const j2 = (j + 1) % segmentCount;
            faces.push([startCenterIndex, stations[0].startIndex + j2, stations[0].startIndex + j]);
        }

        const endCenterIndex = vertices.length;
        const last = stations[stations.length - 1];
        const lastCenter = last.center;
        vertices.push({ x: lastCenter.x, y: lastCenter.y, z: lastCenter.z });
        for (let j = 0; j < segmentCount; j++) {
            const j2 = (j + 1) % segmentCount;
            faces.push([endCenterIndex, last.startIndex + j, last.startIndex + j2]);
        }

        const mesh = {
            schema: 'tonearm-designer-freeform-loft-mesh-v1',
            generator: 'TD052 deterministic centerline/ring loft kernel',
            units: 'mm',
            vertices,
            faces,
            triangles: faces,
            stations,
            metadata: {
                mode: MODE,
                closed: true,
                deterministic: true,
                stationCount,
                segmentCount,
                featureSummary: {
                    integratedHeadshell: !!state.features.integratedHeadshell.enabled,
                    sideBentHeadshellMount: !!state.features.sideBentHeadshellMount.enabled,
                    titaniumMountPlate: !!state.features.titaniumMountPlate.enabled,
                    cartridgeSlots: !!state.features.cartridgeSlots.enabled,
                    counterweightStack: !!state.features.counterweightStack.enabled
                }
            }
        };
        mesh.validation = validateClosedMesh(mesh);
        return { state, mesh };
    }

    function validateClosedMesh(mesh) {
        const edgeCounts = {};
        (mesh.faces || []).forEach(face => {
            for (let i = 0; i < 3; i++) {
                const a = face[i];
                const b = face[(i + 1) % 3];
                const key = a < b ? a + ':' + b : b + ':' + a;
                edgeCounts[key] = (edgeCounts[key] || 0) + 1;
            }
        });
        const boundary = Object.keys(edgeCounts).filter(k => edgeCounts[k] !== 2);
        return {
            status: boundary.length === 0 ? 'PASS' : 'FAIL',
            closed: boundary.length === 0,
            boundaryEdgeCount: boundary.length,
            vertexCount: mesh.vertices ? mesh.vertices.length : 0,
            faceCount: mesh.faces ? mesh.faces.length : 0
        };
    }


    function boundsFromVertices(vertices) {
        const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
        (vertices || []).forEach(v => {
            const x = finite(v.x, 0), y = finite(v.y, 0), z = finite(v.z, 0);
            b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
            b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
            b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z);
        });
        if (!Number.isFinite(b.minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, length: 0, width: 0, height: 0 };
        b.length = b.maxX - b.minX;
        b.width = b.maxY - b.minY;
        b.height = b.maxZ - b.minZ;
        return b;
    }

    function buildFreeformGeometry(freeformState, options) {
        const geometryObject = createIntermediateGeometryObject(freeformState || getCurrentFreeformState(), options || {});
        const warnings = [];
        const bbox = boundsFromVertices(geometryObject.mesh && geometryObject.mesh.vertices);
        geometryObject.geometryMode = 'freeform';
        geometryObject.mesh.geometryMode = 'freeform';
        geometryObject.bbox = bbox;
        geometryObject.features = geometryObject.state ? geometryObject.state.features : {};
        geometryObject.warnings = warnings;
        geometryObject.source = 'state.freeformLoft';
        geometryObject.analysisInput = {
            geometryMode: 'freeform',
            mesh: geometryObject.mesh,
            vertices: geometryObject.mesh.vertices,
            faces: geometryObject.mesh.faces,
            bbox,
            features: geometryObject.features,
            warnings
        };
        return geometryObject;
    }

    function createIntermediateGeometryObject(freeformState, options) {
        const built = buildLoftMesh(freeformState, options);
        const state = built.state;
        const mesh = built.mesh;
        mesh.closed = !!(mesh.validation && mesh.validation.closed);
        return {
            schema: 'tonearm-designer-freeform-loft-geometry-object-v1',
            mode: MODE,
            geometryMode: 'freeform',
            units: 'mm',
            status: mesh.closed ? 'PASS_WITH_SCOPE' : 'PARTIAL_PASS',
            state,
            mesh,
            requiredAnalysisFields: {
                massVolumeComCog: true,
                inertiaTensor: true,
                resonanceProxy: true,
                printabilityExportAudit: true
            },
            analysisInput: {
                vertices: mesh.vertices,
                faces: mesh.faces,
                closed: mesh.closed,
                units: mesh.units,
                wallThicknessByStation: state.rings.map(r => ({ s: r.s, wallThicknessMm: r.wallThicknessMm })),
                features: state.features,
                protectedDatums: state.centerline.protectedDatums
            }
        };
    }

    function copyText(text) {
        if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
            return root.navigator.clipboard.writeText(text).then(() => true).catch(() => false);
        }
        return Promise.resolve(false);
    }

    function installUI() {
        const copyBtn = root.document && root.document.getElementById('aiCopyFreeformPromptBtn');
        const applyBtn = root.document && root.document.getElementById('aiApplyFreeformResponseBtn');
        const presetEl = root.document && root.document.getElementById('aiFreeformPreset');
        const statusEl = root.document && root.document.getElementById('aiFreeformStatus');
        const promptEl = root.document && root.document.getElementById('aiPromptText');
        const responseEl = root.document && root.document.getElementById('aiResponseText');
        function setStatus(text) {
            if (statusEl) statusEl.textContent = text;
        }
        if (presetEl) {
            presetEl.addEventListener('change', function() {
                const state = applyPreset(presetEl.value);
                setStatus('Freeform preset applied locally: ' + state.preset + '. Rebuild/copy prompt before external AI use.');
                if (typeof root.rebuild === 'function') root.rebuild();
            });
        }
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                const text = buildFreeformPrompt(getCurrentFreeformState(), (root.document.getElementById('aiUserIntent') || {}).value || '');
                if (promptEl) promptEl.value = text;
                copyText(text).then(ok => {
                    setStatus(ok ? 'Copy Freeform AI Prompt: copied prompt text.' : 'Copy Freeform AI Prompt: prompt placed in Prompt textarea; clipboard unavailable.');
                });
            });
        }
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                try {
                    const parsed = JSON.parse(responseEl && responseEl.value ? responseEl.value : '{}');
                    const result = applyResponse(getCurrentFreeformState(), parsed);
                    if (!result.ok) {
                        setStatus('Apply Freeform AI Response: rejected — ' + result.errors.join('; '));
                        return;
                    }
                    const geometry = createIntermediateGeometryObject(result.state, { stationCount: 18, segmentCount: 32 });
                    root.LAST_FREEFORM_LOFT_GEOMETRY = geometry;
                    if (typeof root.rebuild === 'function') root.rebuild();
                    setStatus('Apply Freeform AI Response: local freeform state updated; deterministic loft geometry object has ' + geometry.mesh.vertices.length + ' vertices and ' + geometry.mesh.faces.length + ' triangles.');
                } catch (err) {
                    setStatus('Apply Freeform AI Response: JSON parse failed — ' + (err && err.message ? err.message : String(err)));
                }
            });
        }
    }

    root.FreeformLoftKernel = Object.freeze({
        schema: RESPONSE_SCHEMA,
        version: RESPONSE_VERSION,
        mode: MODE,
        appVersion: APP_VERSION,
        preset,
        defaultState,
        sanitizeState,
        getCurrentFreeformState,
        applyPreset,
        applyResponse,
        validateResponse,
        validateResponseAgainstEmbeddedJsonSchema,
        getRuntimeJsonSchema,
        writableFieldSpec,
        engineeringTargets,
        unsupportedPolicy,
        buildFreeformPrompt,
        knownGoodResponse,
        buildLoftMesh,
        buildFreeformGeometry,
        validateClosedMesh,
        createIntermediateGeometryObject
    });

    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', installUI);
        else installUI();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
