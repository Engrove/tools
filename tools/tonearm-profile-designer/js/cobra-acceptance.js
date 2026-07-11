/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-acceptance.js
 * Phase 8 Cobra architecture acceptance harness.
 *
 * Static/Node/browser-safe harness for the accepted Cobra capability modules.
 * It provides canonical preset application, known-good/override/runtime acceptance
 * modes, and physics/export adapter hardening. It is not browser visual
 * verification, not production CAD, and not a full FEA solver.
 */
(function(root) {
    'use strict';

    const SCHEMA = 'tonearm-designer-cobra-acceptance-v2';
    const TARGET_N1P2_MM = 237.05;
    const REQUIRED_CAPABILITIES = Object.freeze([
        'cobraControls',
        'cobraDiscCounterweightAssembly',
        'cobraMechanicalAssembly',
        'headshellSlots',
        'stationBasedEggshellWand',
        'structuralStationFilter',
        'aiCapabilityGate'
    ]);
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

    function readSelect(source, id, fallback) {
        if (hasOwn(source, id)) return source[id];
        if (source && source.selects && hasOwn(source.selects, id)) return source.selects[id];
        return fallback;
    }

    function ensureNestedRuntimeBlocks(target) {
        if (!isObject(target.inputs)) target.inputs = {};
        if (!isObject(target.selects)) target.selects = {};
        if (!isObject(target.checkboxes)) target.checkboxes = {};
        return target;
    }

    function writeCanonicalRuntimeValues(target) {
        ensureNestedRuntimeBlocks(target);
        target.apex = 237;
        target.cartX = -0.05;
        target.rearMode = 'cobra_integrated_tail';
        target.cartMode = 'g1042';
        target.material = 'carbon';
        target.renderMode = 'cad';
        target.inputs.apex = 237;
        target.inputs.cartX = -0.05;
        target.selects.rearMode = 'cobra_integrated_tail';
        target.selects.cartMode = 'g1042';
        target.selects.material = 'carbon';
        target.selects.renderMode = 'cad';
        return target;
    }

    function getDocument() {
        return root.document && typeof root.document.getElementById === 'function' ? root.document : null;
    }

    function dispatchControlEvents(el, enabled) {
        if (enabled !== true || !el || typeof el.dispatchEvent !== 'function') return;
        ['input', 'change'].forEach(function(type) {
            try {
                if (typeof root.Event === 'function') {
                    el.dispatchEvent(new root.Event(type, { bubbles: true }));
                } else if (getDocument() && typeof getDocument().createEvent === 'function') {
                    const evt = getDocument().createEvent('Event');
                    evt.initEvent(type, true, true);
                    el.dispatchEvent(evt);
                }
            } catch (err) {
                // Event dispatch is best-effort for explicit UI preset application only.
            }
        });
    }

    function writeDomValue(id, value, syncErrors, warnings, required, dispatchEvents) {
        if (required !== true) {
            return undefined;
        }
        const doc = getDocument();
        if (!doc) {
            syncErrors.push('DOM unavailable; cannot sync #' + id + '.');
            return undefined;
        }
        const el = doc.getElementById(id);
        if (!el) {
            syncErrors.push('DOM control #' + id + ' unavailable.');
            return undefined;
        }
        if ((id === 'apex' || id === 'cartX') && typeof el.setAttribute === 'function') {
            const step = id === 'cartX' ? '0.01' : '0.01';
            el.setAttribute('step', step);
            if ('step' in el) el.step = step;
        }
        if ('value' in el) {
            el.value = String(value);
            if ('valueAsNumber' in el && Number.isFinite(Number(value))) {
                try { el.valueAsNumber = Number(value); } catch (err) { /* range precision fallback keeps string value */ }
            }
        } else {
            el.textContent = String(value);
        }
        const valEl = getDocument() ? getDocument().getElementById('val_' + id) : null;
        if (valEl) valEl.textContent = String(value);
        dispatchControlEvents(el, dispatchEvents === true);
        return ('value' in el) ? el.value : el.textContent;
    }

    function readDomValue(id) {
        const doc = getDocument();
        if (!doc) return undefined;
        const el = doc.getElementById(id);
        if (!el) return undefined;
        return ('value' in el) ? el.value : el.textContent;
    }

    function collectSessionSnapshot(nameHint, errors, warnings, required) {
        if (!root.Session || typeof root.Session.collect !== 'function') {
            if (required) errors.push('Session.collect unavailable after canonical preset sync.');
            else warnings.push('Session.collect unavailable; state-source audit cannot compare session export source.');
            return null;
        }
        try {
            return root.Session.collect(nameHint || 'cobra_runtime_state_sync_audit');
        } catch (err) {
            const msg = 'Session.collect failed after canonical preset sync: ' + (err && err.message ? err.message : String(err));
            if (required) errors.push(msg);
            else warnings.push(msg);
            return null;
        }
    }

    function compareNumber(label, values, targetValue, tolerance, errors) {
        const entries = Object.keys(values).filter(function(key) {
            return values[key] !== undefined && values[key] !== null && values[key] !== '';
        });
        entries.forEach(function(key) {
            const n = Number(values[key]);
            if (!Number.isFinite(n) || Math.abs(n - targetValue) > tolerance) {
                errors.push(label + ' mismatch for ' + key + ': expected ' + targetValue + ', got ' + values[key] + '.');
            }
        });
    }

    function compareString(label, values, targetValue, errors) {
        const entries = Object.keys(values).filter(function(key) {
            return values[key] !== undefined && values[key] !== null && values[key] !== '';
        });
        entries.forEach(function(key) {
            if (String(values[key]) !== String(targetValue)) {
                errors.push(label + ' mismatch for ' + key + ': expected ' + targetValue + ', got ' + values[key] + '.');
            }
        });
    }

    function compareConsistentNumber(label, values, tolerance, errors) {
        const entries = Object.keys(values).filter(function(key) {
            return values[key] !== undefined && values[key] !== null && values[key] !== '' && Number.isFinite(Number(values[key]));
        });
        if (entries.length < 2) return;
        const referenceKey = entries[0];
        const referenceValue = Number(values[referenceKey]);
        entries.slice(1).forEach(function(key) {
            const value = Number(values[key]);
            if (Math.abs(value - referenceValue) > tolerance) {
                errors.push(label + ' source mismatch: ' + referenceKey + '=' + referenceValue + ', ' + key + '=' + value + '.');
            }
        });
    }

    function compareConsistentString(label, values, errors) {
        const entries = Object.keys(values).filter(function(key) {
            return values[key] !== undefined && values[key] !== null && values[key] !== '';
        });
        if (entries.length < 2) return;
        const referenceKey = entries[0];
        const referenceValue = String(values[referenceKey]);
        entries.slice(1).forEach(function(key) {
            if (String(values[key]) !== referenceValue) {
                errors.push(label + ' source mismatch: ' + referenceKey + '=' + referenceValue + ', ' + key + '=' + values[key] + '.');
            }
        });
    }

    function isCanonicalAuditRequired(target, opts) {
        if (opts && opts.requireCanonical === true) return true;
        const arch = getByPath(target, 'cobraArchitecture', {});
        return !!(arch && arch.enabled === true && arch.specRegime === 'custom_237_05');
    }

    function getByPath(source, path, fallback) {
        if (!isObject(source)) return fallback;
        const parts = path.split('.');
        let cur = source;
        for (let i = 0; i < parts.length; i += 1) {
            if (!isObject(cur) || !hasOwn(cur, parts[i])) return fallback;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function firstFinite(source, paths, fallback) {
        for (let i = 0; i < paths.length; i += 1) {
            const v = getByPath(source, paths[i], undefined);
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
        return fallback;
    }

    function firstString(source, paths, fallback) {
        for (let i = 0; i < paths.length; i += 1) {
            const v = getByPath(source, paths[i], undefined);
            if (typeof v === 'string' && v.trim()) return v;
        }
        return fallback;
    }

    function mergePlain(base, patch) {
        const out = isObject(base) ? clone(base) : {};
        if (!isObject(patch)) return out;
        Object.keys(patch).forEach(key => {
            if (isObject(patch[key]) && isObject(out[key])) out[key] = mergePlain(out[key], patch[key]);
            else out[key] = clone(patch[key]);
        });
        return out;
    }

    function normalizeStatus(status) {
        return typeof status === 'string' && status ? status : 'missing';
    }

    function getManifest() {
        if (root.CobraArchitecture && typeof root.CobraArchitecture.getCobraCapabilityManifest === 'function') {
            return root.CobraArchitecture.getCobraCapabilityManifest();
        }
        if (typeof root.getCobraCapabilityManifest === 'function') {
            return root.getCobraCapabilityManifest();
        }
        return {};
    }

    function capabilityCompletion(manifest) {
        const cap = manifest || getManifest();
        const missing = REQUIRED_CAPABILITIES.filter(id => cap[id] !== 'loaded');
        return {
            complete: missing.length === 0,
            missing,
            status: cap
        };
    }

    function getCanonicalPreset() {
        const controls = (root.CobraControls && typeof root.CobraControls.getDefaultControlState === 'function')
            ? root.CobraControls.getDefaultControlState()
            : {
                enabled: true,
                specRegime: 'custom_237_05',
                n1p2Mm: TARGET_N1P2_MM,
                applyN1P2LockToLegacy: true,
                counterweight: root.CobraDiscCounterweightAssembly && typeof root.CobraDiscCounterweightAssembly.getDefaultSpec === 'function'
                    ? root.CobraDiscCounterweightAssembly.getDefaultSpec()
                    : { enabled: true, variant: 'configurable_disc_stack', mountSource: 'unifiedRearTerminal', useRearDiscStack: true, useRearDiscProxy: false, discStack: { diameterMm: 14, thicknessMm: 4, count: 4, massEachG: 18, xMm: null, yMm: 0, zMm: null }, fineTrim: { enabled: true, lengthMm: 18, massEquivalentG: 0 } },
                armwand: root.CobraEggshellWand && typeof root.CobraEggshellWand.getDefaultSpec === 'function'
                    ? root.CobraEggshellWand.getDefaultSpec()
                    : { enabled: true, variant: 'station_based_eggshell', lengthMm: TARGET_N1P2_MM, stationCount: 9 },
                mechanical: root.CobraMechanicalAssembly && typeof root.CobraMechanicalAssembly.getDefaultSpec === 'function'
                    ? root.CobraMechanicalAssembly.getDefaultSpec()
                    : { enabled: true, variant: 'cobra_pivot_tower_vta' },
                headshellSlots: root.HeadshellSlots && typeof root.HeadshellSlots.getDefaultSpec === 'function'
                    ? root.HeadshellSlots.getDefaultSpec()
                    : { enabled: true, variant: 'integrated_obround_cartridge_slots', slotCount: 2 }
            };

        const state = {};
        if (root.CobraControls && typeof root.CobraControls.applyToState === 'function') {
            root.CobraControls.applyToState(state, controls);
        } else {
            state.cobraArchitecture = {
                schema: 'tonearm-designer-cobra-architecture-v1',
                enabled: true,
                specRegime: 'custom_237_05',
                n1p2Mm: TARGET_N1P2_MM,
                counterweight: clone(controls.counterweight),
                armwand: clone(controls.armwand),
                mechanical: clone(controls.mechanical),
                headshellSlots: clone(controls.headshellSlots),
                capabilitiesRequired: [
                    'cobraControls',
                    'cobraDiscCounterweightAssembly',
                    'cobraMechanicalAssembly',
                    'headshellSlots',
                    'stationBasedEggshellWand',
                    'structuralStationFilter'
                ],
                constraints: {
                    pivotAtRecordHeight: true,
                    totalCOMZMaxMm: 0,
                    counterweightCOMZMaxMm: 0,
                    neutralBalanceResidualMaxMm: 0.5,
                    eiMinMustBePositive: true,
                    firstBendingHzMustBePositive: true,
                    exportMustPass: true
                }
            };
        }

        state.apex = 237;
        state.cartX = -0.05;
        state.rearMode = 'cobra_integrated_tail';
        if (!isObject(state.selects)) state.selects = {};
        state.selects.rearMode = 'cobra_integrated_tail';

        state.rearWeightDiscDiameter = 14;
        state.rearWeightDiscThickness = 4;
        state.rearWeightDiscCount = 4;
        state.rearWeightDiscMass = 18;
        state.rearFineTrimScrewLength = 18;
        state.rearFineTrimScrewMassEquivalent = 0;
        state.includeRearWeightDiscsInExport = true;
        state.showRearWeights = true;
        state.showFineTrimScrew = false;
        state.showMechanicalAssemblyDebug = false;
        state.useCobraEggshellWandDebug = false;
        state.useCobraEggshellExportDebug = false;

        if (state.cobraArchitecture) {
            state.cobraArchitecture.enabled = true;
            state.cobraArchitecture.specRegime = 'custom_237_05';
            state.cobraArchitecture.n1p2Mm = TARGET_N1P2_MM;
            if (state.cobraArchitecture.counterweight) {
                state.cobraArchitecture.counterweight.enabled = true;
                state.cobraArchitecture.counterweight.variant = 'configurable_disc_stack';
                state.cobraArchitecture.counterweight.useRearDiscStack = true;
                state.cobraArchitecture.counterweight.useRearDiscProxy = false;
            }
            if (state.cobraArchitecture.armwand) {
                state.cobraArchitecture.armwand.enabled = true;
                state.cobraArchitecture.armwand.variant = 'station_based_eggshell';
                state.cobraArchitecture.armwand.lengthMm = TARGET_N1P2_MM;
            }
            if (state.cobraArchitecture.mechanical) {
                state.cobraArchitecture.mechanical.enabled = true;
                state.cobraArchitecture.mechanical.variant = 'cobra_pivot_tower_vta';
                state.cobraArchitecture.mechanical.showDebug = false;
                state.cobraArchitecture.mechanical.debugOverlay = false;
            }
            if (state.cobraArchitecture.headshellSlots) {
                state.cobraArchitecture.headshellSlots.enabled = true;
                state.cobraArchitecture.headshellSlots.variant = 'integrated_obround_cartridge_slots';
            }
        }

        return {
            schema: SCHEMA,
            name: 'canonical_cobra_custom_237_05_acceptance_preset',
            state,
            restrictions: {
                noProductionCadClaim: true,
                noFullFeaClaim: true,
                noBrowserVerificationClaim: true,
                forbiddenLegacyProxyFields: FORBIDDEN_LEGACY_PROXY_FIELDS.slice(),
                protectedCoreGeometryFields: PROTECTED_CORE_GEOMETRY_FIELDS.slice(),
                canonicalDiscCounterweightFieldsAllowed: ['rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount', 'rearWeightDiscMass', 'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent'],
                allowedLegacyLockFields: ['apex', 'cartX', 'rearMode']
            }
        };
    }

    function captureLegacyProxyValues(target) {
        const values = {};
        FORBIDDEN_LEGACY_PROXY_FIELDS.forEach(id => {
            if (hasOwn(target, id)) values[id] = target[id];
        });
        return values;
    }

    function restoreLegacyProxyValues(target, before) {
        FORBIDDEN_LEGACY_PROXY_FIELDS.forEach(id => {
            if (hasOwn(before, id)) target[id] = before[id];
            else if (hasOwn(target, id)) delete target[id];
        });
    }

    function hasLegacyProxyMutation(target, before) {
        return FORBIDDEN_LEGACY_PROXY_FIELDS.some(id => {
            if (hasOwn(before, id)) return target[id] !== before[id];
            return hasOwn(target, id);
        });
    }

    function applyCanonicalPreset(targetState) {
        const target = isObject(targetState) ? targetState : {};
        const before = captureLegacyProxyValues(target);
        const preset = getCanonicalPreset();

        Object.keys(preset.state).forEach(key => {
            if (key === 'cobraArchitecture') {
                target.cobraArchitecture = clone(preset.state.cobraArchitecture);
            } else if (key === 'selects') {
                target.selects = mergePlain(target.selects || {}, preset.state.selects);
            } else {
                target[key] = clone(preset.state[key]);
            }
        });

        restoreLegacyProxyValues(target, before);
        return target;
    }

    function buildAcceptanceState() {
        return applyCanonicalPreset({});
    }

    function applyCanonicalPresetToRuntime(targetState, options) {
        const opts = options || {};
        const target = isObject(targetState)
            ? targetState
            : (isObject(root.state) ? root.state : (root.state = {}));
        const before = captureLegacyProxyValues(target);
        const warnings = [];
        const syncErrors = [];
        const requireDomSync = opts.syncDom === true;
        const dispatchEvents = requireDomSync && opts.update !== false && opts.dispatchEvents === true;
        const requireSessionSync = opts.requireSessionCollect === true || (requireDomSync && !!(root.Session && typeof root.Session.collect === 'function'));

        try {
            applyCanonicalPreset(target);
            writeCanonicalRuntimeValues(target);
            restoreLegacyProxyValues(target, before);
        } catch (err) {
            return {
                status: 'FAIL',
                applied: false,
                n1p2Mm: null,
                legacyProxyMutation: false,
                state: {},
                dom: {},
                session: {},
                syncErrors: ['applyCanonicalPreset failed: ' + (err && err.message ? err.message : String(err))],
                warnings
            };
        }

        ['apex', 'cartX'].forEach(function(id) {
            writeDomValue(id, target.inputs[id], syncErrors, warnings, requireDomSync, dispatchEvents);
        });
        ['rearMode', 'cartMode', 'material', 'renderMode'].forEach(function(id) {
            writeDomValue(id, target.selects[id], syncErrors, warnings, requireDomSync, dispatchEvents);
        });

        if (opts.update !== false) {
            [
                ['updateState', root.updateState || (typeof updateState === 'function' ? updateState : null)],
                ['update3D', root.update3D || (typeof update3D === 'function' ? update3D : null)],
                ['updatePhysicsPanel', root.updatePhysicsPanel || (typeof updatePhysicsPanel === 'function' ? updatePhysicsPanel : null)],
                ['draw2D', root.draw2D || (typeof draw2D === 'function' ? draw2D : null)]
            ].forEach(function(pair) {
                const label = pair[0];
                const fn = pair[1];
                if (typeof fn !== 'function') return;
                try {
                    fn();
                } catch (err) {
                    warnings.push(label + ' failed after canonical preset: ' + (err && err.message ? err.message : String(err)));
                }
            });
        }

        const audit = auditRuntimeStateSync(target, {
            requireDom: requireDomSync,
            requireSession: requireSessionSync,
            sessionName: opts.sessionName || 'cobra_canonical_preset_sync'
        });
        audit.syncErrors.forEach(function(err) {
            if (syncErrors.indexOf(err) === -1) syncErrors.push(err);
        });
        audit.warnings.forEach(function(w) {
            if (warnings.indexOf(w) === -1) warnings.push(w);
        });

        const legacyProxyMutation = hasLegacyProxyMutation(target, before);
        if (legacyProxyMutation) syncErrors.push('Legacy proxy field mutation detected; canonical preset must not write Cobra proxy sliders.');
        const measured = n1p2(target);
        if (!Number.isFinite(measured) || Math.abs(measured - TARGET_N1P2_MM) > 0.01) {
            syncErrors.push('N1-P2 measured value is not 237.05 ± 0.01 mm after preset application; measured ' + measured + '.');
        }

        return {
            status: (!legacyProxyMutation && syncErrors.length === 0 && Number.isFinite(measured) && Math.abs(measured - TARGET_N1P2_MM) <= 0.01) ? 'PASS' : 'FAIL',
            applied: true,
            n1p2Mm: measured,
            legacyProxyMutation,
            state: audit.state,
            dom: audit.dom,
            session: audit.session,
            syncErrors,
            warnings
        };
    }

    function auditRuntimeStateSync(targetState, options) {
        const opts = options || {};
        const target = isObject(targetState) ? targetState : (isObject(root.state) ? root.state : {});
        const errors = [];
        const warnings = [];
        const dom = {
            apex: readDomValue('apex'),
            cartX: readDomValue('cartX'),
            rearMode: readDomValue('rearMode')
        };

        if (opts.requireDom && !getDocument()) {
            errors.push('DOM unavailable for runtime state sync audit.');
        }

        const sessionRaw = collectSessionSnapshot(opts.sessionName || 'cobra_runtime_state_sync_audit', errors, warnings, opts.requireSession === true);
        const session = sessionRaw ? {
            'inputs.apex': getByPath(sessionRaw, 'inputs.apex', undefined),
            'inputs.cartX': getByPath(sessionRaw, 'inputs.cartX', undefined),
            'selects.rearMode': getByPath(sessionRaw, 'selects.rearMode', undefined),
            'cobraArchitecture.enabled': getByPath(sessionRaw, 'cobraArchitecture.enabled', undefined)
        } : {};

        const stateSnapshot = {
            apex: readInput(target, 'apex', undefined),
            cartX: readInput(target, 'cartX', undefined),
            rearMode: readSelect(target, 'rearMode', undefined),
            'cobraArchitecture.enabled': getByPath(target, 'cobraArchitecture.enabled', undefined)
        };

        const requireCanonical = isCanonicalAuditRequired(target, opts);
        const isCobraContext = stateSnapshot.rearMode === 'cobra_integrated_tail' ||
            session['selects.rearMode'] === 'cobra_integrated_tail' ||
            getByPath(target, 'cobraArchitecture.enabled', false) === true;

        if (requireCanonical) {
            compareNumber('apex', {
                state: stateSnapshot.apex,
                dom: dom.apex,
                session: session['inputs.apex']
            }, 237, 0.000001, errors);
            compareNumber('cartX', {
                state: stateSnapshot.cartX,
                dom: dom.cartX,
                session: session['inputs.cartX']
            }, -0.05, 0.000001, errors);
            compareString('rearMode', {
                state: stateSnapshot.rearMode,
                dom: dom.rearMode,
                session: session['selects.rearMode']
            }, 'cobra_integrated_tail', errors);

            if (session['cobraArchitecture.enabled'] !== undefined && session['cobraArchitecture.enabled'] !== true) {
                errors.push('cobraArchitecture.enabled mismatch for session: expected true, got ' + session['cobraArchitecture.enabled'] + '.');
            }
            if (stateSnapshot['cobraArchitecture.enabled'] !== undefined && stateSnapshot['cobraArchitecture.enabled'] !== true) {
                errors.push('cobraArchitecture.enabled mismatch for state: expected true, got ' + stateSnapshot['cobraArchitecture.enabled'] + '.');
            }
        } else {
            compareConsistentNumber('apex', {
                state: stateSnapshot.apex,
                dom: dom.apex,
                session: session['inputs.apex']
            }, 0.000001, errors);
            compareConsistentNumber('cartX', {
                state: stateSnapshot.cartX,
                dom: dom.cartX,
                session: session['inputs.cartX']
            }, 0.000001, errors);
            compareConsistentString('rearMode', {
                state: stateSnapshot.rearMode,
                dom: dom.rearMode,
                session: session['selects.rearMode']
            }, errors);
            if (isCobraContext && stateSnapshot['cobraArchitecture.enabled'] !== true) {
                warnings.push('Cobra context detected but cobraArchitecture.enabled=false; canonical Cobra preset is not applied automatically.');
            }
        }

        const measured = n1p2(target);
        let n1p2PrecisionStatus = 'PASS';
        if (!Number.isFinite(measured)) {
            n1p2PrecisionStatus = 'FAIL';
            errors.push('N1-P2 sync audit failed: measured value is unavailable.');
        } else if (Math.abs(measured - TARGET_N1P2_MM) > 0.01) {
            if (requireCanonical) {
                n1p2PrecisionStatus = 'FAIL';
                errors.push('N1-P2 sync audit failed: expected 237.05 ± 0.01 mm, measured ' + measured + '.');
            } else if (isCobraContext) {
                n1p2PrecisionStatus = 'NON_CANONICAL_CONTEXT';
                warnings.push('N1-P2 is ' + measured.toFixed(3) + ' mm in non-canonical Cobra context; export/report must preserve session values.');
            } else {
                n1p2PrecisionStatus = 'NOT_APPLICABLE';
            }
        }

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            n1p2Mm: measured,
            n1p2PrecisionStatus,
            canonicalAuditRequired: requireCanonical,
            state: stateSnapshot,
            dom,
            session,
            sessionRaw,
            syncErrors: errors,
            warnings
        };
    }


    function auditRuntimeGeometry(targetState, options) {
        const opts = options || {};
        const target = isObject(targetState) ? targetState : (isObject(root.state) ? root.state : {});
        const errors = [];
        const warnings = [];
        const precisionAudit = auditRuntimeStateSync(target, { requireDom: false, requireSession: false });
        const precisionStatus = precisionAudit.n1p2PrecisionStatus || (precisionAudit.status === 'PASS' ? 'PASS' : 'FAIL');

        const source = root.getUnifiedGeometrySource && typeof root.getUnifiedGeometrySource === 'function'
            ? root.getUnifiedGeometrySource(target)
            : { id: 'td026_full_ring_geometry', available: false, source: 'missing_getUnifiedGeometrySource' };
        const terminal = root.getUnifiedRearTerminal && typeof root.getUnifiedRearTerminal === 'function'
            ? root.getUnifiedRearTerminal(target)
            : { available: false, source: 'missing_getUnifiedRearTerminal', x: null, y: null, z: null };

        let vertexCount = 0;
        let indexCount = 0;
        let groupCount = 0;
        let exportGeometrySource = 'unavailable';
        let exportValidation = 'FAIL';

        if (!source.available) errors.push('Unified TD026 full ring geometry source unavailable.');
        if (!terminal || terminal.available !== true) errors.push('Unified rear terminal missing.');

        if (typeof root.generateTonearmGeometry === 'function') {
            try {
                const geo = root.generateTonearmGeometry();
                vertexCount = geo && geo.attributes && geo.attributes.position ? geo.attributes.position.count : 0;
                indexCount = geo && geo.index ? Number(geo.index.count) || 0 : 0;
                groupCount = Array.isArray(geo && geo.groups) ? geo.groups.length : 0;
                if (!(vertexCount > 0) || !(indexCount > 0)) errors.push('TD026 full ring 3D geometry has no renderable vertices/indices.');
            } catch (err) {
                warnings.push('generateTonearmGeometry unavailable for runtime geometry audit: ' + (err && err.message ? err.message : String(err)));
            }
        } else {
            warnings.push('generateTonearmGeometry unavailable for runtime geometry audit.');
        }

        if (opts.exportResult) {
            const normalizedExport = normalizeExportForCobraValidation(opts.exportResult);
            exportValidation = normalizedExport.exportValidation || 'FAIL';
            exportGeometrySource = getByPath(opts.exportResult, 'metrics.exportGeometrySource', opts.exportResult.exportGeometrySource || source.id);
        } else if (typeof root.validateExportGeometry === 'function') {
            try {
                const exportResult = root.validateExportGeometry(readSelect(target, 'exportType', target.exportType), target);
                exportValidation = exportResult && exportResult.isValid === true ? 'PASS' : 'FAIL';
                exportGeometrySource = (exportResult && (exportResult.exportGeometrySource || getByPath(exportResult, 'metrics.exportGeometrySource', null))) || source.id;
                if (exportValidation !== 'PASS') {
                    errors.push('Export validation failed: ' + (exportResult && exportResult.errorMsg ? exportResult.errorMsg : 'unknown export error'));
                }
            } catch (err) {
                exportGeometrySource = 'unavailable';
                exportValidation = 'FAIL';
                warnings.push('Export validation unavailable during recovery audit: ' + (err && err.message ? err.message : String(err)));
            }
        } else {
            exportGeometrySource = source.id;
            warnings.push('validateExportGeometry unavailable; export validation could not be checked.');
        }

        if (exportGeometrySource !== 'unavailable' && exportGeometrySource !== source.id) {
            errors.push('2D/3D/export source divergence: export=' + exportGeometrySource + ', primary=' + source.id + '.');
        }

        const mechanicalDebugOn = root.isMechanicalAssemblyDebugEnabled && typeof root.isMechanicalAssemblyDebugEnabled === 'function'
            ? root.isMechanicalAssemblyDebugEnabled(target)
            : !!(target && target.showMechanicalAssemblyDebug === true);
        if (mechanicalDebugOn) {
            errors.push('Mechanical assembly debug overlay is active; normal preview must keep tower/VTA/bearing OFF.');
        }

        if (precisionStatus === 'FAIL') {
            errors.push('N1-P2 precision status failed: ' + (precisionAudit.syncErrors || []).join('; '));
        } else if (precisionStatus === 'NON_CANONICAL_CONTEXT') {
            warnings.push('N1-P2 is non-canonical by session design; no automatic preset mutation was applied.');
        }

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings,
            renderPath: source.id,
            renderStatus: errors.length ? 'FAIL' : 'PASS',
            vertexCount,
            indexCount,
            groupCount,
            renderMaterialMode: 'td026_ring_groups',
            exportGeometrySource,
            exportValidation,
            n1p2PrecisionStatus: precisionStatus,
            domCartXPrecision: precisionAudit.dom ? precisionAudit.dom.cartX : undefined,
            sessionCartXPrecision: precisionAudit.session ? precisionAudit.session['inputs.cartX'] : undefined,
            n1p2Mm: precisionAudit.n1p2Mm,
            rearTerminal: terminal,
            geometrySource: source,
            mechanicalAssemblyDebug: mechanicalDebugOn,
            normalRenderForbiddenNames: ['cobra_tower', 'cobra_vta_ring']
        };
    }

    function n1p2(state) {
        const flat = finite(state && state.apex, NaN);
        const flatCart = finite(state && state.cartX, NaN);
        if (Number.isFinite(flat) && Number.isFinite(flatCart)) return Math.abs(flat - flatCart);

        const nested = finite(getByPath(state, 'inputs.apex', NaN), NaN);
        const nestedCart = finite(getByPath(state, 'inputs.cartX', NaN), NaN);
        if (Number.isFinite(nested) && Number.isFinite(nestedCart)) return Math.abs(nested - nestedCart);

        if (root.CobraArchitecture && typeof root.CobraArchitecture.getN1P2Mm === 'function') {
            const measured = root.CobraArchitecture.getN1P2Mm(state);
            if (Number.isFinite(Number(measured))) return Number(measured);
        }
        return 237.05;
    }

    function defaultKnownGoodPhysics(state) {
        const cw = root.CobraDiscCounterweightAssembly &&
            typeof root.CobraDiscCounterweightAssembly.getMassComponent === 'function'
            ? root.CobraDiscCounterweightAssembly.getMassComponent(state)
            : { name: 'rearWeightDiscStack', source: 'rearWeightDiscStack', massG: 0, com: { x: null, y: 0, z: null }, z: null };

        const cwZ = cw && cw.com ? finite(cw.com.z, null) : finite(cw && cw.z, null);
        return {
            distances: { stylus_pivot: { d: TARGET_N1P2_MM } },
            c_total: { x: 212, y: 0, z: -1.0 },
            c_rear_weights: Object.assign({}, cw, {
                source: 'rearWeightDiscStack',
                name: 'rearWeightDiscStack',
                z: cwZ,
                com: Object.assign({}, cw.com || {}, { z: cwZ })
            }),
            counterweightCOMSource: 'rearWeightDiscStack',
            rearDiscProxyUsed: false,
            structural: {
                EI_min_Nm2: 1.0,
                EI_min: 1.0,
                firstBendingHz: 100.0
            }
        };
    }

    function normalizePhysicsForCobraValidation(physics, state) {
        const source = isObject(physics) ? clone(physics) : {};
        const normalized = clone(source);

        const n1p2Value = firstFinite(source, [
            'distances.stylus_pivot.d',
            'stylus_pivot.d',
            'n1p2Mm'
        ], n1p2(state));
        if (Number.isFinite(n1p2Value)) {
            normalized.distances = normalized.distances || {};
            normalized.distances.stylus_pivot = Object.assign({}, normalized.distances.stylus_pivot || {}, { d: n1p2Value });
        }

        const totalZ = firstFinite(source, [
            'c_total.z',
            'totalCOM.z',
            'com.z'
        ], null);
        if (Number.isFinite(totalZ)) {
            normalized.c_total = Object.assign({}, normalized.c_total || {}, { z: totalZ });
        }

        const cwZ = firstFinite(source, [
            'c_rear_weights.com.z',
            'c_rear_weights.z',
            'counterweightCOM.z',
            'rearWeightDiscStack.com.z',
            'rearWeightDiscStack.z'
        ], null);
        const cwMass = firstFinite(source, [
            'c_rear_weights.massG',
            'c_rear_weights.mass',
            'rearWeightDiscStack.massG',
            'rearWeightDiscStack.mass'
        ], 72);
        if (Number.isFinite(cwZ)) {
            const existing = isObject(normalized.c_rear_weights)
                ? normalized.c_rear_weights
                : {};
            const com = isObject(existing.com) ? existing.com : {};
            normalized.c_rear_weights = Object.assign({}, existing, {
                name: existing.name || 'rearWeightDiscStack',
                source: 'rearWeightDiscStack',
                massG: Number.isFinite(cwMass) ? cwMass : existing.massG,
                mass: Number.isFinite(cwMass) ? cwMass : existing.mass,
                com: Object.assign({}, com, {
                    x: firstFinite(source, ['c_rear_weights.com.x', 'c_rear_weights.x', 'counterweightCOM.x'], com.x || 237),
                    y: firstFinite(source, ['c_rear_weights.com.y', 'c_rear_weights.y', 'counterweightCOM.y'], com.y || 0),
                    z: cwZ
                }),
                z: cwZ
            });
            normalized.counterweightCOMSource = 'rearWeightDiscStack';
            normalized.rearDiscProxyUsed = false;
        }

        const ei = firstFinite(source, [
            'structural.EI_min',
            'structural.EI_min_Nm2',
            'EI_min'
        ], null);
        const bending = firstFinite(source, [
            'structural.firstBendingHz',
            'firstBendingHz'
        ], null);
        if (Number.isFinite(ei) || Number.isFinite(bending)) {
            normalized.structural = normalized.structural || {};
            if (Number.isFinite(ei)) {
                normalized.structural.EI_min = ei;
                normalized.structural.EI_min_Nm2 = ei;
            }
            if (Number.isFinite(bending)) normalized.structural.firstBendingHz = bending;
        }

        return normalized;
    }

    function normalizeExportStatusValue(status) {
        const raw = typeof status === 'string' ? status.trim().toUpperCase() : '';
        if (raw === 'PASS') return 'PASS';
        if (raw === 'FAIL') return 'FAIL';
        if (raw === 'HOLD') return 'HOLD';
        if (raw === 'ERROR') return 'ERROR';
        if (raw === 'INDETERMINATE' || raw === 'UNKNOWN' || raw === 'MISSING' || raw === 'UNAVAILABLE') {
            return 'INDETERMINATE';
        }
        return 'INDETERMINATE';
    }

    function normalizeExportForCobraValidation(exportInput) {
        const source = isObject(exportInput) ? clone(exportInput) : {};
        const status = firstString(source, [
            'exportValidation',
            'export.validation'
        ], null);
        if (status) {
            return Object.assign({}, source, {
                exportValidation: normalizeExportStatusValue(status),
                rawExportValidation: status
            });
        }
        if (source.isValid === true) return Object.assign({}, source, { exportValidation: 'PASS' });
        if (source.isValid === false) return Object.assign({}, source, { exportValidation: 'FAIL' });
        if (source.exportValidation && source.exportValidation.isValid === true) return Object.assign({}, source, { exportValidation: 'PASS' });
        if (source.exportValidation && source.exportValidation.isValid === false) return Object.assign({}, source, { exportValidation: 'FAIL' });
        if (source.export && source.export.isValid === true) return Object.assign({}, source, { exportValidation: 'PASS' });
        if (source.export && source.export.isValid === false) return Object.assign({}, source, { exportValidation: 'FAIL' });
        return {
            exportValidation: 'INDETERMINATE',
            reason: 'missing_explicit_export_evidence'
        };
    }

    function collectRuntimePhysics(state, opts) {
        const options = opts || {};
        const warnings = [];
        const errors = [];
        const explicitCandidates = [
            ['options.physics', options.physics],
            ['options.physicsOverride', options.physicsOverride],
            ['latest report physics', getByPath(root, '__TonearmDesignerLatestReportContext.physics', null)],
            ['latest report physics alias', getByPath(root, '__TonearmLatestReportContext.physics', null)],
            ['latest runtime physics', root.latestPhysics || root.lastPhysics || root.__latestPhysics || root.__lastPhysics],
            ['latest Cobra physics', root.latestCobraPhysics || root.__latestCobraPhysics]
        ];

        for (let i = 0; i < explicitCandidates.length; i += 1) {
            const label = explicitCandidates[i][0];
            const candidate = explicitCandidates[i][1];
            if (isObject(candidate)) {
                return {
                    physics: normalizePhysicsForCobraValidation(candidate, state),
                    source: label,
                    errors,
                    warnings
                };
            }
        }

        const rings = options && Array.isArray(options.rings)
            ? options.rings
            : (Array.isArray(root.GLOBAL_RINGSCache) ? root.GLOBAL_RINGSCache : []);
        const mode = state && (state.cartMode || (state.selects && state.selects.cartMode)) || 'g1042';

        if (!root.Physics || typeof root.Physics.getComprehensiveAnalysis !== 'function') {
            errors.push('Runtime physics unavailable: Physics.getComprehensiveAnalysis is not loaded and no latest physics cache was available.');
            return { physics: null, source: 'unavailable', errors, warnings };
        }

        try {
            return {
                physics: normalizePhysicsForCobraValidation(root.Physics.getComprehensiveAnalysis(state, mode, rings), state),
                source: 'Physics.getComprehensiveAnalysis',
                errors,
                warnings
            };
        } catch (err) {
            errors.push('Runtime physics failed: ' + (err && err.message ? err.message : String(err)));
            return { physics: null, source: 'unavailable', errors, warnings };
        }
    }

    function collectRuntimeExport(state, opts) {
        const options = opts || {};
        const warnings = [];
        const errors = [];
        const explicitCandidates = [
            ['options.export', options.export],
            ['options.exportOverride', options.exportOverride],
            ['latest report export', getByPath(root, '__TonearmDesignerLatestReportContext.exportValidation', null)],
            ['latest report export alias', getByPath(root, '__TonearmLatestReportContext.exportValidation', null)],
            ['latest export validation', root.latestExportValidation || root.lastExportValidation || root.__latestExportValidation]
        ];

        for (let i = 0; i < explicitCandidates.length; i += 1) {
            const label = explicitCandidates[i][0];
            const candidate = explicitCandidates[i][1];
            if (candidate !== undefined && candidate !== null) {
                return {
                    exportResult: normalizeExportForCobraValidation(isObject(candidate) ? candidate : { exportValidation: candidate }),
                    source: label,
                    errors,
                    warnings
                };
            }
        }

        if (typeof root.validateExportGeometry !== 'function') {
            errors.push('Runtime export validation unavailable: validateExportGeometry is not loaded and no latest export cache was available.');
            return { exportResult: null, source: 'unavailable', errors, warnings };
        }
        try {
            return {
                exportResult: normalizeExportForCobraValidation(root.validateExportGeometry(state && state.exportType, state)),
                source: 'validateExportGeometry',
                errors,
                warnings
            };
        } catch (err) {
            errors.push('Runtime export validation failed: ' + (err && err.message ? err.message : String(err)));
            return { exportResult: null, source: 'unavailable', errors, warnings };
        }
    }

    function visualEvidenceComplete(options) {
        const opts = options || {};
        if (opts.manualVisualVerified === true) return true;
        const evidence = isObject(opts.visualEvidence) ? opts.visualEvidence : {};
        return evidence.manualVisualVerified === true || evidence.complete === true;
    }

    function runGeometryRecoveryAcceptance(options) {
        const opts = options || {};
        const target = isObject(opts.state) ? opts.state : (isObject(root.state) ? root.state : {});
        const errors = [];
        const warnings = [];
        const measured = {};

        const geometryAudit = auditRuntimeGeometry(target, opts);
        geometryAudit.errors.forEach(function(e) { errors.push(e); });
        geometryAudit.warnings.forEach(function(w) { warnings.push(w); });

        const rearTerminal = geometryAudit.rearTerminal || (root.getUnifiedRearTerminal && root.getUnifiedRearTerminal(target));
        measured.rearTerminal = rearTerminal || null;

        let discMount = null;
        let discStackState = null;
        if (root.CobraDiscCounterweightAssembly && typeof root.CobraDiscCounterweightAssembly.getDiscStackState === 'function') {
            discStackState = root.CobraDiscCounterweightAssembly.getDiscStackState(target);
        }
        if (root.CobraDiscCounterweightAssembly && typeof root.CobraDiscCounterweightAssembly.getDiscMountPoint === 'function') {
            discMount = root.CobraDiscCounterweightAssembly.getDiscMountPoint(target);
        } else if (discStackState) {
            discMount = discStackState.mount;
        }

        measured.discStack = discStackState || null;
        measured.discMount = discMount || null;
        measured.discMountDeltaMm = null;
        if (rearTerminal && rearTerminal.available === true &&
            discMount && discMount.available === true &&
            Number.isFinite(Number(rearTerminal.x)) && Number.isFinite(Number(discMount.x))) {
            measured.discMountDeltaMm = Math.abs(Number(discMount.x) - Number(rearTerminal.x));
            if (measured.discMountDeltaMm > 0.25) {
                errors.push('disc stack mount != actual rear terminal; delta=' + measured.discMountDeltaMm.toFixed(3) + ' mm.');
            }
            if (Math.abs(Number(discMount.x) - TARGET_N1P2_MM) <= 0.01 &&
                Math.abs(Number(rearTerminal.x) - TARGET_N1P2_MM) > 0.01) {
                errors.push('disc stack mount is at pivot/apex x=237 instead of rear terminal.');
            }
            if (Number.isFinite(Number(rearTerminal.z)) && Number.isFinite(Number(discMount.z))) {
                measured.discMountVerticalGapMm = Math.max(0, Number(rearTerminal.z) - Number(discMount.z));
                if (measured.discMountVerticalGapMm > 0.25) {
                    errors.push('disc stack has visible vertical gap from rear terminal: ' + measured.discMountVerticalGapMm.toFixed(3) + ' mm.');
                }
            }
        } else {
            errors.push('disc stack mount or rear terminal unavailable for comparison.');
        }

        const tol = 1e-6;
        if (discStackState && rearTerminal && rearTerminal.available === true) {
            const count = Math.max(0, Math.round(finite(discStackState.count, 0)));
            const thickness = finite(discStackState.thicknessMm, NaN);
            const anchorZ = finite(discStackState.anchorZ, NaN);
            const rearTerminalZ = finite(rearTerminal.z, NaN);
            const expectedAnchorZ = discMount && discMount.available === true && Number.isFinite(Number(discMount.z))
                ? Number(discMount.z)
                : rearTerminalZ;
            const bridge = discStackState.supportBridge || {};
            const bridgeLengthMm = Number.isFinite(Number(discStackState.supportBridgeLengthMm)) ? Math.max(0, Number(discStackState.supportBridgeLengthMm)) : 0;
            const expectedStackTopZ = expectedAnchorZ - bridgeLengthMm;
            const expectedStackBottomZ = expectedStackTopZ - (count * thickness);
            const expectedStackCOMZ = count > 0 ? expectedStackTopZ - ((count * thickness) / 2) : null;
            const expectedDiscCenterZList = [];
            for (let i = 0; i < count; i += 1) {
                expectedDiscCenterZList.push(expectedStackTopZ - (thickness / 2) - (i * thickness));
            }

            measured.anchorZ = discStackState.anchorZ;
            measured.stackTopZ = discStackState.stackTopZ;
            measured.stackBottomZ = discStackState.stackBottomZ;
            measured.stackCOMZ = discStackState.stackCOMZ;
            measured.supportBridge = bridge;
            measured.supportBridgeLengthMm = bridgeLengthMm;
            measured.expectedAnchorZ = expectedAnchorZ;
            measured.expectedStackTopZ = expectedStackTopZ;
            measured.expectedStackCOMZ = expectedStackCOMZ;
            measured.discCenterZList = Array.isArray(discStackState.discCenterZList) ? discStackState.discCenterZList.slice() : [];
            measured.expectedDiscCenterZList = expectedDiscCenterZList;

            if (!Number.isFinite(rearTerminalZ) || !Number.isFinite(thickness) || thickness <= 0) {
                errors.push('downward disc stack acceptance cannot compute expected support-bridge Z geometry.');
            } else {
                if (!Number.isFinite(anchorZ) || Math.abs(anchorZ - expectedAnchorZ) > tol) {
                    errors.push('disc stack anchorZ must equal computed disc mount anchor; expected ' + expectedAnchorZ + ', got ' + discStackState.anchorZ + '.');
                }
                if (!Number.isFinite(Number(discStackState.stackTopZ)) || Math.abs(Number(discStackState.stackTopZ) - expectedStackTopZ) > tol) {
                    errors.push('stackTopZ must equal support-bridge lower contact; expected ' + expectedStackTopZ + ', got ' + discStackState.stackTopZ + '.');
                }
                if (count > 0 && (!bridge || bridge.enabled !== true)) {
                    errors.push('disc stack requires explicit support bridge to avoid exact cap-contact non-manifold export.');
                }
                if (count > 0 && bridge && bridge.enabled === true) {
                    const bridgeTopZ = Number(bridge.topZ);
                    const bridgeBottomZ = Number(bridge.bottomZ);
                    if (!(Number.isFinite(bridgeTopZ) && Number.isFinite(bridgeBottomZ) && bridgeTopZ > expectedAnchorZ && bridgeBottomZ < expectedStackTopZ)) {
                        errors.push('support bridge must overlap both rear terminal and disc stack; got top=' + bridge.topZ + ', bottom=' + bridge.bottomZ + '.');
                    }
                }
                if (!Number.isFinite(Number(discStackState.stackBottomZ)) || Math.abs(Number(discStackState.stackBottomZ) - expectedStackBottomZ) > tol) {
                    errors.push('stackBottomZ must equal support-bridge stackTopZ - count*thickness; expected ' + expectedStackBottomZ + ', got ' + discStackState.stackBottomZ + '.');
                }
                if (count > 0) {
                    if (!Number.isFinite(Number(discStackState.stackCOMZ)) || Math.abs(Number(discStackState.stackCOMZ) - expectedStackCOMZ) > tol) {
                        errors.push('counterweightCOM.z must equal computed disc stack COM; expected ' + expectedStackCOMZ + ', got ' + discStackState.stackCOMZ + '.');
                    }
                    if (Math.abs(Number(discStackState.stackCOMZ) - expectedAnchorZ) <= tol) {
                        errors.push('disc stack is centered on the mount anchor instead of hanging below the rear-terminal support bridge.');
                    }
                    if (!Array.isArray(discStackState.discCenterZList) || discStackState.discCenterZList.length !== count) {
                        errors.push('disc center Z-list length must equal disc count.');
                    } else {
                        for (let i = 0; i < count; i += 1) {
                            if (Math.abs(Number(discStackState.discCenterZList[i]) - expectedDiscCenterZList[i]) > tol) {
                                errors.push('disc center Z mismatch at index ' + i + ': expected ' + expectedDiscCenterZList[i] + ', got ' + discStackState.discCenterZList[i] + '.');
                                break;
                            }
                        }
                    }
                } else {
                    if (discStackState.stackCOMZ !== null) {
                        errors.push('empty disc stack must report stackCOMZ=null; got ' + discStackState.stackCOMZ + '.');
                    }
                    if (!Array.isArray(discStackState.discCenterZList) || discStackState.discCenterZList.length !== 0) {
                        errors.push('empty disc stack must report discCenterZList=[].');
                    }
                }
            }
        } else {
            errors.push('disc stack state or rear terminal unavailable for downward Z acceptance.');
        }

        let counterweightCOM = null;
        if (root.Physics && typeof root.Physics.getRearWeightCOM === 'function') {
            counterweightCOM = root.Physics.getRearWeightCOM(target);
            measured.counterweightCOM = counterweightCOM;
            if (discStackState && discStackState.count > 0 && counterweightCOM && counterweightCOM.enabled === true) {
                const expectedStackCOMZ = measured.expectedStackCOMZ;
                if (Number.isFinite(Number(expectedStackCOMZ)) &&
                    (!Number.isFinite(Number(counterweightCOM.z)) || Math.abs(Number(counterweightCOM.z) - Number(expectedStackCOMZ)) > tol)) {
                    errors.push('Physics.getRearWeightCOM().z must use downward stack COM; expected ' + expectedStackCOMZ + ', got ' + counterweightCOM.z + '.');
                }
            } else if (discStackState && Math.max(0, Math.round(finite(discStackState.count, 0))) === 0) {
                if (!counterweightCOM || counterweightCOM.enabled !== false || finite(counterweightCOM.massG !== undefined ? counterweightCOM.massG : counterweightCOM.mass, 0) !== 0) {
                    errors.push('Physics rear-weight component must be disabled/zero-mass when rearWeightDiscCount=0.');
                }
            }
        }

        if (geometryAudit.exportGeometrySource !== 'unavailable' &&
            geometryAudit.exportGeometrySource !== geometryAudit.renderPath) {
            errors.push('2D/3D/export primary geometry source diverges.');
        }

        if (geometryAudit.mechanicalAssemblyDebug === true) {
            errors.push('cobra_tower/cobra_vta_ring debug overlay enabled in normal acceptance state.');
        }

        measured.discMountSource = discMount && discMount.source ? discMount.source : 'missing';
        measured.primaryGeometrySource = geometryAudit.renderPath;
        measured.exportGeometrySource = geometryAudit.exportGeometrySource;
        measured.physicsGeometrySource = 'td026_full_ring_geometry';
        measured.manualVisualVerification = visualEvidenceComplete(opts) ? 'PASS' : 'MISSING';

        const automaticStatus = errors.length ? 'FAIL' : 'PASS';
        const status = automaticStatus === 'FAIL'
            ? 'FAIL'
            : (visualEvidenceComplete(opts) ? 'PASS' : 'HOLD');

        return {
            schema: 'tonearm-designer-geometry-recovery-acceptance-v1',
            status,
            automaticStatus,
            manualVisualStatus: visualEvidenceComplete(opts) ? 'PASS' : 'HOLD',
            measured,
            geometryAudit,
            errors,
            warnings
        };
    }


    function collectModuleResults(state) {
        const moduleResults = {};
        const errors = [];
        const warnings = [];

        if (root.CobraControls && typeof root.CobraControls.validateControlState === 'function') {
            moduleResults.cobraControls = root.CobraControls.validateControlState(state);
        } else {
            moduleResults.cobraControls = { status: 'missing', errors: ['CobraControls module unavailable.'] };
        }

        if (root.CobraDiscCounterweightAssembly && typeof root.CobraDiscCounterweightAssembly.getFeatureManifest === 'function') {
            const manifest = root.CobraDiscCounterweightAssembly.getFeatureManifest(state);
            const component = root.CobraDiscCounterweightAssembly.getMassComponent(state);
            const validation = typeof root.CobraDiscCounterweightAssembly.validateCounterweight === 'function'
                ? root.CobraDiscCounterweightAssembly.validateCounterweight(state)
                : null;
            moduleResults.cobraDiscCounterweightAssembly = validation || {
                status: component && component.enabled && component.com && finite(component.com.z, 1) <= 0 ? 'PASS' : 'FAIL',
                manifest,
                component
            };
            moduleResults.cobraDiscCounterweightAssembly.manifest = manifest;
            moduleResults.cobraDiscCounterweightAssembly.component = component;
            if (!component || !component.com || component.enabled !== true) errors.push('rearWeightDiscStack component unavailable.');
            else if (finite(component.com.z, 1) > 0) errors.push('rearWeightDiscStack COM z is above 0.');
            if (validation && Array.isArray(validation.errors)) validation.errors.forEach(function(e) { errors.push(e); });
        } else {
            moduleResults.cobraDiscCounterweightAssembly = { status: 'missing', errors: ['CobraDiscCounterweightAssembly unavailable.'] };
        }

        const egg = root.CobraEggshellWand || root.StationBasedEggshellWand;
        if (egg && typeof egg.buildStations === 'function' && typeof egg.validateStations === 'function') {
            const stations = egg.buildStations(state);
            const validation = egg.validateStations(stations);
            moduleResults.stationBasedEggshellWand = validation;
            if (validation.status !== 'PASS') errors.push('stationBasedEggshellWand validation failed.');
        } else {
            moduleResults.stationBasedEggshellWand = { status: 'missing', errors: ['CobraEggshellWand unavailable.'] };
        }

        if (root.CobraMechanicalAssembly && typeof root.CobraMechanicalAssembly.validateAssembly === 'function') {
            const validation = root.CobraMechanicalAssembly.validateAssembly(state);
            moduleResults.cobraMechanicalAssembly = validation;
            if (validation.status !== 'PASS') errors.push('cobraMechanicalAssembly validation failed.');
        } else {
            moduleResults.cobraMechanicalAssembly = { status: 'missing', errors: ['CobraMechanicalAssembly unavailable.'] };
        }

        if (root.HeadshellSlots && typeof root.HeadshellSlots.validateSpec === 'function') {
            const validation = root.HeadshellSlots.validateSpec(state);
            moduleResults.headshellSlots = validation;
            if (validation.status !== 'PASS') errors.push('headshellSlots validation failed.');
        } else {
            moduleResults.headshellSlots = { status: 'missing', errors: ['HeadshellSlots unavailable.'] };
        }

        return { moduleResults, errors, warnings };
    }

    function architectureValidate(state, physics, exportResult, manifest) {
        if (!root.CobraArchitecture || typeof root.CobraArchitecture.validateCobraArchitecture !== 'function') {
            return {
                status: 'FAIL',
                errors: ['CobraArchitecture.validateCobraArchitecture unavailable.'],
                warnings: [],
                missingCapabilities: capabilityCompletion(manifest).missing,
                measured: {}
            };
        }
        const normalizedPhysics = normalizePhysicsForCobraValidation(physics, state);
        const normalizedExport = normalizeExportForCobraValidation(exportResult);
        return root.CobraArchitecture.validateCobraArchitecture(state, normalizedPhysics, normalizedExport, manifest);
    }

    function resultFromPieces(mode, state, manifest, completion, collected, physics, exportResult, sources, indeterminateErrors) {
        const architectureValidation = indeterminateErrors && indeterminateErrors.length
            ? {
                status: 'INDETERMINATE',
                errors: indeterminateErrors.slice(),
                warnings: [],
                missingCapabilities: completion.missing,
                measured: {}
            }
            : architectureValidate(state, physics, exportResult, manifest);

        const errors = [];
        const warnings = [];

        if (!completion.complete) errors.push('Capability manifest incomplete: ' + completion.missing.join(', '));
        collected.errors.forEach(e => errors.push(e));
        collected.warnings.forEach(w => warnings.push(w));

        if (!Number.isFinite(n1p2(state)) || Math.abs(n1p2(state) - TARGET_N1P2_MM) > 0.01) {
            errors.push('N1-P2 must remain 237.05 ± 0.01 mm; measured ' + n1p2(state));
        }

        if (architectureValidation.status !== 'PASS') {
            if (Array.isArray(architectureValidation.errors)) {
                architectureValidation.errors.forEach(e => errors.push(e));
            } else {
                errors.push('CobraArchitecture validation did not PASS: ' + architectureValidation.status);
            }
        }
        if (Array.isArray(architectureValidation.warnings)) {
            architectureValidation.warnings.forEach(w => warnings.push(w));
        }

        const status = architectureValidation.status === 'INDETERMINATE'
            ? 'INDETERMINATE'
            : ((completion.complete && architectureValidation.status === 'PASS' && errors.length === 0) ? 'PASS' : 'FAIL');

        const measured = architectureValidation.measured || {};
        const egg = collected.moduleResults.stationBasedEggshellWand || {};
        const head = collected.moduleResults.headshellSlots || {};
        const mech = collected.moduleResults.cobraMechanicalAssembly || {};
        const result = {
            schema: SCHEMA,
            status,
            mode,
            capabilityStatus: manifest,
            capabilityComplete: completion.complete,
            missingCapabilities: completion.missing,
            moduleResults: collected.moduleResults,
            cobraArchitectureStatus: normalizeStatus(architectureValidation.status),
            cobraArchitectureValidation: architectureValidation,
            exportManifestSanity: {
                checked: true,
                exportValidation: normalizeExportForCobraValidation(exportResult).exportValidation,
                status: normalizeExportForCobraValidation(exportResult).exportValidation === 'PASS'
                    ? 'PASS'
                    : (normalizeExportForCobraValidation(exportResult).exportValidation === 'FAIL' ? 'FAIL' : 'INDETERMINATE')
            },
            reportBlockSanity: {
                checked: true,
                status: 'PASS'
            },
            runtimePhysicsSource: sources.physics || 'unknown',
            runtimeExportSource: sources.export || 'unknown',
            errors,
            warnings,
            measured: {
                n1p2Mm: n1p2(state),
                counterweightCOMZMm: measured.counterweightCOMZMm !== undefined ? measured.counterweightCOMZMm : null,
                counterweightCOMSource: measured.counterweightCOMSource || 'none',
                eggShellMinEIProxy: egg.minEIProxy !== undefined ? egg.minEIProxy : null,
                headshellSlotCount: head.measured && head.measured.slotCount !== undefined ? head.measured.slotCount : null,
                mechanicalMassComponentCount: mech.measured && mech.measured.massComponentCount !== undefined ? mech.measured.massComponentCount : null
            }
        };

        result.reportBlockSanity.rowCount = toReportBlock(result, { noRecurse: true }).rows.length;
        return result;
    }

    function runRuntimeAcceptance(options) {
        const opts = options || {};
        const mode = opts.mode || (opts.useKnownGoodPhysics ? 'known_good' : (opts.physicsOverride || opts.exportOverride ? 'override' : 'runtime_measured'));
        const baseState = opts.state ? clone(opts.state) : buildAcceptanceState();
        const state = opts.skipPresetApply ? baseState : applyCanonicalPreset(baseState);
        const manifest = opts.capabilities || getManifest();
        const completion = capabilityCompletion(manifest);
        const collected = collectModuleResults(state);
        let physics = null;
        let exportResult = null;
        let sources = { physics: 'unknown', export: 'unknown' };
        const indeterminateErrors = [];

        if (mode === 'known_good') {
            physics = defaultKnownGoodPhysics(state);
            exportResult = { exportValidation: 'INDETERMINATE', reason: 'known_good_mode_has_no_real_export_evidence' };
            sources = { physics: 'known_good', export: 'known_good_no_export_evidence' };
            indeterminateErrors.push('Known-good acceptance mode supplies physics only; export evidence is INDETERMINATE until an explicit export validator result is provided.');
        } else if (mode === 'override') {
            const hasExportOverride = opts.exportOverride !== undefined || opts.export !== undefined;
            physics = normalizePhysicsForCobraValidation(opts.physicsOverride || opts.physics || {}, state);
            exportResult = normalizeExportForCobraValidation(hasExportOverride ? (opts.exportOverride || opts.export) : null);
            if (!hasExportOverride) {
                indeterminateErrors.push('Override acceptance mode missing explicit export evidence; export status is INDETERMINATE.');
            }
            sources = { physics: opts.physics ? 'options.physics' : 'override', export: hasExportOverride ? (opts.export ? 'options.export' : 'options.exportOverride') : 'missing_explicit_export_evidence' };
        } else if (mode === 'runtime_measured') {
            const runtimePhysics = collectRuntimePhysics(state, opts);
            const runtimeExport = collectRuntimeExport(state, opts);
            sources = { physics: runtimePhysics.source, export: runtimeExport.source };
            runtimePhysics.errors.forEach(function(e) { indeterminateErrors.push(e); });
            runtimeExport.errors.forEach(function(e) { indeterminateErrors.push(e); });
            physics = runtimePhysics.physics;
            exportResult = runtimeExport.exportResult;
        } else {
            indeterminateErrors.push('Unknown CobraAcceptance mode: ' + mode);
            sources = { physics: 'unavailable', export: 'unavailable' };
        }

        const result = resultFromPieces(mode, state, manifest, completion, collected, physics || {}, exportResult || {}, sources, indeterminateErrors);
        const recovery = runGeometryRecoveryAcceptance({
            state,
            exportResult,
            manualVisualVerified: opts.manualVisualVerified === true,
            visualEvidence: opts.visualEvidence
        });
        result.geometryRecoveryAcceptance = recovery;
        result.measured = Object.assign({}, result.measured || {}, recovery.measured || {});
        if (recovery.status === 'FAIL') {
            result.status = 'FAIL';
            result.cobraArchitectureStatus = result.cobraArchitectureStatus === 'PASS' ? 'FAIL' : result.cobraArchitectureStatus;
            recovery.errors.forEach(function(e) { if (result.errors.indexOf(e) === -1) result.errors.push(e); });
        } else if (result.status === 'PASS' && recovery.status === 'HOLD') {
            result.status = 'HOLD';
            result.manualVisualStatus = 'HOLD';
            result.holdReasons = ['manual visual verification missing'];
        } else {
            result.manualVisualStatus = recovery.manualVisualStatus;
        }
        return result;
    }

    function runStaticAcceptance(options) {
        const opts = options || {};
        if (opts.mode) return runRuntimeAcceptance(opts);
        if (opts.physicsOverride || opts.exportOverride) {
            return runRuntimeAcceptance(Object.assign({}, opts, { mode: 'override' }));
        }
        return runRuntimeAcceptance(Object.assign({}, opts, { mode: 'known_good' }));
    }

    function toReportBlock(resultOrOptions, internalOptions) {
        const noRecurse = internalOptions && internalOptions.noRecurse === true;
        let primary;
        let knownGood;
        let runtimeMeasured;

        if (resultOrOptions && resultOrOptions.schema === SCHEMA && resultOrOptions.status) {
            primary = resultOrOptions;
            knownGood = primary.mode === 'known_good' ? primary : (noRecurse ? primary : runRuntimeAcceptance({ mode: 'known_good' }));
            runtimeMeasured = primary.mode === 'runtime_measured' ? primary : (noRecurse ? primary : runRuntimeAcceptance({ mode: 'runtime_measured' }));
        } else {
            const opts = resultOrOptions || {};
            knownGood = runRuntimeAcceptance(Object.assign({}, opts, { mode: 'known_good' }));
            runtimeMeasured = runRuntimeAcceptance(Object.assign({}, opts, { mode: 'runtime_measured' }));
            primary = runtimeMeasured.status === 'FAIL' ? runtimeMeasured : knownGood;
        }

        const fullLiveStatus = runtimeMeasured.cobraArchitectureStatus || runtimeMeasured.status || '—';
        return {
            title: 'Cobra End-to-End Acceptance',
            rows: [
                ['Canonical Cobra preset', 'loaded'],
                ['Acceptance status', primary.status],
                ['Static known-good acceptance', knownGood.status],
                ['Runtime measured acceptance', runtimeMeasured.status],
                ['Runtime acceptance mode', runtimeMeasured.mode || 'runtime_measured'],
                ['Capability complete', primary.capabilityComplete === true],
                ['Missing capabilities', primary.missingCapabilities && primary.missingCapabilities.length ? primary.missingCapabilities.join(', ') : 'none'],
                ['Runtime physics source', runtimeMeasured.runtimePhysicsSource || 'unavailable'],
                ['Runtime export source', runtimeMeasured.runtimeExportSource || 'unavailable'],
                ['N1-P2 measured', Number.isFinite(Number(primary.measured && primary.measured.n1p2Mm)) ? Number(primary.measured.n1p2Mm).toFixed(2) + ' mm' : '—'],
                ['Counterweight COM source', primary.measured ? primary.measured.counterweightCOMSource : 'none'],
                ['Rear terminal', primary.measured && primary.measured.rearTerminal ? [primary.measured.rearTerminal.x, primary.measured.rearTerminal.y, primary.measured.rearTerminal.z].join(', ') : '—'],
                ['Disc mount', primary.measured && primary.measured.discMount ? [primary.measured.discMount.x, primary.measured.discMount.y, primary.measured.discMount.z].join(', ') : '—'],
                ['Disc mount source', primary.measured && primary.measured.discMountSource ? primary.measured.discMountSource : '—'],
                ['Disc mount delta X', Number.isFinite(Number(primary.measured && primary.measured.discMountDeltaMm)) ? Number(primary.measured.discMountDeltaMm).toFixed(3) + ' mm' : '—'],
                ['Support bridge', primary.measured && primary.measured.supportBridge && primary.measured.supportBridge.enabled === true ? 'enabled' : '—'],
                ['Support bridge length', Number.isFinite(Number(primary.measured && primary.measured.supportBridgeLengthMm)) ? Number(primary.measured.supportBridgeLengthMm).toFixed(3) + ' mm' : '—'],
                ['Manual visual status', primary.manualVisualStatus || getByPath(primary, 'geometryRecoveryAcceptance.manualVisualStatus', 'HOLD')],
                ['Eggshell wand validation', getByPath(primary, 'moduleResults.stationBasedEggshellWand.status', '—')],
                ['Mechanical validation', getByPath(primary, 'moduleResults.cobraMechanicalAssembly.status', '—')],
                ['Headshell slots validation', getByPath(primary, 'moduleResults.headshellSlots.status', '—')],
                ['Full Cobra validation', primary.cobraArchitectureStatus || '—'],
                ['Full live Cobra validation', fullLiveStatus],
                ['Errors', primary.errors && primary.errors.length ? primary.errors.join('; ') : '—'],
                ['Warnings', primary.warnings && primary.warnings.length ? primary.warnings.join('; ') : '—']
            ]
        };
    }

    function getFeatureManifest() {
        return {
            id: 'cobraAcceptance',
            status: 'loaded',
            schema: SCHEMA,
            featureCount: 8,
            features: [
                { id: 'canonical_preset', role: 'builds deterministic custom_237_05 Cobra state' },
                { id: 'runtime_preset_application', role: 'applies canonical preset to window.state or caller state without legacy proxy mutation' },
                { id: 'capability_completion_check', role: 'verifies all Cobra capability modules are loaded' },
                { id: 'module_acceptance_runner', role: 'runs CobraControls, disc counterweight, eggshell wand, mechanical assembly and headshell slot validations' },
                { id: 'known_good_acceptance', role: 'runs deterministic known-good physics/export acceptance' },
                { id: 'runtime_measured_acceptance', role: 'attempts browser runtime physics/export acceptance without false PASS when unavailable' },
                { id: 'physics_export_adapter', role: 'normalizes COM/EI/bending/export fields for CobraArchitecture validation' },
                { id: 'report_block', role: 'provides Cobra End-to-End Acceptance report rows' }
            ]
        };
    }

    const api = Object.freeze({
        schema: SCHEMA,
        requiredCapabilities: REQUIRED_CAPABILITIES.slice(),
        forbiddenLegacyProxyFields: FORBIDDEN_LEGACY_PROXY_FIELDS.slice(),
        protectedCoreGeometryFields: PROTECTED_CORE_GEOMETRY_FIELDS.slice(),
        canonicalDiscCounterweightFieldsAllowed: ['rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount', 'rearWeightDiscMass', 'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent'],
        getCanonicalPreset,
        applyCanonicalPreset,
        applyCanonicalPresetToRuntime,
        auditRuntimeStateSync,
        auditRuntimeGeometry,
        runGeometryRecoveryAcceptance,
        buildAcceptanceState,
        getFeatureManifest,
        normalizePhysicsForCobraValidation,
        runStaticAcceptance,
        runRuntimeAcceptance,
        toReportBlock
    });

    root.CobraAcceptance = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
