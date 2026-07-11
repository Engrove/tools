/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas19_ai_modal_onshape_handoff_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// FAS19 AI Modal Onshape Handoff acceptance smoke test.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function requireText(file, needle) {
  const text = read(file);
  if (!text.includes(needle)) throw new Error(file + ' missing required text: ' + needle);
}
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: err.message }); process.exitCode = 1; }
}
check('app version advanced to FAS19 or later', () => {
  const sessionText = read('js/session.js');
  const indexText = read('index.html');
  if (!sessionText.includes("APP_VERSION: 'V28.7.0-Fas19-AIModalOnshapeHandoff'") &&
      !sessionText.includes("APP_VERSION: 'V28.8.0-Fas20-AIResponseApplyRuntime'")) {
    throw new Error('js/session.js missing FAS19/FAS20 APP_VERSION');
  }
  if (!indexText.includes('V28.7.0 FAS19 AI Modal Onshape Handoff') &&
      !indexText.includes('V28.8.0 FAS20 AI Response Apply Runtime')) {
    throw new Error('index.html missing FAS19/FAS20 title text');
  }
});
check('AI Modal exposes Onshape handoff model family', () => {
  requireText('index.html', 'value="ai_vibe_3d_onshape"');
  requireText('js/ai-modal.js', "'ai_vibe_3d_onshape'");
  requireText('js/ai-modal.js', 'tonearm-designer-ai-vibe-3d-response');
});
check('AI Modal prompt includes AIVibe3D context', () => {
  requireText('js/ai-modal.js', 'aiVibe3DContext');
  requireText('js/ai-modal.js', 'onshapeHandoffTarget');
  requireText('js/ai-modal.js', 'printabilityAudit');
  requireText('js/ai-modal.js', 'allowedSemanticActions');
});
check('AI response validation and apply wrappers exist', () => {
  requireText('js/ai-modal.js', 'function validateAIResponse');
  requireText('js/ai-modal.js', 'function applyAIResponse');
  requireText('js/ai-modal.js', 'window.validateAIResponse = validateAIResponse');
  requireText('js/ai-modal.js', 'window.applyAIResponse = applyAIResponse');
});
check('AIVibe3D exports FAS19 handoff helpers', () => {
  requireText('js/ai-vibe-3d.js', 'getOnshapeHandoffTarget');
  requireText('js/ai-vibe-3d.js', 'buildAIModalContext');
  requireText('js/ai-vibe-3d.js', 'validateAIVibeResponse');
  requireText('js/ai-vibe-3d.js', 'previewAIVibeResponse');
  requireText('js/ai-vibe-3d.js', 'getAllowedActions');
});
check('legacy delta path remains exported', () => {
  requireText('js/ai-modal.js', 'window.validateAIDelta = validateAIDelta');
  requireText('js/ai-modal.js', 'window.applyAIDelta = applyAIDelta');
});
console.log(JSON.stringify({ schema: 'fas19-ai-modal-onshape-handoff-acceptance-v1', status: process.exitCode ? 'FAIL' : 'PASS', checks }, null, 2));
