/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-manual-verification.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-manual-verification.js
 * Phase 10/11 manual verification and release-readiness harness for the Cobra architecture.
 *
 * This module deliberately does not claim browser or visual verification.
 * It builds deterministic verification packages for Jan-Eric and keeps
 * automatic checks, runtime measured checks, manual visual checks and release
 * readiness as separate states.
 */
(function(root) {
    'use strict';

    const SCHEMA = 'tonearm-designer-cobra-manual-verification-v1';
    const RELEASE_SCHEMA = 'tonearm-designer-cobra-release-readiness-v1';
    const TARGET_N1P2_MM = 237.05;

    const DEFAULT_RELEASE_POLICY = Object.freeze({
        runtimeMeasuredFailBlocksRelease: true,
        runtimeMeasuredIndeterminateBlocksRelease: true,
        manualVisualRequired: true,
        visualEvidenceRequired: true
    });

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

    const FORBIDDEN_LEGACY_PROXY_FIELDS = Object.freeze([]);

    const CHECKLIST = Object.freeze([
        Object.freeze({
            id: 'n1p2_lock',
            label: 'N1-P2 is 237.05 mm',
            type: 'automatic',
            required: true
        }),
        Object.freeze({
            id: 'not_tube_form',
            label: 'Armwand is not a cylindrical tube / constant section',
            type: 'manual_visual',
            required: true
        }),
        Object.freeze({
            id: 'td026_full_rear_terminal',
            label: 'TD026-style full ring svanhals/rear terminal is visually present',
            type: 'manual_visual',
            required: true
        }),
        Object.freeze({
            id: 'disc_counterweight_visible',
            label: 'Configurable disc counterweight is visible',
            type: 'manual_visual',
            required: true
        }),
        Object.freeze({
            id: 'no_oval_capsule_addon',
            label: 'Disc stack is not replaced by oval/capsule add-on',
            type: 'manual_visual',
            required: true
        }),
        Object.freeze({
            id: 'counterweight_com_z',
            label: 'Counterweight COM is on or below Z0',
            type: 'automatic',
            required: true
        }),
        Object.freeze({
            id: 'cobra_acceptance',
            label: 'Cobra acceptance does not fail by missing capabilities',
            type: 'automatic',
            required: true
        }),
        Object.freeze({
            id: 'manual_browser_required',
            label: 'Jan-Eric manual browser/visual verification required',
            type: 'manual_visual',
            required: true
        })
    ]);

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function hasOwn(obj, key) {
        return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
    }

    function readInput(source, id, fallback) {
        if (hasOwn(source, id)) return source[id];
        if (source && source.inputs && hasOwn(source.inputs, id)) return source.inputs[id];
        return fallback;
    }

    function n1p2(source) {
        const apex = finite(readInput(source || {}, 'apex', 237), 237);
        const cartX = finite(readInput(source || {}, 'cartX', -0.05), -0.05);
        return apex - cartX;
    }

    function getByPath(source, path, fallback) {
        if (!isObject(source)) return fallback;
        const parts = path.split('.');
        let cur = source;
        for (let i = 0; i < parts.length; i += 1) {
            if (!isObject(cur) && i < parts.length - 1) return fallback;
            if (!hasOwn(cur, parts[i])) return fallback;
            cur = cur[parts[i]];
        }
        return cur === undefined ? fallback : cur;
    }

    function valueAsString(value) {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    }

    function captureLegacyProxyValues(state) {
        const snapshot = {};
        FORBIDDEN_LEGACY_PROXY_FIELDS.forEach(function(id) {
            if (hasOwn(state, id)) snapshot[id] = clone(state[id]);
            else snapshot[id] = undefined;
        });
        return snapshot;
    }

    function legacyProxyMutation(state, before) {
        const mutated = [];
        FORBIDDEN_LEGACY_PROXY_FIELDS.forEach(function(id) {
            const hadBefore = before && before[id] !== undefined;
            const hasAfter = hasOwn(state, id);
            if (!hadBefore && !hasAfter) return;
            const beforeJson = JSON.stringify(hadBefore ? before[id] : undefined);
            const afterJson = JSON.stringify(hasAfter ? state[id] : undefined);
            if (beforeJson !== afterJson) mutated.push(id);
        });
        return mutated;
    }

    function safeCall(label, fn, fallback, errors) {
        try {
            return fn();
        } catch (err) {
            if (errors) {
                errors.push(label + ' failed: ' + (err && err.message ? err.message : String(err)));
            }
            return fallback;
        }
    }

    function getChecklist() {
        return CHECKLIST.map(clone);
    }

    function requiredManualVisualIds() {
        return CHECKLIST
            .filter(function(item) { return item.type === 'manual_visual' && item.required; })
            .map(function(item) { return item.id; });
    }

    function normalizeVisualEvidence(evidence) {
        const src = isObject(evidence) ? evidence : {};
        const screenshotRefs = Array.isArray(src.screenshotRefs)
            ? src.screenshotRefs.filter(function(ref) { return valueAsString(ref).trim().length > 0; })
            : [];
        const checks = isObject(src.checks) ? clone(src.checks) : {};
        const browserRunId = valueAsString(src.browserRunId).trim();
        const reportRef = valueAsString(src.reportRef).trim();
        const operator = valueAsString(src.operator).trim();
        const missingFields = [];

        if (!browserRunId) missingFields.push('browserRunId');
        if (!screenshotRefs.length) missingFields.push('screenshotRefs');
        if (!reportRef) missingFields.push('reportRef');
        if (!operator) missingFields.push('operator');

        return {
            supplied: !!(browserRunId || screenshotRefs.length || reportRef || operator || Object.keys(checks).length),
            complete: missingFields.length === 0,
            missingFields,
            browserRunId,
            screenshotRefs,
            reportRef,
            operator,
            notes: valueAsString(src.notes).trim(),
            checks
        };
    }

    function visualEvidenceFromResult(result, options) {
        const opts = options || {};
        if (isObject(opts.visualEvidence)) return normalizeVisualEvidence(opts.visualEvidence);
        if (result && isObject(result.visualEvidence)) return normalizeVisualEvidence(result.visualEvidence);
        return normalizeVisualEvidence(null);
    }

    function buildVerificationState() {
        if (!root.CobraAcceptance || typeof root.CobraAcceptance.buildAcceptanceState !== 'function') {
            const state = {};
            state.apex = 237;
            state.cartX = -0.05;
            state.rearMode = 'cobra_integrated_tail';
            state.cobraArchitecture = {
                enabled: true,
                specRegime: 'custom_237_05',
                n1p2Mm: TARGET_N1P2_MM
            };
            return state;
        }
        return root.CobraAcceptance.buildAcceptanceState();
    }

    function applyVerificationPreset(targetState, options) {
        const opts = options || {};
        const target = isObject(targetState) ? targetState : {};
        if (!root.CobraAcceptance || typeof root.CobraAcceptance.applyCanonicalPresetToRuntime !== 'function') {
            return {
                status: 'FAIL',
                applied: false,
                n1p2Mm: n1p2(target),
                legacyProxyMutation: false,
                warnings: [],
                errors: ['CobraAcceptance.applyCanonicalPresetToRuntime is not available']
            };
        }
        return root.CobraAcceptance.applyCanonicalPresetToRuntime(target, {
            update: opts.update === true,
            syncDom: opts.syncDom === true,
            dispatchEvents: opts.dispatchEvents === true
        });
    }

    function moduleResultsFor(state, errors) {
        const results = {};

        results.cobraControls = safeCall('CobraControls.validateControlState', function() {
            if (!root.CobraControls || typeof root.CobraControls.validateControlState !== 'function') return { status: 'missing' };
            return root.CobraControls.validateControlState(state.cobraArchitecture || state);
        }, { status: 'missing' }, errors);

        results.cobraDiscCounterweightAssembly = safeCall('CobraDiscCounterweightAssembly validation', function() {
            const api = root.CobraDiscCounterweightAssembly;
            if (!api) return { status: 'missing' };
            if (typeof api.validateCounterweight === 'function') return api.validateCounterweight(state);
            if (typeof api.validateAssembly === 'function') return api.validateAssembly(state);
            if (typeof api.getMassComponent === 'function') {
                const comp = api.getMassComponent(state);
                const z = Number(getByPath(comp, 'com.z', null));
                const mass = Number(comp && (comp.massG !== undefined ? comp.massG : comp.mass));
                const errs = [];
                if (!comp) errs.push('rear weight disc stack component missing');
                if (!Number.isFinite(mass) || mass <= 0) errs.push('cobra disc counterweight mass must be positive');
                if (!Number.isFinite(z) || z > 0) errs.push('cobra disc counterweight COM Z must be on or below Z0');
                return {
                    status: errs.length ? 'FAIL' : 'PASS',
                    errors: errs,
                    measured: {
                        massG: mass,
                        counterweightCOMZMm: z,
                        counterweightCOMSource: 'rearWeightDiscStack'
                    }
                };
            }
            return { status: 'missing' };
        }, { status: 'missing' }, errors);

        results.stationBasedEggshellWand = safeCall('CobraEggshellWand.validateStations', function() {
            if (!root.CobraEggshellWand || typeof root.CobraEggshellWand.buildStations !== 'function') return { status: 'missing' };
            const stations = root.CobraEggshellWand.buildStations(state);
            return root.CobraEggshellWand.validateStations(stations);
        }, { status: 'missing' }, errors);

        results.cobraMechanicalAssembly = safeCall('CobraMechanicalAssembly.validateAssembly', function() {
            if (!root.CobraMechanicalAssembly || typeof root.CobraMechanicalAssembly.validateAssembly !== 'function') return { status: 'missing' };
            return root.CobraMechanicalAssembly.validateAssembly(state);
        }, { status: 'missing' }, errors);

        results.headshellSlots = safeCall('HeadshellSlots.validateSpec', function() {
            if (!root.HeadshellSlots || typeof root.HeadshellSlots.validateSpec !== 'function') return { status: 'missing' };
            return root.HeadshellSlots.validateSpec(state);
        }, { status: 'missing' }, errors);

        return results;
    }

    function resultStatusIsPass(value) {
        return value && value.status === 'PASS';
    }

    function extractCounterweightZ(result) {
        const candidates = [
            getByPath(result, 'measured.counterweightCOMZMm', null),
            getByPath(result, 'measured.counterweightCOMZ', null),
            getByPath(result, 'measured.counterweightCOM.z', null)
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const n = Number(candidates[i]);
            if (Number.isFinite(n)) return n;
        }
        return null;
    }

    function evaluateManualChecks(checklist, manualResults, visualEvidence) {
        const evidence = visualEvidence || normalizeVisualEvidence(null);
        const supplied = isObject(manualResults) ? manualResults : evidence.checks;
        return checklist
            .filter(function(item) { return item.type === 'manual_visual'; })
            .map(function(item) {
                const passed = supplied[item.id] === true;
                return Object.assign({}, item, {
                    status: passed ? 'PASS' : 'REQUIRED'
                });
            });
    }

    function runVerificationPackage(options) {
        const opts = options || {};
        const checklist = getChecklist();
        const errors = [];
        const warnings = [];
        const state = isObject(opts.targetState) ? clone(opts.targetState) : buildVerificationState();
        const before = captureLegacyProxyValues(state);
        const visualEvidence = normalizeVisualEvidence(opts.visualEvidence);
        let presetResult = null;

        if (opts.applyPreset !== false) {
            presetResult = applyVerificationPreset(state, {
                update: opts.update === true,
                syncDom: opts.syncDom === true,
                dispatchEvents: opts.dispatchEvents === true
            });
            if (presetResult.errors && presetResult.errors.length) {
                presetResult.errors.forEach(function(e) { errors.push(e); });
            }
            if (presetResult.warnings && presetResult.warnings.length) {
                presetResult.warnings.forEach(function(w) { warnings.push(w); });
            }
        }

        const proxyMutations = legacyProxyMutation(state, before);
        if (proxyMutations.length) {
            errors.push('Legacy proxy mutation detected: ' + proxyMutations.join(', '));
        }

        const knownGoodAcceptance = safeCall('CobraAcceptance.runRuntimeAcceptance known_good', function() {
            if (!root.CobraAcceptance || typeof root.CobraAcceptance.runRuntimeAcceptance !== 'function') {
                return { status: 'FAIL', errors: ['CobraAcceptance unavailable'], missingCapabilities: [] };
            }
            return root.CobraAcceptance.runRuntimeAcceptance({ mode: 'known_good', state: clone(state) });
        }, { status: 'FAIL', errors: ['CobraAcceptance unavailable'], missingCapabilities: [] }, errors);

        const runtimeMeasuredAcceptance = safeCall('CobraAcceptance.runRuntimeAcceptance runtime_measured', function() {
            if (!root.CobraAcceptance || typeof root.CobraAcceptance.runRuntimeAcceptance !== 'function') {
                return { status: 'INDETERMINATE', errors: ['CobraAcceptance unavailable'], missingCapabilities: [] };
            }
            return root.CobraAcceptance.runRuntimeAcceptance({ mode: 'runtime_measured', state: clone(state) });
        }, { status: 'INDETERMINATE', errors: ['CobraAcceptance unavailable'], missingCapabilities: [] }, errors);

        const moduleResults = moduleResultsFor(state, errors);
        const measuredN1P2 = n1p2(state);
        const counterweightZ = extractCounterweightZ(knownGoodAcceptance);
        const capabilityComplete = knownGoodAcceptance.capabilityComplete === true;
        const missingCapabilities = Array.isArray(knownGoodAcceptance.missingCapabilities)
            ? knownGoodAcceptance.missingCapabilities.slice()
            : [];

        const automaticChecks = [];
        automaticChecks.push({
            id: 'n1p2_lock',
            label: 'N1-P2 is 237.05 mm',
            status: Math.abs(measuredN1P2 - TARGET_N1P2_MM) <= 0.01 ? 'PASS' : 'FAIL',
            measured: measuredN1P2
        });
        automaticChecks.push({
            id: 'counterweight_com_z',
            label: 'Counterweight COM is on or below Z0',
            status: Number.isFinite(counterweightZ) && counterweightZ <= 0 ? 'PASS' : 'FAIL',
            measured: counterweightZ
        });
        automaticChecks.push({
            id: 'cobra_acceptance',
            label: 'Cobra acceptance does not fail by missing capabilities',
            status: capabilityComplete && missingCapabilities.length === 0 && knownGoodAcceptance.status === 'PASS' ? 'PASS' : 'FAIL',
            measured: knownGoodAcceptance.status
        });
        automaticChecks.push({
            id: 'legacy_proxy_mutation',
            label: 'Canonical verification preset does not mutate legacy Cobra proxy sliders',
            status: proxyMutations.length === 0 ? 'PASS' : 'FAIL',
            measured: proxyMutations.length ? proxyMutations.join(', ') : false
        });

        Object.keys(moduleResults).forEach(function(key) {
            const res = moduleResults[key];
            automaticChecks.push({
                id: key,
                label: key + ' validation',
                status: resultStatusIsPass(res) ? 'PASS' : 'FAIL',
                measured: res && res.status ? res.status : 'missing'
            });
        });

        if (opts.runtimeMeasuredFailBlocksAutomatic === true && runtimeMeasuredAcceptance.status === 'FAIL') {
            automaticChecks.push({
                id: 'runtime_measured_acceptance',
                label: 'Runtime measured acceptance must not fail',
                status: 'FAIL',
                measured: runtimeMeasuredAcceptance.status
            });
        }

        automaticChecks.forEach(function(check) {
            if (check.status === 'FAIL') errors.push(check.id + ' failed');
        });

        if (runtimeMeasuredAcceptance.status === 'INDETERMINATE') {
            warnings.push('Runtime measured acceptance is indeterminate until browser/UI runtime physics and export paths are available.');
        } else if (runtimeMeasuredAcceptance.status === 'FAIL') {
            warnings.push('Runtime measured acceptance returned FAIL; inspect runtime metrics before release.');
        }

        const automaticStatus = automaticChecks.some(function(check) { return check.status === 'FAIL'; })
            ? 'FAIL'
            : 'PASS';

        const manualChecks = evaluateManualChecks(checklist, opts.manualResults, visualEvidence);
        const requiredManual = manualChecks.filter(function(check) { return check.required; });
        const allRequiredManualPassed = requiredManual.length > 0 && requiredManual.every(function(check) { return check.status === 'PASS'; });

        let status;
        if (automaticStatus === 'FAIL') {
            status = 'FAIL';
        } else if (allRequiredManualPassed) {
            status = 'PASS';
        } else {
            status = 'HOLD';
        }

        return {
            schema: SCHEMA,
            status,
            automaticStatus,
            manualVisualStatus: allRequiredManualPassed ? 'PASS' : 'REQUIRED',
            runtimeMeasuredStatus: runtimeMeasuredAcceptance.status || 'INDETERMINATE',
            knownGoodStatus: knownGoodAcceptance.status || 'FAIL',
            capabilityComplete,
            missingCapabilities,
            visualEvidence,
            visualEvidenceSupplied: visualEvidence.complete,
            knownGoodAcceptance,
            runtimeMeasuredAcceptance,
            moduleResults,
            checklist,
            automaticChecks,
            manualChecks,
            errors,
            warnings,
            measured: {
                n1p2Mm: measuredN1P2,
                counterweightCOMZMm: counterweightZ,
                legacyProxyMutation: proxyMutations.length > 0,
                legacyProxyMutatedFields: proxyMutations
            }
        };
    }

    function evaluateReleaseReadiness(resultOrOptions, options) {
        const opts = options || {};
        const result = resultOrOptions && resultOrOptions.schema === SCHEMA
            ? resultOrOptions
            : runVerificationPackage(resultOrOptions || {});
        const policy = Object.assign({}, DEFAULT_RELEASE_POLICY, opts || {});
        if (opts.allowRuntimeMeasuredIndeterminateForStaticReview === true) {
            policy.runtimeMeasuredIndeterminateBlocksRelease = false;
        }

        const reasons = [];
        const requiredEvidence = [];
        const evidence = visualEvidenceFromResult(result, opts);
        const knownGoodStatus = result.knownGoodStatus || getByPath(result, 'knownGoodAcceptance.status', 'FAIL');
        const runtimeMeasuredStatus = result.runtimeMeasuredStatus || getByPath(result, 'runtimeMeasuredAcceptance.status', 'INDETERMINATE');
        const automaticStatus = result.automaticStatus || 'FAIL';
        const manualVisualStatus = result.manualVisualStatus || 'REQUIRED';
        const capabilityComplete = result.capabilityComplete === true;

        let hardFail = false;
        let hold = false;

        if (automaticStatus === 'FAIL') {
            hardFail = true;
            reasons.push('automatic status failed');
        }

        if (knownGoodStatus !== 'PASS') {
            hardFail = true;
            reasons.push('known-good acceptance did not pass');
        }

        if (!capabilityComplete) {
            hardFail = true;
            reasons.push('Cobra capability set is incomplete');
        }

        if (runtimeMeasuredStatus === 'FAIL') {
            if (policy.runtimeMeasuredFailBlocksRelease !== false) {
                hardFail = true;
                reasons.push('runtime measured acceptance failed');
            } else {
                hold = true;
                reasons.push('runtime measured acceptance failed and requires release decision');
            }
        } else if (runtimeMeasuredStatus === 'INDETERMINATE') {
            if (policy.runtimeMeasuredIndeterminateBlocksRelease !== false) {
                hold = true;
                reasons.push('runtime measured acceptance indeterminate');
            }
        }

        if (policy.manualVisualRequired !== false && manualVisualStatus !== 'PASS') {
            hold = true;
            reasons.push('manual visual verification required');
            requiredEvidence.push('manual visual checks by Jan-Eric');
        }

        if (policy.visualEvidenceRequired !== false && !evidence.complete) {
            hold = true;
            reasons.push('visual evidence required');
            requiredEvidence.push('visual evidence metadata: browserRunId, screenshotRefs, reportRef, operator');
            if (evidence.missingFields.length) {
                reasons.push('visual evidence missing fields: ' + evidence.missingFields.join(', '));
            }
        }

        const status = hardFail ? 'FAIL' : (hold ? 'HOLD' : 'RELEASE_READY');

        return {
            schema: RELEASE_SCHEMA,
            status,
            reasons,
            requiredEvidence,
            evidenceSummary: {
                visualEvidenceSupplied: evidence.complete,
                browserRunId: evidence.browserRunId || '—',
                screenshotRefs: evidence.screenshotRefs.slice(),
                reportRef: evidence.reportRef || '—',
                operator: evidence.operator || '—',
                missingFields: evidence.missingFields.slice(),
                notes: evidence.notes || ''
            },
            automaticStatus,
            manualVisualStatus,
            runtimeMeasuredStatus,
            knownGoodStatus,
            capabilityComplete
        };
    }

    function toReportBlock(resultOrOptions) {
        const result = resultOrOptions && resultOrOptions.schema === SCHEMA
            ? resultOrOptions
            : runVerificationPackage(resultOrOptions || {});
        const manualRequiredText = 'manual required';

        return {
            title: 'Cobra Manual Visual Verification',
            rows: [
                ['Manual verification package', 'loaded'],
                ['Verification status', result.status],
                ['Automatic status', result.automaticStatus],
                ['Manual visual status', result.manualVisualStatus],
                ['N1-P2 measured', Number.isFinite(result.measured && result.measured.n1p2Mm) ? result.measured.n1p2Mm.toFixed(2) + ' mm' : '—'],
                ['Counterweight COM Z', Number.isFinite(result.measured && result.measured.counterweightCOMZMm) ? result.measured.counterweightCOMZMm.toFixed(3) + ' mm' : '—'],
                ['Legacy proxy mutation', result.measured && result.measured.legacyProxyMutation ? 'true' : 'false'],
                ['Not tube form', manualRequiredText],
                ['TD026 full rear terminal/svanhals', manualRequiredText],
                ['Configurable disc counterweight visible', manualRequiredText],
                ['Browser/visual verification by Jan-Eric', 'required'],
                ['Errors', result.errors && result.errors.length ? result.errors.join('; ') : '—'],
                ['Warnings', result.warnings && result.warnings.length ? result.warnings.join('; ') : '—']
            ]
        };
    }

    function toReleaseReadinessReportBlock(resultOrOptions, readinessOptions) {
        const result = resultOrOptions && resultOrOptions.schema === SCHEMA
            ? resultOrOptions
            : runVerificationPackage(resultOrOptions || {});
        const readiness = evaluateReleaseReadiness(result, readinessOptions || {});
        const evidence = readiness.evidenceSummary || {};
        return {
            title: 'Cobra Release Readiness',
            rows: [
                ['Release readiness', readiness.status],
                ['Known-good acceptance', readiness.knownGoodStatus],
                ['Runtime measured acceptance', readiness.runtimeMeasuredStatus],
                ['Manual visual verification', readiness.manualVisualStatus],
                ['Visual evidence required', DEFAULT_RELEASE_POLICY.visualEvidenceRequired],
                ['Visual evidence supplied', evidence.visualEvidenceSupplied === true],
                ['Browser run ID', evidence.browserRunId || '—'],
                ['Screenshot refs', Array.isArray(evidence.screenshotRefs) && evidence.screenshotRefs.length ? evidence.screenshotRefs.join(', ') : '—'],
                ['Report ref', evidence.reportRef || '—'],
                ['Release blockers', readiness.reasons && readiness.reasons.length ? readiness.reasons.join('; ') : '—']
            ]
        };
    }

    function getFeatureManifest() {
        return {
            id: 'cobraManualVerification',
            status: 'loaded',
            schema: SCHEMA,
            releaseSchema: RELEASE_SCHEMA,
            featureCount: 7,
            features: [
                { id: 'checklist', role: 'structured automatic and manual visual verification checklist' },
                { id: 'verification_state', role: 'builds canonical Cobra verification state' },
                { id: 'runtime_preset_apply', role: 'applies canonical Cobra preset without browser verification claim' },
                { id: 'verification_package', role: 'collects automatic acceptance and manual checklist status' },
                { id: 'visual_evidence_metadata', role: 'records user-supplied manual browser evidence metadata without claiming verification by itself' },
                { id: 'release_readiness_policy', role: 'keeps release readiness separate from static acceptance and manual visual checks' },
                { id: 'report_blocks', role: 'adds Cobra Manual Visual Verification and Cobra Release Readiness report rows' }
            ]
        };
    }

    const api = Object.freeze({
        schema: SCHEMA,
        releaseSchema: RELEASE_SCHEMA,
        getFeatureManifest,
        getChecklist,
        buildVerificationState,
        applyVerificationPreset,
        runVerificationPackage,
        evaluateReleaseReadiness,
        toReportBlock,
        toReleaseReadinessReportBlock
    });

    root.CobraManualVerification = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
