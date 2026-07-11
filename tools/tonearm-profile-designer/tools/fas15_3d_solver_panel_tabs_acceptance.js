#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3d_solver_panel_tabs_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3d solver panel tabs acceptance.
 * Static/source-contract harness only. Browser/WebGL is not executed here.
 */

const fs = require('fs');
const path = require('path');

function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
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
const css = read('css/style.css');
const help = read('help.html');
const data = read('data/tonearmdesigner-cartridges.min.js');
const combinedUiHelp = index + '\n' + help;
const errors = [];

const tabBlockMatch = index.match(/<nav class="solver-layout-tabs"[\s\S]*?<\/nav>/);
const tabBlock = tabBlockMatch ? tabBlockMatch[0] : '';
assert(tabBlock.length > 0, 'solver layout tab block exists', errors);

// Controls are pure in-page buttons and do not navigate.
['guide', 'expert', 'results', 'preview'].forEach(name => {
    assertRegex(tabBlock, new RegExp('<button[^>]+type="button"[^>]+data-solver-panel="' + name + '"'), 'non-navigating button for ' + name, errors);
});
assertNotContains(tabBlock, 'href=', 'solver tab href navigation', errors);
assertNotContains(tabBlock, 'index.html', 'solver tab self-index navigation', errors);
assertNotContains(index.toLowerCase(), '<iframe', 'iframe/self-index loading for solver panels', errors);
assertNotContains(index.toLowerCase(), '<object', 'object/self-index loading for solver panels', errors);

// State and click handling.
assertContains(solver, 'activeSolverPanel', 'active solver panel state', errors);
assertContains(solver, 'function showSolverPanel', 'showSolverPanel state function', errors);
assertContains(solver, 'evt.preventDefault()', 'tab click preventDefault', errors);
assertContains(solver, 'evt.stopPropagation()', 'tab click stopPropagation', errors);
assertContains(solver, "showSolverPanel(target)", 'tab click calls in-page state switch', errors);
assertRegex(solver, /panel\.hidden\s*=\s*!active/, 'panel hidden state toggled in page', errors);
assertRegex(solver, /panel\.classList\.toggle\('active',\s*active\)/, 'panel active class toggled', errors);
assertRegex(solver, /btn\.setAttribute\('aria-selected',\s*active \? 'true' : 'false'\)/, 'aria-selected updated', errors);
assertRegex(css, /\.solver-tab-panel\[hidden\][\s\S]*display:\s*none\s*!important/, 'hidden tab panels forced hidden despite panel flex display', errors);

// Panels exist.
assertContains(index, 'id="solverGuidePanel"', 'Guide panel exists', errors);
assertContains(index, 'id="solverExpertPanel"', 'Expert panel exists', errors);
assertContains(index, 'id="solverResultsPanel"', 'Results panel exists', errors);
assertContains(index, 'id="solverPreviewPanel"', 'Preview panel exists', errors);
assertContains(index, 'role="tabpanel"', 'tabpanel roles exist', errors);

// Switching is UI state only: no reset/live mutation calls inside showSolverPanel.
const showPanelMatch = solver.match(/function showSolverPanel\(name\) \{[\s\S]*?\n    \}/);
const showPanelBody = showPanelMatch ? showPanelMatch[0] : '';
assert(showPanelBody.length > 0, 'showSolverPanel body can be inspected', errors);
assertNotContains(showPanelBody, 'resetSolverSearchSession', 'panel switching must not reset search session', errors);
assertNotContains(showPanelBody, 'resetSession', 'panel switching must not reset solver session', errors);
assertNotContains(showPanelBody, 'updateState(', 'panel switching must not mutate live design', errors);
assertNotContains(showPanelBody, 'applySelectedCandidate', 'panel switching must not apply candidate', errors);
assertContains(showPanelBody, "target === 'preview'", 'Preview visibility branch exists', errors);
assertContains(showPanelBody, 'resizePreviewRenderer()', 'preview resize triggered when preview visible', errors);
assertContains(showPanelBody, 'renderCandidatePreview', 'preview render triggered for selected candidate', errors);

// Regression from 15.3c/15.3b/15.3a.
assertContains(solver, 'solverSearchSession', 'continuation behavior remains present', errors);
assertContains(solver, 'Continue Search', 'Continue Search UI state remains present', errors);
assertContains(solver, 'captureActiveSolverInput', 'solver input focus fix remains present', errors);
assertContains(solver, 'restoreActiveSolverInput', 'solver input caret restore remains present', errors);
assertContains(index, 'data/tonearmdesigner-cartridges.min.js', 'cartridge JS data bundle still used', errors);
assertContains(data, 'window.TONEARMDESIGNER_CARTRIDGES', 'runtime cartridge JS global exists', errors);
assertContains(picker, 'window.TONEARMDESIGNER_CARTRIDGES', 'picker uses JS data global', errors);
assertContains(picker, 'expandControlRangeForValue', 'dynamic cartridge controller range fix remains present', errors);
assertNotContains(picker, 'tonearmdesigner-cartridges.min.json', 'no JSON fetch dependency in picker', errors);
assertNotContains(index, 'tonearmdesigner-cartridges.min.json', 'no JSON fetch dependency in index', errors);
assertNotContains(combinedUiHelp, 'AI is wrong by default', 'AI protocol mantra in UI/help', errors);
assertNotContains(combinedUiHelp, 'AI har fel', 'AI protocol mantra Swedish in UI/help', errors);

if (errors.length) {
    console.error('Fas 15.3d solver panel tabs acceptance: FAIL');
    errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
    process.exit(1);
}

console.log('Fas 15.3d solver panel tabs acceptance: PASS');
console.log('- Guide/Expert/Results/Preview controls are non-navigating in-page buttons');
console.log('- no iframe/object/self-index loading is used for solver panels');
console.log('- activeSolverPanel state toggles active class, aria-selected and hidden panels');
console.log('- panel switching does not reset search session or mutate live design');
console.log('- Preview selection triggers resize/render hooks');
console.log('- continuation, focus retention and cartridge picker regressions remain protected');
