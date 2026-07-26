#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress casting-pattern cross-section scaling and two-part mould release auditing.
 * Inputs: A deterministic lofted mesh from the kernel plus a deliberately undercut variant.
 * Outputs: Process status through behavior assertions.
 * Safe edits: Additional matched accept/reject cases for pattern preparation.
 * Do not: Assert on a single direction only, or accept a pass without a matching reject case.
 * Verification: npm test.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mouldAudit = require('../js/freeform-plug-mould-audit.js');

const root = path.resolve(__dirname, '..');
const context = { console, Math, Number, Object, Array, JSON, Set, Map, Date, String, Boolean, isFinite, parseFloat, Infinity, NaN, structuredClone };
context.globalThis = context;
context.window = context;
vm.createContext(context);
['math.js', 'freeform-centerline.js', 'freeform-rings.js', 'freeform-features.js', 'freeform-schema.js', 'freeform-loft-kernel.js']
    .forEach(file => vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file }));

const kernel = context.FreeformLoftKernel;
const base = kernel.defaultState('straight_low_mass_lt_arm');
const meshOf = state => kernel.buildFreeformGeometry(state, { stationCount: 20, segmentCount: 40 }).mesh;
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

// ---- cross-section scaling keeps length and scales sections ----
const sanitizedBase = kernel.sanitizeState(base);
const scaled = kernel.scaleCrossSection(base, 1.05);
const baseBox = kernel.buildFreeformGeometry(base, { stationCount: 20, segmentCount: 40 }).bbox;
const scaledBox = kernel.buildFreeformGeometry(scaled, { stationCount: 20, segmentCount: 40 }).bbox;
// The centerline carries the length, and scaling must not touch it at all. Compared structurally rather
// than with deepStrictEqual: the kernel runs in a vm realm, so equivalent objects carry a foreign prototype.
check(JSON.stringify(scaled.centerline) === JSON.stringify(sanitizedBase.centerline),
    'cross-section scaling must leave the centerline untouched');
// The bounding box can still shift by a fraction of a percent: an end section whose plane is tilted
// relative to X projects a little further along X once it grows. The centerline length is the invariant.
check(Math.abs(scaledBox.length / baseBox.length - 1) < 0.0005, 'cross-section scaling must not change pattern length materially');
check(Math.abs(scaledBox.width / baseBox.width - 1.05) < 1e-4, 'cross-section scaling must scale width by the factor');
check(Math.abs(scaledBox.height / baseBox.height - 1.05) < 1e-4, 'cross-section scaling must scale height by the factor');
check(scaled.plugCompensation.crossSectionScale === 1.05, 'the applied scale must be recorded as provenance');
check(scaled.plugCompensation.lengthPreserved === true, 'the provenance must state that length was preserved');

// scaling composes rather than overwriting
const twice = kernel.scaleCrossSection(kernel.scaleCrossSection(base, 1.02), 1.03);
check(Math.abs(twice.plugCompensation.crossSectionScale - 1.0506) < 1e-9, 'chained scaling must compose the recorded factor');

// ---- scaling fails closed instead of clamping ----
for (const bad of [0, -1, Number.NaN, 'x']) {
    assert.throws(() => kernel.scaleCrossSection(base, bad), /finite positive number/);
    assertions++;
}
assert.throws(() => kernel.scaleCrossSection(base, 6), /outside the supported/);
assertions++;

// ---- two-part mould release: accepted case ----
const release = mouldAudit.auditDemouldability(meshOf(base), { pullAxis: 'Z', gridResolution: 40 });
check(release.twoPartMouldable === true, 'the default pattern must release along Z: ' + JSON.stringify(release.findings));
check(release.maxSurfaceCrossings === 2, 'a releasable pattern crosses the surface exactly twice along the pull axis');
check(release.undercutRayCount === 0, 'a releasable pattern reports no undercut rays');
check(release.status === 'PASS_WITH_SCOPE' || release.status === 'PARTIAL_PASS', 'a releasable pattern must not be graded BLOCKER');

// ---- two-part mould release: rejected case ----
const undercut = context.structuredClone(base);
undercut.rings = undercut.rings.map((ring, index) => index === Math.floor(undercut.rings.length / 2)
    ? Object.assign({}, ring, { rotationDeg: 75, widthMm: 22, heightMm: 5 })
    : ring);
const locked = mouldAudit.auditDemouldability(meshOf(kernel.sanitizeState(undercut)), { pullAxis: 'Z', gridResolution: 40 });
check(locked.twoPartMouldable === false, 'a rotated overhanging section must be reported as not releasable');
check(locked.maxSurfaceCrossings > 2, 'an undercut pattern must cross the surface more than twice somewhere');
check(locked.status === 'BLOCKER', 'an undercut pattern must be graded BLOCKER');
check(locked.findings.indexOf('undercut_relative_to_Z_pull') >= 0, 'the undercut finding must name the pull axis');

// ---- an open shell is refused rather than graded ----
const openMesh = meshOf(base);
openMesh.validation = { closed: false, boundaryEdgeCount: 4 };
check(mouldAudit.auditDemouldability(openMesh, {}).status === 'BLOCKER', 'an unclosed shell must not be graded releasable');

// ---- parting line reaches the widest points ----
const line = mouldAudit.partingLine(meshOf(base), { pullAxis: 'Z', stations: 12 });
check(line.length > 0, 'a parting line must be produced for a closed pattern');
check(line.every(point => point.maxMm >= point.minMm), 'every parting-line station must bracket the section');

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'freeform-plug-mould-audit', assertions }, null, 2));
