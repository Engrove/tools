/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas20_ai_response_apply_runtime_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// FAS20 AI response apply runtime acceptance smoke test.
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
check('FAS20 version is active', () => {
  requireText('js/session.js', "APP_VERSION: 'V28.8.0-Fas20-AIResponseApplyRuntime'");
  requireText('index.html', 'V28.8.0 FAS20 AI Response Apply Runtime');
});
check('AI Modal can extract pasted JSON from code fences/prose', () => {
  requireText('js/ai-modal.js', 'function extractFirstJSONObject');
  requireText('js/ai-modal.js', 'fenceMatch');
  requireText('js/ai-modal.js', 'JSON object is not balanced');
});
check('AI Modal sanitizes non-applicable JSON fields instead of hard failing', () => {
  requireText('js/ai-modal.js', 'function sanitizeAIDeltaForRuntime');
  requireText('js/ai-modal.js', 'Ignoring non-writable or missing input field');
  requireText('js/ai-modal.js', 'Ignoring non-writable or missing checkbox field');
});
check('AI Vibe actions include Cobra gate and N1-P2 lock', () => {
  requireText('js/ai-vibe-3d.js', "op: 'activate_cobra_architecture_gate'");
  requireText('js/ai-vibe-3d.js', "op: 'lock_n1p2'");
  requireText('js/ai-vibe-3d.js', "setInputValue('apex', target)");
});
check('Cobra architecture can be enabled from runtime controls', () => {
  requireText('js/cobra-architecture.js', 'applyRuntimeControlsToArchitecture');
  requireText('js/cobra-architecture.js', "readStateValue(s, 'cobraArchitectureEnabled'");
  requireText('js/cobra-architecture.js', "readStateValue(s, 'rearMode', '') === 'cobra_integrated_tail'");
});
check('Titanium and Cobra gate controls exist in UI/session/config', () => {
  requireText('index.html', 'id="titaniumPlateEnabled"');
  requireText('index.html', 'id="cobraArchitectureEnabled"');
  requireText('js/session.js', "'titaniumPlateEnabled'");
  requireText('js/config.js', 'titaniumPlateThickness');
  requireText('js/parameter-metadata.js', "id: 'titaniumPlateThickness'");
});
console.log(JSON.stringify({ schema: 'fas20-ai-response-apply-runtime-acceptance-v1', status: process.exitCode ? 'FAIL' : 'PASS', checks }, null, 2));
