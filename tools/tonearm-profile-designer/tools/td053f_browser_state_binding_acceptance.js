/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_browser_state_binding_acceptance.js behavior as a cohesive legacy module.
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

load('js/freeform-apply-state-machine.js');
load('js/freeform-live-state-binding.js');

function minimalFreeform(revision) {
  return {
    role: 'preview',
    revision: revision || 'preview-probe',
    centerline: { points: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 100, y: 0, z: 0 }] },
    rings: [{ id: 'r0', s: 0, widthMm: 8, heightMm: 4, wallThicknessMm: 0.8 }, { id: 'r1', s: 1, widthMm: 8, heightMm: 4, wallThicknessMm: 0.8 }]
  };
}

check('index loads live-state binding before runtime integration', () => {
  const html = src('index.html');
  assert(html.includes('js/freeform-live-state-binding.js'), 'missing live-state script');
  assert(html.indexOf('js/freeform-live-state-binding.js') < html.indexOf('js/freeform-runtime-integration.js'), 'live-state binding must load before runtime integration');
});
check('runtime ensureState uses canonical browser state accessor', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  assert(runtime.includes('FreeformLiveStateBinding.getCanonicalAppState'), 'runtime does not bind to canonical state accessor');
  assert(runtime.includes('syncFreeformUiFromCanonicalState'), 'runtime does not sync UI from canonical state');
});
check('validate/apply/top-state selectors are present', () => {
  const html = src('index.html');
  ['data-freeform-validation-state','data-freeform-apply-state','freeformActiveSourceIndicator','freeformAcceptPreviewBtn'].forEach(term => assert(html.includes(term), 'missing ' + term));
});
check('canonical state moves preview to accepted active and updates apply phase', () => {
  const s = { geometryMode: 'parametric', freeformLoftActive: { role: 'active', revision: 'active-a', centerline: { points: [] }, rings: [] } };
  globalThis.state = s;
  const B = globalThis.FreeformLiveStateBinding;
  B.setFreeformPreview(minimalFreeform('preview-a'), { targetCompliance: { status: 'PASS_WITH_SCOPE' }, cobraFidelity: { status: 'PASS_WITH_SCOPE' } }, null, s);
  const accepted = B.acceptFreeformPreviewAsActive({ state: s, decision: { acceptedActiveAllowed: true } });
  assert(accepted.ok === true, 'accept failed');
  assert(s.geometryMode === 'freeform', 'geometryMode not freeform');
  assert(s.freeformLoftActive && s.freeformLoftActive.role === 'active', 'active freeform missing');
  assert(s.freeformApplyState.phase === 'ACCEPTED_ACTIVE', 'top/apply state not ACCEPTED_ACTIVE');
  assert(s.geometryModeAudit.renderGeometrySource === 'freeformLoftKernel', 'render source not freeform');
});
console.log(JSON.stringify({ checks }, null, 2));
