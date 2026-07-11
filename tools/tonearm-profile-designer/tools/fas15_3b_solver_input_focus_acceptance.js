#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3b_solver_input_focus_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3b solver modal input focus retention acceptance.
 *
 * Static/source-contract harness only:
 * - Browser/WebGL is not executed here.
 * - It verifies that solver modal numeric typing uses edit buffers and commit
 *   points instead of full DOM rebuilds on every keypress.
 */

const fs = require('fs');
const path = require('path');

function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function exists(rel) {
    return fs.existsSync(path.join(__dirname, '..', rel));
}

function assert(condition, label, errors) {
    if (!condition) errors.push(label);
}

function assertContains(haystack, needle, label, errors) {
    if (!haystack.includes(needle)) errors.push(label + ' missing: ' + needle);
}

function assertNotContains(haystack, needle, label, errors) {
    if (haystack.includes(needle)) errors.push(label + ' forbidden: ' + needle);
}

function assertRegex(haystack, regex, label, errors) {
    if (!regex.test(haystack)) errors.push(label + ' missing pattern: ' + regex);
}

const index = read('index.html');
const solver = read('js/solver-modal.js');
const picker = read('js/cartridge-picker.js');
const help = read('help.html');
const css = read('css/style.css');
const combinedUiHelp = index + '\n' + help;

const errors = [];

// Existing accepted behavior must still be present.
assertContains(solver, 'withVirtualState', 'solver virtual state guard', errors);
assertRegex(solver, /function\s+applySelectedCandidate\(\)[\s\S]*Object\.keys\(result\.values\)\.forEach[\s\S]*updateState\(\)/, 'Apply-only live mutation path', errors);
assertContains(solver, 'scheduleSolverChunk', 'async solver scheduling preserved', errors);
assertContains(solver, 'solverAbortRequested', 'async cancel state preserved', errors);

