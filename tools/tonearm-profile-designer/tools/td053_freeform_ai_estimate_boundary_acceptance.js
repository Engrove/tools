/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053_freeform_ai_estimate_boundary_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 AI estimate/deterministic analysis boundary acceptance.
// Local Node schema/prompt test only.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function finite(n) { return Number.isFinite(Number(n)); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}
function loadTD053() {
  [
    'js/freeform-centerline.js',
    'js/freeform-rings.js',
    'js/freeform-features.js',
    'js/freeform-schema.js',
    'js/freeform-loft-kernel.js',
    'js/freeform-analysis-adapter.js',
    'js/freeform-section-properties.js',
    'js/freeform-resonance-analysis.js',
    'js/freeform-geometry-audit.js',
    'js/freeform-physical-analysis.js'
  ].forEach(load);
}

loadTD053();
const K = globalThis.FreeformLoftKernel;

function expectAccepted(name, mutate) {
  const r = clone(K.knownGoodResponse());
  mutate(r);
  const result = K.validateResponse(r);
  assert(result.ok === true, name + ' rejected: ' + result.errors.join('; '));
}
function expectRejected(name, mutate) {
  const r = clone(K.knownGoodResponse());
  mutate(r);
  const result = K.validateResponse(r);
  assert(result.ok === false, name + ' not rejected');
}

check('AI can write targets, analysisRequests and aiEstimates', () => {
  expectAccepted('targets and aiEstimates', r => {
    r.targets = { effectiveMassVerticalG: 12, effectiveMassHorizontalG: 13, lfResonanceHz: 10, firstBendingModeHzMin: 600, torsionModeHzMin: 800, counterweightBalanceResidualMaxGmm: 50 };
    r.analysisRequests = ['mass','COM','inertia','LF_resonance','EI_distribution','torsion_proxy','export_audit'];
    r.aiEstimates = { massG: 25, effectiveMassVerticalG: 12, lfResonanceHz: 10, reasoningSummary: 'estimate only', confidence: 0.5 };
  });
});

check('AI cannot write deterministic analysis object or final physical truth fields', () => {
  ['analysis','deterministicAnalysis','massG','COM','effectiveMassVerticalG','resonanceVerticalHz','status'].forEach(field => {
    expectRejected('forbidden deterministic field ' + field, r => { r[field] = field === 'COM' ? { x: 1, y: 2, z: 3 } : (field === 'analysis' ? { massG: 1 } : 1); });
  });
});

check('prompt states app/kernel calculates truth and AI estimates are advisory', () => {
  const prompt = K.buildFreeformPrompt(K.defaultState('long_low_cobra_monocoque'), 'test');
  assert(/app\/kernel calculates/i.test(prompt), 'prompt missing app/kernel calculates wording');
  assert(/AI estimates are advisory/i.test(prompt) || /aiEstimates are advisory/i.test(prompt), 'prompt missing AI estimate boundary');
  assert(/must not write analysis\.massG/i.test(prompt), 'prompt missing forbidden analysis.massG wording');
});

console.log(JSON.stringify(checks, null, 2));
