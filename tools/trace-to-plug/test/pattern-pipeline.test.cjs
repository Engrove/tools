#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress the Trace to Plug pipeline from imported views to split pattern, and the AI response contract.
 * Inputs: A synthetic calibrated trace pair and the geometry kernel owned by Tonearm Profile Designer.
 * Outputs: Process status through behavior assertions.
 * Safe edits: Additional matched accept/reject cases for the workflow and the AI contract.
 * Do not: Accept an AI response without a matching rejection case, or assert geometry without checking closure.
 * Verification: npm test.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const toolRoot = path.resolve(__dirname, '..');
const donorJs = path.resolve(toolRoot, '..', 'tonearm-profile-designer', 'js');
const patternState = require('../js/pattern-state.js');
const patternAI = require('../js/pattern-ai.js');
const meshTools = require('../js/pattern-mesh.js');
const adapter = require(path.join(donorJs, 'manual-trace-3d-adapter.js'));
const mould = require(path.join(donorJs, 'freeform-plug-mould-audit.js'));
const splitter = require(path.join(donorJs, 'freeform-pattern-split.js'));

const context = { console, Math, Number, Object, Array, JSON, Set, Map, Date, String, Boolean, isFinite, parseFloat, Infinity, NaN, structuredClone };
context.globalThis = context;
context.window = context;
vm.createContext(context);
['math.js', 'freeform-centerline.js', 'freeform-rings.js', 'freeform-features.js', 'freeform-schema.js', 'freeform-loft-kernel.js', 'freeform-analysis-adapter.js']
    .forEach(file => vm.runInContext(fs.readFileSync(path.join(donorJs, file), 'utf8'), context, { filename: file }));
const kernel = context.FreeformLoftKernel;

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

// ---- a calibrated traced pair with rounded ends, as a real object would be ----
const LENGTH = 200, CAP = 2;
const halfWidth = x => (x <= 20 ? 16 : x <= 40 ? 16 + (8 - 16) * (x - 20) / 20 : x <= 170 ? 8 : 8 + (20 - 8) * (x - 170) / 30) / 2;
const halfHeight = x => (x <= 20 ? 9 : x <= 40 ? 9 + (7 - 9) * (x - 20) / 20 : x <= 170 ? 7 : 7 + (16 - 7) * (x - 170) / 30) / 2;
const cap = x => x < CAP ? Math.sqrt(Math.max(0, 1 - ((CAP - x) / CAP) ** 2))
    : x > LENGTH - CAP ? Math.sqrt(Math.max(0, 1 - ((x - (LENGTH - CAP)) / CAP) ** 2)) : 1;
function descriptor(plane) {
    const transverse = plane === 'top' ? 'y' : 'z';
    const half = plane === 'top' ? halfWidth : halfHeight;
    const xs = [];
    for (let x = 0; x <= LENGTH + 1e-9; x += 0.5) xs.push(Math.min(x, LENGTH));
    const points = xs.map(x => { const p = { x, y: 0, z: 0 }; p[transverse] = half(x) * cap(x); return p; })
        .concat(xs.slice().reverse().map(x => { const p = { x, y: 0, z: 0 }; p[transverse] = -half(x) * cap(x); return p; }));
    return {
        fileName: plane + '.json', packageType: 'engrove_manual_trace_json', geometrySchema: 'engrove_manual_trace_v16',
        detectedPlane: plane, plane, contourCount: 1, unitPerPixel: 1, originRole: 'stylus_tip', stationX: [],
        contours: [{ id: plane, name: plane, kind: 'outer_contour', closed: true, points }]
    };
}

// ---- interpretation records the operator's decision and preserves the traced length ----
const state = patternState.createState();
check(state.step === 'import' && state.loft === null, 'a new workflow starts empty');
check(patternState.interpret(state, kernel, adapter).ok === false, 'interpreting without views must be refused');

