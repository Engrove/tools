/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052b_freeform_render_export_wiring_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052B freeform render/export source wiring acceptance.
// Local source/package/runtime-wiring candidate only; no browser/WebGL/export-file claim.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

const config = read('js/config.js');
const runtime = read('js/freeform-runtime-integration.js');
const render = read('js/render3d.js');
const exporters = read('js/exporters.js');

check('geometryMode state exists', () => {
  assert(config.includes("geometryMode: 'parametric'"), 'config state missing geometryMode default');
  assert(config.includes('freeformLoft: null'), 'config state missing freeformLoft field');
  assert(runtime.includes('state.freeformLoft') || runtime.includes('s.freeformLoft'), 'runtime integration not state.freeformLoft based');
});

check('render3d has explicit freeform branch', () => {
  assert(render.includes('freeformGeometryMode'), 'render3d missing freeformGeometryMode branch variable');
  assert(render.includes("getGeometryMode(state) === 'freeform'"), 'render3d missing geometryMode freeform check');
  assert(render.includes('buildCurrentThreeGeometry(THREE, state'), 'render3d does not build from state-based freeform geometry');
  assert(render.includes('td052b_freeform_render3d_branch'), 'render3d missing TD052B freeform branch marker');
  assert(!/LAST_FREEFORM_LOFT_GEOMETRY[^]*new THREE\.Mesh/.test(render), 'render3d must not render from window-only scratch geometry');
});

check('exporters has explicit freeform branch and no silent parametric fallback', () => {
  assert(exporters.includes('function getFreeformLoftExportGeometry'), 'exporters missing getFreeformLoftExportGeometry');
  assert(exporters.includes("state.geometryMode === 'freeform'"), 'exporters missing geometryMode freeform check');
  assert(exporters.includes('FreeformRuntimeIntegration.exportFreeformMeshGeometry'), 'exporters missing runtime integration exporter call');
  assert(exporters.includes('tonearm_td052b_freeform_loft'), 'export filename must identify freeform loft');
  assert(exporters.includes('noParametricFallback'), 'export path must mark no parametric fallback');
  assert(exporters.includes('TD052B freeform export blocker'), 'export path must warn/block rather than silently fallback');
});

check('shared runtime can build first-class freeform geometry object', () => {
  assert(runtime.includes('buildFreeformGeometry'), 'runtime missing buildFreeformGeometry');
  assert(runtime.includes('buildThreeBufferGeometryFromFreeformGeometry'), 'runtime missing THREE conversion function');
  assert(runtime.includes('exportFreeformMeshGeometry'), 'runtime missing exportFreeformMeshGeometry');
  assert(runtime.includes("geometryMode: FREEFORM"), 'runtime geometry object missing freeform mode marker');
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
