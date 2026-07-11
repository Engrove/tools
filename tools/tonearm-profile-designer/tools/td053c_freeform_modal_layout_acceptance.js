/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053c_freeform_modal_layout_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053C Freeform AI Workbench modal layout acceptance.

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (err) { console.error('FAIL', name + ':', err && err.message || err); process.exitCode = 1; }
}
function loadKernel() {
  [
    'js/freeform-centerline.js',
    'js/freeform-rings.js',
    'js/freeform-features.js',
    'js/freeform-schema.js',
    'js/freeform-loft-kernel.js'
  ].forEach(load);
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

check('wide modal exists outside old AI modal and narrow sidebar intent', () => {
  assert(html.includes('id="freeformAiWorkbenchBackdrop"'), 'missing freeformAiWorkbenchBackdrop');
  assert(html.includes('data-td053c-wide-modal="true"'), 'missing wide modal data marker');
  assert(html.includes('class="freeform-ai-workbench-modal freeform-workbench-modal-wide"'), 'missing wide modal class');
  const modalIdx = html.indexOf('id="freeformAiWorkbenchBackdrop"');
  const oldAiIdx = html.indexOf('id="aiModalBackdrop"');
  assert(modalIdx > -1 && oldAiIdx > -1 && modalIdx < oldAiIdx, 'modal not inserted as independent workbench before AI modal');
});

check('left panel is compact and opens modal', () => {
  assert(html.includes('id="freeformOpenWorkbenchBtn"'), 'missing left-panel open workbench button');
  assert(html.includes('data-freeform-left-compact="true"'), 'missing compact left-panel marker');
  assert(!html.includes('<details class="freeform-ai-response-panel">'), 'old narrow JSON response panel still present');
});

check('modal has required workbench sections and editors', () => {
  ['Prompt','AI Response JSON','Validation','Apply / Preview','Deterministic Analysis'].forEach(label => assert(html.includes(label), 'missing section ' + label));
  assert(html.includes('id="freeformWorkbenchPromptText"'), 'missing prompt textarea');
  assert(html.includes('id="freeformWorkbenchResponseText"'), 'missing response textarea');
  assert(html.includes('id="freeformWorkbenchValidationPanel"'), 'missing validation/error panel');
  assert(html.includes('id="freeformCopyPromptBtn"'), 'missing copy prompt button');
  assert(html.includes('id="freeformValidateResponseBtn"'), 'missing validate button');
  assert(html.includes('id="freeformApplyResponseBtn"'), 'missing apply button');
  assert(html.includes('id="freeformClearResponseBtn"'), 'missing clear button');
});

check('modal dimensions satisfy TD053C width/height/editor requirements', () => {
  assert(/width:\s*90vw/.test(css) || /width:\s*(8[0-9]|9[0-2])vw/.test(css), 'modal width not 80-92vw');
  assert(/max-width:\s*1500px/.test(css) || /max-width:\s*1[456]00px/.test(css), 'modal max-width not 1400-1600px');
  assert(/height:\s*88vh/.test(css) || /height:\s*(8[0-9]|90)vh/.test(css), 'modal height not 80-90vh');
  assert(/min-height:\s*45vh/.test(css), 'editor min-height 45vh missing');
});
