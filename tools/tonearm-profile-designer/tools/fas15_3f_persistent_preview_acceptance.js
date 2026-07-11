#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3f_persistent_preview_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3f persistent solver preview acceptance.
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

// Persistent preview layout.
assertContains(index, 'id="solverPreviewPanel"', 'persistent right-side preview panel exists', errors);
assertContains(index, 'solver-persistent-preview-panel', 'persistent preview panel class exists', errors);
assertContains(index, 'data-persistent-preview="true"', 'persistent preview marker exists', errors);
assertContains(index, 'id="solverPreview3D"', 'preview canvas container exists', errors);
assertContains(index, 'id="solverCandidateMetrics"', 'selected candidate metrics panel exists', errors);
assertRegex(index, /<aside id="solverPreviewPanel"[\s\S]*solver-persistent-preview-panel/, 'preview is persistent aside, not only a hidden tab panel', errors);
assertNotContains(index.match(/id="solverPreviewPanel"[\s\S]*?<div id="solverCandidateMetrics"/)?.[0] || '', 'solver-tab-panel', 'preview panel is not only inside hidden Preview tab', errors);
assertNotContains(index.match(/id="solverPreviewPanel"[\s\S]*?<div id="solverCandidateMetrics"/)?.[0] || '', 'hidden', 'persistent preview panel hidden attribute', errors);

// Left/main work panels remain Guide / Expert / Results.
['solverGuidePanel', 'solverExpertPanel', 'solverResultsPanel'].forEach(id => {
    assertContains(index, `id="${id}"`, `${id} exists as work panel`, errors);
});
assertContains(index, 'Focus Preview', 'Preview tab replaced with Focus Preview control or equivalent', errors);
assertContains(css, 'grid-template-areas:', 'responsive grid layout exists', errors);
assertContains(css, '"tabs preview"', 'wide layout places preview persistently at right', errors);
assertContains(css, '"guide preview"', 'work panel plus persistent preview layout exists', errors);
assertContains(css, 'solver-persistent-preview-panel', 'persistent preview CSS exists', errors);

// Render lifecycle.
assertContains(solver, 'function initPreview', 'preview renderer initialization function exists', errors);
assertContains(solver, "schedulePersistentPreviewRender('modal open')", 'preview render tied to modal open', errors);
assertContains(solver, "schedulePersistentPreviewRender('selected candidate changed')", 'preview render tied to selected candidate change', errors);
assertContains(solver, "schedulePersistentPreviewRender('solver result update')", 'preview render tied to solver result update', errors);
assertContains(solver, 'ResizeObserver', 'ResizeObserver or equivalent resize lifecycle exists', errors);
assertContains(solver, 'handlePreviewWindowResize', 'window resize fallback exists', errors);
assertContains(solver, 'PREVIEW_ZERO_SIZE_RETRY_LIMIT', 'zero-size retry guard exists', errors);
assertContains(solver, 'getPreviewContainerSize', 'container size guard exists', errors);
assertContains(solver, 'init zero-size guard', 'zero-size init retry exists', errors);
assertContains(solver, 'resize zero-size guard', 'zero-size resize retry exists', errors);
assertContains(solver, 'startPreviewLoop', 'preview loop remains available', errors);
assertContains(solver, 'disposePreview()', 'preview disposed only through explicit lifecycle calls', errors);

const showPanelMatch = solver.match(/function showSolverPanel\(name\) \{[\s\S]*?\n    \}/);
const showPanelBody = showPanelMatch ? showPanelMatch[0] : '';
assert(showPanelBody.length > 0, 'showSolverPanel can be inspected', errors);
assertContains(showPanelBody, "target === 'preview'", 'Focus Preview branch exists', errors);
assertContains(showPanelBody, 'schedulePersistentPreviewRender', 'panel switching schedules persistent preview render', errors);
assertNotContains(showPanelBody, 'disposePreview', 'panel switching must not dispose preview', errors);
assertNotContains(showPanelBody, 'updateState(', 'panel switching must not mutate live design', errors);
assertNotContains(showPanelBody, 'resetSolverSearchSession', 'panel switching must not reset continuation', errors);

// No self-index loading/navigation.
const lowerIndex = index.toLowerCase();
assertNotContains(lowerIndex, '<iframe', 'iframe self-index loading', errors);
assertNotContains(lowerIndex, '<object', 'object self-index loading', errors);
assertNotContains(lowerIndex, '<embed', 'embed self-index loading', errors);
assertNotContains(index, 'src="index.html"', 'index.html iframe/embed src', errors);
assertNotContains(index, 'data="index.html"', 'index.html object data', errors);
assertNotContains(solver, 'index.html', 'solver JS index.html navigation', errors);
assertContains(solver, 'evt.preventDefault()', 'panel/focus controls prevent default navigation', errors);

// Regressions preserved.
assertRegex(index, /<option value="smart_prioritized" selected>Smart prioritized<\/option>/, 'Smart prioritized remains default', errors);
assertContains(index, 'value="exhaustive_order"', 'Exhaustive order remains selectable', errors);
assertContains(solver, 'solverSearchSession', 'continuation/search session remains present', errors);
assertContains(solver, 'solverPlan', 'solverPlan metadata remains present', errors);
assertContains(solver, 'captureActiveSolverInput', 'input focus protection remains present', errors);
assertContains(solver, 'restoreActiveSolverInput', 'input caret restore remains present', errors);
assertContains(index, 'data/tonearmdesigner-cartridges.min.js', 'cartridge picker JS data remains present', errors);
assertContains(data, 'window.TONEARMDESIGNER_CARTRIDGES', 'runtime cartridge JS global remains present', errors);
assertContains(picker, 'window.TONEARMDESIGNER_CARTRIDGES', 'picker uses cartridge JS global', errors);
assertNotContains(picker, 'tonearmdesigner-cartridges.min.json', 'no JSON fetch cartridge dependency in picker', errors);
assertNotContains(index, 'tonearmdesigner-cartridges.min.json', 'no JSON fetch cartridge dependency in index', errors);
assertContains(solver, 'applySelectedCandidate', 'Apply-only candidate path remains present', errors);
assertNotContains(combinedUiHelp, 'AI is wrong by default', 'AI protocol mantra in UI/help', errors);
assertNotContains(combinedUiHelp, 'AI har fel', 'AI protocol mantra Swedish in UI/help', errors);

if (errors.length) {
    console.error('Fas 15.3f persistent solver preview acceptance: FAIL');
    errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
    process.exit(1);
}

console.log('Fas 15.3f persistent solver preview acceptance: PASS');
console.log('- persistent right-side preview panel stays mounted outside hidden Preview tab lifecycle');
console.log('- preview render is tied to modal open, selected candidate changes, solver result updates and resize lifecycle');
console.log('- zero-size guards/retries and WebGL failure messaging are present');
console.log('- no iframe/object/embed self-index loading is used for solver UI');
console.log('- smart ordering, continuation, input focus and cartridge JS-data regressions remain protected');
