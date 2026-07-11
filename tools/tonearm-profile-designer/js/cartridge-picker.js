/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cartridge-picker.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3a cartridge picker.
 *
 * Loads the compact app-ready cartridge data script, filters it in memory, and applies
 * the selected cartridge only when the user presses Apply. Cancel, X and
 * backdrop clicks never mutate the live TonearmDesigner state or controller ranges.
 */
(function(root) {
    'use strict';

    const DATA_PATH = 'data/tonearmdesigner-cartridges.min.js';
    const DATA_GLOBAL = 'TONEARMDESIGNER_CARTRIDGES';
    const MAX_RENDERED_RESULTS = 200;

    const FALLBACK_CARTRIDGES = [{
        id: 'goldring-1042',
        manufacturer: 'Goldring',
        model: '1042',
        type: 'MM',
        mass_g: 6.3,
        compliance_10hz_cu: 11,
        compliance_10hz_estimated: false,
        tracking_force_g: { min: 1.5, max: 2.0, recommended: 1.75 },
        stylus: 'Gyger S'
    }];

    const CARTRIDGE_CONTROL_SPECS = {
        customMass: { label: 'cartridge mass', unit: 'g', digits: 3 },
        comp10: { label: 'compliance', unit: 'cu', digits: 3 },
        targetVTF: { label: 'tracking force', unit: 'g', digits: 3 }
    };

    let cartridges = [];
    let loaded = false;
    let loadError = null;
    let draftSelection = null;
    let liveSelection = null;

    function $(id) {
        return document.getElementById(id);
    }

    function currentState() {
        return (typeof state !== 'undefined') ? state : (root.state || {});
    }

    function currentPhysics() {
        return (typeof Physics !== 'undefined') ? Physics : root.Physics;
    }

    function text(value) {
        if (value === null || value === undefined || value === '') return '—';
        return String(value);
    }

    function num(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string' && value.trim() === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function fmt(value, digits) {
        const n = num(value);
        if (n === null) return '—';
        return Number(n.toFixed(digits === undefined ? 2 : digits)).toString();
    }

    function cartridgeName(cart) {
        if (!cart) return '—';
        return [cart.manufacturer, cart.model].filter(Boolean).join(' ').trim() || cart.id || 'Unnamed cartridge';
    }

    function trackingForceValue(cart) {
        const tf = cart && cart.tracking_force_g ? cart.tracking_force_g : {};
        const rec = num(tf.recommended);
        if (rec !== null) return rec;
        const min = num(tf.min);
        const max = num(tf.max);
        if (min !== null && max !== null) return (min + max) / 2;
        return min !== null ? min : max;
    }

    function trackingForceRangeText(cart) {
        const tf = cart && cart.tracking_force_g ? cart.tracking_force_g : {};
        const min = num(tf.min);
        const max = num(tf.max);
        const rec = trackingForceValue(cart);
        const range = (min !== null || max !== null) ? `${fmt(min, 2)}–${fmt(max, 2)} g` : '—';
        return rec !== null ? `${range}, rec ${fmt(rec, 2)} g` : range;
    }

    function normalizeSearch(value) {
        return String(value || '').trim().toLowerCase();
    }

    function withinRange(value, minEl, maxEl) {
        const v = num(value);
        if (v === null) return false;
        const min = minEl ? num(minEl.value) : null;
        const max = maxEl ? num(maxEl.value) : null;
        if (min !== null && v < min) return false;
        if (max !== null && v > max) return false;
        return true;
    }

    function matchesSearch(cart, query) {
        const q = normalizeSearch(query);
        if (!q) return true;
        const haystack = normalizeSearch([cart.manufacturer, cart.model].filter(Boolean).join(' '));
        return haystack.indexOf(q) !== -1;
    }

    function passesFilters(cart) {
        const typeFilter = $('cartridgeTypeFilter');
        const stylusFilter = $('cartridgeStylusFilter');
        const typeWanted = typeFilter ? typeFilter.value : '';
        if (typeWanted && String(cart.type || '') !== typeWanted) return false;

        const stylusQuery = stylusFilter ? normalizeSearch(stylusFilter.value) : '';
        if (stylusQuery && normalizeSearch(cart.stylus).indexOf(stylusQuery) === -1) return false;

        if (!withinRange(cart.mass_g, $('cartridgeMassMin'), $('cartridgeMassMax'))) return false;
        if (!withinRange(cart.compliance_10hz_cu, $('cartridgeComplianceMin'), $('cartridgeComplianceMax'))) return false;
        if (!withinRange(trackingForceValue(cart), $('cartridgeTrackingForceMin'), $('cartridgeTrackingForceMax'))) return false;

        const outMin = $('cartridgeOutputMin');
        const outMax = $('cartridgeOutputMax');
        const outputFilterActive = (outMin && outMin.value !== '') || (outMax && outMax.value !== '');
        if (outputFilterActive && !withinRange(cart.output_mv, outMin, outMax)) return false;

        return matchesSearch(cart, $('cartridgeSearchInput') ? $('cartridgeSearchInput').value : '');
    }

    function sortCartridges(list) {
        return list.slice().sort(function(a, b) {
            return cartridgeName(a).localeCompare(cartridgeName(b), undefined, { sensitivity: 'base' });
        });
    }

    function filteredCartridges() {
        return sortCartridges(cartridges.filter(passesFilters));
    }

    function setStatus(message, kind) {
        const el = $('cartridgeDataStatus');
        if (!el) return;
        el.textContent = message || '';
        el.className = 'info-text cartridge-data-status ' + (kind || '');
    }

    function setModalStatus(message, kind) {
        const el = $('cartridgePickerStatus');
        if (!el) return;
        el.textContent = message || '';
        el.className = 'cartridge-picker-status ' + (kind || '');
    }

    function exactValueString(value) {
        const n = num(value);
        if (n === null) return '';
        return String(Number(n.toFixed(4)));
    }

    function currentControlRange(id) {
        const el = $(id);
        if (!el) return null;
        return {
            id,
            min: num(el.getAttribute('min')),
            max: num(el.getAttribute('max'))
        };
    }

    function cartridgeControlValues(cart) {
        const cartridgeState = buildCartridgeState(cart);
        return {
            customMass: cartridgeState.selectedCartridgeMassG,
            comp10: cartridgeState.selectedCartridgeCompliance10HzCu,
            targetVTF: cartridgeState.selectedCartridgeTrackingForceRecommendedG
        };
    }

    function requiredRangeExpansions(cart) {
        if (!cart) return [];
        const values = cartridgeControlValues(cart);
        return Object.keys(CARTRIDGE_CONTROL_SPECS).reduce(function(list, id) {
            const el = $(id);
            const value = num(values[id]);
            const range = currentControlRange(id);
            if (!el || value === null || !range) return list;

            const spec = CARTRIDGE_CONTROL_SPECS[id];
            if (range.min !== null && value < range.min) {
                list.push({ id, edge: 'min', oldValue: range.min, newValue: value, value, label: spec.label, unit: spec.unit });
            }
            if (range.max !== null && value > range.max) {
                list.push({ id, edge: 'max', oldValue: range.max, newValue: value, value, label: spec.label, unit: spec.unit });
            }
            return list;
        }, []);
    }

    function expansionSummary(expansions) {
        if (!expansions || expansions.length === 0) return '';
        const labels = Array.from(new Set(expansions.map(e => e.label)));
        if (labels.length === 1) return labels[0];
        if (labels.length === 2) return labels.join(' and ');
        return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
    }

    function expandControlRangeForValue(id, value) {
        const el = $(id);
        const n = num(value);
        if (!el || n === null) return false;

        let changed = false;
        const currentMin = num(el.getAttribute('min'));
        const currentMax = num(el.getAttribute('max'));

        if (currentMin !== null && n < currentMin) {
            el.setAttribute('min', exactValueString(n));
            changed = true;
        }
        if (currentMax !== null && n > currentMax) {
            el.setAttribute('max', exactValueString(n));
            changed = true;
        }
        return changed;
    }

    function applyRequiredRangeExpansions(cart) {
        const values = cartridgeControlValues(cart);
        const expansions = requiredRangeExpansions(cart);
        Object.keys(values).forEach(function(id) {
            expandControlRangeForValue(id, values[id]);
        });
        return expansions;
    }

    function setNumberControl(id, value) {
        const el = $(id);
        if (!el) return;
        const n = num(value);
        if (n === null) return;
        expandControlRangeForValue(id, n);
        el.value = exactValueString(n);
        const valEl = $('val_' + id);
        if (valEl) valEl.textContent = el.value;
    }

    function buildCartridgeState(cart) {
        const tf = cart.tracking_force_g || {};
        const force = trackingForceValue(cart);
        return {
            selectedCartridgeId: cart.id || '',
            selectedCartridgeName: cartridgeName(cart),
            selectedCartridgeManufacturer: cart.manufacturer || '',
            selectedCartridgeModel: cart.model || '',
            selectedCartridgeType: cart.type || '',
            selectedCartridgeMassG: num(cart.mass_g),
            selectedCartridgeCompliance10HzCu: num(cart.compliance_10hz_cu),
            selectedCartridgeComplianceEstimated: !!cart.compliance_10hz_estimated,
            selectedCartridgeTrackingForceMinG: num(tf.min),
            selectedCartridgeTrackingForceMaxG: num(tf.max),
            selectedCartridgeTrackingForceRecommendedG: force,
            selectedCartridgeStylus: cart.stylus || '',
            selectedCartridgeCantilever: cart.cantilever || '',
            selectedCartridgeOutputMv: num(cart.output_mv)
        };
    }

    function syncSelectedSummary(cartOrState) {
        const st = cartOrState || currentState();
        const name = st.selectedCartridgeName || 'Goldring 1042';
        const mass = st.selectedCartridgeMassG;
        const compliance = st.selectedCartridgeCompliance10HzCu;
        const tf = st.selectedCartridgeTrackingForceRecommendedG;
        const type = st.selectedCartridgeType || '—';

        const summary = $('selectedCartridgeSummary');
        if (summary) {
            summary.textContent = `Selected cartridge: ${name}`;
        }

        const meta = $('selectedCartridgeMeta');
        if (meta) {
            meta.textContent = `Type ${type} · mass ${fmt(mass, 2)} g · C10 ${fmt(compliance, 2)} cu · tracking ${fmt(tf, 2)} g`;
        }

        const indicator = $('cartridgeEstimatedIndicator');
        if (indicator) {
            const estimated = !!st.selectedCartridgeComplianceEstimated;
            indicator.hidden = !estimated;
            indicator.textContent = estimated ? 'estimated compliance' : '';
        }
    }

    function renderPreview(cart) {
        const host = $('cartridgePickerPreview');
        if (!host) return;
        if (!cart) {
            host.innerHTML = '<div class="cartridge-picker-empty">Select a cartridge row to preview details.</div>';
            return;
        }
        const estimated = cart.compliance_10hz_estimated
            ? '<span class="cartridge-estimated-indicator">estimated compliance</span>'
            : '';
        const expansions = requiredRangeExpansions(cart);
        const rangeNotice = expansions.length > 0
            ? `<div class="cartridge-picker-range-warning">Applying this cartridge will expand controller ranges for ${expansionSummary(expansions)}.</div>`
            : '';
        host.innerHTML = `
            <div class="cartridge-preview-title">${cartridgeName(cart)} ${estimated}</div>
            <dl class="cartridge-preview-grid">
                <dt>Type</dt><dd>${text(cart.type)}</dd>
                <dt>Mass</dt><dd>${fmt(cart.mass_g, 2)} g</dd>
                <dt>Compliance 10 Hz</dt><dd>${fmt(cart.compliance_10hz_cu, 2)} cu</dd>
                <dt>Tracking force</dt><dd>${trackingForceRangeText(cart)}</dd>
                <dt>Stylus</dt><dd>${text(cart.stylus)}</dd>
                <dt>Cantilever</dt><dd>${text(cart.cantilever)}</dd>
                <dt>Output</dt><dd>${cart.output_mv !== undefined ? fmt(cart.output_mv, 3) + ' mV' : '—'}</dd>
            </dl>
            ${rangeNotice}
        `;
    }

    function renderResults() {
        const results = $('cartridgeResults');
        const countEl = $('cartridgeResultCount');
        if (!results || !countEl) return;

        const list = filteredCartridges();
        const shown = list.slice(0, MAX_RENDERED_RESULTS);
        countEl.textContent = `${list.length} result${list.length === 1 ? '' : 's'}${list.length > shown.length ? `, showing first ${shown.length}` : ''}`;

        if (shown.length === 0) {
            results.innerHTML = '<div class="cartridge-picker-empty">No cartridges match the current filters.</div>';
            renderPreview(null);
            draftSelection = null;
            syncApplyEnabled();
            return;
        }

        results.innerHTML = shown.map(function(cart) {
            const selected = draftSelection && draftSelection.id === cart.id ? ' selected' : '';
            const estimated = cart.compliance_10hz_estimated ? '<span class="cartridge-row-badge">est.</span>' : '';
            return `<button type="button" class="cartridge-result-row${selected}" data-cartridge-id="${String(cart.id).replace(/"/g, '&quot;')}">
                <span class="cartridge-result-name">${cartridgeName(cart)} ${estimated}</span>
                <span class="cartridge-result-meta">${text(cart.type)} · ${fmt(cart.mass_g, 2)} g · C10 ${fmt(cart.compliance_10hz_cu, 2)} · TF ${fmt(trackingForceValue(cart), 2)} g</span>
            </button>`;
        }).join('');

        Array.from(results.querySelectorAll('[data-cartridge-id]')).forEach(function(btn) {
            btn.addEventListener('click', function() {
                const id = btn.getAttribute('data-cartridge-id');
                draftSelection = cartridges.find(c => String(c.id) === String(id)) || null;
                renderPreview(draftSelection);
                renderResults();
                syncApplyEnabled();
            });
        });
    }

    function syncApplyEnabled() {
        const apply = $('cartridgePickerApplyBtn');
        if (apply) apply.disabled = !draftSelection;
    }

    function populateTypeFilter() {
        const el = $('cartridgeTypeFilter');
        if (!el) return;
        const types = Array.from(new Set(cartridges.map(c => c.type).filter(Boolean))).sort();
        const current = el.value;
        el.innerHTML = '<option value="">All types</option>' + types.map(t => `<option value="${String(t).replace(/"/g, '&quot;')}">${t}</option>`).join('');
        if (types.indexOf(current) !== -1) el.value = current;
    }

    function setModePanel(mode) {
        const cartProps = $('cartProps');
        const customProps = $('customCartProps');
        const armOnlyProps = $('armOnlyProps');
        if (cartProps) cartProps.style.display = (mode !== 'none') ? 'block' : 'none';
        if (customProps) customProps.style.display = (mode === 'custom' || mode === 'selected') ? 'block' : 'none';
        if (armOnlyProps) armOnlyProps.style.display = (mode === 'none') ? 'block' : 'none';
    }

    function applySelectedCartridge(cart) {
        if (!cart) return false;

        const cartridgeState = buildCartridgeState(cart);
        const mass = cartridgeState.selectedCartridgeMassG;
        const compliance = cartridgeState.selectedCartridgeCompliance10HzCu;
        const trackingForce = cartridgeState.selectedCartridgeTrackingForceRecommendedG;

        if (mass === null || compliance === null || trackingForce === null) {
            setModalStatus('Selected cartridge lacks mass, compliance, or tracking force.', 'error');
            return false;
        }

        const cartMode = $('cartMode');
        if (cartMode) cartMode.value = 'selected';
        setModePanel('selected');

        const rangeExpansions = applyRequiredRangeExpansions(cart);

        setNumberControl('customMass', mass);
        setNumberControl('comp10', compliance);
        const kEl = $('compK');
        const k = kEl ? num(kEl.value) : null;
        if (k !== null && currentPhysics() && typeof currentPhysics().calcEstimatedC100 === 'function') {
            setNumberControl('comp100', currentPhysics().calcEstimatedC100(compliance, k));
        }
        setNumberControl('targetVTF', trackingForce);

        Object.assign(currentState(), cartridgeState, {
            cartMode: 'selected',
            customMass: mass,
            comp10: compliance,
            targetVTF: trackingForce,
            cartridgeComplianceEstimated: !!cartridgeState.selectedCartridgeComplianceEstimated
        });

        if (typeof root.Session_setIsEstimatedC10 === 'function') {
            root.Session_setIsEstimatedC10(false);
        }
        if (typeof syncComplianceUI === 'function') syncComplianceUI();
        if (typeof updateState === 'function') updateState();

        // updateState reads DOM controls but does not own the compact cartridge
        // metadata, so re-assert it after the general state refresh.
        Object.assign(currentState(), cartridgeState, {
            cartMode: 'selected',
            cartridgeComplianceEstimated: !!cartridgeState.selectedCartridgeComplianceEstimated
        });

        liveSelection = cart;
        syncSelectedSummary(currentState() || cartridgeState);
        if (rangeExpansions.length > 0) {
            const message = `Applied ${cartridgeName(cart)}. Controller range expanded for selected cartridge.`;
            setStatus(message, 'success');
            setModalStatus(message, 'success');
        } else {
            setStatus(`Applied ${cartridgeName(cart)}.`, 'success');
            setModalStatus(`Applied ${cartridgeName(cart)}.`, 'success');
        }
        return true;
    }

    function openModal() {
        const modal = $('cartridgePickerModal');
        if (!modal) return;
        draftSelection = liveSelection || cartridges.find(c => c.id === (currentState().selectedCartridgeId)) || cartridges[0] || null;
        setModalStatus('', '');
        modal.hidden = false;
        modal.classList.add('open');
        document.body.classList.add('cartridge-picker-open');
        renderPreview(draftSelection);
        renderResults();
        syncApplyEnabled();
        const search = $('cartridgeSearchInput');
        if (search) search.focus();
    }

    function closeModal() {
        const modal = $('cartridgePickerModal');
        if (!modal) return;
        draftSelection = null;
        modal.classList.remove('open');
        modal.hidden = true;
        document.body.classList.remove('cartridge-picker-open');
    }

    function resetFilters() {
        [
            'cartridgeSearchInput', 'cartridgeMassMin', 'cartridgeMassMax',
            'cartridgeComplianceMin', 'cartridgeComplianceMax',
            'cartridgeTrackingForceMin', 'cartridgeTrackingForceMax',
            'cartridgeOutputMin', 'cartridgeOutputMax', 'cartridgeStylusFilter'
        ].forEach(function(id) {
            const el = $(id);
            if (el) el.value = '';
        });
        const type = $('cartridgeTypeFilter');
        if (type) type.value = '';
        setModalStatus('Filters cleared.', 'info');
        renderResults();
    }

    function bindEvents() {
        const openBtn = $('cartridgePickerOpenBtn');
        if (openBtn) openBtn.addEventListener('click', openModal);

        const closeBtn = $('cartridgePickerCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        const cancelBtn = $('cartridgePickerCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        const applyBtn = $('cartridgePickerApplyBtn');
        if (applyBtn) applyBtn.addEventListener('click', function() {
            if (applySelectedCartridge(draftSelection)) closeModal();
        });

        const resetBtn = $('cartridgePickerResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetFilters);

        const modal = $('cartridgePickerModal');
        if (modal) {
            modal.addEventListener('click', function(evt) {
                if (evt.target === modal) {
                    evt.preventDefault();
                    setModalStatus('Backdrop click ignored. Use Apply, Cancel, or X.', 'info');
                }
            });
        }

        [
            'cartridgeSearchInput', 'cartridgeTypeFilter', 'cartridgeMassMin', 'cartridgeMassMax',
            'cartridgeComplianceMin', 'cartridgeComplianceMax', 'cartridgeTrackingForceMin',
            'cartridgeTrackingForceMax', 'cartridgeOutputMin', 'cartridgeOutputMax', 'cartridgeStylusFilter'
        ].forEach(function(id) {
            const el = $(id);
            if (!el) return;
            el.addEventListener('input', renderResults);
            el.addEventListener('change', renderResults);
        });
    }

    function loadCartridges() {
        const data = root[DATA_GLOBAL] || (root.window && root.window.TONEARMDESIGNER_CARTRIDGES) || (typeof window !== 'undefined' ? window.TONEARMDESIGNER_CARTRIDGES : null);

        if (Array.isArray(data)) {
            cartridges = sortCartridges(data);
            loaded = true;
            loadError = null;
            populateTypeFilter();
            setStatus(`Loaded ${cartridges.length} cartridges from compact data script.`, 'success');
            renderResults();
            return Promise.resolve(cartridges);
        }

        cartridges = sortCartridges(FALLBACK_CARTRIDGES);
        loaded = false;
        loadError = DATA_GLOBAL + ' unavailable';
        populateTypeFilter();
        setStatus('Cartridge data script could not be loaded; Goldring fallback remains available.', 'error');
        renderResults();
        return Promise.resolve(cartridges);
    }

    function init() {
        bindEvents();
        cartridges = sortCartridges(FALLBACK_CARTRIDGES);
        populateTypeFilter();
        syncSelectedSummary(currentState());
        renderResults();
        loadCartridges();
    }

    root.CartridgePicker = {
        DATA_PATH,
        DATA_GLOBAL,
        init,
        loadCartridges,
        filterCartridges: filteredCartridges,
        applySelectedCartridge,
        syncSelectedSummary,
        trackingForceValue,
        requiredRangeExpansions,
        applyRequiredRangeExpansions,
        expansionSummary,
        matchesSearch,
        passesFilters,
        getCartridges: function() { return cartridges.slice(); },
        getState: function() { return { loaded, loadError, count: cartridges.length }; }
    };

    init();
})(typeof window !== 'undefined' ? window : globalThis);
