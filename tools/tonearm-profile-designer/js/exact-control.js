/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F exact-control.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/exact-control.js
 * Compact exact-value popover for slider-bound numeric parameters.
 *
 * This module updates the same DOM input used by the slider and dispatches
 * the same input event so existing updateState bindings remain authoritative.
 */
(function() {
    let popover = null;
    let activeId = null;
    let activeButton = null;

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

    function metaFor(id) {
        return window.ParameterMetadata && typeof window.ParameterMetadata.get === 'function'
            ? window.ParameterMetadata.get(id)
            : null;
    }

    function finiteNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function runtimeMinMax(id, meta) {
        const el = $(id);
        const domMin = el ? finiteNumber(el.min) : null;
        const domMax = el ? finiteNumber(el.max) : null;
        return {
            min: domMin !== null ? domMin : Number(meta.min),
            max: domMax !== null ? domMax : Number(meta.max)
        };
    }

    function decimalsFromStep(step) {
        const text = String(step == null ? '' : step);
        if (text.indexOf('e-') !== -1) return Number(text.split('e-')[1]) || 0;
        const i = text.indexOf('.');
        return i === -1 ? 0 : text.length - i - 1;
    }

    function precisionFor(meta) {
        const p = Number(meta && meta.precision);
        if (Number.isInteger(p) && p >= 0) return p;
        return decimalsFromStep(meta && meta.step);
    }

    function formatValue(value, meta) {
        const precision = precisionFor(meta);
        return Number(value).toFixed(precision);
    }

    function normalizeValue(id, rawValue) {
        const meta = metaFor(id);
        if (!meta) return { ok: false, error: 'No parameter metadata found for "' + id + '".' };

        const value = Number(rawValue);
        if (!Number.isFinite(value)) {
            return { ok: false, error: 'Enter a numeric value.' };
        }

        const bounds = runtimeMinMax(id, meta);
        if (Number.isFinite(bounds.min) && value < bounds.min) {
            return { ok: false, error: 'Value is below minimum ' + formatValue(bounds.min, meta) + ' ' + (meta.unit || '') + '.' };
        }
        if (Number.isFinite(bounds.max) && value > bounds.max) {
            return { ok: false, error: 'Value is above maximum ' + formatValue(bounds.max, meta) + ' ' + (meta.unit || '') + '.' };
        }

        const step = Number(meta.step);
        const precision = precisionFor(meta);
        let rounded = value;
        if (Number.isFinite(step) && step > 0) {
            const base = Number.isFinite(bounds.min) ? bounds.min : 0;
            rounded = base + Math.round((value - base) / step) * step;
        }
        const factor = Math.pow(10, precision);
        rounded = Math.round((rounded + Number.EPSILON) * factor) / factor;

        if (Number.isFinite(bounds.min)) rounded = Math.max(bounds.min, rounded);
        if (Number.isFinite(bounds.max)) rounded = Math.min(bounds.max, rounded);

        const roundedText = formatValue(rounded, meta);
        const roundedChanged = Math.abs(rounded - value) > Math.max(1e-12, Math.abs(step || 0) * 1e-9);
        return {
            ok: true,
            id,
            value,
            normalized: rounded,
            text: roundedText,
            rounded: roundedChanged,
            message: roundedChanged ? 'Value rounded to nearest step: ' + roundedText + (meta.unit ? ' ' + meta.unit : '') + '.' : ''
        };
    }

    function setMessage(kind, text) {
        const msg = popover ? popover.querySelector('[data-exact-message]') : null;
        if (!msg) return;
        msg.className = 'exact-control-message ' + (kind || '');
        msg.textContent = text || '';
    }

    function applyExactValue(id, rawValue, options) {
        const meta = metaFor(id);
        const el = $(id);
        if (!meta || !el) {
            return { ok: false, error: 'Control not found for "' + id + '".' };
        }

        const result = normalizeValue(id, rawValue);
        if (!result.ok) return result;

        el.value = result.text;
        const valEl = $('val_' + id);
        if (valEl) valEl.innerText = result.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));

        if (!(options && options.silent)) {
            setMessage(result.rounded ? 'info' : 'success', result.message || 'Value applied.');
        }

        return Object.assign({}, result, { applied: true, updateEventDispatched: true });
    }

    function metadataRows(meta) {
        const zones = meta.zoneTags && meta.zoneTags.length ? meta.zoneTags.join(', ') : 'none';
        const locked = meta.aiWritable ? 'yes' : 'no';
        return [
            ['Unit', meta.unit || 'unitless'],
            ['Valid range', String(meta.min) + ' – ' + String(meta.max)],
            ['Step / precision', String(meta.step) + ' / ' + String(meta.precision)],
            ['AI writable', locked],
            ['Zones', zones]
        ].map(row => '<div><strong>' + escapeHTML(row[0]) + ':</strong> ' + escapeHTML(row[1]) + '</div>').join('');
    }

    function currentValueLine(id, meta) {
        const el = $(id);
        const value = el ? el.value : '';
        return escapeHTML(value) + (meta.unit ? ' ' + escapeHTML(meta.unit) : '');
    }

    function createPopover() {
        if (popover) return popover;
        popover = document.createElement('div');
        popover.className = 'exact-control-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-live', 'polite');
        popover.hidden = true;
        document.body.appendChild(popover);

        document.addEventListener('keydown', evt => {
            if (evt.key === 'Escape') hidePopover();
        });
        document.addEventListener('mousedown', evt => {
            if (!popover || popover.hidden) return;
            if (popover.contains(evt.target)) return;
            if (evt.target && evt.target.closest && evt.target.closest('.exact-control-btn')) return;
            hidePopover();
        });
        window.addEventListener('resize', repositionActivePopover);
        window.addEventListener('scroll', repositionActivePopover, true);
        return popover;
    }

    function clamp(value, min, max) {
        if (!Number.isFinite(value)) return min;
        if (max < min) return min;
        return Math.max(min, Math.min(max, value));
    }

    function viewportSize() {
        const docEl = document.documentElement || {};
        return {
            width: Math.max(320, window.innerWidth || docEl.clientWidth || 320),
            height: Math.max(240, window.innerHeight || docEl.clientHeight || 240)
        };
    }

    function positionPopover(button) {
        if (!popover || !button || !button.getBoundingClientRect) return;
        const rect = button.getBoundingClientRect();
        const viewport = viewportSize();
        const pad = 10;
        const gap = 8;

        popover.style.maxWidth = Math.max(180, viewport.width - pad * 2) + 'px';
        popover.style.maxHeight = Math.max(140, viewport.height - pad * 2) + 'px';
        popover.style.overflowY = 'auto';

        const popRect = popover.getBoundingClientRect ? popover.getBoundingClientRect() : { width: 300, height: 240 };
        const popWidth = Math.min(popRect.width || 300, viewport.width - pad * 2);
        const popHeight = Math.min(popRect.height || 240, viewport.height - pad * 2);

        const centeredLeft = rect.left + rect.width / 2 - popWidth / 2;
        const left = clamp(centeredLeft, pad, viewport.width - popWidth - pad);

        const belowTop = rect.bottom + gap;
        const aboveTop = rect.top - popHeight - gap;
        let top;
        let placement;
        if (belowTop + popHeight <= viewport.height - pad) {
            top = belowTop;
            placement = 'bottom';
        } else if (aboveTop >= pad) {
            top = aboveTop;
            placement = 'top';
        } else {
            top = clamp(belowTop, pad, viewport.height - popHeight - pad);
            placement = top < rect.top ? 'top-clamped' : 'bottom-clamped';
        }

        popover.style.left = left + 'px';
        popover.style.top = top + 'px';
        popover.setAttribute('data-placement', placement);
    }

    function repositionActivePopover() {
        if (!popover || popover.hidden || !activeButton) return;
        positionPopover(activeButton);
    }

    function hidePopover() {
        if (!popover) return;
        popover.hidden = true;
        activeId = null;
        activeButton = null;
    }

    function showPopover(id, button) {
        const meta = metaFor(id);
        const el = $(id);
        if (!meta || !el) return;

        activeId = id;
        activeButton = button;
        createPopover();

        const unit = meta.unit ? ' ' + escapeHTML(meta.unit) : '';
        popover.innerHTML = [
            '<div class="exact-control-title-row">',
            '<div>',
            '<div class="exact-control-kicker">Exact value</div>',
            '<div class="exact-control-title">' + escapeHTML(meta.label) + '</div>',
            '</div>',
            '<button type="button" class="exact-control-close" aria-label="Close exact value popover">×</button>',
            '</div>',
            '<div class="exact-control-desc">' + escapeHTML(meta.description || '') + '</div>',
            '<div class="exact-control-current">Current: <strong>' + currentValueLine(id, meta) + '</strong></div>',
            '<div class="exact-control-meta">' + metadataRows(meta) + '</div>',
            meta.notes ? '<div class="exact-control-note">' + escapeHTML(meta.notes) + '</div>' : '',
            '<label class="exact-control-input-label">New value' + unit + '</label>',
            '<input type="text" class="exact-control-input" inputmode="decimal" data-exact-input value="' + escapeHTML(el.value) + '">',
            '<div class="exact-control-actions">',
            '<button type="button" class="exact-control-apply" data-exact-apply>Apply</button>',
            '<button type="button" class="exact-control-cancel" data-exact-cancel>Cancel</button>',
            '</div>',
            '<div class="exact-control-message" data-exact-message></div>'
        ].join('');

        const close = popover.querySelector('.exact-control-close');
        const cancel = popover.querySelector('[data-exact-cancel]');
        const apply = popover.querySelector('[data-exact-apply]');
        const input = popover.querySelector('[data-exact-input]');

        const doApply = () => {
            const result = applyExactValue(activeId, input.value);
            if (!result.ok) {
                setMessage('error', result.error);
                return;
            }
            input.value = result.text;
        };

        if (close) close.addEventListener('click', hidePopover);
        if (cancel) cancel.addEventListener('click', hidePopover);
        if (apply) apply.addEventListener('click', doApply);
        if (input) {
            input.addEventListener('keydown', evt => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    doApply();
                }
            });
        }

        popover.hidden = false;
        positionPopover(button);
        if (input) {
            input.focus();
            input.select();
        }
    }

    function controlLabelFor(input) {
        let node = input ? input.previousElementSibling : null;
        while (node && node.tagName && node.tagName.toLowerCase() !== 'label') {
            node = node.previousElementSibling;
        }
        if (node && node.tagName && node.tagName.toLowerCase() === 'label') return node;
        const parent = input ? input.closest('.control-group') : null;
        return parent ? parent.querySelector('label') : null;
    }

    function addButton(meta) {
        const input = $(meta.id);
        if (!input || input.type !== 'range') return false;
        const label = controlLabelFor(input);
        if (!label || label.querySelector('[data-exact-for="' + meta.id + '"]')) return false;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'exact-control-btn';
        btn.setAttribute('data-exact-for', meta.id);
        btn.setAttribute('aria-label', 'Exact value for ' + meta.label);
        btn.title = 'Exact value and parameter metadata';
        btn.textContent = '#';
        btn.addEventListener('click', evt => {
            evt.preventDefault();
            evt.stopPropagation();
            showPopover(meta.id, btn);
        });
        label.appendChild(document.createTextNode(' '));
        label.appendChild(btn);
        return true;
    }

    function initExactControls() {
        if (!window.ParameterMetadata || typeof window.ParameterMetadata.exactEditable !== 'function') {
            return { ok: false, added: 0, error: 'ParameterMetadata not loaded.' };
        }
        const metas = window.ParameterMetadata.exactEditable();
        let added = 0;
        metas.forEach(meta => { if (addButton(meta)) added += 1; });
        return { ok: true, added, total: metas.length };
    }

    window.ParameterExactControl = Object.freeze({
        init: initExactControls,
        normalizeValue,
        applyExactValue,
        hide: hidePopover
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExactControls);
    } else {
        initExactControls();
    }
})();
