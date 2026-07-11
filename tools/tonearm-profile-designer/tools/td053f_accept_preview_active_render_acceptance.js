/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_accept_preview_active_render_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053F acceptance. Local source/Node checks only; browser manual validation is NOT_TESTED here.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

load('js/freeform-live-state-binding.js');

check('render branch uses accepted active freeform source', () => {
  const render = src('js/render3d.js');
  assert(render.includes('freeformLoftActive'), 'render does not mention freeformLoftActive');
  assert(render.includes('TD053F render blocker'), 'render blocker for missing active freeform is absent');
  assert(render.includes("sourceState: 'state.freeformLoftActive'") || render.includes('sourceState: "state.freeformLoftActive"'), 'render metadata lacks state.freeformLoftActive');
  assert(render.includes('renderGeometrySource') && render.includes('freeformLoftKernel'), 'render metadata lacks freeformLoftKernel');
});
check('canonical accept invalidates render/export caches', () => {
  const B = globalThis.FreeformLiveStateBinding;
  const s = { geometryMode: 'parametric', freeformLoftPreview: { role: 'preview', revision: 'preview-a', centerline: { points: [] }, rings: [] } };
  const accepted = B.acceptFreeformPreviewAsActive({ state: s, decision: { acceptedActiveAllowed: true } });
  assert(accepted.ok === true, 'accept failed');
  assert(globalThis.LAST_FREEFORM_RENDER_INVALIDATION_REASON, 'render cache invalidation reason missing');
  assert(globalThis.LAST_FREEFORM_EXPORT_CACHE_REVISION, 'export cache revision missing');
  assert(B.getActiveGeometrySource(s) === 'freeformLoftActive', 'active source not freeformLoftActive');
});
console.log(JSON.stringify({ checks }, null, 2));