state.views = [descriptor('top'), descriptor('side')];
state.decisions.sectionFullness = 3.2;
const interpreted = patternState.interpret(state, kernel, adapter);
check(interpreted.ok === true, 'a calibrated pair must interpret: ' + (interpreted.error || ''));
check(state.loft.rings.every(ring => ring.superellipseExponent === 3.2), 'the chosen section fullness must reach every ring');
check(state.loft.sourceProvenance.sectionExponentSource === 'operator', 'the fullness source must be recorded as the operator');
const traced = state.loft.sourceProvenance.commonLongitudinalSourceRangeMm.translatedLength;
check(Math.abs(traced - LENGTH) < 0.01, 'the traced length must survive interpretation, got ' + traced);

// ---- the allowance scales sections and leaves the length alone ----
state.decisions.allowancePercent = 2;
const pattern = patternState.patternState(state, kernel);
check(pattern.ok === true, 'the allowance must apply: ' + (pattern.error || ''));
check(Math.abs(pattern.factor - 1.02) < 1e-9, 'the applied factor must follow the allowance');
state.loft.rings.forEach((ring, index) => {
    check(Math.abs(pattern.pattern.rings[index].widthMm - ring.widthMm * 1.02) < 1e-6, 'ring ' + ring.id + ' width must carry the allowance');
});
check(JSON.stringify(pattern.pattern.centerline) === JSON.stringify(state.loft.centerline), 'the allowance must not touch the centerline');

// ---- the pattern mesh is a closed solid, and the release check runs on it ----
const built = patternState.patternGeometry(state, kernel);
check(built.ok === true, 'the pattern geometry must build');
check(built.geometry.mesh.validation.closed === true, 'the pattern mesh must be closed');
const release = mould.auditDemouldability(built.geometry.mesh, { pullAxis: state.decisions.pullAxis });
check(release.twoPartMouldable === true, 'the traced pattern must release along Z: ' + JSON.stringify(release.findings));
state.release = release;

// ---- splitting yields two closed halves that mate ----
const halves = splitter.splitPattern(built.geometry.mesh, {
    axis: 'X',
    at: built.geometry.bbox.minX + built.geometry.bbox.length * 0.5,
    clearanceMm: state.decisions.splitClearanceMm,
    registration: { depthMm: state.decisions.pinDepthMm, clearanceMm: state.decisions.pinClearanceMm }
});
check(halves.ok === true, 'the pattern must split: ' + (halves.error || ''));
check(splitter.meshClosure(halves.partA).closed === true, 'the boss half must be closed');
check(splitter.meshClosure(halves.partB).closed === true, 'the socket half must be closed');

// The split halves carry no closure flag, so the export gate has to reach the same verdict from the
// topology alone. If it did not, every split export would be refused and the control would be dead.
check(meshTools.exportable(halves.partA).ok === true, 'the boss half must pass the export gate: ' + meshTools.exportable(halves.partA).reasons.join(' '));
check(meshTools.exportable(halves.partB).ok === true, 'the socket half must pass the export gate: ' + meshTools.exportable(halves.partB).reasons.join(' '));
check(meshTools.exportable(built.geometry.mesh).ok === true, 'the whole pattern must pass the export gate');
const wholeVolume = meshTools.metrics(built.geometry.mesh).volumeMm3;
const halvesVolume = meshTools.metrics(halves.partA).volumeMm3 + meshTools.metrics(halves.partB).volumeMm3;
check(wholeVolume > 0, 'the pattern must enclose a positive volume, got ' + wholeVolume);
// The cut removes the clearance gap and adds the boss, so the halves do not sum to the whole. They must
// still land close to it: a large gap would mean the cut lost or duplicated material.
check(Math.abs(halvesVolume - wholeVolume) / wholeVolume < 0.05,
    'the halves must account for the pattern volume, whole ' + wholeVolume.toFixed(1) + ' vs halves ' + halvesVolume.toFixed(1));

