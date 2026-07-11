#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3e_smart_solver_ordering_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3e smart solver ordering acceptance.
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

// Strategy selector.
assertContains(index, 'id="solverSearchStrategy"', 'search strategy selector exists', errors);
[
    'smart_prioritized',
    'exhaustive_order',
    'local_refinement',
    'counterweight_first',
    'geometry_first',
    'resonance_first'
].forEach(strategy => {
    assertContains(index, `value="${strategy}"`, `strategy option ${strategy}`, errors);
});
assertRegex(index, /<option value="smart_prioritized" selected>Smart prioritized<\/option>/, 'Smart prioritized default option', errors);
assertContains(index, 'solverPlanSummary', 'strategy/plan summary UI', errors);

// Plan/scheduler.
assertContains(solver, 'const SOLVER_SCHEDULER_VERSION', 'scheduler version constant', errors);
assertContains(solver, 'const SEARCH_STRATEGIES', 'search strategies registry', errors);
assertContains(solver, 'function buildSolverPlan', 'solverPlan object builder exists', errors);
assertContains(solver, 'function buildSolverPlan', 'solverPlan schema appears', errors);
assertContains(solver, 'strategyLabel', 'solverPlan strategy label', errors);
assertContains(solver, 'primaryGroups', 'solverPlan primary groups', errors);
assertContains(solver, 'passSequence', 'solverPlan pass sequence', errors);
assertContains(solver, 'refinementAroundTopN', 'solverPlan refinement top N', errors);
assertContains(solver, 'baselineNearFirst', 'baseline-near-first flag', errors);
assertContains(solver, 'targetAwareOrdering', 'target-aware ordering flag', errors);
assertContains(solver, 'deterministicSeed', 'deterministic seed metadata', errors);
assertContains(solver, 'strategy,', 'strategy included in search signature', errors);
assertContains(solver, 'schedulerVersion: SOLVER_SCHEDULER_VERSION', 'scheduler version in signature/session', errors);
assertContains(solver, 'function makeCandidateScheduler', 'candidate scheduler exists', errors);
assertContains(solver, 'function buildCandidateFromSchedulerCursor', 'scheduler cursor builder exists', errors);
assertContains(solver, 'function orderSamplesForPlan', 'lazy sample ordering exists', errors);
assertContains(solver, 'function orderedSampleValuesForPlan', 'baseline-near value ordering exists', errors);
assertContains(solver, 'function targetPriorityGroups', 'target-aware group mapping exists', errors);
assertContains(solver, 'function variableHeuristicGroup', 'variable group priority exists', errors);
assertContains(solver, 'function classifySchedulerCursor', 'coarse-to-fine pass classification exists', errors);
assertContains(solver, 'local refinement', 'local refinement source metadata', errors);
assertContains(solver, 'makeCandidateScheduler(samples, baseline, plan, searchSession)', 'scheduler integrated into runSolver', errors);
assertNotContains(solver, 'Math.random()', 'unseeded Math.random candidate ordering', errors);

// Lazy/chunked behavior: no eager full grid array generation.
assertContains(solver, 'scheduleSolverChunk(pump)', 'async/chunked pump remains', errors);
assertContains(solver, 'SOLVER_BATCH_SIZE', 'solver chunk size remains', errors);
assertRegex(solver, /scheduler\.next\(schedulerCursor\)/, 'scheduler lazily returns next candidate', errors);
assertNotContains(solver, 'allCandidates.push', 'eager full candidate list build', errors);
assertNotContains(solver, 'Array.from({ length: est.raw', 'full grid materialization', errors);

