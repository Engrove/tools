/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052b_freeform_tab_runtime_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052B top-level freeform tab runtime/source acceptance.
// Local source/package/runtime-wiring candidate only; no browser/WebGL claim.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

const html = read('index.html');

check('top-level Freeform tab exists outside AI Modal', () => {
  const tabIdx = html.indexOf('id="tabFreeformLoft"');
  const panelIdx = html.indexOf('id="freeformLoftMainPanel"');
  const modalIdx = html.indexOf('id="aiModalBackdrop"');
  assert(tabIdx > 0, 'missing tabFreeformLoft');
  assert(panelIdx > 0, 'missing freeformLoftMainPanel');
  assert(modalIdx > 0, 'missing aiModalBackdrop for boundary comparison');
  assert(tabIdx < modalIdx, 'Freeform tab is inside or after AI Modal; must be top-level main UI');
  assert(panelIdx < modalIdx, 'Freeform main panel is inside or after AI Modal; must be top-level main UI');
  assert(html.includes('data-td052b-top-level-tabs="true"'), 'missing top-level tabs marker');
  assert(html.includes('data-top-level-freeform-tab="true"'), 'missing top-level freeform panel marker');
});

check('main tab structure exposes required workspaces', () => {
  ['Parametric / Cobra', 'AI Vibe 3D Freeform Loft', 'Analysis / Export'].forEach(label => assert(html.includes(label), 'missing workspace label ' + label));
  assert(html.includes('role="tablist"'), 'missing tablist role');
  assert(html.includes('role="tabpanel"'), 'missing tabpanel role');
});

check('Freeform tab contains visible editor scaffolds and controls', () => {
  [
    'freeformGeometryModeSelect',
    'freeformPresetSelect',
    'freeformCenterlineEditor',
    'freeformRingEditor',
    'freeformFeatureEditor',
    'freeformCopyPromptBtn',
    'freeformApplyResponseBtn',
    'freeformPreviewBtn',
    'freeformAnalysisStatusPanel'
  ].forEach(id => assert(html.includes('id="' + id + '"'), 'missing ' + id));
  assert(html.includes('data-freeform-centerline-editor="true"'), 'missing centerline editor marker');
  assert(html.includes('data-freeform-ring-editor="true"'), 'missing ring editor marker');
  assert(html.includes('data-freeform-feature-editor="true"'), 'missing feature editor marker');
});

check('AI Modal-only panel is insufficient by design', () => {
  const modalPanelIdx = html.indexOf('ai-freeform-loft-panel');
  const mainPanelIdx = html.indexOf('freeform-loft-main-panel');
  assert(modalPanelIdx > 0, 'TD052 modal panel should remain allowed but not sufficient');
  assert(mainPanelIdx > 0, 'TD052B main panel missing');
  assert(mainPanelIdx < html.indexOf('id="aiModalBackdrop"'), 'main panel must not be modal-only');
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
