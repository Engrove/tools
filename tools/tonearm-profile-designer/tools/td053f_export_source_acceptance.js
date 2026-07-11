/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_export_source_acceptance.js behavior as a cohesive legacy module.
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

check('export uses accepted active freeform and blocks silent parametric fallback', () => {
  const exporters = src('js/exporters.js');
  assert(exporters.includes('freeformLoftActive'), 'exporter does not require freeformLoftActive');
  assert(exporters.includes('EXPORT_BLOCKED'), 'exporter lacks explicit export blocker');
  assert(exporters.includes("source = 'freeformLoftActive'") || exporters.includes("source: 'freeformLoftActive'"), 'export metadata lacks freeformLoftActive source');
  assert(exporters.includes('stlSource') && exporters.includes('freeformLoftKernel'), 'export metadata lacks stlSource freeformLoftKernel');
  assert(exporters.includes('silent parametric fallback is forbidden'), 'no silent fallback wording missing');
});
check('runtime export API returns freeformLoftActive source metadata', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  assert(runtime.includes("source: 'freeformLoftActive'") || runtime.includes('source: "freeformLoftActive"'), 'runtime export result lacks freeformLoftActive source');
  assert(runtime.includes("sourceState: 'state.freeformLoftActive'") || runtime.includes('sourceState: "state.freeformLoftActive"'), 'runtime export sourceState lacks active state');
  assert(runtime.includes('EXPORT_BLOCKED'), 'runtime export does not block');
});
console.log(JSON.stringify({ checks }, null, 2));