// Continuation integration.
assertContains(solver, 'searchSession.strategy = strategy', 'strategy stored in search session', errors);
assertContains(solver, 'searchSession.schedulerVersion = SOLVER_SCHEDULER_VERSION', 'scheduler version stored in search session', errors);
assertContains(solver, 'searchSession.solverPlan = deepClone(plan)', 'plan stored in search session', errors);
assertRegex(solver, /startCursor\s*=\s*Math\.max\(0,\s*Number\(searchSession\.cursor\)/, 'unchanged strategy continues next scheduler cursor', errors);
assertContains(solver, "invalidateSolverSearch('Search strategy changed.')", 'strategy change invalidates continuation', errors);
assertContains(solver, 'mergeSolverBestCandidates', 'cumulative best results merge across prioritized batches', errors);
assertContains(solver, 'candidateKeyFromValues', 'duplicate candidate key support', errors);
assertContains(solver, 'candidateKey', 'duplicate candidate avoidance/cursor metadata', errors);

// Guide integration.
assertRegex(solver, /tracking_force:[\s\S]*strategy:\s*'counterweight_first'/, 'Tracking Force guide strategy mapping', errors);
assertRegex(solver, /resonance:[\s\S]*strategy:\s*'resonance_first'/, 'Resonance guide strategy mapping', errors);
assertRegex(solver, /counterweight:[\s\S]*strategy:\s*'counterweight_first'/, 'Counterweight guide strategy mapping', errors);
assertRegex(solver, /manufacturing:[\s\S]*strategy:\s*'smart_prioritized'/, 'Manufacturing guide strategy mapping', errors);
assertRegex(solver, /balanced:[\s\S]*strategy:\s*'smart_prioritized'/, 'Balanced guide strategy mapping', errors);
assertContains(solver, 'session.searchStrategy = normalizeSearchStrategy(preset.strategy', 'guide applies strategy', errors);
assertContains(solver, 'Plan:', 'guide summary shows plan', errors);
assertContains(solver, 'onSearchStrategyChange', 'Expert/manual strategy override handler exists', errors);

// Reporting.
assertContains(solver, 'Strategy:', 'strategy reporting text exists', errors);
assertContains(solver, 'source ${result.source', 'candidate source reporting exists', errors);
assertContains(solver, 'pass ${result.pass', 'candidate pass reporting exists', errors);
assertContains(solver, 'Not exhaustive: candidate order is prioritized by active targets.', 'not-exhaustive prioritized note', errors);

// Regression: previous behavior remains.
assertContains(solver, 'solverSearchSession', 'continuation session remains', errors);
assertContains(solver, 'activeSolverPanel', 'panel tabs remain stateful', errors);
assertContains(solver, 'evt.preventDefault()', 'panel tabs remain non-navigating', errors);
assertContains(solver, 'stageVariableInput', 'solver input focus/edit buffer remains', errors);
assertContains(picker, 'window.TONEARMDESIGNER_CARTRIDGES', 'cartridge picker JS-data remains', errors);
assertContains(data, 'window.TONEARMDESIGNER_CARTRIDGES', 'cartridge JS data bundle exists', errors);
assertNotContains(picker, 'fetch("data/tonearmdesigner-cartridges.min.json")', 'JSON fetch cartridge dependency', errors);
assertNotContains(picker, "fetch('data/tonearmdesigner-cartridges.min.json')", 'JSON fetch cartridge dependency single quote', errors);
assertContains(solver, 'applySelectedCandidate', 'Apply-only live mutation function remains', errors);
assertContains(index, 'solverApplyBtn', 'Apply button remains', errors);

// User-facing mantra must not appear.
assertNotContains(combinedUiHelp.toLowerCase(), 'ai is wrong by default', 'AI protocol in UI/help', errors);
assertNotContains(combinedUiHelp.toLowerCase(), 'wrong by default until proven otherwise', 'AI protocol in UI/help', errors);
assertNotContains(combinedUiHelp.toLowerCase(), 'fel som standard', 'AI protocol in UI/help Swedish', errors);

if (errors.length) {
    console.error('Fas 15.3e smart solver ordering acceptance: FAIL');
    errors.forEach((err, idx) => console.error(`${idx + 1}. ${err}`));
    process.exit(1);
}

console.log('Fas 15.3e smart solver ordering acceptance: PASS');
console.log('- Smart prioritized is default and Exhaustive order remains available');
console.log('- solverPlan and deterministic scheduler metadata are present');
console.log('- candidate ordering is lazy/chunked, target-aware and baseline-near first');
console.log('- continuation includes strategy/scheduler signature and resets on strategy change');
console.log('- guide presets map to strategy plans while previous panel/input/cartridge fixes remain protected');
