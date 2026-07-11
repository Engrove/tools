/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_preview_active_separation_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053E acceptance. Local source/Node checks only; no browser/WebGL/CAD/FEA/manufacturing claim.
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

['js/freeform-apply-state-machine.js'].forEach(load);
const SM = globalThis.FreeformApplyStateMachine;
check('active and preview revisions are separate', () => {
  const s = { freeformLoftActive: { revision: 'active-a', role: 'active' } };
  SM.ensureState(s);
  SM.markPreview(s, { revision: 'preview-fixed', role: 'preview' }, {});
  assert(s.freeformLoftActive.revision === 'active-a', 'active changed during preview');
  assert(s.freeformLoftPreview.role === 'preview', 'preview role missing');
  assert(s.freeformLoftPreview.revision !== s.freeformLoftActive.revision, 'preview and active revision collapsed');
});
check('runtime/source exports active by default and labels report subject', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  const report = src('js/report-exporter.js');
  assert(runtime.includes('freeformLoftActive') && runtime.includes('freeformLoftPreview') && runtime.includes('freeformLoftRejected'), 'active/preview/rejected state not source-wired');
  assert(runtime.includes('buildPreviewFreeformGeometry'), 'preview geometry builder missing');
  assert(report.includes('Report subject') && report.includes('Active design revision') && report.includes('Preview design revision'), 'report does not expose active/preview subject');
  assert(report.includes('accepted active design from preview/quarantine') || report.includes('accepted active design'), 'claim boundary lacks active/preview wording');
});
check('failed preview cannot silently overwrite active', () => {
  const s = { freeformLoftActive: { revision: 'active-a', role: 'active' } };
  SM.ensureState(s);
  SM.markPreview(s, { revision: 'preview-b', role: 'preview' }, {});
  SM.classifyPreview(s, { targetCompliance: { status: 'TARGET_FAIL', overall: 'BLOCKER', blockers: ['mass'] } });
  assert(s.freeformLoftActive.revision === 'active-a', 'active overwritten by failed preview');
  assert(s.freeformApplyState.activeStateChanged === false, 'activeStateChanged should remain false');
});
console.log(JSON.stringify({ checks }, null, 2));
