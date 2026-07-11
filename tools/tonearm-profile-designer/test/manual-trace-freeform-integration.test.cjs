#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify that Manual Trace conversion survives the existing Freeform sanitizer and produces deterministic kernel mesh geometry.
 * Inputs: In-memory calibrated top/side contours and current Freeform modules.
 * Outputs: Process status through cross-module behavior assertions.
 * Safe edits: Extend assertions across the actual adapter/kernel contract.
 * Do not: Mock away centerline/ring sanitization or mesh generation.
 * Verification: npm test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const adapter = require('../js/manual-trace-3d-adapter.js');

const root = path.resolve(__dirname, '..');
const context = { console, Math, Number, Object, Array, JSON, Set, Map, Date, globalThis: null, window: null };
context.globalThis = context;
context.window = context;
vm.createContext(context);
['freeform-centerline.js', 'freeform-rings.js', 'freeform-features.js', 'freeform-schema.js', 'freeform-loft-kernel.js'].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
});

function descriptor(plane, half) {
  const transverse = plane === 'top' ? 'y' : 'z';
  const points = [0, 100, 100, 0].map((x, index) => {
    const point = { x, y: 0, z: 0 };
    point[transverse] = index < 2 ? -half : half;
    return point;
  });
  return {
    fileName: plane + '.json',
    packageType: 'engrove_manual_trace_json',
    geometrySchema: 'engrove_manual_trace_v16',
    detectedPlane: plane,
    plane,
    contourCount: 1,
    unitPerPixel: 1,
    originRole: 'stylus_tip',
    stationX: [],
    contours: [{ id: plane + '_outer', name: plane + '_outer', kind: 'outer_contour', closed: true, points }]
  };
}

const proposed = adapter.buildFreeformState(
  [descriptor('top', 5), descriptor('side', 3)],
  { baseState: context.FreeformLoftKernel.defaultState('straight_low_mass_lt_arm'), stationCount: 8 }
);
const sanitized = context.FreeformLoftKernel.sanitizeState(proposed);
assert.equal(sanitized.sourceProvenance.sourceKind, 'engrove_manual_trace');
assert.equal(sanitized.centerline.points[0].x, 0);
assert.equal(sanitized.centerline.points.at(-1).x, 100);
assert.equal(sanitized.rings[0].widthMm, 10);
assert.equal(sanitized.rings[0].heightMm, 6);

const geometry = context.FreeformLoftKernel.buildFreeformGeometry(sanitized, { stationCount: 12, segmentCount: 24 });
assert.ok(geometry.mesh.vertices.length > 100);
assert.ok(geometry.mesh.faces.length > 100);
assert.equal(geometry.state.sourceProvenance.sourceKind, 'engrove_manual_trace');
assert.equal(geometry.bbox.length, 100);

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'manual-trace-freeform-integration', vertices: geometry.mesh.vertices.length, faces: geometry.mesh.faces.length }, null, 2));
