#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3c_solver_continuation_responsive_guide_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3c solver continuation, responsive layout and guided mode acceptance.
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

// Continuation
assertContains(solver, 'solverSearchSession', 'solver search session object', errors);
assertContains(solver, 'function buildSolverSearchSignature', 'solver search signature function', errors);
assertContains(solver, 'variables', 'signature includes variables', errors);
assertContains(solver, 'targets', 'signature includes targets', errors);
assertContains(solver, 'weight', 'signature includes weights', errors);
assertContains(solver, 'evaluationLimit: getSelectedEvaluationLimit()', 'signature includes evaluation limit', errors);
assertContains(solver, 'cursor: 0', 'first search session cursor starts at 0', errors);
assertRegex(solver, /startCursor\s*=\s*Math\.max\(0,\s*Number\(searchSession\.cursor\)/, 'run starts from current cursor', errors);
assertRegex(solver, /linearIndex\s*=\s*Math\.min\(est\.raw\s*-\s*1,\s*startCursor\s*\+\s*session\.evaluatedCount\)/, 'unchanged continuation advances next cursor', errors);
assertContains(solver, 'searchSession.evaluatedCumulative', 'cumulative evaluated count', errors);
assertContains(solver, 'mergeSolverBestCandidates', 'best results merged across batches', errors);
assertContains(solver, "invalidateSolverSearch('Variable range changed.')", 'changed variable invalidates continuation', errors);
assertContains(solver, "invalidateSolverSearch('Target value changed.')", 'changed target invalidates continuation', errors);
assertContains(solver, "invalidateSolverSearch('Evaluation limit changed.')", 'changed evaluation slider invalidates continuation', errors);
assertContains(solver, 'resetSolverSearchSession', 'reset search function exists', errors);
assertContains(index, 'Reset Search', 'Reset Search UI exists', errors);
assertContains(solver, 'Continue Search', 'Continue Search UI state exists', errors);
assertContains(solver, 'Search Complete', 'Search Complete UI state exists', errors);

// Responsive layout
assertContains(index, 'solverGuidePanel', 'Guide panel exists', errors);
assertContains(index, 'solverExpertPanel', 'Expert panel exists', errors);
assertContains(index, 'solverResultsPanel', 'Results panel exists', errors);
assertContains(index, 'solverPreviewPanel', 'Preview panel exists', errors);
assertContains(index, 'data-solver-tab="guide"', 'Guide tab exists', errors);
assertContains(index, 'data-solver-tab="expert"', 'Expert tab exists', errors);
assertContains(index, 'data-solver-tab="results"', 'Results tab exists', errors);
assertContains(index, 'data-solver-tab="preview"', 'Preview tab exists', errors);
assertRegex(css, /@media\s*\(max-width:\s*1366px\)/, '1366px responsive breakpoint', errors);
assertRegex(css, /@media\s*\(max-width:\s*1024px\)/, '1024px responsive breakpoint', errors);
assertNotContains(css, 'grid-template-columns: minmax(260px, 21vw) minmax(300px, 24vw) 1fr minmax(280px, 21vw)', 'fixed four-column-only solver layout', errors);
assertContains(index, 'solverPreview3D', 'preview remains accessible', errors);
assertContains(index, 'solverResults', 'results remain accessible', errors);
assertContains(index, 'solverVariables', 'expert variables remain accessible', errors);
assertContains(index, 'solverTargets', 'expert targets remain accessible', errors);
assertContains(solver, 'captureActiveSolverInput', 'input focus retention still protected', errors);
assertContains(solver, 'restoreActiveSolverInput', 'caret restore still protected', errors);

// Guided mode
assertContains(index, 'solverGuidePreset', 'guided preset selector exists', errors);
assertContains(index, 'What do you want to optimize?', 'guide question 1 exists', errors);
assertContains(index, 'What may the solver change?', 'guide question 2 exists', errors);
assertContains(index, 'What is fixed?', 'guide question 3 exists', errors);
assertContains(index, 'Manufacturing constraints', 'guide manufacturing question exists', errors);
assertContains(index, 'Search depth', 'guide search depth exists', errors);
['Tracking Force Fine Tune','Resonance Window Tune','Counterweight Balance Tune','Manufacturing Diameter Safe Tune','Balanced Optimization'].forEach(label => {
    assertContains(index, label, 'guide required preset ' + label, errors);
});
assertContains(solver, 'GUIDE_PRESETS', 'guide preset mapping exists', errors);
assertContains(solver, 'applySolverGuideSettings', 'guide apply function exists', errors);
assertContains(solver, 'target.enabled = targetsToEnable.indexOf(target.id) >= 0', 'guide can activate targets', errors);
assertContains(solver, 'variable.locked = variablesToUnlock.indexOf(variable.key) < 0', 'guide can unlock/lock variables', errors);
assertContains(solver, 'session.evaluationLimit = depth', 'guide can set evaluation limit', errors);
assertContains(index, 'solverGuideSummary', 'guide summary UI exists', errors);
assertContains(solver, 'Guide configured:', 'guide summary message exists', errors);
assertContains(index, 'live design still changes only after Apply', 'guide sandbox copy states no live mutation', errors);
assertContains(solver, "showSolverTab('expert')", 'guide-to-expert state reflection exists', errors);
assertContains(solver, 'session.activeSolverTab', 'switching guide/expert preserves tab state', errors);

// Regression
assertContains(index, 'data/tonearmdesigner-cartridges.min.js', 'cartridge JS data bundle used', errors);
assertContains(data, 'window.TONEARMDESIGNER_CARTRIDGES', 'runtime cartridge JS global exists', errors);
assertContains(picker, 'window.TONEARMDESIGNER_CARTRIDGES', 'picker uses JS data global', errors);
assertNotContains(picker, 'tonearmdesigner-cartridges.min.json', 'no JSON fetch dependency in picker', errors);
assertNotContains(index, 'tonearmdesigner-cartridges.min.json', 'no JSON fetch dependency in index', errors);
assertRegex(solver, /function\s+applySelectedCandidate\(\)[\s\S]*Object\.keys\(result\.values\)\.forEach[\s\S]*updateState\(\)/, 'Apply-only live mutation contract remains intact', errors);
assertNotContains(combinedUiHelp, 'AI is wrong by default', 'AI protocol mantra in UI/help', errors);
assertNotContains(combinedUiHelp, 'AI har fel', 'AI protocol mantra Swedish in UI/help', errors);

if (errors.length) {
    console.error('Fas 15.3c solver continuation/responsive/guide acceptance: FAIL');
    errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
    process.exit(1);
}

console.log('Fas 15.3c solver continuation/responsive/guide acceptance: PASS');
console.log('- solver search session signature includes variables, targets, weights and evaluation limit');
console.log('- unchanged Run Solver continues from the next cursor and merges cumulative best results');
console.log('- changed variables, targets and evaluation limit invalidate continuation');
console.log('- Guide/Expert/Results/Preview panels and responsive breakpoints are present');
console.log('- guided presets configure solver sandbox settings and keep Apply-only live mutation contract');
console.log('- cartridge picker JS-data and solver input focus protections remain intact');