// 1. Input handlers must not do full modal re-render on every keypress.
assertRegex(
    solver,
    /function\s+onVariableRangeInput\(evt\)[\s\S]*if\s*\(\s*evt\.type\s*===\s*['"]input['"]\s*\)[\s\S]*stageVariableInput\(evt\.target\)[\s\S]*return;/,
    'variable input event stages edit and returns before render',
    errors
);
assertRegex(
    solver,
    /function\s+onTargetInput\(evt\)[\s\S]*if\s*\(\s*evt\.type\s*===\s*['"]input['"]\s*\)[\s\S]*stageTargetInput\(evt\.target\)[\s\S]*return;/,
    'target input event stages edit and returns before render',
    errors
);
const variableInputBody = solver.slice(solver.indexOf('function onVariableRangeInput'), solver.indexOf('function onVariableRangeKeydown'));
const targetInputBody = solver.slice(solver.indexOf('function onTargetInput'), solver.indexOf('function onTargetKeydown'));
assert(!variableInputBody.includes('renderVariablePanel()'), 'variable input handler must not call renderVariablePanel on keypress', errors);
assert(!targetInputBody.includes('renderTargetPanel()'), 'target input handler must not call renderTargetPanel on keypress', errors);

// 2-3. Local edit buffers for variable and target numeric fields.
assertContains(solver, 'editBuffers', 'session edit buffer model', errors);
assertContains(solver, 'variables: Object.create(null)', 'variable edit buffer', errors);
assertContains(solver, 'targets: Object.create(null)', 'target edit buffer', errors);
assertContains(solver, 'stageVariableInput', 'variable staging function', errors);
assertContains(solver, 'commitVariableInput', 'variable commit function', errors);
assertContains(solver, 'stageTargetInput', 'target staging function', errors);
assertContains(solver, 'commitTargetInput', 'target commit function', errors);

// 4. Partial numeric strings are not immediately converted to zero.
assertContains(solver, 'isPartialSolverNumericText', 'partial numeric detector', errors);
assertContains(solver, "text === '-'", 'minus partial preserved', errors);
assertContains(solver, "/[.,]$/.test(text)", 'trailing dot/comma partial preserved', errors);
assertRegex(solver, /parseCommittedSolverNumber\(value\)[\s\S]*if\s*\(\s*isPartialSolverNumericText\(text\)\s*\)\s*return null;/, 'partial committed number returns null', errors);
assertNotContains(solver, "Number(evt.target.value) || 0", 'keypress conversion to zero', errors);
assertNotContains(solver, "parseFloat(evt.target.value);\n        if (!Number.isFinite(value)) return;", 'old immediate parse/return path', errors);

// 5. Commit happens on blur/Enter/Run Solver.
assertRegex(solver, /addEventListener\(['"]blur['"],\s*onVariableRangeInput\)/, 'variable blur commit listener', errors);
assertRegex(solver, /addEventListener\(['"]keydown['"],\s*onVariableRangeKeydown\)/, 'variable Enter commit listener', errors);
assertRegex(solver, /targetPanel\.addEventListener\(['"]focusout['"],\s*onTargetInput\)/, 'target focusout commit listener', errors);
assertRegex(solver, /targetPanel\.addEventListener\(['"]keydown['"],\s*onTargetKeydown\)/, 'target Enter commit listener', errors);
assertRegex(solver, /function\s+runSolver\(\)[\s\S]*if\s*\(\s*!commitAllSolverEdits\(\)\s*\)\s*return;/, 'Run Solver commits pending edits before solving', errors);

// 6. Active input focus/caret preservation logic exists.
assertContains(solver, 'captureActiveSolverInput', 'active solver input capture', errors);
assertContains(solver, 'restoreActiveSolverInput', 'active solver input restore', errors);
assertContains(solver, 'selectionStart', 'caret start preservation', errors);
assertContains(solver, 'selectionEnd', 'caret end preservation', errors);
assertContains(solver, 'setSelectionRange', 'caret restore call', errors);
assertContains(solver, 'withSolverFocusPreserved', 'focus-preserved render wrapper', errors);

// 7. Solver uses committed current values.
assertRegex(solver, /const\s+samples\s*=\s*unlocked\.map\(v\s*=>\s*\(\{\s*variable:\s*v,\s*values:\s*makeSamples\(v\)\s*\}\)\)/, 'Run Solver samples committed variable policy', errors);
assertContains(solver, 'rescoreResultsAfterTargetCommit', 'committed target values rescore results', errors);

// 8. Apply-only contract preserved.
assertRegex(solver, /function\s+closeModal\(reason\)[\s\S]*session\s*=\s*null[\s\S]*disposePreview\(\)/, 'discard/X closes without live mutation', errors);
assertContains(solver, "closeModal('discard')", 'Discard close path', errors);
assertContains(solver, "closeModal('x')", 'X close path', errors);

// 9. Previous cartridge picker JS-data and dynamic range behavior remains intact.
assert(exists('data/tonearmdesigner-cartridges.min.js'), 'cartridge JS data file remains', errors);
assertContains(index, '<script src="data/tonearmdesigner-cartridges.min.js"></script>', 'cartridge JS data include', errors);
assertContains(picker, "root[DATA_GLOBAL]", 'picker uses JS data bundle through window/root global', errors);
assertNotContains(picker, 'fetch(', 'picker does not fetch JSON data', errors);
assertContains(picker, 'expandControlRangeForValue', 'cartridge dynamic controller range helper remains', errors);
assertContains(picker, 'Controller range expanded', 'cartridge range expansion status remains', errors);

// Help/CSS and UI hygiene.
assertContains(help, 'Editing solver fields', 'help documents solver input editing', errors);
assertContains(css, '.solver-edit-pending', 'pending edit CSS', errors);
assertContains(css, '.solver-edit-invalid', 'invalid edit CSS', errors);
const forbiddenSv = ['Jag AI har fel som standard', ' tills jag bevisat motsatsen'].join('');
const forbiddenEn = ['AI is wrong by default', ' until proven otherwise'].join('');
assertNotContains(combinedUiHelp, forbiddenSv, 'AI protocol/mantra in UI/help', errors);
assertNotContains(combinedUiHelp, forbiddenEn, 'AI protocol/mantra in UI/help English', errors);

if (errors.length) {
    console.error('Fas 15.3b solver input focus acceptance: FAIL');
    errors.forEach((err, idx) => console.error(`${idx + 1}. ${err}`));
    process.exit(1);
}

console.log('Fas 15.3b solver input focus acceptance: PASS');
console.log('- solver numeric input events stage edit buffers and do not full re-render on keypress');
console.log('- variable min/max/step and target target/tolerance/weight fields commit on blur/Enter/Run Solver');
console.log('- partial numeric strings remain pending instead of becoming 0');
console.log('- focus/caret preservation helpers are present for unavoidable renders');
console.log('- Apply-only solver contract and cartridge picker JS-data/dynamic ranges remain intact');
