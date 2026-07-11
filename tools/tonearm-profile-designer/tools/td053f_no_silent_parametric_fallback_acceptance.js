/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_no_silent_parametric_fallback_acceptance.js behavior as a cohesive legacy module.
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
load('js/freeform-mode-audit.js');

check('accepted active freeform with parametric render/export is BLOCKER', () => {
  const s = {
    geometryMode: 'freeform',
    freeformLoftActive: { revision: 'active-a', role: 'active', centerline: { points: [] }, rings: [] },
    freeformApplyState: { phase: 'ACCEPTED_ACTIVE' }
  };
  const audit = globalThis.FreeformModeAudit.auditGeometryMode(s, 'parametricGeometry', 'parametricMesh', 'legacyParametricPhysics', { stlSource: 'parametricMesh' });
  assert(audit.silentFallbackDetected === true, 'silent fallback not detected');
  assert(audit.status === 'BLOCKER', 'silent fallback not BLOCKER');
  assert(String(audit.fallbackReason || '').includes('parametric source'), 'fallback reason missing');
});
check('source contains no silent fallback policy fields', () => {
  const live = src('js/freeform-live-state-binding.js');
  assert(live.includes('silentFallbackDetected'), 'live binding missing silentFallbackDetected');
  assert(live.includes('fallbackReason'), 'live binding missing fallbackReason');
  assert(live.includes('accepted active freeform exists but export/render/report used parametric source'), 'fallback warning missing');
});
console.log(JSON.stringify({ checks }, null, 2));
