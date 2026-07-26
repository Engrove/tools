#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress the Markdown record that ships beside an exported pattern.
 * Inputs: Decision records and mesh metrics covering the split, unsplit and unchecked cases.
 * Outputs: Process status through behavior assertions.
 * Safe edits: Additional reported fields, each asserted present.
 * Do not: Let the sheet report a number the record does not carry, or drop the stated limits.
 * Verification: npm test.
 */
'use strict';

const assert = require('node:assert/strict');
const patternRecord = require('../js/pattern-record.js');
const patternState = require('../js/pattern-state.js');

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

const fullRecord = {
    schema: 'engrove-trace-to-plug-record-v1',
    source: { fileName: 'arm.engrove-trace-project', projectId: 'proj-7', traceIds: ['t-top', 't-side'] },
    tracedLengthMm: 230.004,
    loftedLengthMm: 229.87,
    endStationInsets: 2,
    sectionFullness: 3.2,
    sectionFullnessSource: 'operator',
    allowancePercent: 2.5,
    pullAxis: 'Z',
    split: { positionPercent: 50, clearanceMm: 0.1, registration: { radiusMm: 2.4, depthMm: 3, clearanceMm: 0.15 } },
    release: { pullAxis: 'Z', twoPartMouldable: true, undercutRayCount: 0, lowDraftAreaFraction: 0.0134, claimBoundary: 'ray-sampled release check on the exported pattern mesh; not a mould-flow or tooling simulation' }
};
const metrics = {
    closed: true, triangleCount: 2304, degenerateTriangleCount: 0, surfaceAreaMm2: 12345.6,
    volumeMm3: 15546.7, volumeIsMeaningful: true,
    bbox: { lengthX: 230.004, lengthY: 16.4, lengthZ: 9.2 }
};

const sheet = patternRecord.renderMarkdown(fullRecord, metrics, {
    aiProposals: [{ changedFields: ['sectionFullness'], reasoning: 'a tube reads fuller', assumptions: ['the arm is a closed tube'] }]
});

// ---- everything the operator decided has to be findable in the sheet ----
check(sheet.includes('arm.engrove-trace-project'), 'the sheet must name the source package');
check(sheet.includes('proj-7'), 'the sheet must carry the project id');
check(sheet.includes('t-top, t-side'), 'the sheet must list the trace ids');
check(sheet.includes('230.004'), 'the sheet must carry the traced length');
check(sheet.includes('229.870'), 'the sheet must carry the lofted length');
check(sheet.includes('3.20'), 'the sheet must carry the section fullness');
check(sheet.includes('operator'), 'the sheet must say where the fullness came from');
check(sheet.includes('2.50 % on every section, length unchanged'), 'the sheet must state that the allowance leaves the length alone');
check(sheet.includes('15546.7'), 'the sheet must carry the measured volume');
check(sheet.includes('2304'), 'the sheet must carry the triangle count');
check(sheet.includes('230.00 × 16.40 × 9.20 mm'), 'the sheet must carry the bounding box');
check(sheet.includes('releases along this axis'), 'the sheet must carry the release verdict');
check(sheet.includes('1.34 %'), 'the sheet must carry the near-vertical area fraction as a percentage');
check(sheet.includes('radius 2.400 mm'), 'the sheet must carry the registration pin size');
check(sheet.includes('a tube reads fuller'), 'the sheet must carry the accepted AI reasoning');
check(sheet.includes('the arm is a closed tube'), 'the sheet must carry the AI assumptions');
check(sheet.includes('Changed sectionFullness'), 'the sheet must name what the AI changed');

// ---- the limits travel with the sheet, because the sheet outlives the session ----
patternRecord.LIMITS.forEach((limit, index) => {
    check(sheet.includes(limit), 'limit ' + index + ' must appear in the sheet');
});

// ---- the unsplit, unchecked case must read as absent rather than as a passing result ----
const bare = patternState.decisionRecord(patternState.createState());
const bareSheet = patternRecord.renderMarkdown(bare, null);
check(bareSheet.includes('not split; exported whole'), 'an unsplit pattern must say so');
check(bareSheet.includes('Not run for this pattern.'), 'an unchecked release must say it was not run');
check(!bareSheet.includes('releases along this axis'), 'an unchecked release must never read as a pass');
check(bareSheet.includes('not recorded'), 'a missing source must read as not recorded rather than as a value');
check(!bareSheet.includes('Accepted AI proposals'), 'a sheet with no AI proposals must not claim a section for them');
check(!bareSheet.includes('undefined') && !bareSheet.includes('NaN'), 'the sheet must never print undefined or NaN');

// ---- an open mesh must not be reported with a volume ----
const openSheet = patternRecord.renderMarkdown(fullRecord, {
    closed: false, triangleCount: 12, degenerateTriangleCount: 1, surfaceAreaMm2: 10, volumeMm3: -3, volumeIsMeaningful: false, bbox: null
});
check(openSheet.includes('not meaningful'), 'an open mesh must have its volume reported as not meaningful');
check(!openSheet.includes('-3.0 mm³'), 'an open mesh must not have a volume printed as a measurement');

// ---- a split without registration must say so rather than omit the row ----
const noPin = JSON.parse(JSON.stringify(fullRecord));
noPin.split.registration = null;
check(patternRecord.renderMarkdown(noPin, metrics).includes('| Registration pin | none |'), 'a split without a pin must state that explicitly');

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'pattern-record', assertions }, null, 2));
