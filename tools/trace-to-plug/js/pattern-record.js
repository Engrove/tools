// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Render the pattern decision record as the Markdown sheet that ships beside an exported STL.
 * Inputs: The decision record, the measured mesh metrics, and the applied AI proposals.
 * Outputs: Markdown text; no DOM and no network access.
 * Safe edits: Additional reported sections and wording.
 * Do not: Report a number the record does not carry, or drop the stated limits from the sheet.
 * Verification: test/pattern-record.test.cjs
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PatternRecord = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    // Every number in the sheet is a measurement or a recorded decision. These limits travel with it because
    // the sheet outlives the session: whoever reads it later must see what the pattern does not establish.
    const LIMITS = Object.freeze([
        'Two orthographic silhouettes fix each section\'s width and height, not its corner fullness. The section fullness above is an operator assumption, and it changes the pattern volume.',
        'The mould release check is ray-sampled on the exported mesh at the exported tessellation. It is a geometric test, not a mould-flow, tooling or process simulation.',
        'A closed mesh and a release verdict do not establish that the mould will produce an acceptable part.',
        'STL is a mesh reference output, not a parametric STEP or a manufacturing-ready B-rep model.',
        'Dimensional truth is inherited from the trace calibration. This tool cannot detect a mis-scaled or axis-ambiguous source trace.'
    ]);

    function number(value, digits) {
        return Number.isFinite(Number(value)) ? Number(value).toFixed(digits === undefined ? 3 : digits) : 'not recorded';
    }

    function row(label, value) {
        return '| ' + label + ' | ' + value + ' |';
    }

    function renderMarkdown(record, meshMetrics, options) {
        const settings = options || {};
        const source = record.source || {};
        const lines = [];
        lines.push('# Casting pattern record');
        lines.push('');
        lines.push('Produced by Engrove Trace to Plug. This sheet describes the pattern in the STL beside it.');
        lines.push('');

        lines.push('## Source');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('| --- | --- |');
        lines.push(row('Package', source.fileName || 'not recorded'));
        lines.push(row('Project id', source.projectId || 'not recorded'));
        lines.push(row('Trace ids', Array.isArray(source.traceIds) && source.traceIds.length ? source.traceIds.join(', ') : 'not recorded'));
        lines.push(row('Traced length', number(record.tracedLengthMm) + ' mm'));
        lines.push(row('Lofted length', number(record.loftedLengthMm) + ' mm'));
        lines.push(row('End stations recovered by inset', String(record.endStationInsets)));
        lines.push('');

        lines.push('## Decisions');
        lines.push('');
        lines.push('| Decision | Value | Origin |');
        lines.push('| --- | --- | --- |');
        lines.push('| Section fullness (superellipse exponent) | ' + number(record.sectionFullness, 2) + ' | ' + record.sectionFullnessSource + ' |');
        lines.push('| Casting allowance | ' + number(record.allowancePercent, 2) + ' % on every section, length unchanged | operator |');
        lines.push('| Pull axis | ' + record.pullAxis + ' | operator |');
        if (record.split) {
            lines.push('| Split position | ' + number(record.split.positionPercent, 1) + ' % of length | operator |');
            lines.push('| Split clearance | ' + number(record.split.clearanceMm) + ' mm | operator |');
            if (record.split.registration) {
                lines.push('| Registration pin | radius ' + number(record.split.registration.radiusMm) + ' mm, depth '
                    + number(record.split.registration.depthMm) + ' mm, clearance ' + number(record.split.registration.clearanceMm) + ' mm | operator |');
            } else {
                lines.push('| Registration pin | none | operator |');
            }
        } else {
            lines.push('| Split | not split; exported whole | operator |');
        }
        lines.push('');

        if (meshMetrics) {
            lines.push('## Exported mesh');
            lines.push('');
            lines.push('| Measurement | Value |');
            lines.push('| --- | --- |');
            lines.push(row('Closed', meshMetrics.closed ? 'yes' : 'no'));
            lines.push(row('Triangles', String(meshMetrics.triangleCount)));
            lines.push(row('Degenerate triangles', String(meshMetrics.degenerateTriangleCount)));
            lines.push(row('Surface area', number(meshMetrics.surfaceAreaMm2, 1) + ' mm²'));
            lines.push(row('Enclosed volume', meshMetrics.volumeIsMeaningful
                ? number(meshMetrics.volumeMm3, 1) + ' mm³'
                : 'not meaningful; the mesh is not a closed, non-degenerate solid'));
            if (meshMetrics.bbox) {
                lines.push(row('Bounding box', number(meshMetrics.bbox.lengthX, 2) + ' × ' + number(meshMetrics.bbox.lengthY, 2)
                    + ' × ' + number(meshMetrics.bbox.lengthZ, 2) + ' mm'));
            }
            lines.push('');
        }

        lines.push('## Two-part mould release');
        lines.push('');
        if (record.release) {
            lines.push('| Check | Result |');
            lines.push('| --- | --- |');
            lines.push(row('Pull axis', String(record.release.pullAxis)));
            lines.push(row('Verdict', record.release.twoPartMouldable ? 'releases along this axis' : 'does not release along this axis'));
            lines.push(row('Undercut rays', String(record.release.undercutRayCount)));
            lines.push(row('Near-vertical surface area', number((record.release.lowDraftAreaFraction || 0) * 100, 2) + ' % of the pattern surface'));
            lines.push('');
            lines.push('Claim boundary: ' + record.release.claimBoundary);
        } else {
            lines.push('Not run for this pattern.');
        }
        lines.push('');

        if (Array.isArray(settings.aiProposals) && settings.aiProposals.length) {
            lines.push('## Accepted AI proposals');
            lines.push('');
            settings.aiProposals.forEach((proposal, index) => {
                lines.push((index + 1) + '. Changed ' + proposal.changedFields.join(', ') + '.');
                if (proposal.reasoning) lines.push('   Stated reason: ' + proposal.reasoning);
                (proposal.assumptions || []).forEach(assumption => lines.push('   Assumption: ' + assumption));
            });
            lines.push('');
            lines.push('Each proposal was checked against the response contract before it changed anything. An unchecked suggestion cannot reach the geometry.');
            lines.push('');
        }

        lines.push('## What this record does not establish');
        lines.push('');
        LIMITS.forEach(limit => lines.push('- ' + limit));
        lines.push('');
        return lines.join('\n');
    }

    return Object.freeze({ LIMITS, renderMarkdown });
});
