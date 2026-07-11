/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_report_audit_acceptance.js behavior as a cohesive legacy module.
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

check('report exporter includes TD053E audit fields', () => {
  const report = src('js/report-exporter.js');
  [
    'TD053E Freeform Apply State / Report-Export Audit',
    'geometryMode',
    'Report subject',
    'renderGeometrySource',
    'exportGeometrySource',
    'reportGeometrySource',
    'stlSource',
    'targetCompliance.status',
    'targetCompliance.blockers',
    'cobraFidelity.status',
    'cobraFidelity weak score reasons',
    'Claim boundary'
  ].forEach(term => assert(report.includes(term), 'report missing ' + term));
});
check('runtime mode audit includes preview role and stl source', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  assert(runtime.includes('audit.stateRole') && runtime.includes('audit.stlSource') && runtime.includes('audit.reportSubject'), 'mode audit role/source fields missing');
});
console.log(JSON.stringify({ checks }, null, 2));
