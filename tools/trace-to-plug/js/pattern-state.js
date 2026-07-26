// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Own the Trace to Plug workflow state and derive the pattern geometry from it.
 * Inputs: An imported trace package descriptor and the operator's recorded pattern decisions.
 * Outputs: A sanitized loft state, the pattern mesh, and the decision record; no DOM access.
 * Safe edits: Additional recorded decisions and derived pattern metrics.
 * Do not: Carry parametric tonearm concepts here, or let a decision reach geometry without being recorded.
 * Verification: test/pattern-pipeline.test.cjs
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PatternState = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const STATE_SCHEMA = 'engrove-trace-to-plug-state-v1';
    const SECTION_FULLNESS = Object.freeze({ min: 0.35, max: 8, default: 2.6 });
    const ALLOWANCE_PERCENT = Object.freeze({ min: -5, max: 10 });
    const SPLIT_PERCENT = Object.freeze({ min: 5, max: 95 });
    const MESH_RESOLUTION = Object.freeze({ stationCount: 24, segmentCount: 48 });

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamped(value, range, fallback) {
        const n = finite(value, fallback);
        return Math.min(range.max, Math.max(range.min, n));
    }

    /** The decisions an operator makes, and nothing else. Everything here ends up in the record. */
    function createState() {
        return {
            schema: STATE_SCHEMA,
            step: 'import',
            source: null,
            views: null,
            loft: null,
            decisions: {
                stationCount: 14,
                sectionFullness: SECTION_FULLNESS.default,
                allowancePercent: 0,
                pullAxis: 'Z',
                splitEnabled: false,
                splitPositionPercent: 50,
                splitClearanceMm: 0.1,
                registrationEnabled: true,
                pinRadiusMm: 0,
                pinDepthMm: 3,
                pinClearanceMm: 0.15
            },
            release: null,
            lastError: null
        };
    }

    function sanitizeDecisions(decisions) {
        const source = decisions || {};
        return {
            stationCount: Math.round(clamped(source.stationCount, { min: 6, max: 24 }, 14)),
            sectionFullness: clamped(source.sectionFullness, SECTION_FULLNESS, SECTION_FULLNESS.default),
            allowancePercent: clamped(source.allowancePercent, ALLOWANCE_PERCENT, 0),
            pullAxis: ['X', 'Y', 'Z'].indexOf(String(source.pullAxis || 'Z').toUpperCase()) >= 0
                ? String(source.pullAxis).toUpperCase() : 'Z',
            splitEnabled: !!source.splitEnabled,
            splitPositionPercent: clamped(source.splitPositionPercent, SPLIT_PERCENT, 50),
            splitClearanceMm: Math.max(0, finite(source.splitClearanceMm, 0.1)),
            registrationEnabled: source.registrationEnabled !== false,
            pinRadiusMm: Math.max(0, finite(source.pinRadiusMm, 0)),
            pinDepthMm: Math.max(0.5, finite(source.pinDepthMm, 3)),
            pinClearanceMm: Math.max(0, finite(source.pinClearanceMm, 0.15))
        };
    }

    /**
     * Rebuilds the loft from the imported views and the current decisions. Interpretation is not cached
     * against the decisions that produced it: a stale pattern is how an operator ends up printing one
     * shape while reading the numbers of another.
     */
    function interpret(state, kernel, adapter) {
        if (!state.views || !state.views.length) return { ok: false, error: 'Import a trace package before interpreting it.' };
        const decisions = sanitizeDecisions(state.decisions);
        try {
            const proposed = adapter.buildFreeformState(state.views, {
                baseState: kernel.defaultState('straight_low_mass_lt_arm'),
                stationCount: decisions.stationCount,
                superellipseExponent: decisions.sectionFullness
            });
            state.loft = kernel.sanitizeState(proposed);
            state.decisions = decisions;
            state.lastError = null;
            return { ok: true, loft: state.loft };
        } catch (error) {
            state.loft = null;
            state.lastError = error && error.message ? error.message : String(error);
            return { ok: false, error: state.lastError, code: error && error.code };
        }
    }

    /**
     * The loft with the casting allowance applied. This is the shape that gets measured, checked, split and
     * exported: every downstream step must see the same object the printer will.
     */
    function patternState(state, kernel) {
        if (!state.loft) return { ok: false, error: 'Interpret the trace before building a pattern.' };
        const decisions = sanitizeDecisions(state.decisions);
        if (decisions.allowancePercent === 0) return { ok: true, pattern: state.loft, factor: 1 };
        try {
            const factor = 1 + decisions.allowancePercent / 100;
            return { ok: true, pattern: kernel.scaleCrossSection(state.loft, factor), factor };
        } catch (error) {
            return { ok: false, error: error && error.message ? error.message : String(error) };
        }
    }

    function patternGeometry(state, kernel) {
        const resolved = patternState(state, kernel);
        if (!resolved.ok) return resolved;
        return {
            ok: true,
            factor: resolved.factor,
            geometry: kernel.buildFreeformGeometry(resolved.pattern, MESH_RESOLUTION),
            pattern: resolved.pattern
        };
    }

    /** Flat record of everything that shaped the exported pattern, for the report and the AI prompt. */
    function decisionRecord(state) {
        const decisions = sanitizeDecisions(state.decisions);
        const provenance = (state.loft && state.loft.sourceProvenance) || {};
        const traced = provenance.commonLongitudinalSourceRangeMm || {};
        const lofted = provenance.loftedLongitudinalRangeMm || {};
        return {
            schema: 'engrove-trace-to-plug-record-v1',
            source: state.source ? { fileName: state.source.fileName, projectId: state.source.projectId, traceIds: state.source.traceIds } : null,
            tracedLengthMm: traced.translatedLength !== undefined ? traced.translatedLength : null,
            loftedLengthMm: lofted.loftedLength !== undefined ? lofted.loftedLength : null,
            endStationInsets: Array.isArray(provenance.endStationInsets) ? provenance.endStationInsets.length : 0,
            sectionFullness: decisions.sectionFullness,
            sectionFullnessSource: provenance.sectionExponentSource || 'default',
            allowancePercent: decisions.allowancePercent,
            pullAxis: decisions.pullAxis,
            split: decisions.splitEnabled
                ? { positionPercent: decisions.splitPositionPercent, clearanceMm: decisions.splitClearanceMm,
                    registration: decisions.registrationEnabled ? { radiusMm: decisions.pinRadiusMm, depthMm: decisions.pinDepthMm, clearanceMm: decisions.pinClearanceMm } : null }
                : null,
            release: state.release
                ? { pullAxis: state.release.pullAxis, twoPartMouldable: state.release.twoPartMouldable,
                    undercutRayCount: state.release.undercutRayCount, lowDraftAreaFraction: state.release.lowDraftAreaFraction,
                    claimBoundary: state.release.claimBoundary }
                : null
        };
    }

    return Object.freeze({
        STATE_SCHEMA,
        SECTION_FULLNESS,
        ALLOWANCE_PERCENT,
        SPLIT_PERCENT,
        MESH_RESOLUTION,
        createState,
        sanitizeDecisions,
        interpret,
        patternState,
        patternGeometry,
        decisionRecord
    });
});