// ---- the record carries every decision that shaped the pattern ----
const record = patternState.decisionRecord(state);
check(record.sectionFullness === 3.2, 'the record must state the section fullness');
check(record.sectionFullnessSource === 'operator', 'the record must state where the fullness came from');
check(record.allowancePercent === 2, 'the record must state the allowance');
check(record.release && record.release.twoPartMouldable === true, 'the record must carry the release verdict');
check(record.endStationInsets >= 0, 'the record must state how many end stations were recovered');

// ---- AI prompt carries the record and the contract ----
const prompt = patternAI.buildPrompt(record, 'make the sections fuller');
check(prompt.includes(patternAI.RESPONSE_SCHEMA), 'the prompt must state the response schema');
check(prompt.includes('sectionFullness'), 'the prompt must list the writable fields');
check(prompt.includes('make the sections fuller'), 'the prompt must carry the operator note');

// ---- AI responses: accepted ----
const accepted = patternAI.validateResponse(JSON.stringify({
    schema: patternAI.RESPONSE_SCHEMA, reasoning: 'fuller corners suit a tube', decisions: { sectionFullness: 4, allowancePercent: 1.5 }
}));
check(accepted.ok === true, 'a contract-conforming response must be accepted: ' + JSON.stringify(accepted.diagnostics));
check(accepted.patch.sectionFullness === 4 && accepted.patch.allowancePercent === 1.5, 'the accepted patch must carry the proposed values');
check(accepted.changedFields.join(',') === 'allowancePercent,sectionFullness', 'the accepted patch must name what changed');
const fenced = patternAI.validateResponse('```json\n' + JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: { pullAxis: 'y' } }) + '\n```');
check(fenced.ok === true && fenced.patch.pullAxis === 'Y', 'a fenced response must be unwrapped and normalized');
check(patternAI.validateResponse(JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA })).ok === true, 'a response proposing nothing is valid');

// ---- AI responses: rejected, one case per failure mode ----
const rejections = [
    ['', 'AI_RESPONSE_EMPTY'],
    ['not json at all', 'AI_RESPONSE_NOT_JSON'],
    [JSON.stringify([1, 2]), 'AI_RESPONSE_NOT_OBJECT'],
    [JSON.stringify({ schema: 'something-else' }), 'AI_RESPONSE_SCHEMA_MISMATCH'],
    [JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: { centerline: [] } }), 'AI_FIELD_NOT_WRITABLE'],
    [JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: { sectionFullness: 99 } }), 'AI_FIELD_RANGE'],
    [JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: { sectionFullness: 'wide' } }), 'AI_FIELD_TYPE'],
    [JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: { pullAxis: 'Q' } }), 'AI_FIELD_VALUE'],
    [JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: { splitEnabled: 'yes' } }), 'AI_FIELD_TYPE'],
    [JSON.stringify({ schema: patternAI.RESPONSE_SCHEMA, decisions: [] }), 'AI_DECISIONS_NOT_OBJECT']
];
rejections.forEach(([payload, code]) => {
    const result = patternAI.validateResponse(payload);
    check(result.ok === false, 'the response for ' + code + ' must be refused');
    check(result.diagnostics.some(item => item.code === code), 'the refusal must be named ' + code + ', got ' + JSON.stringify(result.diagnostics.map(d => d.code)));
    check(result.patch === undefined, 'a refused response must yield no patch at all');
});

// ---- a refused geometry decision must not leave a stale pattern behind ----
const broken = patternState.createState();
broken.views = [descriptor('top')];
const failed = patternState.interpret(broken, kernel, adapter);
check(failed.ok === false && broken.loft === null, 'a failed interpretation must leave no geometry behind');
check(typeof broken.lastError === 'string' && broken.lastError.length > 0, 'a failed interpretation must record why');

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'pattern-pipeline', assertions }, null, 2));
