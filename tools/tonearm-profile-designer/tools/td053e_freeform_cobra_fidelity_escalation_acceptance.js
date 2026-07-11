/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_cobra_fidelity_escalation_acceptance.js behavior as a cohesive legacy module.
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

['js/freeform-form-fidelity.js','js/freeform-acceptance-gates.js'].forEach(load);
const F = globalThis.FreeformFormFidelity;
const G = globalThis.FreeformAcceptanceGates;
check('lowLongProfileScore below 60 escalates Cobra intent to FORM_INTENT_MISMATCH', () => {
  const status = F.classifyFormIntent({
    cobraIntentDetected: true,
    cobraFormFidelityScore: 76,
    frontCanopyScore: 82,
    rearRootApexScore: 80,
    asymmetricWingBodyScore: 78,
    lowLongProfileScore: 23,
    integratedHeadshellContinuityScore: 90,
    rearTerminalSeparationScore: 55
  });
  assert(status === 'FORM_INTENT_MISMATCH', 'low-long failure did not escalate: ' + status);
});
check('lowLongProfileScore below 40 blocks accepted active', () => {
  const decision = G.evaluateAcceptance({
    cobraFidelity: {
      status: 'FORM_INTENT_MISMATCH',
      cobraIntentDetected: true,
      cobraFormFidelityScore: 76,
      lowLongProfileScore: 23,
      rearTerminalSeparationScore: 55,
      blockers: ['Cobra intent detected but lowLongProfileScore=23 below required 60']
    },
    targetCompliance: { status: 'PASS_WITH_SCOPE' }
  });
  assert(decision.acceptedActiveAllowed === false, 'low-long failure allowed active');
  assert(decision.blockers.join(' ').includes('lowLongProfileScore=23'), 'weak low-long reason missing');
});
check('operator copied values do not get ordinary PARTIAL_PASS', () => {
  const status = F.classifyFormIntent({
    cobraIntentDetected: true,
    cobraFormFidelityScore: 76,
    lowLongProfileScore: 23,
    rearTerminalSeparationScore: 55,
    frontCanopyScore: 90,
    rearRootApexScore: 90,
    asymmetricWingBodyScore: 90,
    integratedHeadshellContinuityScore: 90
  });
  assert(status !== 'PARTIAL_PASS', 'operator copy values falsely classified PARTIAL_PASS');
});
console.log(JSON.stringify({ checks }, null, 2));
