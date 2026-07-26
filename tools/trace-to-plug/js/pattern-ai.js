// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Build the AI prompt for a pattern and validate a pasted response before it may change anything.
 * Inputs: The workflow decision record and a response string typed or pasted by the operator.
 * Outputs: Prompt text, and either an accepted decision patch or named diagnostics; no network and no DOM access.
 * Safe edits: Prompt wording and additional validated decision fields.
 * Do not: Send anything anywhere, accept a field outside the contract, or apply a response that failed validation.
 * Verification: test/pattern-pipeline.test.cjs
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PatternAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const RESPONSE_SCHEMA = 'engrove-trace-to-plug-ai-response-v1';

    // The only fields an AI may propose. Anything else is refused by name rather than ignored, so an
    // operator is never left believing a suggestion was applied when it was silently dropped.
    const WRITABLE = Object.freeze({
        sectionFullness: { min: 0.35, max: 8, kind: 'number' },
        allowancePercent: { min: -5, max: 10, kind: 'number' },
        pullAxis: { values: ['X', 'Y', 'Z'], kind: 'enum' },
        splitEnabled: { kind: 'boolean' },
        splitPositionPercent: { min: 5, max: 95, kind: 'number' },
        splitClearanceMm: { min: 0, max: 2, kind: 'number' },
        registrationEnabled: { kind: 'boolean' },
        pinRadiusMm: { min: 0, max: 12, kind: 'number' },
        pinDepthMm: { min: 0.5, max: 30, kind: 'number' },
        pinClearanceMm: { min: 0, max: 1, kind: 'number' }
    });

    function diagnostic(code, message, at) {
        return { code, message, at: at || null };
    }

    /**
     * The prompt carries the pattern's measured facts and the operator's current decisions, plus the exact
     * response contract. It never carries the trace geometry itself: the point of the handoff is advice on
     * the decisions, and the geometry stays on the operator's machine.
     */
    function buildPrompt(record, notes) {
        const lines = [];
        lines.push('You are advising on a 3D printed casting pattern ("plug") that will be used to make a two-part');
        lines.push('glassfibre mould, from which a final part is laid up in carbon fibre.');
        lines.push('');
        lines.push('The pattern was built from two orthographic traced views. Those views fix each cross-section\'s');
        lines.push('width and height but not its corner fullness, which is why sectionFullness is an operator choice.');
        lines.push('');
        lines.push('## Current pattern');
        lines.push('```json');
        lines.push(JSON.stringify(record, null, 2));
        lines.push('```');
        lines.push('');
        if (notes && String(notes).trim()) {
            lines.push('## What the operator wants');
            lines.push(String(notes).trim());
            lines.push('');
        }
        lines.push('## What you may change');
        lines.push('Only these fields, each within the stated range:');
        Object.keys(WRITABLE).sort().forEach(field => {
            const spec = WRITABLE[field];
            const bounds = spec.kind === 'enum' ? spec.values.join(' | ')
                : spec.kind === 'boolean' ? 'true | false'
                : spec.min + ' .. ' + spec.max;
            lines.push('- `' + field + '` (' + spec.kind + '): ' + bounds);
        });
        lines.push('');
        lines.push('## Response contract');
        lines.push('Reply with exactly one JSON object and no prose or markdown fences:');
        lines.push('```json');
        lines.push(JSON.stringify({
            schema: RESPONSE_SCHEMA,
            reasoning: 'one or two sentences explaining the change',
            decisions: { sectionFullness: 3.2 },
            assumptions: ['anything you had to assume']
        }, null, 2));
        lines.push('```');
        lines.push('Include only the fields you want changed. Omit `decisions` entirely if nothing should change.');
        lines.push('Do not propose a change you cannot justify from the pattern facts above.');
        return lines.join('\n');
    }

    /**
     * Validates a pasted response. Fails closed: an unparseable, mislabelled, unknown-field or out-of-range
     * response yields named diagnostics and no patch at all, rather than a partially applied suggestion.
     */
    function validateResponse(text) {
        const errors = [];
        let parsed;
        const raw = String(text === undefined || text === null ? '' : text).trim();
        if (!raw) return { ok: false, diagnostics: [diagnostic('AI_RESPONSE_EMPTY', 'Paste the AI response before applying it.')] };
        // A fenced block is the single most common paste, so unwrap it rather than refusing over formatting.
        const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        try {
            parsed = JSON.parse(unfenced);
        } catch (error) {
            return { ok: false, diagnostics: [diagnostic('AI_RESPONSE_NOT_JSON', 'The response is not valid JSON: ' + (error && error.message))] };
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, diagnostics: [diagnostic('AI_RESPONSE_NOT_OBJECT', 'The response must be a single JSON object.')] };
        }
        if (parsed.schema !== RESPONSE_SCHEMA) {
            errors.push(diagnostic('AI_RESPONSE_SCHEMA_MISMATCH', 'The response must declare schema "' + RESPONSE_SCHEMA + '"; received ' + JSON.stringify(parsed.schema) + '.', 'schema'));
        }

        const proposed = parsed.decisions;
        const patch = {};
        if (proposed !== undefined && proposed !== null) {
            if (typeof proposed !== 'object' || Array.isArray(proposed)) {
                errors.push(diagnostic('AI_DECISIONS_NOT_OBJECT', '`decisions` must be an object when present.', 'decisions'));
            } else {
                Object.keys(proposed).forEach(field => {
                    const spec = WRITABLE[field];
                    if (!spec) {
                        errors.push(diagnostic('AI_FIELD_NOT_WRITABLE', 'The response proposes `' + field + '`, which this tool does not let an AI change.', 'decisions.' + field));
                        return;
                    }
                    const value = proposed[field];
                    if (spec.kind === 'boolean') {
                        if (typeof value !== 'boolean') {
                            errors.push(diagnostic('AI_FIELD_TYPE', '`' + field + '` must be true or false.', 'decisions.' + field));
                            return;
                        }
                        patch[field] = value;
                        return;
                    }
                    if (spec.kind === 'enum') {
                        if (spec.values.indexOf(String(value).toUpperCase()) < 0) {
                            errors.push(diagnostic('AI_FIELD_VALUE', '`' + field + '` must be one of ' + spec.values.join(', ') + '.', 'decisions.' + field));
                            return;
                        }
                        patch[field] = String(value).toUpperCase();
                        return;
                    }
                    const number = Number(value);
                    if (!Number.isFinite(number)) {
                        errors.push(diagnostic('AI_FIELD_TYPE', '`' + field + '` must be a finite number.', 'decisions.' + field));
                        return;
                    }
                    if (number < spec.min || number > spec.max) {
                        errors.push(diagnostic('AI_FIELD_RANGE', '`' + field + '` is ' + number + ', outside the supported ' + spec.min + ' to ' + spec.max + '.', 'decisions.' + field));
                        return;
                    }
                    patch[field] = number;
                });
            }
        }

        if (errors.length) return { ok: false, diagnostics: errors };
        return {
            ok: true,
            diagnostics: [],
            patch,
            reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
            assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String) : [],
            changedFields: Object.keys(patch).sort()
        };
    }

    return Object.freeze({ RESPONSE_SCHEMA, WRITABLE, buildPrompt, validateResponse });
});
