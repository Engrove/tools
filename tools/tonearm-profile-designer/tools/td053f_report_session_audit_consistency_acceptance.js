/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_report_session_audit_consistency_acceptance.js behavior as a cohesive legacy module.
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

check('report includes TD053F session-audit consistency fields', () => {
  const report = src('js/report-exporter.js');
  [
    'TD053F Freeform Browser State / Render-Export Audit',
    'geometryMode',
    'freeformLoftActive',
    'apply phase',
    'renderGeometrySource',
    'exportGeometrySource',
    'reportGeometrySource',
    'stlSource',
    'modeMismatch',
    'targetCompliance status',
    'cobraFidelity status',
    'feasibility status',
    'Claim boundary'
  ].forEach(term => assert(report.includes(term), 'report missing ' + term));
});
check('mode audit agrees with session snapshot for accepted active', () => {
  const s = {
    geometryMode: 'freeform',
    freeformLoftActive: { revision: 'active-a', role: 'active', centerline: { points: [] }, rings: [] },
    freeformApplyState: { phase: 'ACCEPTED_ACTIVE' }
  };
  const audit = globalThis.FreeformModeAudit.auditGeometryMode(s, 'freeformLoftKernel', 'freeformLoftKernel', 'freeformPhysicalAnalysis', { stlSource: 'freeformLoftKernel' });
  const snap = globalThis.FreeformLiveStateBinding.sessionSnapshot(s);
  assert(audit.modeMismatch === false, 'audit mismatch');
  assert(snap.geometryModeAudit.modeMismatch === false, 'session audit mismatch');
  assert(audit.renderGeometrySource === snap.geometryModeAudit.renderGeometrySource, 'render source mismatch');
  assert(audit.exportGeometrySource === snap.geometryModeAudit.exportGeometrySource, 'export source mismatch');
});
console.log(JSON.stringify({ checks }, null, 2));
