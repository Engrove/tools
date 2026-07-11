/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F solver-modal.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/solver-modal.js
 * Fas 15.3c Solver Continuation, Responsive Guided Mode, Input Focus Retention & UI Cleanup.
 *
 * Contract:
 * - full-screen modal
 * - closed only by Discard, Apply, or the top-right X button
 * - read-only solver session until Apply
 * - lock/unlock per variable
 * - min/max/step per adjustable variable
 * - explicit active-target scoring
 * - chunked/asynchronous candidate evaluation
 */
(function(root) {
    'use strict';

    const SOLVER_SCHEMA = 'tonearm-designer-fas15-bruteforce-solver';
    const SOLVER_VERSION = 4;
    const MIN_EVALUATION_LIMIT = 2500;
    const MAX_EVALUATION_LIMIT = 15000;
    const EVALUATION_LIMIT_STEP = 500;
    const DEFAULT_EVALUATION_LIMIT = 2500;
    const MAX_EVALUATED_CANDIDATES = DEFAULT_EVALUATION_LIMIT;
    const MAX_SAMPLES_PER_VARIABLE = 9;
    const SOLVER_BATCH_SIZE = 120;

    const SOLVER_SCHEDULER_VERSION = 'fas15.3e.v1';
    const DEFAULT_SEARCH_STRATEGY = 'smart_prioritized';
    const SEARCH_STRATEGIES = Object.freeze({
        smart_prioritized: {
            label: 'Smart prioritized',
            mode: 'prioritized',
            primaryGroups: ['counterweight', 'mass_resonance', 'geometry', 'manufacturing', 'fine_trim'],
            passSequence: ['baseline', 'target_priority', 'coarse', 'refine', 'fallback', 'exhaustive']
        },
        exhaustive_order: {
            label: 'Exhaustive order',
            mode: 'exhaustive',
            primaryGroups: [],
            passSequence: ['exhaustive']
        },
        local_refinement: {
            label: 'Local refinement',
            mode: 'refinement',
            primaryGroups: ['fine_trim', 'counterweight', 'mass_resonance'],
            passSequence: ['baseline', 'refine', 'fallback']
        },
        counterweight_first: {
            label: 'Counterweight first',
            mode: 'prioritized',
            primaryGroups: ['counterweight', 'fine_trim', 'mass_resonance', 'geometry'],
            passSequence: ['baseline', 'coarse_counterweight', 'refine', 'fallback']
        },
        geometry_first: {
            label: 'Geometry first',
            mode: 'prioritized',
            primaryGroups: ['geometry', 'cartridge_geometry', 'rear_geometry', 'counterweight', 'fine_trim'],
            passSequence: ['baseline', 'coarse_geometry', 'refine', 'fallback']
        },
        resonance_first: {
            label: 'Resonance first',
            mode: 'prioritized',
            primaryGroups: ['mass_resonance', 'cartridge_physics', 'counterweight', 'fine_trim'],
            passSequence: ['baseline', 'coarse_resonance', 'refine', 'fallback']
        }
    });

    const DEFAULT_SOLVER_VARIABLES = [
        'cartX',
        'pivotSpindle',
        'apex',
        'fullLength',
        'maxH',
        'maxW',
        'neckW',
        'neckL',
        'tailD',
        'thick',
        'armBodyDatumOffsetZ',
        'verticalPivotHeightAboveLP',
        'rearBendStartX',
        'rearBendDropZ',
        'rearWeightDiscDiameter',
        'rearWeightDiscThickness',
        'rearWeightDiscCount',
        'rearWeightDiscMass',
        'rearFineTrimScrewLength',
        'rearFineTrimScrewMassEquivalent',
        'customMass',
        'customZ',
        'comp10'
    ];

    const PREFERRED_UNLOCKED = Object.freeze({
        cartX: true,
        rearWeightDiscCount: true,
        rearWeightDiscThickness: true,
        rearWeightDiscMass: true,
        rearFineTrimScrewMassEquivalent: true
    });

    const CATEGORY_ORDER = [
        'counterweight',
        'cartridge_geometry',
        'cartridge_physics',
        'kinematics',
        'geometry',
        'rear_geometry',
        'vertical_datum',
        'mass',
        'general'
    ];

    let session = null;
    let preview = null;
    let previewAnimationId = null;
    let previewResizeObserver = null;
    let previewWindowResizeBound = false;
    const PREVIEW_ZERO_SIZE_RETRY_LIMIT = 8;
    let activeSolverPanel = 'guide';

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isFiniteNumber(value) {
        return Number.isFinite(Number(value));
    }

    function roundToStep(value, step) {
        const s = Math.abs(Number(step) || 1);
        const inv = 1 / s;
        return Math.round(Number(value) * inv) / inv;
    }

    function clamp(value, min, max) {
        const n = Number(value);
        const lo = Number(min);
        const hi = Number(max);
        if (!Number.isFinite(n)) return Number.isFinite(lo) ? lo : 0;
        return Math.max(lo, Math.min(hi, n));
    }

    function normalizeEvaluationLimit(value) {
        const raw = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_EVALUATION_LIMIT;
        const stepped = Math.round(raw / EVALUATION_LIMIT_STEP) * EVALUATION_LIMIT_STEP;
        return clamp(stepped, MIN_EVALUATION_LIMIT, MAX_EVALUATION_LIMIT);
    }

    function getSelectedEvaluationLimit() {
        return session ? normalizeEvaluationLimit(session.evaluationLimit) : DEFAULT_EVALUATION_LIMIT;
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function getParameterMetadataApi() {
        return (typeof ParameterMetadata !== 'undefined') ? ParameterMetadata : root.ParameterMetadata;
    }

    function getSessionApi() {
        return (typeof Session !== 'undefined') ? Session : root.Session;
    }

    function getPhysicsApi() {
        return (typeof Physics !== 'undefined') ? Physics : root.Physics;
    }

    function getKinematicsApi() {
        return (typeof Kinematics !== 'undefined') ? Kinematics : root.Kinematics;
    }

    function getKinematicsPresets() {
        return (typeof KINEMATICS_PRESETS !== 'undefined') ? KINEMATICS_PRESETS : root.KINEMATICS_PRESETS;
    }

    function getVariableMeta(id) {
        const parameterMetadata = getParameterMetadataApi();
        if (parameterMetadata && typeof parameterMetadata.get === 'function') {
            const meta = parameterMetadata.get(id);
            if (meta) return meta;
        }
        const el = getEl(id);
        return {
            id,
            label: id,
            unit: el ? (el.getAttribute('data-unit') || '') : '',
            min: el ? parseFloat(el.min) : undefined,
            max: el ? parseFloat(el.max) : undefined,
            step: el ? parseFloat(el.step) : undefined,
            precision: 2,
            category: 'general',
            notes: ''
        };
    }

    function categoryAlias(category) {
        const c = String(category || 'general');
        if (c.indexOf('counterweight') >= 0 || c.indexOf('rear_weight') >= 0) return 'counterweight';
        if (c.indexOf('cartridge_geometry') >= 0) return 'cartridge_geometry';
        if (c.indexOf('cartridge_physics') >= 0) return 'cartridge_physics';
        if (c.indexOf('kinematic') >= 0 || c === 'tonearm_kinematics') return 'kinematics';
        if (c.indexOf('rear') >= 0) return 'rear_geometry';
        if (c.indexOf('datum') >= 0 || c.indexOf('vertical') >= 0) return 'vertical_datum';
        if (c.indexOf('mass') >= 0 || c.indexOf('physics') >= 0) return 'mass';
        if (c.indexOf('geometry') >= 0 || c.indexOf('body') >= 0 || c.indexOf('profile') >= 0) return 'geometry';
        return c || 'general';
    }

    function normalizeSearchStrategy(value) {
        const key = String(value || DEFAULT_SEARCH_STRATEGY);
        return SEARCH_STRATEGIES[key] ? key : DEFAULT_SEARCH_STRATEGY;
    }

    function getSelectedSearchStrategy() {
        if (session && session.searchStrategy) return normalizeSearchStrategy(session.searchStrategy);
        const input = getEl('solverSearchStrategy');
        return normalizeSearchStrategy(input && input.value);
    }

    function getSearchStrategyDefinition(strategy) {
        return SEARCH_STRATEGIES[normalizeSearchStrategy(strategy)] || SEARCH_STRATEGIES[DEFAULT_SEARCH_STRATEGY];
    }

    function stableHash(text) {
        const s = String(text || '');
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return ('00000000' + (h >>> 0).toString(16)).slice(-8);
    }

    function variableHeuristicGroup(variable) {
        const key = String(variable && variable.key || '');
        const category = categoryAlias(variable && variable.category);
        if (/rearWeight|rearFineTrim|counterweight/i.test(key) || category === 'counterweight') return 'counterweight';
        if (/customMass|comp10|effectiveMass|resonance/i.test(key) || category === 'cartridge_physics' || category === 'mass') return 'mass_resonance';
        if (/maxH|maxW|tailD|Diameter|thick|neck/i.test(key)) return 'manufacturing';
        if (/cartX|pivotSpindle|apex|fullLength|Bend|geometry/i.test(key) || category === 'geometry' || category === 'cartridge_geometry' || category === 'rear_geometry') return 'geometry';
        if (/FineTrim|trim/i.test(key)) return 'fine_trim';
        return category || 'general';
    }

    function targetPriorityGroups(activeTargets) {
        const groups = [];
        function add(name) {
            if (groups.indexOf(name) < 0) groups.push(name);
        }
        (activeTargets || []).forEach(target => {
            const id = String(target && target.id || '');
            const metric = String(target && target.metricKey || '');
            const joined = `${id} ${metric}`.toLowerCase();
            if (joined.indexOf('tracking') >= 0 || joined.indexOf('force') >= 0) {
                add('counterweight');
                add('fine_trim');
            }
            if (joined.indexOf('resonance') >= 0 || joined.indexOf('effective_mass') >= 0 || joined.indexOf('mass') >= 0) {
                add('mass_resonance');
                add('counterweight');
            }
            if (joined.indexOf('counterweight') >= 0 || joined.indexOf('rear') >= 0) {
                add('counterweight');
            }
            if (joined.indexOf('diameter') >= 0 || joined.indexOf('manufacturing') >= 0 || joined.indexOf('build') >= 0) {
                add('manufacturing');
            }
            if (joined.indexOf('total_com') >= 0 || joined.indexOf('com') >= 0 || joined.indexOf('geometry') >= 0) {
                add('geometry');
                add('counterweight');
            }
        });
        return groups;
    }

    function mergeUniqueGroups(primary, fallback) {
        const out = [];
        (primary || []).concat(fallback || []).forEach(group => {
            const g = String(group || '').trim();
            if (g && out.indexOf(g) < 0) out.push(g);
        });
        return out;
    }

    function buildSolverPlan(strategy, unlocked, activeTargets) {
        const normalized = normalizeSearchStrategy(strategy);
        const def = getSearchStrategyDefinition(normalized);
        const targetGroups = targetPriorityGroups(activeTargets);
        const primaryGroups = normalized === 'smart_prioritized'
            ? mergeUniqueGroups(targetGroups, def.primaryGroups)
            : mergeUniqueGroups(def.primaryGroups, targetGroups);
        const passSequence = (def.passSequence || ['baseline', 'coarse', 'refine', 'fallback']).slice();
        return {
            strategy: normalized,
            strategyLabel: def.label,
            schedulerVersion: SOLVER_SCHEDULER_VERSION,
            mode: def.mode,
            primaryGroups,
            passSequence,
            refinementAroundTopN: normalized === 'exhaustive_order' ? 0 : 10,
            baselineNearFirst: normalized !== 'exhaustive_order',
            targetAwareOrdering: normalized !== 'exhaustive_order',
            deterministicSeed: 'signature-derived-' + stableHash(stableJson({
                strategy: normalized,
                groups: primaryGroups,
                targets: (activeTargets || []).map(target => target.id),
                variables: (unlocked || []).map(variable => variable.key)
            })),
            notes: [
                def.mode === 'exhaustive'
                    ? 'Exhaustive order preserves the sequential mixed-radix sweep for regression comparison.'
                    : 'Deterministic local heuristic ordering prioritizes baseline-near values, active target groups and coarse-to-fine passes.',
                'No external AI call or unseeded randomness is used.'
            ]
        };
    }

    function renderSearchStrategyControl() {
        const select = getEl('solverSearchStrategy');
        if (!select) return;
        const value = getSelectedSearchStrategy();
        select.value = value;
    }

    function updateSolverPlanSummary(plan) {
        const el = getEl('solverPlanSummary');
        if (!el) return;
        const currentPlan = plan || (session && session.solverPlan) || buildSolverPlan(getSelectedSearchStrategy(), session ? session.policy.filter(v => !v.locked) : [], session ? (session.targets || []).filter(t => t.enabled) : []);
        const label = currentPlan.strategyLabel || getSearchStrategyDefinition(currentPlan.strategy).label;
        const groups = (currentPlan.primaryGroups || []).join(', ') || 'none';
        const passes = (currentPlan.passSequence || []).join(' → ');
        const modeText = currentPlan.mode === 'exhaustive' ? 'exhaustive' : (currentPlan.mode === 'refinement' ? 'refinement' : 'prioritized');
        el.textContent = `Strategy: ${label} — ${modeText}. Passes: ${passes}. Priority groups: ${groups}.`;
    }

    function onSearchStrategyChange(evt) {
        if (!session) return;
        session.searchStrategy = normalizeSearchStrategy(evt && evt.target && evt.target.value);
        session.solverPlan = buildSolverPlan(
            session.searchStrategy,
            session.policy.filter(v => !v.locked),
            (session.targets || []).filter(target => target.enabled)
        );
        invalidateSolverSearch('Search strategy changed.');
        renderSearchStrategyControl();
        updateSolverPlanSummary(session.solverPlan);
        updateSearchSummary();
        renderSolverProgress();
    }



    function getCurrentValue(id, sourceState) {
        if (sourceState && isFiniteNumber(sourceState[id])) return Number(sourceState[id]);
        const el = getEl(id);
        if (el && isFiniteNumber(el.value)) return Number(el.value);
        return 0;
    }

    function inferBounds(id, meta, currentValue) {
        let min = isFiniteNumber(meta.min) ? Number(meta.min) : currentValue;
        let max = isFiniteNumber(meta.max) ? Number(meta.max) : currentValue;
        const el = getEl(id);
        if (el) {
            if (isFiniteNumber(el.min)) min = Number(el.min);
            if (isFiniteNumber(el.max)) max = Number(el.max);
        }
        if (min > max) {
            const tmp = min;
            min = max;
            max = tmp;
        }
        const span = Math.max(0, max - min);
        let safeMin = min;
        let safeMax = max;
        if (span === 0) {
            safeMin = currentValue;
            safeMax = currentValue;
        }
        return { min: safeMin, max: safeMax };
    }

    function inferStep(id, meta) {
        const el = getEl(id);
        let step = isFiniteNumber(meta.step) ? Number(meta.step) : 0.1;
        if (el && isFiniteNumber(el.step)) step = Number(el.step);
        if (id === 'rearWeightDiscCount') step = 1;
        return Math.max(0.0001, Math.abs(step || 0.1));
    }

    function buildVariablePolicy(snapshot) {
        const ids = DEFAULT_SOLVER_VARIABLES
            .filter((id, idx, arr) => arr.indexOf(id) === idx)
            .filter(id => isFiniteNumber(getCurrentValue(id, snapshot)) || !!getEl(id));

        return ids.map(id => {
            const meta = getVariableMeta(id);
            const currentValue = getCurrentValue(id, snapshot);
            const bounds = inferBounds(id, meta, currentValue);
            if (typeof isNonNegativeMassInput === 'function' && isNonNegativeMassInput(id)) {
                bounds.min = Math.max(0, Number(bounds.min));
                bounds.max = Math.max(bounds.min, Number(bounds.max));
            }
            const step = inferStep(id, meta);
            return {
                key: id,
                label: meta.label || id,
                category: categoryAlias(meta.category || 'general'),
                unit: meta.unit || '',
                currentValue,
                locked: !PREFERRED_UNLOCKED[id],
                min: bounds.min,
                max: bounds.max,
                step,
                hardSafetyMin: bounds.min,
                hardSafetyMax: bounds.max,
                precision: isFiniteNumber(meta.precision) ? Number(meta.precision) : 2,
                notes: meta.notes || meta.description || ''
            };
        }).sort((a, b) => {
            const ac = CATEGORY_ORDER.indexOf(a.category);
            const bc = CATEGORY_ORDER.indexOf(b.category);
            const ai = ac < 0 ? 99 : ac;
            const bi = bc < 0 ? 99 : bc;
            if (ai !== bi) return ai - bi;
            return a.label.localeCompare(b.label);
        });
    }

    function captureSnapshot() {
        if (getSessionApi() && typeof getSessionApi().collect === 'function') {
            const collected = getSessionApi().collect('solver_baseline_snapshot');
            return Object.assign({}, state, collected.inputs || {}, collected.selects || {}, collected.flags || {}, {
                cobraArchitecture: collected.cobraArchitecture ? deepClone(collected.cobraArchitecture) : deepClone(state.cobraArchitecture || {})
            });
        }
        return deepClone(state);
    }

    function refreshSnapshotFromDom() {
        if (typeof updateState === 'function') updateState();
        return captureSnapshot();
    }

    function getModal() {
        return getEl('solverModal');
    }

    function status(message, kind) {
        const el = getEl('solverStatus');
        if (!el) return;
        el.textContent = message || '';
        el.dataset.kind = kind || 'info';
    }

    function setOpen(open) {
        const modal = getModal();
        if (!modal) return;
        modal.classList.toggle('open', !!open);
        modal.setAttribute('aria-hidden', open ? 'false' : 'true');
        document.body.classList.toggle('solver-modal-open', !!open);
        if (!open) stopPreviewLoop();
    }

    function closeModal(reason) {
        if (!session) {
            setOpen(false);
            return;
        }
        if (session.isCalculating) {
            session.solverAbortRequested = true;
        }
        session.closedBy = reason || 'discard';
        setOpen(false);
        session = null;
        disposePreview();
    }

    function groupVariablesByCategory(policy) {
        return policy.reduce((acc, variable) => {
            if (!acc[variable.category]) acc[variable.category] = [];
            acc[variable.category].push(variable);
            return acc;
        }, {});
    }

    function variableRow(variable) {
        const checked = variable.locked ? '' : ' checked';
        const disabled = variable.locked ? ' disabled' : '';
        const unit = variable.unit ? ` <span class="solver-unit">${escapeHtml(variable.unit)}</span>` : '';
        return `
            <div class="solver-variable-row" data-var="${escapeHtml(variable.key)}">
                <label class="solver-variable-toggle" title="Unlock variable for brute-force search">
                    <input type="checkbox" class="solver-var-enabled" data-key="${escapeHtml(variable.key)}"${checked}>
                    <span>${escapeHtml(variable.label)}</span>${unit}
                </label>
                <div class="solver-current">current ${formatNumber(variable.currentValue, variable.precision)}</div>
                <div class="solver-range-grid">
                    <label>min <input type="number" class="solver-var-min" data-key="${escapeHtml(variable.key)}" value="${variable.min}" step="${variable.step}"${disabled}></label>
                    <label>max <input type="number" class="solver-var-max" data-key="${escapeHtml(variable.key)}" value="${variable.max}" step="${variable.step}"${disabled}></label>
                    <label>step <input type="number" class="solver-var-step" data-key="${escapeHtml(variable.key)}" value="${variable.step}" step="${variable.step}" min="0.0001"${disabled}></label>
                </div>
            </div>
        `;
    }

    function renderVariablePanel() {
        const panel = getEl('solverVariables');
        if (!panel || !session) return;
        const grouped = groupVariablesByCategory(session.policy);
        const html = Object.keys(grouped).map(category => `
            <section class="solver-variable-category">
                <h4>${escapeHtml(category.replace(/_/g, ' '))}</h4>
                ${grouped[category].map(variableRow).join('')}
            </section>
        `).join('');
        panel.innerHTML = html;
        panel.querySelectorAll('.solver-var-enabled').forEach(el => {
            el.addEventListener('change', onVariableLockChange);
        });
        ['min', 'max', 'step'].forEach(kind => {
            panel.querySelectorAll('.solver-var-' + kind).forEach(el => {
                el.addEventListener('input', onVariableRangeInput);
                el.addEventListener('change', onVariableRangeInput);
                el.addEventListener('blur', onVariableRangeInput);
                el.addEventListener('keydown', onVariableRangeKeydown);
            });
        });
    }

    function onVariableLockChange(evt) {
        const key = evt.target.dataset.key;
        const variable = session.policy.find(v => v.key === key);
        if (!variable) return;
        variable.locked = !evt.target.checked;
        const row = evt.target.closest('.solver-variable-row');
        if (row) {
            row.querySelectorAll('.solver-var-min,.solver-var-max,.solver-var-step').forEach(input => {
                input.disabled = variable.locked;
            });
        }
        invalidateSolverSearch('Variable lock state changed.');
        updateSearchSummary();
    }

    function onVariableRangeInput(evt) {
        if (!session || !evt || !evt.target) return;
        if (evt.type === 'input') {
            stageVariableInput(evt.target);
            return;
        }
        commitVariableInput(evt.target);
    }

    function onVariableRangeKeydown(evt) {
        if (!session || !evt || !evt.target) return;
        if (evt.key === 'Enter') {
            evt.preventDefault();
            commitVariableInput(evt.target);
        }
    }

    function renderEvaluationLimitControl() {
        const input = getEl('solverEvaluationLimit');
        const valueEl = getEl('solverEvaluationLimitValue');
        const limit = getSelectedEvaluationLimit();
        if (input) {
            input.min = String(MIN_EVALUATION_LIMIT);
            input.max = String(MAX_EVALUATION_LIMIT);
            input.step = String(EVALUATION_LIMIT_STEP);
            input.value = String(limit);
            input.setAttribute('aria-valuetext', `${limit.toLocaleString()} candidates`);
        }
        if (valueEl) valueEl.textContent = `${limit.toLocaleString()} candidates`;
    }

    function updateSearchSummary() {
        const unlocked = session ? session.policy.filter(v => !v.locked) : [];
        const selectedLimit = getSelectedEvaluationLimit();
        const est = estimateSearchSize(unlocked, selectedLimit);
        const el = getEl('solverSearchSummary');
        const plan = session && session.solverPlan
            ? session.solverPlan
            : buildSolverPlan(getSelectedSearchStrategy(), unlocked, session ? (session.targets || []).filter(target => target.enabled) : []);
        if (el) {
            const searchSession = session && session.solverSearchSession;
            const sameSignature = searchSession && searchSession.signature === buildSolverSearchSignature();
            const continuation = sameSignature
                ? ` Batch ${Number(searchSession.batchCount || 0)}, evaluated ${Number(searchSession.evaluatedCumulative || 0).toLocaleString()} / ${Number(searchSession.estimatedGridCount || est.raw).toLocaleString()}.`
                : '';
            const capText = est.raw > selectedLimit
                ? `batch limit ${selectedLimit.toLocaleString()} of estimated grid ${est.raw.toLocaleString()}`
                : `full estimated grid ${est.raw.toLocaleString()} within selected ${selectedLimit.toLocaleString()}`;
            const exhaustiveNote = plan.mode === 'exhaustive'
                ? 'Exhaustive order.'
                : 'Not exhaustive: candidate order is prioritized by active targets.';
            el.textContent = `${unlocked.length} unlocked variable(s), ${capText}. Strategy: ${plan.strategyLabel} — ${exhaustiveNote}${continuation}`;
        }
        updateSolverPlanSummary(plan);
    }

    function onEvaluationLimitInput(evt) {
        if (!session) return;
        session.evaluationLimit = normalizeEvaluationLimit(evt.target.value);
        session.maxEvaluations = session.evaluationLimit;
        invalidateSolverSearch('Evaluation limit changed.');
        renderEvaluationLimitControl();
        renderSearchStrategyControl();
        updateSolverPlanSummary(session.solverPlan);
        updateSearchSummary();
        renderSolverProgress();
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[c]);
    }

    function formatNumber(value, precision) {
        const p = Number.isFinite(Number(precision)) ? Number(precision) : 2;
        const n = Number(value);
        if (!Number.isFinite(n)) return '—';
        return Number(n.toFixed(Math.max(0, Math.min(4, p)))).toString();
    }

    function normalizeSolverNumericText(value) {
        return String(value == null ? '' : value).trim().replace(',', '.');
    }

    function isPartialSolverNumericText(value) {
        const text = String(value == null ? '' : value).trim();
        return text === '' ||
            text === '-' ||
            text === '+' ||
            text === '.' ||
            text === ',' ||
            text === '-.' ||
            text === '+.' ||
            text === '-,' ||
            text === '+,' ||
            /[.,]$/.test(text);
    }

    function parseCommittedSolverNumber(value) {
        const text = normalizeSolverNumericText(value);
        if (isPartialSolverNumericText(text)) return null;
        const n = Number(text);
        return Number.isFinite(n) ? n : null;
    }

    function ensureSolverEditBuffers() {
        if (!session) return null;
        if (!session.editBuffers) {
            session.editBuffers = {
                variables: Object.create(null),
                targets: Object.create(null),
                evaluationLimit: null
            };
        }
        return session.editBuffers;
    }

    function solverEditKey(key, kind) {
        return `${key}:${kind}`;
    }

    function hasClassName(el, className) {
        return el && String(el.className || '').split(/\s+/).indexOf(className) >= 0;
    }

    function variableInputKind(input) {
        if (hasClassName(input, 'solver-var-min')) return 'min';
        if (hasClassName(input, 'solver-var-max')) return 'max';
        if (hasClassName(input, 'solver-var-step')) return 'step';
        return '';
    }

    function targetInputKind(input) {
        if (hasClassName(input, 'solver-target-min')) return 'min';
        if (hasClassName(input, 'solver-target-max')) return 'max';
        if (hasClassName(input, 'solver-target-value')) return 'target';
        if (hasClassName(input, 'solver-target-tolerance')) return 'tolerance';
        if (hasClassName(input, 'solver-target-weight')) return 'weight';
        return '';
    }

    function isSolverEditInput(input) {
        return input && (
            hasClassName(input, 'solver-var-min') ||
            hasClassName(input, 'solver-var-max') ||
            hasClassName(input, 'solver-var-step') ||
            hasClassName(input, 'solver-target-input') ||
            input.id === 'solverEvaluationLimit'
        );
    }

    function markSolverInputPending(input, message) {
        if (!input || !input.classList) return;
        input.classList.add('solver-edit-pending');
        input.classList.remove('solver-edit-invalid');
        input.setAttribute('aria-invalid', 'false');
        input.title = message || 'Pending edit; commit with Enter, blur, or Run Solver.';
    }

    function markSolverInputInvalid(input, message) {
        if (!input || !input.classList) return;
        input.classList.add('solver-edit-invalid');
        input.classList.remove('solver-edit-pending');
        input.setAttribute('aria-invalid', 'true');
        input.title = message || 'Invalid value.';
    }

    function clearSolverInputEditState(input) {
        if (!input || !input.classList) return;
        input.classList.remove('solver-edit-pending');
        input.classList.remove('solver-edit-invalid');
        input.setAttribute('aria-invalid', 'false');
        input.title = '';
    }

    function captureActiveSolverInput() {
        const active = document.activeElement;
        if (!isSolverEditInput(active)) return null;
        const kind = variableInputKind(active) || targetInputKind(active) || (active.id === 'solverEvaluationLimit' ? 'evaluationLimit' : '');
        return {
            id: active.id || '',
            className: active.className || '',
            key: active.dataset ? (active.dataset.key || active.dataset.targetKey || '') : '',
            kind,
            selectionStart: Number.isFinite(active.selectionStart) ? active.selectionStart : null,
            selectionEnd: Number.isFinite(active.selectionEnd) ? active.selectionEnd : null
        };
    }

    function findSolverInputFromSnapshot(snapshot) {
        if (!snapshot) return null;
        if (snapshot.id) {
            const byId = getEl(snapshot.id);
            if (byId) return byId;
        }
        if (snapshot.key && snapshot.kind) {
            const selector = snapshot.className.indexOf('solver-target-input') >= 0
                ? `.solver-target-input[data-target-key="${snapshot.key}"]`
                : `[data-key="${snapshot.key}"]`;
            const candidates = Array.prototype.slice.call(document.querySelectorAll(selector));
            return candidates.find(el => {
                if (snapshot.kind === 'evaluationLimit') return el.id === 'solverEvaluationLimit';
                if (snapshot.className.indexOf('solver-target-input') >= 0) return targetInputKind(el) === snapshot.kind;
                return variableInputKind(el) === snapshot.kind;
            }) || null;
        }
        return null;
    }

    function restoreActiveSolverInput(snapshot) {
        const input = findSolverInputFromSnapshot(snapshot);
        if (!input || typeof input.focus !== 'function') return;
        input.focus();
        if (
            snapshot.selectionStart !== null &&
            snapshot.selectionEnd !== null &&
            typeof input.setSelectionRange === 'function'
        ) {
            try {
                input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
            } catch (err) {
                // Some input types such as range do not support text selection.
            }
        }
    }

    function withSolverFocusPreserved(renderFn) {
        const focusSnapshot = captureActiveSolverInput();
        const result = renderFn();
        restoreActiveSolverInput(focusSnapshot);
        return result;
    }

    function commitVariableInput(input) {
        if (!session || !input) return true;
        const key = input.dataset.key;
        const kind = variableInputKind(input);
        const variable = session.policy.find(v => v.key === key);
        if (!variable || !kind) return true;

        const parsed = parseCommittedSolverNumber(input.value);
        if (!Number.isFinite(parsed)) {
            markSolverInputInvalid(input, 'Enter a complete numeric value before running the solver.');
            status('Solver input is incomplete or invalid. Finish the value before running the solver.', 'warning');
            return false;
        }

        if (kind === 'step') {
            if (parsed <= 0) {
                markSolverInputInvalid(input, 'Step must be greater than zero.');
                status('Solver step must be greater than zero.', 'warning');
                return false;
            }
            variable.step = Math.max(0.0001, Math.abs(parsed));
            input.value = String(variable.step);
        } else {
            const lo = Number(variable.hardSafetyMin);
            const hi = Number(variable.hardSafetyMax);
            if (Number.isFinite(lo) && parsed < lo) {
                markSolverInputInvalid(input, `Value is below the hard safety minimum ${lo}.`);
                status(`Solver ${kind} is below the hard safety minimum ${formatNumber(lo, variable.precision)}.`, 'warning');
                return false;
            }
            if (Number.isFinite(hi) && parsed > hi) {
                markSolverInputInvalid(input, `Value is above the hard safety maximum ${hi}.`);
                status(`Solver ${kind} is above the hard safety maximum ${formatNumber(hi, variable.precision)}.`, 'warning');
                return false;
            }
            if (kind === 'min' && parsed > Number(variable.max)) {
                markSolverInputInvalid(input, 'Minimum must be less than or equal to maximum.');
                status('Solver variable minimum must be less than or equal to maximum.', 'warning');
                return false;
            }
            if (kind === 'max' && parsed < Number(variable.min)) {
                markSolverInputInvalid(input, 'Maximum must be greater than or equal to minimum.');
                status('Solver variable maximum must be greater than or equal to minimum.', 'warning');
                return false;
            }
            const committed = (typeof isNonNegativeMassInput === 'function' && isNonNegativeMassInput(key)) ? Math.max(0, parsed) : parsed;
            variable[kind] = committed;
            input.value = String(committed);
        }

        const buffers = ensureSolverEditBuffers();
        if (buffers) delete buffers.variables[solverEditKey(key, kind)];
        clearSolverInputEditState(input);
        invalidateSolverSearch('Variable range changed.');
        updateSearchSummary();
        return true;
    }

    function stageVariableInput(input) {
        if (!session || !input) return;
        const buffers = ensureSolverEditBuffers();
        const key = input.dataset.key;
        const kind = variableInputKind(input);
        if (!buffers || !key || !kind) return;
        buffers.variables[solverEditKey(key, kind)] = input.value;
        const parsed = parseCommittedSolverNumber(input.value);
        if (!Number.isFinite(parsed)) {
            if (isPartialSolverNumericText(input.value)) {
                markSolverInputPending(input, 'Pending partial number; commit with Enter, blur, or Run Solver.');
            } else {
                markSolverInputInvalid(input, 'Invalid number; fix before committing.');
            }
        } else {
            markSolverInputPending(input, 'Pending solver edit; commit with Enter, blur, or Run Solver.');
        }
    }

    function commitTargetInput(input) {
        if (!session || !input) return true;
        const key = input.dataset.targetKey;
        const kind = targetInputKind(input);
        const target = session.targets.find(item => item.id === key);
        if (!target || !kind) return true;

        const parsed = parseCommittedSolverNumber(input.value);
        if (!Number.isFinite(parsed)) {
            markSolverInputInvalid(input, 'Enter a complete numeric value before running the solver.');
            status('Solver target input is incomplete or invalid. Finish the value before running the solver.', 'warning');
            return false;
        }

        if (kind === 'min') {
            if (parsed > Number(target.max)) {
                markSolverInputInvalid(input, 'Minimum must be less than or equal to maximum.');
                status('Target minimum must be less than or equal to maximum.', 'warning');
                return false;
            }
            target.min = parsed;
            input.value = String(parsed);
        } else if (kind === 'max') {
            if (parsed < Number(target.min)) {
                markSolverInputInvalid(input, 'Maximum must be greater than or equal to minimum.');
                status('Target maximum must be greater than or equal to minimum.', 'warning');
                return false;
            }
            target.max = parsed;
            input.value = String(parsed);
        } else if (kind === 'target') {
            target.target = parsed;
            input.value = String(parsed);
        } else if (kind === 'tolerance') {
            if (parsed <= 0) {
                markSolverInputInvalid(input, 'Tolerance must be greater than zero.');
                status('Target tolerance must be greater than zero.', 'warning');
                return false;
            }
            target.tolerance = Math.max(0.0001, Math.abs(parsed));
            input.value = String(target.tolerance);
        } else if (kind === 'weight') {
            if (parsed < 0) {
                markSolverInputInvalid(input, 'Weight must not be negative.');
                status('Target weight must not be negative.', 'warning');
                return false;
            }
            target.weight = parsed;
            input.value = String(parsed);
        }

        const buffers = ensureSolverEditBuffers();
        if (buffers) delete buffers.targets[solverEditKey(key, kind)];
        clearSolverInputEditState(input);
        invalidateSolverSearch('Target value changed.');
        withSolverFocusPreserved(renderTargetPanel);
        return true;
    }

    function stageTargetInput(input) {
        if (!session || !input) return;
        const buffers = ensureSolverEditBuffers();
        const key = input.dataset.targetKey;
        const kind = targetInputKind(input);
        if (!buffers || !key || !kind) return;
        buffers.targets[solverEditKey(key, kind)] = input.value;
        const parsed = parseCommittedSolverNumber(input.value);
        if (!Number.isFinite(parsed)) {
            if (isPartialSolverNumericText(input.value)) {
                markSolverInputPending(input, 'Pending partial number; commit with Enter, blur, or Run Solver.');
            } else {
                markSolverInputInvalid(input, 'Invalid number; fix before committing.');
            }
        } else {
            markSolverInputPending(input, 'Pending solver target edit; commit with Enter, blur, or Run Solver.');
        }
    }

    function rescoreResultsAfterTargetCommit() {
        if (!session || !(session.results && session.results.length)) {
            withSolverFocusPreserved(renderTargetPanel);
            return;
        }
        session.results.forEach(result => {
            result.scoring = scoreCandidateWithTargets(result.metrics, session.targets);
            result.penalty = result.scoring.penalty;
            result.score = result.scoring.uiScore;
            result.invalid = result.scoring.hardViolation;
        });
        session.results = session.results
            .filter(result => !result.invalid)
            .sort((a, b) => a.penalty - b.penalty)
            .slice(0, 25);
        session.selectedIndex = session.results.length ? 0 : -1;
        session.selectedCandidate = session.results[session.selectedIndex] || null;
        renderResults();
        if (session.selectedCandidate) renderCandidatePreview(session.selectedCandidate);
        withSolverFocusPreserved(renderTargetPanel);
    }

    function commitAllSolverEdits() {
        if (!session) return true;
        const inputs = Array.prototype.slice.call(document.querySelectorAll(
            '.solver-var-min,.solver-var-max,.solver-var-step,.solver-target-input'
        ));
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const isPending = input.classList && (
                input.classList.contains('solver-edit-pending') ||
                input.classList.contains('solver-edit-invalid')
            );
            if (!isPending) continue;
            const ok = hasClassName(input, 'solver-target-input') ? commitTargetInput(input) : commitVariableInput(input);
            if (!ok) {
                if (typeof input.focus === 'function') input.focus();
                return false;
            }
        }
        return true;
    }

    function makeSamples(variable) {
        const min = clamp(variable.min, variable.hardSafetyMin, variable.hardSafetyMax);
        const max = clamp(variable.max, variable.hardSafetyMin, variable.hardSafetyMax);
        const step = Math.max(0.0001, Math.abs(Number(variable.step) || 0.1));
        if (max <= min) return [roundToStep(min, step)];
        const theoretical = Math.floor((max - min) / step) + 1;
        const samples = [];
        if (theoretical <= MAX_SAMPLES_PER_VARIABLE) {
            for (let v = min; v <= max + step * 0.5; v += step) {
                samples.push(roundToStep(v, step));
            }
        } else {
            const slots = MAX_SAMPLES_PER_VARIABLE;
            for (let i = 0; i < slots; i++) {
                samples.push(roundToStep(min + (max - min) * (i / (slots - 1)), step));
            }
            samples.push(roundToStep(variable.currentValue, step));
        }
        const unique = samples
            .map(v => (typeof isNonNegativeMassInput === 'function' && isNonNegativeMassInput(variable.key)) ? Math.max(0, v) : v)
            .map(v => clamp(v, min, max))
            .filter((v, idx, arr) => arr.indexOf(v) === idx);
        if (variable.key === 'rearWeightDiscCount') return unique.map(v => Math.max(0, Math.round(v)));
        return unique;
    }

    function estimateSearchSize(unlocked, evaluationLimit) {
        const limit = normalizeEvaluationLimit(evaluationLimit || getSelectedEvaluationLimit());
        let raw = 1;
        unlocked.forEach(variable => {
            raw *= Math.max(1, makeSamples(variable).length);
        });
        return {
            raw,
            selectedEvaluationLimit: limit,
            capped: Math.min(raw, limit)
        };
    }

    function scheduleSolverChunk(fn) {
        if (typeof root.requestIdleCallback === 'function') {
            root.requestIdleCallback(fn, { timeout: 50 });
        } else if (typeof root.requestAnimationFrame === 'function') {
            root.requestAnimationFrame(() => root.setTimeout(fn, 0));
        } else {
            root.setTimeout(fn, 0);
        }
    }

    function cancelActiveSolver(reason) {
        if (!session || !session.isCalculating) return;
        session.solverAbortRequested = true;
        status(reason || 'Calculation cancelled.', 'warning');
        renderSolverProgress();
    }

    function computeApproximateMaxDiameter(currentState) {
        const candidates = [
            currentState && currentState.maxH,
            currentState && currentState.maxW,
            currentState && currentState.tailD,
            currentState && currentState.rearMouthWidth,
            currentState && currentState.rearWeightDiscDiameter
        ].map(Number).filter(Number.isFinite);
        return candidates.length ? Math.max.apply(null, candidates) : 0;
    }

    function estimateCounterweightComFallback(currentState) {
        const physics = getPhysicsApi();
        const terminal = physics && typeof physics.getRearTerminalCenter === 'function'
            ? physics.getRearTerminalCenter(currentState)
            : null;
        const count = Math.max(0, Math.round(Number(currentState && currentState.rearWeightDiscCount || 0)));
        const thickness = Math.max(0, Number(currentState && currentState.rearWeightDiscThickness || 0));
        if (terminal && terminal.available === true && Number.isFinite(Number(terminal.x)) && Number.isFinite(Number(terminal.z))) {
            return {
                x: Number(terminal.x),
                z: Number(terminal.z) - ((count > 0 && thickness > 0) ? (count * thickness / 2) : (thickness || 0) / 2),
                source: count > 0 ? 'rear_terminal_top_anchored_downward_stack_estimate' : 'rear_terminal_estimate_no_active_stack',
                estimated: true,
                available: true
            };
        }
        return { x: null, z: null, source: 'not_available', estimated: true, available: false };
    }

    function getCandidateMetrics(candidateState) {
        const physics = getPhysicsApi();
        const mode = candidateState.cartMode || 'g1042';
        const rings = (typeof GLOBAL_RINGSCache !== 'undefined' && GLOBAL_RINGSCache) ? GLOBAL_RINGSCache : [];
        const analysis = physics && typeof physics.getComprehensiveAnalysis === 'function'
            ? physics.getComprehensiveAnalysis(candidateState, mode, rings)
            : null;

        const effectiveLength = physics && typeof physics.getEffectiveLength === 'function'
            ? physics.getEffectiveLength(candidateState, mode)
            : 0;
        const effectiveMass = analysis && analysis.inertia && physics && typeof physics.calculateEffectiveMass === 'function'
            ? physics.calculateEffectiveMass(analysis.inertia.Iyy || 0, effectiveLength)
            : 0;
        const compliance = Number(candidateState.comp10 || 13);
        const resonance = physics && typeof physics.calculateResonance === 'function'
            ? physics.calculateResonance(effectiveMass, compliance)
            : 0;

        const total = analysis && analysis.c_total ? analysis.c_total : {};
        const counterweight = analysis && analysis.c_rear_weights ? analysis.c_rear_weights
            : (physics && typeof physics.getRearWeightCOM === 'function' ? physics.getRearWeightCOM(candidateState) : null);
        const counterweightFallback = (!counterweight || counterweight.available === false) ? estimateCounterweightComFallback(candidateState) : null;
        const rear = analysis && analysis.c_rear ? analysis.c_rear : {};
        const trackingForce = analysis && analysis.trackingForce ? (analysis.trackingForce.gf || 0) : 0;
        const maxDiameterEstimated = computeApproximateMaxDiameter(candidateState);

        return {
            analysis,
            effectiveLength,
            effectiveMass,
            resonance,
            totalMass: total && Number.isFinite(Number(total.mass)) ? Number(total.mass) : 0,
            totalCOMX: total && Number.isFinite(Number(total.x)) ? Number(total.x) : null,
            totalCOMZ: total && Number.isFinite(Number(total.z)) ? Number(total.z) : null,
            rearCOMX: rear && Number.isFinite(Number(rear.x)) ? Number(rear.x) : null,
            rearCOMZ: rear && Number.isFinite(Number(rear.z)) ? Number(rear.z) : null,
            counterweightCOMX: counterweight && Number.isFinite(Number(counterweight.x)) ? Number(counterweight.x)
                : (counterweightFallback && Number.isFinite(Number(counterweightFallback.x)) ? Number(counterweightFallback.x) : null),
            counterweightCOMZ: counterweight && Number.isFinite(Number(counterweight.z)) ? Number(counterweight.z)
                : (counterweightFallback && Number.isFinite(Number(counterweightFallback.z)) ? Number(counterweightFallback.z) : null),
            counterweightCOMAvailable: !!(counterweight && counterweight.available !== false && Number(counterweight.mass || counterweight.massG || 0) > 0),
            counterweightCOMEstimated: !(counterweight && counterweight.available !== false && Number(counterweight.mass || counterweight.massG || 0) > 0),
            counterweightCOMSource: counterweight && counterweight.source
                ? counterweight.source
                : (counterweightFallback ? counterweightFallback.source : 'not_available'),
            trackingForce,
            maxDiameterEstimated,
            maxDiameterIsEstimated: true
        };
    }

    function getMetricValue(metrics, metricKey) {
        if (!metrics) return null;
        const value = metrics[metricKey];
        return Number.isFinite(Number(value)) ? Number(value) : null;
    }

    function targetDisplayValue(target, metrics) {
        const value = getMetricValue(metrics, target.metricKey);
        return value === null ? 'not available' : `${formatNumber(value, target.precision)} ${target.unit || ''}${target.estimated ? ' estimated' : ''}`;
    }

    function makePointTarget(id, label, metricKey, unit, target, tolerance, weight, enabled, precision, estimated) {
        return {
            id,
            kind: 'point',
            label,
            metricKey,
            unit,
            target: Number.isFinite(Number(target)) ? Number(target) : 0,
            tolerance: Math.max(0.0001, Math.abs(Number(tolerance) || 1)),
            weight: Math.max(0, Number(weight) || 1),
            enabled: enabled !== false,
            precision: Number.isFinite(Number(precision)) ? Number(precision) : 2,
            hard: false,
            estimated: !!estimated,
            status: 'idle'
        };
    }

    function makeRangeTarget(id, label, metricKey, unit, min, max, weight, enabled, precision, hard, estimated) {
        const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
        const hi = Number.isFinite(Number(max)) ? Number(max) : lo;
        return {
            id,
            kind: 'range',
            label,
            metricKey,
            unit,
            min: Math.min(lo, hi),
            max: Math.max(lo, hi),
            weight: Math.max(0, Number(weight) || 1),
            enabled: enabled !== false,
            precision: Number.isFinite(Number(precision)) ? Number(precision) : 2,
            hard: !!hard,
            estimated: !!estimated,
            status: 'idle'
        };
    }

    function buildDefaultTargets(snapshot) {
        const currentMetrics = withVirtualState(snapshot, () => getCandidateMetrics(snapshot));
        const currentMaxDiameter = getMetricValue(currentMetrics, 'maxDiameterEstimated') || Number(snapshot.maxW || 34);
        const targetVTF = Number(snapshot.targetVTF || currentMetrics.trackingForce || 2);
        const targetEffectiveMass = Number(snapshot.targetEffectiveMass || currentMetrics.effectiveMass || 12);
        const targetResonance = Number(snapshot.targetLFResonance || currentMetrics.resonance || 10);

        return [
            makePointTarget('tracking_force', 'Tracking force / needle pressure', 'trackingForce', 'g', targetVTF, 0.1, 25, true, 2, false),
            makePointTarget('total_com_z', 'Total tonearm COM Z', 'totalCOMZ', 'mm', currentMetrics.totalCOMZ, 1.0, 4, true, 2, false),
            makePointTarget('counterweight_com_z', 'Counterweight COM Z', 'counterweightCOMZ', 'mm', currentMetrics.counterweightCOMZ, 1.0, 4, true, 2, currentMetrics.counterweightCOMEstimated),
            makeRangeTarget('diameter_range', 'Diameter manufacturing constraint', 'maxDiameterEstimated', 'mm', Math.max(4, Number(snapshot.tailD || 6)), Math.max(35, currentMaxDiameter), 1000, true, 2, true, true),
            makeRangeTarget('resonance_window', 'LF resonance window', 'resonance', 'Hz', Math.max(5, targetResonance - 2), Math.min(16, targetResonance + 2), 30, true, 2, false, false),
            makeRangeTarget('effective_mass_range', 'Effective mass range', 'effectiveMass', 'g', Math.max(1, targetEffectiveMass - 2), Math.max(2, targetEffectiveMass + 2), 5, true, 2, false, false),
            makePointTarget('total_com_x', 'Total tonearm COM X', 'totalCOMX', 'mm', currentMetrics.totalCOMX, 2.0, 2, false, 2, false),
            makePointTarget('counterweight_com_x', 'Counterweight COM X', 'counterweightCOMX', 'mm', currentMetrics.counterweightCOMX, 2.0, 2, false, 2, currentMetrics.counterweightCOMEstimated)
        ];
    }

    function evaluateTarget(target, metrics) {
        const value = getMetricValue(metrics, target.metricKey);
        if (!target.enabled) {
            return {
                id: target.id,
                label: target.label,
                enabled: false,
                contributes: false,
                value,
                delta: null,
                penalty: 0,
                status: 'disabled',
                message: 'inactive'
            };
        }
        if (value === null) {
            const penalty = 10000 * Math.max(1, target.weight || 1);
            return {
                id: target.id,
                label: target.label,
                enabled: true,
                contributes: true,
                value: null,
                delta: null,
                penalty,
                hardViolation: !!target.hard,
                status: 'fail',
                message: 'not available'
            };
        }

        let delta = 0;
        let penalty = 0;
        let status = 'pass';
        let message = 'pass';

        if (target.kind === 'range') {
            if (value < target.min) {
                delta = value - target.min;
                status = target.hard ? 'fail' : 'warning';
                message = `${formatNumber(Math.abs(delta), target.precision)} ${target.unit || ''} below min`;
            } else if (value > target.max) {
                delta = value - target.max;
                status = target.hard ? 'fail' : 'warning';
                message = `${formatNumber(Math.abs(delta), target.precision)} ${target.unit || ''} above max`;
            }
            if (delta !== 0) {
                const span = Math.max(0.0001, Math.abs(target.max - target.min) || 1);
                penalty = Math.pow(Math.abs(delta) / span, 2) * target.weight;
            }
        } else {
            delta = value - target.target;
            const tolerance = Math.max(0.0001, Math.abs(Number(target.tolerance) || 1));
            const normalized = Math.max(0, Math.abs(delta) - tolerance) / tolerance;
            penalty = Math.pow(normalized, 2) * target.weight;
            if (Math.abs(delta) > tolerance * 2) status = 'fail';
            else if (Math.abs(delta) > tolerance) status = 'warning';
            message = `${delta >= 0 ? '+' : ''}${formatNumber(delta, target.precision)} ${target.unit || ''}`;
        }

        return {
            id: target.id,
            label: target.label,
            enabled: true,
            contributes: true,
            value,
            delta,
            penalty: Number.isFinite(penalty) ? penalty : Number.POSITIVE_INFINITY,
            hardViolation: !!target.hard && status === 'fail',
            status,
            message
        };
    }

    function scoreCandidateWithTargets(metrics, targets) {
        const details = (targets || []).map(target => evaluateTarget(target, metrics));
        const activeDetails = details.filter(detail => detail.enabled && detail.contributes);
        const hardViolation = activeDetails.some(detail => detail.hardViolation);
        const activeTargetPenalty = activeDetails.reduce((sum, detail) => sum + (Number.isFinite(detail.penalty) ? detail.penalty : 1000000), 0);
        const tieBreakerPenalty = Math.abs(Number(metrics.totalCOMZ || 0)) * 0.01;
        const penalty = activeTargetPenalty + tieBreakerPenalty;
        const uiScore = 1000 / (1 + Math.max(0, penalty));
        return {
            penalty,
            uiScore,
            hardViolation,
            activeTargetIds: activeDetails.map(detail => detail.id),
            details,
            uiScoreTransform: '1000 / (1 + activeTargetPenalty + tieBreakerPenalty)'
        };
    }

    function renderTargetControls(target) {
        const disabled = target.enabled ? '' : ' disabled';
        if (target.kind === 'range') {
            return `
                <label>Min <input class="solver-target-input solver-target-min" data-target-key="${target.id}" type="number" value="${formatNumber(target.min, target.precision)}" step="0.1"${disabled}></label>
                <label>Max <input class="solver-target-input solver-target-max" data-target-key="${target.id}" type="number" value="${formatNumber(target.max, target.precision)}" step="0.1"${disabled}></label>
                <label>Weight <input class="solver-target-input solver-target-weight" data-target-key="${target.id}" type="number" value="${formatNumber(target.weight, 2)}" min="0" step="0.5"${disabled}></label>
            `;
        }
        return `
            <label>Target <input class="solver-target-input solver-target-value" data-target-key="${target.id}" type="number" value="${formatNumber(target.target, target.precision)}" step="0.1"${disabled}></label>
            <label>Tolerance <input class="solver-target-input solver-target-tolerance" data-target-key="${target.id}" type="number" value="${formatNumber(target.tolerance, target.precision)}" min="0.0001" step="0.1"${disabled}></label>
            <label>Weight <input class="solver-target-input solver-target-weight" data-target-key="${target.id}" type="number" value="${formatNumber(target.weight, 2)}" min="0" step="0.5"${disabled}></label>
        `;
    }

    function renderTargetPanel() {
        const panel = getEl('solverTargets');
        if (!panel || !session) return;
        const selected = session.results && session.selectedIndex >= 0 ? session.results[session.selectedIndex] : null;
        const selectedMetrics = selected ? selected.metrics : null;
        panel.innerHTML = session.targets.map(target => {
            const currentValue = targetDisplayValue(target, session.currentMetrics);
            const candidateValue = selectedMetrics ? targetDisplayValue(target, selectedMetrics) : '—';
            const detail = selected && selected.scoring ? selected.scoring.details.find(item => item.id === target.id) : null;
            const statusClass = detail ? detail.status : (target.enabled ? 'idle' : 'disabled');
            const statusText = detail ? detail.message : (target.enabled ? 'waiting for candidate' : 'inactive');
            return `
                <div class="solver-target-row solver-target-${statusClass}">
                    <label class="solver-target-toggle">
                        <input class="solver-target-enabled" data-target-key="${target.id}" type="checkbox" ${target.enabled ? 'checked' : ''}>
                        <span>${escapeHtml(target.label)}</span>
                        <span class="solver-unit">${escapeHtml(target.unit || '')}${target.hard ? ' · hard' : ''}${target.estimated ? ' · estimated' : ''}</span>
                    </label>
                    <div class="solver-target-grid">${renderTargetControls(target)}</div>
                    <div class="solver-target-measures">
                        <span>Current: ${escapeHtml(currentValue)}</span>
                        <span>Selected: ${escapeHtml(candidateValue)}</span>
                        <span class="solver-target-status">${escapeHtml(statusText)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function onTargetInput(evt) {
        if (!session || !evt || !evt.target) return;
        const key = evt.target.dataset.targetKey;
        const target = session.targets.find(item => item.id === key);
        if (!target) return;

        if (hasClassName(evt.target, 'solver-target-enabled')) {
            target.enabled = !!evt.target.checked;
            const row = evt.target.closest('.solver-target-row');
            if (row) {
                row.querySelectorAll('.solver-target-input').forEach(input => {
                    input.disabled = !target.enabled;
                });
            }
            invalidateSolverSearch('Target enabled state changed.');
            return;
        }

        if (!hasClassName(evt.target, 'solver-target-input')) return;
        if (evt.type === 'input') {
            stageTargetInput(evt.target);
            return;
        }
        commitTargetInput(evt.target);
    }

    function onTargetKeydown(evt) {
        if (!session || !evt || !evt.target) return;
        if (evt.key === 'Enter' && hasClassName(evt.target, 'solver-target-input')) {
            evt.preventDefault();
            commitTargetInput(evt.target);
        }
    }

    function renderSolverProgress() {
        const spinner = getEl('solverSpinner');
        const text = getEl('solverProgressText');
        const runBtn = getEl('solverRunBtn');
        const cancelBtn = getEl('solverCancelBtn');
        if (!session) {
            if (spinner) spinner.hidden = true;
            if (text) text.textContent = 'Idle.';
            if (runBtn) {
                runBtn.disabled = false;
                runBtn.textContent = 'Run Solver';
            }
            return;
        }
        const searchSession = session.solverSearchSession;
        const selectedLimit = getSelectedEvaluationLimit();
        const continuation = hasContinuationAvailable();
        const exhausted = searchSession && searchSession.signature === buildSolverSearchSignature() && searchSession.exhausted;
        if (spinner) spinner.hidden = !session.isCalculating;
        if (runBtn) {
            runBtn.disabled = !!session.isCalculating || !!exhausted;
            runBtn.textContent = session.isCalculating
                ? 'Calculating…'
                : exhausted
                    ? 'Search Complete'
                    : continuation
                        ? 'Continue Search'
                        : 'Run Solver';
        }
        if (cancelBtn) cancelBtn.disabled = !session.isCalculating;
        if (text) {
            const evaluated = Number(session.evaluatedCount || 0);
            const capped = Number(session.cappedEvaluationCount || Math.min(Number(session.estimatedGridCount || 0), selectedLimit));
            const estimated = Number(session.estimatedGridCount || (searchSession && searchSession.estimatedGridCount) || 0);
            const cumulative = Number(searchSession && searchSession.evaluatedCumulative || 0) + (session.isCalculating ? evaluated : 0);
            const batch = Number(searchSession && searchSession.batchCount || 0);
            const pct = capped > 0 ? Math.min(100, Math.round((evaluated / capped) * 100)) : 0;
            const plan = session.solverPlan || (searchSession && searchSession.solverPlan) || buildSolverPlan(getSelectedSearchStrategy(), session.policy.filter(v => !v.locked), (session.targets || []).filter(target => target.enabled));
            const strategyLabel = plan.strategyLabel || getSearchStrategyDefinition(plan.strategy).label;
            const stage = searchSession && searchSession.lastStage ? searchSession.lastStage.passLabel : ((plan.passSequence || [])[0] || 'ready');
            if (session.isCalculating) {
                text.textContent = `Strategy: ${strategyLabel} — ${stage}. Batch ${batch}, evaluating ${evaluated.toLocaleString()} / ${capped.toLocaleString()} (${pct}%). Cumulative ${cumulative.toLocaleString()} / ${estimated.toLocaleString()}.`;
            } else if (exhausted) {
                text.textContent = `Search Complete. Strategy: ${strategyLabel}. Evaluated ${Number(searchSession.evaluatedCumulative || 0).toLocaleString()} / ${Number(searchSession.estimatedGridCount || 0).toLocaleString()} candidates.`;
            } else if (continuation) {
                text.textContent = `Continue Search available. Strategy: ${strategyLabel}. Evaluated ${Number(searchSession.evaluatedCumulative || 0).toLocaleString()} / ${Number(searchSession.estimatedGridCount || 0).toLocaleString()} candidates across ${batch} batch(es).`;
            } else if (searchSession && searchSession.signature !== buildSolverSearchSignature()) {
                text.textContent = `Settings changed. Run Solver starts a new ${strategyLabel} search session with limit ${selectedLimit.toLocaleString()}.`;
            } else {
                text.textContent = `Idle. Strategy: ${strategyLabel}. Evaluation limit ${selectedLimit.toLocaleString()} candidates.`;
            }
        }
    }

    function buildCandidateFromLinearIndex(linearIndex, samples, baseline) {
        let cursor = Math.max(0, Math.floor(Number(linearIndex) || 0));
        const values = {};
        const candidate = Object.assign({}, baseline);
        samples.forEach(item => {
            const choices = item.values;
            const pick = choices.length ? choices[cursor % choices.length] : item.variable.current;
            cursor = Math.floor(cursor / Math.max(1, choices.length));
            values[item.variable.key] = pick;
            candidate[item.variable.key] = pick;
        });
        return { values, candidate };
    }

    function orderedSampleValuesForPlan(item, plan) {
        const values = (item && item.values ? item.values.slice() : []).filter(value => Number.isFinite(Number(value)));
        if (!values.length || !plan || plan.strategy === 'exhaustive_order') return values;
        const variable = item.variable || {};
        const current = Number(variable.currentValue != null ? variable.currentValue : variable.current);
        const min = Math.min.apply(null, values);
        const max = Math.max.apply(null, values);
        const mid = (min + max) / 2;
        const baselineNear = values.slice().sort((a, b) => {
            const da = Math.abs(Number(a) - current);
            const db = Math.abs(Number(b) - current);
            if (da !== db) return da - db;
            return Number(a) - Number(b);
        });
        const coarse = [current, min, max, mid].map(v => roundToStep(v, variable.step || 0.1))
            .map(v => clamp(v, min, max));
        const out = [];
        coarse.concat(baselineNear).forEach(value => {
            const n = Number(value);
            if (Number.isFinite(n) && out.indexOf(n) < 0) out.push(n);
        });
        return out;
    }

    function orderSamplesForPlan(samples, plan) {
        if (!plan || plan.strategy === 'exhaustive_order') return samples.map(item => ({
            variable: item.variable,
            values: item.values.slice(),
            heuristicGroup: variableHeuristicGroup(item.variable)
        }));
        const groupRank = Object.create(null);
        (plan.primaryGroups || []).forEach((group, index) => { groupRank[group] = index; });
        return samples.map(item => ({
            variable: item.variable,
            values: orderedSampleValuesForPlan(item, plan),
            heuristicGroup: variableHeuristicGroup(item.variable)
        })).sort((a, b) => {
            const ar = Object.prototype.hasOwnProperty.call(groupRank, a.heuristicGroup) ? groupRank[a.heuristicGroup] : 99;
            const br = Object.prototype.hasOwnProperty.call(groupRank, b.heuristicGroup) ? groupRank[b.heuristicGroup] : 99;
            if (ar !== br) return ar - br;
            return String(a.variable.key).localeCompare(String(b.variable.key));
        });
    }

    function classifySchedulerCursor(cursor, plan, selectedLimit) {
        const passes = (plan && plan.passSequence && plan.passSequence.length) ? plan.passSequence : ['exhaustive'];
        const limit = Math.max(1, Number(selectedLimit) || DEFAULT_EVALUATION_LIMIT);
        const slot = Math.floor((Number(cursor) || 0) % limit);
        const passIndex = Math.min(passes.length - 1, Math.floor((slot / limit) * passes.length));
        const stage = passes[passIndex] || passes[0] || 'exhaustive';
        return {
            stage,
            passIndex,
            passLabel: stage.replace(/_/g, ' '),
            source: stage.indexOf('refine') >= 0
                ? 'local refinement'
                : stage.indexOf('counterweight') >= 0
                    ? 'counterweight priority pass'
                    : stage.indexOf('geometry') >= 0
                        ? 'geometry priority pass'
                        : stage.indexOf('resonance') >= 0
                            ? 'coarse resonance pass'
                            : stage === 'baseline'
                                ? 'baseline-near pass'
                                : stage === 'exhaustive'
                                    ? 'exhaustive order'
                                    : 'coarse prioritized scan'
        };
    }

    function candidateKeyFromValues(values) {
        return stableJson(values || {});
    }

    function buildCandidateFromSchedulerCursor(schedulerCursor, orderedSamples, baseline, plan, searchSession) {
        const stage = classifySchedulerCursor(schedulerCursor, plan, searchSession && searchSession.selectedLimit);
        const built = buildCandidateFromLinearIndex(schedulerCursor, orderedSamples, baseline);
        const key = candidateKeyFromValues(built.values);
        built.scheduler = {
            cursor: Math.max(0, Math.floor(Number(schedulerCursor) || 0)),
            strategy: plan ? plan.strategy : 'exhaustive_order',
            schedulerVersion: SOLVER_SCHEDULER_VERSION,
            pass: stage.stage,
            passLabel: stage.passLabel,
            source: stage.source,
            candidateKey: key
        };
        return built;
    }

    function makeCandidateScheduler(samples, baseline, solverPlan, searchSession) {
        const orderedSamples = orderSamplesForPlan(samples, solverPlan);
        return {
            solverPlan,
            orderedSamples,
            next(cursor) {
                return buildCandidateFromSchedulerCursor(cursor, orderedSamples, baseline, solverPlan, searchSession);
            }
        };
    }



    function withVirtualState(candidateState, fn) {
        const savedState = deepClone(state);
        const savedRings = (typeof GLOBAL_RINGSCache !== 'undefined' && Array.isArray(GLOBAL_RINGSCache))
            ? GLOBAL_RINGSCache.slice()
            : null;
        try {
            Object.keys(candidateState).forEach(key => {
                state[key] = (typeof sanitizeInputValue === 'function') ? sanitizeInputValue(key, candidateState[key], state[key]) : candidateState[key];
            });
            if (typeof sanitizeMassFieldsOnObject === 'function') sanitizeMassFieldsOnObject(state);
            if (state.stylusLockedToLP && getPhysicsApi() && typeof getPhysicsApi().solveArmBodyDatumOffsetZ === 'function') {
                state.armBodyDatumOffsetZ = getPhysicsApi().solveArmBodyDatumOffsetZ(state, state.cartMode || 'g1042');
            }
            if (typeof updateGeometryCache === 'function') updateGeometryCache();
            return fn();
        } finally {
            Object.keys(state).forEach(key => { delete state[key]; });
            Object.assign(state, savedState);
            if (savedRings && typeof GLOBAL_RINGSCache !== 'undefined') {
                GLOBAL_RINGSCache = savedRings;
                if (typeof exposeUnifiedGeometryApi === 'function') exposeUnifiedGeometryApi();
            }
        }
    }

    function evaluateCandidate(candidateState, values, index) {
        return withVirtualState(candidateState, () => {
            const metrics = getCandidateMetrics(candidateState);
            const scoring = scoreCandidateWithTargets(metrics, session ? session.targets : []);
            const warnings = scoring.details
                .filter(detail => detail.enabled && detail.status !== 'pass')
                .map(detail => `${detail.label}: ${detail.message}`);

            return {
                index,
                penalty: Number.isFinite(scoring.penalty) ? scoring.penalty : Number.POSITIVE_INFINITY,
                score: Number.isFinite(scoring.uiScore) ? scoring.uiScore : 0,
                values: Object.assign({}, values),
                state: deepClone(candidateState),
                metrics,
                scoring,
                warnings,
                invalid: scoring.hardViolation
            };
        });
    }


    function stableJson(value) {
        if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
        if (value && typeof value === 'object') {
            return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
        }
        return JSON.stringify(value);
    }

    function buildSolverSearchSignature() {
        const variables = (session && session.policy ? session.policy : []).map(variable => ({
            key: variable.key,
            locked: !!variable.locked,
            min: Number(variable.min),
            max: Number(variable.max),
            step: Number(variable.step),
            hardSafetyMin: Number(variable.hardSafetyMin),
            hardSafetyMax: Number(variable.hardSafetyMax)
        }));
        const targets = (session && session.targets ? session.targets : []).map(target => ({
            id: target.id,
            kind: target.kind,
            metricKey: target.metricKey,
            enabled: !!target.enabled,
            hard: !!target.hard,
            target: Number(target.target),
            tolerance: Number(target.tolerance),
            min: Number(target.min),
            max: Number(target.max),
            weight: Number(target.weight)
        }));
        const strategy = getSelectedSearchStrategy();
        const activeTargets = (session && session.targets ? session.targets : []).filter(target => target.enabled);
        const unlocked = (session && session.policy ? session.policy : []).filter(variable => !variable.locked);
        const plan = session && session.solverPlan
            ? session.solverPlan
            : buildSolverPlan(strategy, unlocked, activeTargets);
        return stableJson({
            schema: SOLVER_SCHEMA,
            version: SOLVER_VERSION,
            schedulerVersion: SOLVER_SCHEDULER_VERSION,
            strategy,
            solverPlan: {
                strategy: plan.strategy,
                schedulerVersion: plan.schedulerVersion,
                primaryGroups: plan.primaryGroups,
                passSequence: plan.passSequence,
                refinementAroundTopN: plan.refinementAroundTopN,
                baselineNearFirst: plan.baselineNearFirst,
                targetAwareOrdering: plan.targetAwareOrdering
            },
            variables,
            targets,
            evaluationLimit: getSelectedEvaluationLimit(),
            guide: {
                preset: (getEl('solverGuidePreset') || {}).value || null,
                scope: (getEl('solverGuideChangeScope') || {}).value || null
            },
            scoringMode: 'active-target-penalty-v1'
        });
    }

    function createSolverSearchSession(signature, estimatedGridCount, selectedLimit) {
        const now = new Date().toISOString();
        return {
            signature,
            cursor: 0,
            evaluatedCumulative: 0,
            estimatedGridCount: Number(estimatedGridCount) || 0,
            selectedLimit: Number(selectedLimit) || DEFAULT_EVALUATION_LIMIT,
            actualBatchLimit: 0,
            bestCandidates: [],
            batchCount: 0,
            exhausted: false,
            strategy: getSelectedSearchStrategy(),
            schedulerVersion: SOLVER_SCHEDULER_VERSION,
            solverPlan: session && session.solverPlan ? deepClone(session.solverPlan) : null,
            schedulerCursor: 0,
            duplicateCandidateKeys: Object.create(null),
            startedAt: now,
            updatedAt: now
        };
    }

    function getOrCreateSolverSearchSession(signature, estimatedGridCount, selectedLimit) {
        if (
            session.solverSearchSession &&
            session.solverSearchSession.signature === signature &&
            !session.solverSearchSession.exhausted
        ) {
            session.solverSearchSession.selectedLimit = selectedLimit;
            session.solverSearchSession.estimatedGridCount = estimatedGridCount;
            session.solverSearchSession.strategy = getSelectedSearchStrategy();
            session.solverSearchSession.schedulerVersion = SOLVER_SCHEDULER_VERSION;
            session.solverSearchSession.solverPlan = session.solverPlan ? deepClone(session.solverPlan) : session.solverSearchSession.solverPlan;
            return session.solverSearchSession;
        }
        session.solverSearchSession = createSolverSearchSession(signature, estimatedGridCount, selectedLimit);
        return session.solverSearchSession;
    }

    function mergeSolverBestCandidates(existing, next) {
        const seen = Object.create(null);
        return (existing || []).concat(next || [])
            .filter(result => result && !result.invalid && Number.isFinite(result.penalty))
            .filter(result => {
                const key = result.candidateKey || (result.scheduler && result.scheduler.candidateKey) || stableJson(result.values || {});
                if (seen[key]) return false;
                seen[key] = true;
                result.candidateKey = key;
                return true;
            })
            .sort((a, b) => a.penalty - b.penalty)
            .slice(0, 50);
    }

    function resetSolverSearchSession(reason) {
        if (!session) return;
        session.solverSearchSession = null;
        session.results = [];
        session.selectedIndex = -1;
        session.selectedCandidate = null;
        session.evaluatedCount = 0;
        session.estimatedGridCount = 0;
        session.cappedEvaluationCount = 0;
        session.lastSolverRun = null;
        renderSolverProgress();
        renderResults();
        renderTargetPanel();
        updateSearchSummary();
        updatePreviewScene(session.baselineState || session.snapshot);
        if (reason) status(reason, 'info');
    }

    function invalidateSolverSearch(reason) {
        if (!session || session.isCalculating) return;
        if (!session.solverSearchSession && !(session.results && session.results.length)) return;
        session.staleSearchReason = reason || 'Solver settings changed.';
        resetSolverSearchSession(session.staleSearchReason + ' Search continuation was reset.');
    }

    function hasContinuationAvailable() {
        if (!session || !session.solverSearchSession || session.isCalculating) return false;
        return session.solverSearchSession.signature === buildSolverSearchSignature() &&
            !session.solverSearchSession.exhausted &&
            Number(session.solverSearchSession.cursor || 0) > 0;
    }

    function showSolverPanel(name) {
        const allowed = ['guide', 'expert', 'results', 'preview'];
        const requested = String(name || '').toLowerCase();
        const target = allowed.indexOf(requested) >= 0 ? requested : 'guide';
        const previewFocusRequested = target === 'preview';
        const previousWorkPanel = (session && session.activeSolverPanel && session.activeSolverPanel !== 'preview')
            ? session.activeSolverPanel
            : (activeSolverPanel && activeSolverPanel !== 'preview' ? activeSolverPanel : 'guide');
        const workTarget = previewFocusRequested ? previousWorkPanel : target;

        activeSolverPanel = workTarget;
        document.querySelectorAll('.solver-tab-btn').forEach(btn => {
            const panelName = btn.dataset.solverPanel || btn.dataset.solverTab || '';
            const active = previewFocusRequested ? panelName === 'preview' : panelName === workTarget;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            btn.tabIndex = active ? 0 : -1;
        });
        document.querySelectorAll('.solver-tab-panel').forEach(panel => {
            const panelName = panel.dataset.solverPanelName || panel.dataset.solverPanel || '';
            const active = panelName === workTarget;
            panel.classList.toggle('active', active);
            panel.hidden = !active;
            panel.setAttribute('aria-hidden', active ? 'false' : 'true');
        });

        if (session) {
            session.activeSolverPanel = workTarget;
            session.activeSolverTab = workTarget;
        }
        if (target === 'preview') {
            const previewPanel = getEl('solverPreviewPanel');
            if (previewPanel && typeof previewPanel.focus === 'function') previewPanel.focus({ preventScroll: false });
            resizePreviewRenderer();
            schedulePersistentPreviewRender('focus-preview');
            if (session && session.selectedCandidate) renderCandidatePreview(session.selectedCandidate);
            else if (session) updatePreviewScene(session.baselineState || session.snapshot);
            return;
        }

        schedulePersistentPreviewRender('panel-switch');
    }

    const showSolverTab = showSolverPanel;

    const GUIDE_PRESETS = Object.freeze({
        tracking_force: {
            label: 'Tracking Force Fine Tune',
            targets: ['tracking_force'],
            variables: ['cartX', 'rearFineTrimScrewMassEquivalent', 'rearWeightDiscMass'],
            depth: 2500,
            strategy: 'counterweight_first'
        },
        resonance: {
            label: 'Resonance Window Tune',
            targets: ['resonance_window', 'effective_mass_range', 'tracking_force'],
            variables: ['customMass', 'comp10', 'rearWeightDiscMass', 'rearFineTrimScrewMassEquivalent'],
            depth: 5000,
            strategy: 'resonance_first'
        },
        counterweight: {
            label: 'Counterweight Balance Tune',
            targets: ['counterweight_com_z', 'counterweight_com_x', 'tracking_force'],
            variables: ['rearWeightDiscCount', 'rearWeightDiscThickness', 'rearWeightDiscMass', 'rearFineTrimScrewMassEquivalent'],
            depth: 5000,
            strategy: 'counterweight_first'
        },
        manufacturing: {
            label: 'Manufacturing Diameter Safe Tune',
            targets: ['diameter_range', 'tracking_force', 'resonance_window'],
            variables: ['maxH', 'maxW', 'tailD', 'rearWeightDiscDiameter', 'rearWeightDiscThickness'],
            depth: 7500,
            strategy: 'smart_prioritized'
        },
        balanced: {
            label: 'Balanced Optimization',
            targets: ['tracking_force', 'resonance_window', 'total_com_z', 'counterweight_com_z', 'diameter_range', 'effective_mass_range'],
            variables: ['cartX', 'rearWeightDiscCount', 'rearWeightDiscThickness', 'rearWeightDiscMass', 'rearFineTrimScrewMassEquivalent', 'customMass', 'comp10'],
            depth: 7500,
            strategy: 'smart_prioritized'
        }
    });

    function setGuidePresetDefaults() {
        const presetKey = (getEl('solverGuidePreset') || {}).value || 'balanced';
        const preset = GUIDE_PRESETS[presetKey] || GUIDE_PRESETS.balanced;
        document.querySelectorAll('.solver-guide-goal').forEach(input => {
            input.checked = preset.targets.indexOf(input.value) >= 0;
        });
        const depth = getEl('solverGuideDepth');
        if (depth) depth.value = String(preset.depth || 5000);
        const strategy = getEl('solverSearchStrategy');
        if (strategy && preset.strategy) strategy.value = normalizeSearchStrategy(preset.strategy);
    }

    function applySolverGuideSettings() {
        if (!session) return;
        const presetKey = (getEl('solverGuidePreset') || {}).value || 'balanced';
        const preset = GUIDE_PRESETS[presetKey] || GUIDE_PRESETS.balanced;
        const checkedGoals = Array.prototype.slice.call(document.querySelectorAll('.solver-guide-goal:checked')).map(input => input.value);
        const targetsToEnable = checkedGoals.length ? checkedGoals : preset.targets;
        const scope = (getEl('solverGuideChangeScope') || {}).value || 'custom';
        const variablesByScope = {
            counterweight: ['rearWeightDiscCount', 'rearWeightDiscThickness', 'rearWeightDiscMass', 'rearFineTrimScrewMassEquivalent', 'rearFineTrimScrewLength'],
            geometry: ['cartX', 'pivotSpindle', 'apex', 'fullLength', 'maxH', 'maxW', 'neckW', 'neckL', 'tailD'],
            mass_resonance: ['customMass', 'customZ', 'comp10', 'rearWeightDiscMass', 'rearFineTrimScrewMassEquivalent'],
            tail: ['rearBendStartX', 'rearBendDropZ', 'tailD', 'rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount'],
            fine_trim: ['cartX', 'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent'],
            full: DEFAULT_SOLVER_VARIABLES.slice(),
            custom: null
        };
        const variablesToUnlock = variablesByScope[scope] || preset.variables;
        const fixed = Array.prototype.slice.call(document.querySelectorAll('.solver-guide-fixed:checked')).map(input => input.value);
        const fixedKeys = {
            cartridge: ['customMass', 'customZ', 'comp10'],
            effective_length: ['pivotSpindle', 'apex', 'fullLength'],
            diameter: ['maxH', 'maxW', 'tailD', 'rearWeightDiscDiameter'],
            disc_count: ['rearWeightDiscCount'],
            visual_shape: ['maxH', 'maxW', 'neckW', 'neckL', 'tailD']
        };

        if (scope !== 'custom') {
            session.policy.forEach(variable => {
                variable.locked = variablesToUnlock.indexOf(variable.key) < 0;
            });
        } else {
            preset.variables.forEach(key => {
                const variable = session.policy.find(item => item.key === key);
                if (variable) variable.locked = false;
            });
        }

        fixed.forEach(flag => {
            (fixedKeys[flag] || []).forEach(key => {
                const variable = session.policy.find(item => item.key === key);
                if (variable) variable.locked = true;
            });
        });

        session.targets.forEach(target => {
            target.enabled = targetsToEnable.indexOf(target.id) >= 0;
            if (target.id === 'diameter_range') {
                const minD = parseCommittedSolverNumber((getEl('solverGuideMinDiameter') || {}).value);
                const maxD = parseCommittedSolverNumber((getEl('solverGuideMaxDiameter') || {}).value);
                if (Number.isFinite(minD)) target.min = minD;
                if (Number.isFinite(maxD)) target.max = maxD;
                if ((getEl('solverGuideCarbonSleeve') || {}).checked) target.weight = Math.max(Number(target.weight) || 0, 1200);
                if ((getEl('solverGuideBodyEnvelope') || {}).checked) target.weight = Math.max(Number(target.weight) || 0, 1000);
            }
        });

        const depth = normalizeEvaluationLimit((getEl('solverGuideDepth') || {}).value || preset.depth);
        session.evaluationLimit = depth;
        session.maxEvaluations = depth;
        session.searchStrategy = normalizeSearchStrategy(preset.strategy || DEFAULT_SEARCH_STRATEGY);
        session.solverPlan = buildSolverPlan(
            session.searchStrategy,
            session.policy.filter(variable => !variable.locked),
            session.targets.filter(target => target.enabled)
        );

        const unlockedCount = session.policy.filter(variable => !variable.locked).length;
        const activeTargetCount = session.targets.filter(target => target.enabled).length;
        const summary = `Guide configured: ${unlockedCount} variables unlocked, ${activeTargetCount} targets active, evaluation limit ${depth.toLocaleString()}, strategy ${session.solverPlan.strategyLabel}.`;
        const summaryEl = getEl('solverGuideSummary');
        if (summaryEl) summaryEl.textContent = summary + ` Plan: ${(session.solverPlan.primaryGroups || []).join(', ')} priority groups; ${(session.solverPlan.passSequence || []).join(' → ')} passes. Expert controls reflect these solver sandbox settings. Run Solver is still manual.`;
        invalidateSolverSearch('Guide settings changed.');
        setGuidePresetDefaults();
        renderVariablePanel();
        renderTargetPanel();
        renderEvaluationLimitControl();
        renderSearchStrategyControl();
        updateSolverPlanSummary(session.solverPlan);
        updateSearchSummary();
        renderSolverProgress();
        showSolverTab('expert');
        status(summary, 'success');
    }

    function runSolver() {
        if (!session || session.isCalculating) return;
        if (!commitAllSolverEdits()) return;
        const unlocked = session.policy.filter(v => !v.locked);
        const activeTargets = (session.targets || []).filter(target => target.enabled);
        if (unlocked.length === 0) {
            status('No variables are unlocked. Unlock at least one variable before running the solver.', 'warning');
            return;
        }
        if (activeTargets.length === 0) {
            status('Enable at least one optimization target.', 'warning');
            return;
        }

        const selectedLimit = getSelectedEvaluationLimit();
        const samples = unlocked.map(v => ({ variable: v, values: makeSamples(v) }));
        const est = estimateSearchSize(unlocked, selectedLimit);
        const capped = Math.min(est.raw, selectedLimit);
        const strategy = getSelectedSearchStrategy();
        const plan = buildSolverPlan(strategy, unlocked, activeTargets);
        session.solverPlan = plan;
        const signature = buildSolverSearchSignature();
        const searchSession = getOrCreateSolverSearchSession(signature, est.raw, selectedLimit);
        searchSession.strategy = strategy;
        searchSession.schedulerVersion = SOLVER_SCHEDULER_VERSION;
        searchSession.solverPlan = deepClone(plan);
        const baseline = deepClone(session.baselineState || session.snapshot);
        const scheduler = makeCandidateScheduler(samples, baseline, plan, searchSession);
        const startCursor = Math.max(0, Number(searchSession.cursor) || 0);
        const remaining = Math.max(0, est.raw - startCursor);
        const actualBatchLimit = Math.min(capped, remaining);
        const batchResults = [];
        let accepted = 0;

        if (actualBatchLimit <= 0) {
            searchSession.exhausted = true;
            renderSolverProgress();
            status('Search Complete: all estimated candidates have already been evaluated for these settings. Use Reset Search or change settings to start over.', 'info');
            return;
        }

        session.results = (searchSession.bestCandidates || []).slice(0, 25);
        session.selectedIndex = -1;
        session.selectedCandidate = null;
        session.isCalculating = true;
        session.solverAbortRequested = false;
        session.evaluatedCount = 0;
        session.estimatedGridCount = est.raw;
        session.cappedEvaluationCount = actualBatchLimit;
        session.evaluationCapApplied = est.raw > actualBatchLimit;
        searchSession.actualBatchLimit = actualBatchLimit;
        searchSession.batchCount += 1;
        searchSession.selectedLimit = selectedLimit;
        searchSession.estimatedGridCount = est.raw;
        searchSession.updatedAt = new Date().toISOString();
        session.lastSolverRun = {
            activeTargetIds: activeTargets.map(target => target.id),
            estimatedGridCount: est.raw,
            selectedEvaluationLimit: selectedLimit,
            cappedEvaluationCount: actualBatchLimit,
            maxEvaluations: selectedLimit,
            deterministicStride: 1,
            batchSize: SOLVER_BATCH_SIZE,
            continuationCursorStart: startCursor,
            continuationBatch: searchSession.batchCount,
            strategy,
            schedulerVersion: SOLVER_SCHEDULER_VERSION,
            solverPlan: deepClone(plan),
            schedulerMode: plan.mode,
            deterministicSeed: plan.deterministicSeed
        };

        updateSolverPlanSummary(plan);
        renderSearchStrategyControl();
        renderSolverProgress();
        renderResults();
        renderTargetPanel();
        const initialStage = classifySchedulerCursor(startCursor, plan, selectedLimit);
        searchSession.lastStage = initialStage;
        status(searchSession.batchCount > 1
            ? `Continuing ${plan.strategyLabel} batch ${searchSession.batchCount} (${initialStage.passLabel})… evaluating prioritized candidates ${(startCursor + 1).toLocaleString()}–${(startCursor + actualBatchLimit).toLocaleString()} of ${est.raw.toLocaleString()}.`
            : `Calculating ${plan.strategyLabel} batch 1 (${initialStage.passLabel})… estimated grid ${est.raw.toLocaleString()} combinations; evaluating ${actualBatchLimit.toLocaleString()} from selected limit ${selectedLimit.toLocaleString()}.`, 'info');

        function finish(kind) {
            session.isCalculating = false;
            searchSession.bestCandidates = mergeSolverBestCandidates(searchSession.bestCandidates, batchResults);
            searchSession.evaluatedCumulative = Number(searchSession.evaluatedCumulative || 0) + session.evaluatedCount;
            searchSession.cursor = Math.min(est.raw, startCursor + session.evaluatedCount);
            searchSession.schedulerCursor = searchSession.cursor;
            searchSession.exhausted = searchSession.cursor >= est.raw;
            searchSession.updatedAt = new Date().toISOString();
            searchSession.lastStage = classifySchedulerCursor(Math.max(0, searchSession.cursor - 1), plan, selectedLimit);
            session.results = (searchSession.bestCandidates || []).slice(0, 25);
            session.selectedIndex = session.results.length ? 0 : -1;
            session.selectedCandidate = session.results[session.selectedIndex] || null;
            renderSolverProgress();
            renderResults();
            schedulePersistentPreviewRender('solver result update');
            renderTargetPanel();
            if (session.selectedCandidate) {
                renderCandidatePreview(session.selectedCandidate);
            } else {
                updatePreviewScene(session.baselineState || session.snapshot);
            }

            if (kind === 'cancelled') {
                status(`Calculation cancelled in ${plan.strategyLabel} batch ${searchSession.batchCount} after ${session.evaluatedCount.toLocaleString()} candidate(s). Cumulative evaluated ${searchSession.evaluatedCumulative.toLocaleString()} / ${est.raw.toLocaleString()}.`, 'warning');
            } else if (session.results.length) {
                const mode = searchSession.exhausted ? 'Search Complete' : 'Continue Search available';
                status(`${plan.strategyLabel} batch ${searchSession.batchCount} complete, evaluated ${searchSession.evaluatedCumulative.toLocaleString()} / ${est.raw.toLocaleString()} candidates. ${mode}. Best score ${formatNumber(session.results[0].score, 2)}.`, 'success');
            } else {
                status(`Batch ${searchSession.batchCount} produced no valid candidate after active hard constraints. Evaluated ${searchSession.evaluatedCumulative.toLocaleString()} / ${est.raw.toLocaleString()}.`, 'warning');
            }
        }

        function pump() {
            if (!session || !session.isCalculating) return;
            if (session.solverAbortRequested) {
                finish('cancelled');
                return;
            }

            const startCount = session.evaluatedCount;
            while (
                session.evaluatedCount < capped &&
                session.evaluatedCount < actualBatchLimit &&
                (session.evaluatedCount - startCount) < SOLVER_BATCH_SIZE &&
                !session.solverAbortRequested
            ) {
                const linearIndex = Math.min(est.raw - 1, startCursor + session.evaluatedCount);
                const schedulerCursor = linearIndex;
                const built = scheduler.next(schedulerCursor);
                const result = evaluateCandidate(built.candidate, built.values, schedulerCursor + 1);
                if (result) {
                    result.batch = searchSession.batchCount;
                    result.strategy = plan.strategy;
                    result.strategyLabel = plan.strategyLabel;
                    result.scheduler = built.scheduler;
                    result.source = built.scheduler && built.scheduler.source;
                    result.pass = built.scheduler && built.scheduler.pass;
                    result.candidateKey = built.scheduler && built.scheduler.candidateKey;
                }
                session.evaluatedCount += 1;
                if (result && !result.invalid && Number.isFinite(result.penalty)) {
                    batchResults.push(result);
                    accepted += 1;
                }
            }

            batchResults.sort((a, b) => a.penalty - b.penalty);
            if (batchResults.length > 50) batchResults.length = 50;
            renderSolverProgress();

            if (session.evaluatedCount >= actualBatchLimit || session.solverAbortRequested) {
                finish(session.solverAbortRequested ? 'cancelled' : 'complete');
                return;
            }

            scheduleSolverChunk(pump);
        }

        scheduleSolverChunk(pump);
    }

    function renderResults() {
        const el = getEl('solverResults');
        if (!el || !session) return;
        if (!session.results || session.results.length === 0) {
            el.innerHTML = '<div class="solver-empty">No solver results yet. Enable targets, unlock variables and run solver.</div>';
            updateApplyButton();
            return;
        }
        el.innerHTML = session.results.map((result, idx) => {
            const activeDetails = result.scoring && result.scoring.details
                ? result.scoring.details.filter(detail => detail.enabled).slice(0, 4)
                : [];
            const deltaText = activeDetails.map(detail => `${detail.label}: ${detail.message}`).join(' · ');
            const warnings = result.warnings && result.warnings.length
                ? `<div class="solver-result-warning">${escapeHtml(result.warnings.slice(0, 3).join(' · '))}</div>`
                : '';
            return `
                <button class="solver-result-row ${idx === session.selectedIndex ? 'selected' : ''}" data-idx="${idx}" type="button">
                    <div class="solver-result-top">
                        <strong>#${idx + 1}</strong>
                        <span>Score ${formatNumber(result.score, 2)}</span>
                    </div>
                    <div class="solver-result-metrics">
                        TF ${formatNumber(result.metrics.trackingForce, 2)} g · Total COM ${formatNumber(result.metrics.totalCOMX, 1)}/${formatNumber(result.metrics.totalCOMZ, 1)} mm · CW COM ${formatNumber(result.metrics.counterweightCOMX, 1)}/${formatNumber(result.metrics.counterweightCOMZ, 1)} mm
                    </div>
                    <div class="solver-result-metrics">
                        Mass ${formatNumber(result.metrics.totalMass, 2)} g · Eff ${formatNumber(result.metrics.effectiveMass, 2)} g · Res ${formatNumber(result.metrics.resonance, 2)} Hz · Ø ${formatNumber(result.metrics.maxDiameterEstimated, 2)} mm est.
                    </div>
                    <div class="solver-result-deltas">${escapeHtml(deltaText || 'No active target deltas.')}</div>
                    <div class="solver-result-source">${escapeHtml(`strategy ${result.strategyLabel || result.strategy || 'solver'} · source ${result.source || 'candidate sweep'} · pass ${result.pass || 'n/a'}`)}</div>
                    ${warnings}
                    <div class="solver-result-values">${escapeHtml(`batch ${result.batch || 1} · ` + Object.keys(result.values).map(k => `${k}=${formatNumber(result.values[k], 3)}`).join(', '))}</div>
                </button>
            `;
        }).join('');
        el.querySelectorAll('.solver-result-row').forEach(btn => {
            btn.addEventListener('click', evt => {
                const idx = Number(evt.currentTarget.dataset.idx);
                selectResult(idx);
            });
        });
        updateApplyButton();
    }

    function selectResult(idx) {
        if (!session || !session.results || !session.results[idx]) return;
        session.selectedIndex = idx;
        session.selectedCandidate = session.results[idx];
        renderResults();
        renderCandidatePreview(session.results[idx]);
        renderTargetPanel();
    }

    function updateApplyButton() {
        const btn = getEl('solverApplyBtn');
        if (!btn || !session) return;
        btn.disabled = !!session.isCalculating || !(session.results && session.results.length && session.results[session.selectedIndex]);
    }

    function renderCandidatePreview(result) {
        if (!result) return;
        const metricsEl = getEl('solverCandidateMetrics');
        if (metricsEl) {
            const m = result.metrics;
            const activeDetails = result.scoring && result.scoring.details
                ? result.scoring.details.filter(detail => detail.enabled)
                : [];
            const why = activeDetails
                .sort((a, b) => (b.penalty || 0) - (a.penalty || 0))
                .slice(0, 3)
                .map(detail => `${detail.label}: ${detail.message}`)
                .join(' · ');
            metricsEl.innerHTML = `
                <div><strong>Selected candidate</strong> #${session.selectedIndex + 1}</div>
                <div>Score: ${formatNumber(result.score, 2)}</div>
                <div>Penalty: ${formatNumber(result.penalty, 3)}</div>
                <div>Tracking force: ${formatNumber(m.trackingForce, 2)} g</div>
                <div>Total COM X/Z: ${formatNumber(m.totalCOMX, 2)} / ${formatNumber(m.totalCOMZ, 2)} mm</div>
                <div>Counterweight COM X/Z: ${formatNumber(m.counterweightCOMX, 2)} / ${formatNumber(m.counterweightCOMZ, 2)} mm${m.counterweightCOMEstimated ? ' estimated' : ''}</div>
                <div>Total mass: ${formatNumber(m.totalMass, 2)} g</div>
                <div>Effective mass: ${formatNumber(m.effectiveMass, 2)} g</div>
                <div>Resonance: ${formatNumber(m.resonance, 2)} Hz</div>
                <div>Max diameter: ${formatNumber(m.maxDiameterEstimated, 2)} mm estimated</div>
                <div>Strategy/source: ${escapeHtml(`${result.strategyLabel || result.strategy || 'solver'} · ${result.source || 'candidate sweep'} · pass ${result.pass || 'n/a'}`)}</div>
                <div>Active target deltas: ${escapeHtml(why || 'all active targets within tolerance/range')}</div>
            `;
        }
        updatePreviewScene(result.state);
        schedulePersistentPreviewRender('selected candidate changed');
    }

    function setPreviewStatus(message, kind) {
        const statusEl = getEl('solverPreviewStatus');
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.className = `solver-preview-status ${kind || 'info'}`.trim();
    }

    function getPreviewContainerSize(container) {
        const rect = container && typeof container.getBoundingClientRect === 'function'
            ? container.getBoundingClientRect()
            : { width: 0, height: 0 };
        const width = Math.floor(rect.width || container.clientWidth || container.offsetWidth || 0);
        const height = Math.floor(rect.height || container.clientHeight || container.offsetHeight || 0);
        return { width, height };
    }

    function handlePreviewWindowResize() {
        schedulePersistentPreviewRender('window-resize');
    }

    function installPreviewResizeObserver(container) {
        if (!container) return;
        if (previewResizeObserver && typeof previewResizeObserver.disconnect === 'function') {
            previewResizeObserver.disconnect();
            previewResizeObserver = null;
        }
        if (typeof ResizeObserver !== 'undefined') {
            previewResizeObserver = new ResizeObserver(() => {
                schedulePersistentPreviewRender('ResizeObserver layout resize');
            });
            previewResizeObserver.observe(container);
        } else if (!previewWindowResizeBound && root && typeof root.addEventListener === 'function') {
            root.addEventListener('resize', handlePreviewWindowResize);
            previewWindowResizeBound = true;
        }
    }

    function schedulePersistentPreviewRender(reason, retryCount) {
        const retry = Number(retryCount) || 0;
        if (typeof requestAnimationFrame !== 'function') {
            ensurePersistentPreviewRender(reason || 'immediate', retry);
            return;
        }
        requestAnimationFrame(() => ensurePersistentPreviewRender(reason || 'scheduled', retry));
    }

    function ensurePersistentPreviewRender(reason, retryCount) {
        const container = getEl('solverPreview3D');
        if (!container) return false;
        const size = getPreviewContainerSize(container);
        if (size.width <= 2 || size.height <= 2) {
            if ((Number(retryCount) || 0) < PREVIEW_ZERO_SIZE_RETRY_LIMIT) {
                schedulePersistentPreviewRender(reason || 'zero-size retry', (Number(retryCount) || 0) + 1);
            } else {
                setPreviewStatus('3D preview waiting for a visible layout size.', 'warning');
            }
            return false;
        }
        if (!preview) initPreview();
        if (!preview) return false;
        resizePreviewRenderer();
        if (session && session.selectedCandidate && preview.root) {
            renderPreviewFrame();
        } else if (session && !preview.root) {
            updatePreviewScene(session.baselineState || session.snapshot);
        } else {
            renderPreviewFrame();
        }
        if (reason) preview.lastRenderReason = reason;
        setPreviewStatus('3D preview ready.', 'ok');
        return true;
    }

    function initPreview() {
        const container = getEl('solverPreview3D');
        if (!container) return null;
        if (typeof THREE === 'undefined') {
            setPreviewStatus('3D preview unavailable: WebGL/THREE renderer was not loaded.', 'error');
            return null;
        }
        if (preview && preview.container === container && preview.renderer) {
            installPreviewResizeObserver(container);
            return preview;
        }
        disposePreview();

        const size = getPreviewContainerSize(container);
        if (size.width <= 2 || size.height <= 2) {
            schedulePersistentPreviewRender('init zero-size guard', 1);
            return null;
        }

        const sceneLocal = new THREE.Scene();
        sceneLocal.background = new THREE.Color(0x222222);
        const cameraLocal = new THREE.PerspectiveCamera(45, Math.max(1, size.width) / Math.max(1, size.height), 1, 1400);
        cameraLocal.up.set(0, 0, 1);
        cameraLocal.position.set(-100, -150, 100);

        let rendererLocal = null;
        try {
            rendererLocal = new THREE.WebGLRenderer({ antialias: true });
            rendererLocal.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            rendererLocal.setSize(Math.max(1, size.width), Math.max(1, size.height), false);
        } catch (err) {
            setPreviewStatus('3D preview unavailable: WebGL renderer could not initialize.', 'error');
            if (root.console && typeof root.console.warn === 'function') {
                root.console.warn('Solver persistent preview WebGL initialization failed:', err);
            }
            return null;
        }

        container.innerHTML = '';
        container.appendChild(rendererLocal.domElement);

        const controlsLocal = (THREE.OrbitControls)
            ? new THREE.OrbitControls(cameraLocal, rendererLocal.domElement)
            : null;
        if (controlsLocal) {
            controlsLocal.target.set(LENGTH * 0.55, 0, 0);
            controlsLocal.update();
        }

        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
        hemi.position.set(0, 0, 200);
        sceneLocal.add(hemi);
        const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
        dir1.position.set(120, -120, 220);
        sceneLocal.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xaaccff, 0.42);
        dir2.position.set(-100, 100, -50);
        sceneLocal.add(dir2);

        preview = {
            container,
            scene: sceneLocal,
            camera: cameraLocal,
            renderer: rendererLocal,
            controls: controlsLocal,
            root: null,
            persistent: true,
            lastRenderReason: 'init'
        };
        installPreviewResizeObserver(container);
        setPreviewStatus('3D preview ready.', 'ok');
        return preview;
    }

    function startPreviewLoop() {
        if (!preview) initPreview();
        if (!preview || previewAnimationId) return;
        function tick() {
            if (!preview) return;
            previewAnimationId = requestAnimationFrame(tick);
            resizePreviewRenderer();
            if (preview.controls) preview.controls.update();
            preview.renderer.render(preview.scene, preview.camera);
        }
        tick();
    }

    function resizePreviewRenderer() {
        if (!preview || !preview.container || !preview.renderer || !preview.camera) return false;
        const size = getPreviewContainerSize(preview.container);
        if (size.width <= 2 || size.height <= 2) {
            schedulePersistentPreviewRender('resize zero-size guard', 1);
            return false;
        }
        preview.camera.aspect = size.width / size.height;
        preview.camera.updateProjectionMatrix();
        preview.renderer.setSize(size.width, size.height, false);
        return true;
    }

    function renderPreviewFrame() {
        if (!preview || !preview.renderer || !preview.scene || !preview.camera) return;
        if (!resizePreviewRenderer()) return;
        if (preview.controls) preview.controls.update();
        preview.renderer.render(preview.scene, preview.camera);
    }

    function stopPreviewLoop() {
        if (previewAnimationId) {
            cancelAnimationFrame(previewAnimationId);
            previewAnimationId = null;
        }
    }

    function disposePreviewObject(obj) {
        if (!obj) return;
        if (typeof obj.traverse === 'function') {
            obj.traverse(child => {
                if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => { if (m && typeof m.dispose === 'function') m.dispose(); });
                    else if (typeof child.material.dispose === 'function') child.material.dispose();
                }
            });
        }
    }

    function disposePreview() {
        stopPreviewLoop();
        if (previewResizeObserver && typeof previewResizeObserver.disconnect === 'function') {
            previewResizeObserver.disconnect();
            previewResizeObserver = null;
        }
        if (previewWindowResizeBound && root && typeof root.removeEventListener === 'function') {
            root.removeEventListener('resize', handlePreviewWindowResize);
            previewWindowResizeBound = false;
        }
        if (preview) {
            if (preview.root) disposePreviewObject(preview.root);
            if (preview.renderer && typeof preview.renderer.dispose === 'function') preview.renderer.dispose();
            if (preview.container) preview.container.innerHTML = '';
        }
        preview = null;
        setPreviewStatus('Preview disposed.', 'info');
    }

    function clearPreviewRoot() {
        if (!preview) initPreview();
        if (!preview) return;
        if (preview.root) {
            preview.scene.remove(preview.root);
            disposePreviewObject(preview.root);
        }
        preview.root = new THREE.Group();
        preview.root.name = 'solver_candidate_preview_root';
        preview.scene.add(preview.root);
    }

    function makePreviewMaterial() {
        return {
            outer: new THREE.MeshStandardMaterial({ color: 0xb0b5b9, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }),
            inner: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }),
            cap: new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })
        };
    }

    function addSafePreviewFallback(localRoot, candidateState, reason) {
        const mats = makePreviewMaterial();
        const length = Number(candidateState.fullLength || candidateState.L || LENGTH || 240);
        const radius = Math.max(3, Number(candidateState.maxH || 24) * 0.18);
        const bodyLength = Math.max(80, length * 0.85);
        const tubeGeo = new THREE.CylinderGeometry(radius, radius * 0.72, bodyLength, 24);
        tubeGeo.rotateZ(Math.PI / 2);
        tubeGeo.translate(bodyLength / 2, 0, 0);
        const body = new THREE.Mesh(tubeGeo, mats.outer);
        body.name = 'solver_safe_preview_fallback_body';
        body.userData = { fallbackReason: reason || 'preview_builder_unavailable' };
        localRoot.add(body);

        const rearDiscCount = Math.max(0, Math.min(8, Math.round(Number(candidateState.rearWeightDiscCount || 0))));
        const discDiameter = Math.max(8, Number(candidateState.rearWeightDiscDiameter || 28));
        const discThickness = Math.max(1, Number(candidateState.rearWeightDiscThickness || 4));
        const rearX = bodyLength;
        const rearTopZ = -Math.max(4, radius * 1.4);
        for (let i = 0; i < rearDiscCount; i += 1) {
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(discDiameter / 2, discDiameter / 2, discThickness, 32), mats.cap);
            disc.rotation.y = Math.PI / 2;
            disc.position.set(rearX, 0, rearTopZ - discThickness / 2 - i * discThickness);
            disc.name = 'solver_safe_preview_fallback_downward_disc';
            localRoot.add(disc);
        }
        status('Preview fallback used: canonical live render builder was unavailable or threw.', 'warning');
    }

    function updatePreviewScene(candidateState) {
        if (typeof THREE === 'undefined') return;
        clearPreviewRoot();
        if (!preview || !preview.root) return;

        let rootGroup = null;
        try {
            rootGroup = withVirtualState(candidateState, () => {
                const localRoot = new THREE.Group();
                localRoot.name = 'solver_candidate_geometry_group';
                const mats = makePreviewMaterial();
                let added = false;

                const cobraGeometry = (typeof getCobraEggshellTonearmGeometry === 'function') ? getCobraEggshellTonearmGeometry() : null;
                if (cobraGeometry) {
                    localRoot.add(new THREE.Mesh(cobraGeometry, mats.outer));
                    added = true;
                } else if (typeof generateTonearmGeometry === 'function') {
                    localRoot.add(new THREE.Mesh(generateTonearmGeometry(), [mats.outer, mats.inner, mats.cap]));
                    added = true;
                }

                if (typeof buildHeadshellSlotsRenderGroup === 'function') {
                    const slots = buildHeadshellSlotsRenderGroup();
                    if (slots) localRoot.add(slots);
                }

                const rearModes = (typeof REAR_MODES !== 'undefined') ? REAR_MODES : root.REAR_MODES;
                const cobraGooseMode = rearModes && rearModes.COBRA_GOOSE;
                if ((!cobraGooseMode || candidateState.rearMode === cobraGooseMode) && typeof buildRearAccessoriesGroup === 'function') {
                    const rear = buildRearAccessoriesGroup(candidateState.showRearWeights !== false);
                    if (rear) localRoot.add(rear);
                }

                const mode = candidateState.cartMode || 'g1042';
                if (mode === 'g1042' && typeof createGoldring10423D === 'function' &&
                    typeof getClassicProfileAtX === 'function' &&
                    typeof GOLDRING1042 !== 'undefined' && GOLDRING1042.anchors) {
                    const pZ = getClassicProfileAtX(candidateState.cartX + GOLDRING1042.anchors.tipToMountX).zBot;
                    localRoot.add(createGoldring10423D(pZ, candidateState.cartX));
                } else if (mode === 'custom' && typeof createGenericCartridge3D === 'function' &&
                    typeof getClassicProfileAtX === 'function') {
                    const pZ = getClassicProfileAtX(candidateState.cartX + 9).zBot;
                    localRoot.add(createGenericCartridge3D(pZ, candidateState.cartX, candidateState.customZ));
                }

                if (!added || localRoot.children.length === 0) {
                    addSafePreviewFallback(localRoot, candidateState, 'no_live_geometry_added');
                }
                return localRoot;
            });
        } catch (err) {
            rootGroup = new THREE.Group();
            rootGroup.name = 'solver_candidate_geometry_group_fallback';
            addSafePreviewFallback(rootGroup, candidateState || {}, err && err.message ? err.message : 'preview_exception');
            if (root.console && typeof root.console.warn === 'function') {
                root.console.warn('Solver preview fallback:', err);
            }
        }

        preview.root.add(rootGroup);
        fitPreviewCamera(rootGroup);
        renderPreviewFrame();
        schedulePersistentPreviewRender('preview scene updated');
    }

    function fitPreviewCamera(rootGroup) {
        if (!preview || !rootGroup || !THREE.Box3) return;
        const box = new THREE.Box3().setFromObject(rootGroup);
        if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const span = Math.max(size.x, size.y, size.z, 50);
        preview.camera.position.set(center.x - span * 0.65, center.y - span * 0.95, center.z + span * 0.55);
        preview.camera.near = Math.max(0.1, span / 100);
        preview.camera.far = Math.max(1000, span * 20);
        preview.camera.updateProjectionMatrix();
        if (preview.controls) {
            preview.controls.target.copy(center);
            preview.controls.update();
        } else {
            preview.camera.lookAt(center);
        }
    }

    function applySelectedCandidate() {
        if (!session || session.isCalculating || !session.results || !session.results[session.selectedIndex]) return;
        const result = session.results[session.selectedIndex];
        Object.keys(result.values).forEach(key => {
            const el = getEl(key);
            if (el) el.value = result.values[key];
        });
        if (typeof updateState === 'function') updateState();
        status('Applied selected solver candidate to live design.', 'success');
        closeModal('apply');
    }

    function resetSession() {
        if (!session) return;
        if (session.isCalculating) cancelActiveSolver('Calculation cancelled by Reset Search.');
        session.solverSearchSession = null;
        session.results = [];
        session.selectedIndex = -1;
        session.selectedCandidate = null;
        session.evaluatedCount = 0;
        session.estimatedGridCount = 0;
        session.cappedEvaluationCount = 0;
        session.solverAbortRequested = false;
        renderResults();
        renderTargetPanel();
        renderEvaluationLimitControl();
        renderSolverProgress();
        updateSearchSummary();
        updatePreviewScene(session.baselineState || session.snapshot);
        status('Search cursor and results reset. Solver settings and live design remain unchanged.', 'info');
    }

    function openModal() {
        const snapshot = refreshSnapshotFromDom();
        const variables = buildVariablePolicy(snapshot);
        session = {
            schema: SOLVER_SCHEMA,
            version: SOLVER_VERSION,
            openedAt: new Date().toISOString(),
            baselineState: deepClone(snapshot),
            workingState: deepClone(snapshot),
            snapshot,
            variables,
            policy: variables,
            targets: buildDefaultTargets(snapshot),
            currentMetrics: withVirtualState(snapshot, () => getCandidateMetrics(snapshot)),
            results: [],
            selectedCandidate: null,
            selectedIndex: -1,
            isCalculating: false,
            solverAbortRequested: false,
            solverSearchSession: null,
            staleSearchReason: null,
            activeSolverTab: 'guide',
            evaluatedCount: 0,
            estimatedGridCount: 0,
            cappedEvaluationCount: 0,
            evaluationLimit: DEFAULT_EVALUATION_LIMIT,
            maxEvaluations: DEFAULT_EVALUATION_LIMIT,
            searchStrategy: DEFAULT_SEARCH_STRATEGY,
            solverPlan: null,
            editBuffers: {
                variables: Object.create(null),
                targets: Object.create(null),
                evaluationLimit: null
            },
            closedBy: null
        };
        setOpen(true);
        renderVariablePanel();
        renderTargetPanel();
        renderResults();
        renderSearchStrategyControl();
        session.solverPlan = buildSolverPlan(session.searchStrategy, session.policy.filter(v => !v.locked), session.targets.filter(t => t.enabled));
        renderSolverProgress();
        updateSearchSummary();
        showSolverPanel(session.activeSolverPanel || activeSolverPanel || 'guide');
        initPreview();
        schedulePersistentPreviewRender('modal open');
        requestAnimationFrame(() => {
            if (!session) return;
            updatePreviewScene(snapshot);
            startPreviewLoop();
            schedulePersistentPreviewRender('modal open layout settled');
        });
        status('Solver runs in sandbox mode. Live design changes only after Apply.', 'info');
    }

    function bind() {
        const openBtn = getEl('openSolverBtn');
        if (openBtn) openBtn.addEventListener('click', openModal);

        const discardBtn = getEl('solverDiscardBtn');
        if (discardBtn) discardBtn.addEventListener('click', () => closeModal('discard'));

        const closeBtn = getEl('solverCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => closeModal('x'));

        const resetBtn = getEl('solverResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetSession);

        const runBtn = getEl('solverRunBtn');
        if (runBtn) runBtn.addEventListener('click', runSolver);

        const cancelBtn = getEl('solverCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => cancelActiveSolver('Calculation cancelled.'));

        const evaluationLimitInput = getEl('solverEvaluationLimit');
        if (evaluationLimitInput) {
            evaluationLimitInput.addEventListener('input', onEvaluationLimitInput);
            evaluationLimitInput.addEventListener('change', onEvaluationLimitInput);
        }

        const searchStrategyInput = getEl('solverSearchStrategy');
        if (searchStrategyInput) {
            searchStrategyInput.addEventListener('change', onSearchStrategyChange);
        }


        document.querySelectorAll('.solver-tab-btn').forEach(btn => {
            btn.addEventListener('click', evt => {
                evt.preventDefault();
                evt.stopPropagation();
                const target = evt.currentTarget.dataset.solverPanel || evt.currentTarget.dataset.solverTab || 'guide';
                showSolverPanel(target);
            });
        });

        const guidePreset = getEl('solverGuidePreset');
        if (guidePreset) guidePreset.addEventListener('change', setGuidePresetDefaults);

        const guideApplyBtn = getEl('solverGuideApplyBtn');
        if (guideApplyBtn) guideApplyBtn.addEventListener('click', applySolverGuideSettings);

        const targetPanel = getEl('solverTargets');
        if (targetPanel) {
            targetPanel.addEventListener('input', onTargetInput);
            targetPanel.addEventListener('change', onTargetInput);
            targetPanel.addEventListener('focusout', onTargetInput);
            targetPanel.addEventListener('keydown', onTargetKeydown);
        }

        const applyBtn = getEl('solverApplyBtn');
        if (applyBtn) applyBtn.addEventListener('click', applySelectedCandidate);

        const modal = getModal();
        if (modal) {
            modal.addEventListener('click', evt => {
                if (evt.target === modal) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    status('Solver modal is intentionally not dismissed by backdrop clicks. Use Discard, Apply, or X.', 'warning');
                }
            });
            modal.addEventListener('keydown', evt => {
                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    evt.stopPropagation();
                    status('Escape is disabled by design. Use Discard, Apply, or X to close the solver.', 'warning');
                }
            });
        }

        window.addEventListener('resize', () => {
            if (!preview) return;
            const w = Math.max(1, preview.container.clientWidth);
            const h = Math.max(1, preview.container.clientHeight);
            preview.camera.aspect = w / h;
            preview.camera.updateProjectionMatrix();
            preview.renderer.setSize(w, h, false);
            renderPreviewFrame();
        });
    }

    root.TonearmSolver = Object.freeze({
        schema: SOLVER_SCHEMA,
        version: SOLVER_VERSION,
        open: openModal,
        run: runSolver,
        _test: Object.freeze({
            buildVariablePolicy,
            makeSamples,
            estimateSearchSize,
            buildDefaultTargets,
            scoreCandidateWithTargets,
            getCandidateMetrics,
            scheduleSolverChunk,
            normalizeEvaluationLimit,
            getSelectedEvaluationLimit,
            DEFAULT_EVALUATION_LIMIT,
            MIN_EVALUATION_LIMIT,
            MAX_EVALUATION_LIMIT,
            EVALUATION_LIMIT_STEP,
            captureSnapshot
        })
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})(window);
