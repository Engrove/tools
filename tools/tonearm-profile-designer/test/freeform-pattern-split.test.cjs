#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress cutting a closed pattern into two printable halves that stay closed and conserve volume.
 * Inputs: A deterministic lofted mesh from the kernel.
 * Outputs: Process status through behavior assertions.
 * Safe edits: Additional matched accept/reject cases for pattern splitting.
 * Do not: Accept a half with open boundary edges, or assert only the accepted path.
 * Verification: npm test.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const split = require('../js/freeform-pattern-split.js');

const root = path.resolve(__dirname, '..');
const context = { console, Math, Number, Object, Array, JSON, Set, Map, Date, String, Boolean, isFinite, parseFloat, Infinity, NaN, structuredClone };
context.globalThis = context;
context.window = context;
vm.createContext(context);
['math.js', 'freeform-centerline.js', 'freeform-rings.js', 'freeform-features.js', 'freeform-schema.js', 'freeform-loft-kernel.js']
    .forEach(file => vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file }));

const kernel = context.FreeformLoftKernel;
const geometry = kernel.buildFreeformGeometry(kernel.defaultState('straight_low_mass_lt_arm'), { stationCount: 20, segmentCount: 40 });
const source = geometry.mesh;
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

function signedVolume(mesh) {
    let total = 0;
    for (const face of mesh.faces) {
        const a = mesh.vertices[face[0]], b = mesh.vertices[face[1]], c = mesh.vertices[face[2]];
        total += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
    }
    return total;
}

const sourceVolume = signedVolume(source);
check(sourceVolume > 0, 'the source pattern must be a positively oriented solid');

// ---- accepted: a mid-length cut yields two closed halves that conserve volume ----
const result = split.splitPattern(source, { axis: 'X' });
check(result.ok === true, 'a mid-length cut must succeed: ' + (result.error || ''));
for (const key of ['partA', 'partB']) {
    const closure = split.meshClosure(result[key]);
    check(closure.closed === true, key + ' must be closed after the cut, got boundary=' + closure.boundaryEdgeCount + ' nonManifold=' + closure.nonManifoldEdgeCount);
    check(closure.degenerateFaceCount === 0, key + ' must contain no degenerate faces');
    check(closure.faceCount > 0, key + ' must contain geometry');
}
const halvesVolume = signedVolume(result.partA) + signedVolume(result.partB);
check(Math.abs(halvesVolume - sourceVolume) < 1e-6, 'the two halves must conserve the pattern volume: ' + halvesVolume + ' vs ' + sourceVolume);

// ---- clearance is applied and still leaves both halves closed ----
const spaced = split.splitPattern(source, { axis: 'X', clearanceMm: 0.2 });
check(spaced.ok === true, 'a cut with clearance must succeed');
check(spaced.clearanceMm === 0.2, 'the applied clearance must be reported');
for (const key of ['partA', 'partB']) {
    check(split.meshClosure(spaced[key]).closed === true, key + ' must stay closed when a clearance is applied');
}

// ---- rejected: a cut outside or on the extent, and an unclosed source ----
const extent = geometry.bbox;
for (const at of [extent.minX - 5, extent.maxX + 5, extent.minX]) {
    const outside = split.splitPattern(source, { axis: 'X', at });
    check(outside.ok === false, 'a cut at ' + at + ' outside the pattern extent must be refused');
}
check(split.splitPattern(source, { axis: 'W' }).ok === false, 'an unsupported axis must be refused');

const openSource = JSON.parse(JSON.stringify(source));
openSource.validation = { closed: false, boundaryEdgeCount: 3 };
check(split.splitPattern(openSource, { axis: 'X' }).ok === false, 'an unclosed source pattern must be refused');
check(split.splitPattern({ vertices: [], faces: [] }, {}).ok === false, 'an empty mesh must be refused');

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'freeform-pattern-split', assertions }, null, 2));
