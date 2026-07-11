/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053d_freeform_modal_completion_acceptance.js behavior as a cohesive legacy module.
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
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

check('modal has all TD053D Freeform Workbench tabs', () => {
  ['Prompt','AI Response JSON','Validate / Apply','Centerline Editor','Ring Editor','Feature Editor','Cobra Fidelity','Deterministic Analysis','Export / Report Audit'].forEach(label => {
    assert(html.includes(label), 'missing modal tab/section label: ' + label);
  });
});

check('modal lies outside left sidebar and before legacy AI modal', () => {
  const leftStart = html.indexOf('id="freeformLoftMainPanel"');
  const leftEnd = html.indexOf('</section>', leftStart);
  const modalIdx = html.indexOf('id="freeformAiWorkbenchBackdrop"');
  const aiIdx = html.indexOf('id="aiModalBackdrop"');
  assert(leftStart >= 0 && leftEnd > leftStart, 'left panel missing');
  assert(modalIdx > leftEnd, 'modal must be outside left panel');
  assert(aiIdx > modalIdx, 'modal should be independent before legacy AI modal');
});

check('wide modal dimensions remain suitable for Freeform Workbench', () => {
  assert(/width:\s*90vw/.test(css), 'modal width 90vw missing');
  assert(/max-width:\s*1500px/.test(css), 'modal max-width 1500px missing');
  assert(/height:\s*88vh/.test(css), 'modal height 88vh missing');
  assert(/min-height:\s*45vh/.test(css), 'editor min-height 45vh missing');
});

check('prompt area has non-placeholder default TD053D prompt text', () => {
  const promptMatch = html.match(/<textarea[^>]+id="freeformWorkbenchPromptText"[^>]*>([\s\S]*?)<\/textarea>/);
  assert(promptMatch, 'prompt textarea missing');
  const value = promptMatch[1].trim();
  assert(value.length > 80, 'prompt textarea is empty or too short');
  assert(!/Copy Freeform AI Prompt fills this area/i.test(value), 'prompt textarea still uses inert placeholder text');
  assert(/app\/kernel owns deterministic/i.test(value), 'prompt must describe deterministic app/kernel authority');
});

console.log(JSON.stringify({ checks }, null, 2));
