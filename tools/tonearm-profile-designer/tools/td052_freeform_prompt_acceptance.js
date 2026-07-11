/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052_freeform_prompt_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Freeform prompt/UI acceptance.
// Local source/package candidate only; no browser/runtime/Onshape claim.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function load(rel) { require(path.join(ROOT, rel)); }

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

load('js/freeform-centerline.js');
load('js/freeform-rings.js');
load('js/freeform-features.js');
load('js/freeform-loft-kernel.js');

check('freeform prompt contains full contract surface', () => {
  const prompt = globalThis.FreeformLoftKernel.buildFreeformPrompt(globalThis.FreeformLoftKernel.defaultState('long_low_cobra_monocoque'));
  [
    'AI Vibe 3D Freeform Loft',
    'Copy Freeform AI Prompt',
    'Apply Freeform AI Response',
    'tonearm-designer-ai-freeform-loft-response',
    'freeform_centerline_ring_loft',
    'centerline',
    'rings',
    'features',
    'all writable fields',
    'min/max/enum constraints',
    'engineering targets',
    'mass/COM/COG',
    'cartridge datum',
    'headshell datum',
    'counterweight context',
    'Onshape/export audit context',
    'Markdown spec',
    'unsupportedAttributes',
    'strict JSON only',
    'sparse patch only',
    'no direct STL/OBJ/mesh triangles',
    'no protected datum movement',
    'no LT mechanism/P1/P2/P3/STATOR/L23 writes',
    'circle',
    'triangle',
    'rounded_rectangle',
    'crescent',
    'custom_bezier_loop'
  ].forEach(needle => assert(prompt.includes(needle), 'prompt missing: ' + needle));
});

check('index.html exposes TD052 tab and actions', () => {
  const html = read('index.html');
  [
    'AI Vibe 3D Freeform Loft',
    'freeform_centerline_ring_loft',
    'aiFreeformPreset',
    'Copy Freeform AI Prompt',
    'Apply Freeform AI Response',
    'aiCopyFreeformPromptBtn',
    'aiApplyFreeformResponseBtn',
    'js/freeform-centerline.js',
    'js/freeform-rings.js',
    'js/freeform-features.js',
    'js/freeform-loft-kernel.js',
    'js/freeform-analysis-adapter.js'
  ].forEach(needle => assert(html.includes(needle), 'index.html missing: ' + needle));
});

check('ai-modal routes freeform family to TD052 prompt builder', () => {
  const text = read('js/ai-modal.js');
  [
    'freeform_centerline_ring_loft',
    'FreeformLoftKernel',
    'buildFreeformPrompt',
    'AI Vibe 3D Freeform Loft',
    'tonearm-designer-ai-freeform-loft-response'
  ].forEach(needle => assert(text.includes(needle), 'ai-modal.js missing: ' + needle));
});

check('spec document exists and carries claim boundary', () => {
  const spec = read('AI_VIBE_3D_FREEFORM_LOFT_SPEC_TD052.md');
  [
    'TD052',
    'Centerline',
    'Ring',
    'Feature',
    'strict JSON only',
    'PARTIAL_PASS',
    'Claim boundary'
  ].forEach(needle => assert(spec.includes(needle), 'TD052 spec missing: ' + needle));
});

console.log(JSON.stringify({
  status: process.exitCode ? 'FAIL' : 'PASS',
  test: 'td052_freeform_prompt_acceptance',
  checks
}, null, 2));
