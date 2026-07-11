/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053d_freeform_sidebar_compact_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053D acceptance. Local source/Node checks only; no browser/WebGL/CAD/FEA/manufacturing claim.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const leftMatch = html.match(/<section id="freeformLoftMainPanel"[\s\S]*?<\/section>/);
check('left Freeform panel exists', () => { assert(leftMatch, 'freeformLoftMainPanel missing'); });
check('left panel contains only compact controls and status', () => {
  const left = leftMatch[0];
  ['freeformGeometryModeSelect','freeformPresetSelect','freeformApplyPresetBtn','freeformPreviewBtn','freeformOpenWorkbenchBtn','freeformStatusPanel'].forEach(id => assert(left.includes(id), 'missing compact id ' + id));
});
check('left panel has no editor scaffolds, textareas, validation lists or full analysis panel', () => {
  const left = leftMatch[0];
  ['data-freeform-editor','<textarea','freeformWorkbenchPromptText','freeformWorkbenchResponseText','freeformWorkbenchValidationPanel','freeformAnalysisStatusPanel','data-freeform-centerline-editor','data-freeform-ring-editor','data-freeform-feature-editor'].forEach(forbidden => {
    assert(!left.includes(forbidden), 'forbidden narrow-panel content remains: ' + forbidden);
  });
});
check('modal owns editor scaffolds', () => {
  const modalStart = html.indexOf('id="freeformAiWorkbenchBackdrop"');
  const modalEnd = html.indexOf('id="aiModalBackdrop"', modalStart);
  const modal = html.slice(modalStart, modalEnd);
  ['data-freeform-editor="centerline"','data-freeform-editor="rings"','data-freeform-editor="features"','freeformWorkbenchValidationPanel'].forEach(term => assert(modal.includes(term), 'modal missing ' + term));
});
console.log(JSON.stringify({ checks }, null, 2));
