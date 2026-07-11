#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress Manual Trace schema/axis/scale validation and top+side deterministic loft conversion.
 * Inputs: In-memory valid and invalid Manual Trace v18-compatible artifacts.
 * Outputs: Process status through behavior assertions.
 * Safe edits: Add positive/negative cases matching importer contracts.
 * Do not: Replace behavior checks with source-string checks.
 * Verification: npm test.
 */
const assert = require('node:assert/strict');
const adapter = require('../js/manual-trace-3d-adapter.js');

function traceObject(plane, overrides = {}) {
  const axes = plane === 'top'
    ? { x: '+image_x', y: '+image_y', z: '+out_of_screen' }
    : { x: '+image_x', y: '+out_of_screen', z: '-image_y' };
  const half = plane === 'top' ? 5 : 3;
  return {
    schema_version: 'engrove_manual_trace_v16',
    producer: { name: 'Engrove Manual Trace Tool', version: '18' },
    trace_frame: {
      origin: { x: 0, y: 0 },
      origin_metadata: { location_role: 'stylus_tip' },
      axes,
      scale: { unit: 'mm', unit_per_px: 1, px_per_unit: 1 }
    },
    shapes: [{
      id: plane + '_outline',
      type: 'poly',
      name: plane + '_outer_contour',
      role: 'trace',
      closed: true,
      semantic: { feature_kind: 'outer_contour' },
      points: [
        { x: 0, y: -half },
        { x: 100, y: -half },
        { x: 100, y: half },
        { x: 0, y: half }
      ]
    }, {
      id: plane + '_station_50',
      type: 'station',
      orientation: 'vertical',
      x: 50,
      x1: 50,
      x2: 50,
      y1: -20,
      y2: 20,
      station_index: 0
    }],
    ...overrides
  };
}

const top = adapter.parseJsonText(JSON.stringify(traceObject('top')), 'top.json');
const side = adapter.parseJsonText(JSON.stringify(traceObject('side')), 'side.engrove-trace.json');
assert.equal(top.detectedPlane, 'top');
assert.equal(side.detectedPlane, 'side');
assert.equal(top.unitPerPixel, 1);
assert.equal(top.contourCount, 1);

const state = adapter.buildFreeformState([top, side], { stationCount: 8, baseState: { features: {} } });
assert.equal(state.preset, 'engrove_manual_trace_import');
assert.equal(state.sourceProvenance.sourceKind, 'engrove_manual_trace');
assert.equal(state.sourceProvenance.commonLongitudinalSourceRangeMm.translatedLength, 100);
assert.ok(state.rings.length >= 4);
assert.equal(state.rings[0].widthMm, 10);
assert.equal(state.rings[0].heightMm, 6);
assert.equal(state.centerline.points[0].id, 'stylus_front');
assert.equal(state.centerline.points.at(-1).id, 'pivot_reference');
assert.equal(state.centerline.points.at(-1).x, 100);

const project = {
  package_type: 'engrove_trace_project',
  schema_version: 'engrove_trace_project_v2',
  source_app: { name: 'Engrove Manual Trace Tool', version: '18', geometry_schema: 'engrove_manual_trace_v16' },
  project: { name: 'top-project' },
  workspace: {
    trace_frame: traceObject('top').trace_frame,
    shapes: traceObject('top').shapes
  }
};
const normalizedProject = adapter.parseJsonText(JSON.stringify(project), 'top.engrove-trace');
assert.equal(normalizedProject.packageType, 'engrove_trace_project');
assert.equal(normalizedProject.projectName, 'top-project');

const missingScale = traceObject('top');
missingScale.trace_frame.scale = { unit: 'mm' };
assert.throws(() => adapter.parseJsonText(JSON.stringify(missingScale), 'missing-scale.json'), error => error.code === 'TRACE_SCALE_REQUIRED');

const ambiguousAxes = traceObject('top');
ambiguousAxes.trace_frame.axes.y = '+image_x';
assert.throws(() => adapter.parseJsonText(JSON.stringify(ambiguousAxes), 'bad-axes.json'), error => error.code === 'TRACE_AXES_AMBIGUOUS');

assert.throws(() => adapter.buildFreeformState([top], {}), error => error.code === 'TRACE_TOP_SIDE_REQUIRED');

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'manual-trace-adapter', assertions: 18 }, null, 2));
