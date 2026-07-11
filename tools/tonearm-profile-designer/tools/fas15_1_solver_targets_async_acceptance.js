#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_1_solver_targets_async_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.1 solver targets + async acceptance.
 *
 * Static/contract harness only:
 * - Browser/WebGL is not executed here.
 * - It verifies solver targets, active-target scoring, async/chunking hooks,
 *   progress state, close contract, and read-only-until-Apply source contracts.
 */

const fs = require('fs');
const path = require('path');

function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
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
const css = read('css/style.css');
const solver = read('js/solver-modal.js');
const combined = index + '\n' + css + '\n' + solver;

const errors = [];
const warnings = [];

assertNotContains(combined, 'Jag AI har fel som standard tills jag bevisat motsatsen', 'AI mantra in UI/source contract', errors);

assertContains(index, 'id="solverTargets"', 'targets panel DOM', errors);
assertContains(index, 'Optimization Goals', 'targets panel title', errors);
assertContains(solver, 'buildDefaultTargets', 'target model builder', errors);

assertContains(solver, 'tracking_force', 'tracking force target', errors);
assertRegex(solver, /Tracking force\s*\/\s*needle pressure/, 'tracking force label', errors);
assertContains(solver, 'total_com_z', 'total COM target', errors);
assertContains(solver, 'Total tonearm COM Z', 'total COM label', errors);
assertContains(solver, 'counterweight_com_z', 'counterweight COM target', errors);
assertContains(solver, 'Counterweight COM Z', 'counterweight COM label', errors);
assertContains(solver, 'diameter_range', 'diameter manufacturing constraint target', errors);
assertContains(solver, 'Diameter manufacturing constraint', 'diameter target label', errors);
assertContains(solver, 'maxDiameterEstimated', 'candidate estimated max diameter metric', errors);
assertContains(solver, 'hard: !!hard', 'hard constraint model', errors);
assertRegex(solver, /hardViolation[\s\S]*filter\(result => !result\.invalid\)/, 'hard invalid candidate rejection', errors);

assertContains(solver, "status('Enable at least one optimization target.'", 'zero active targets refusal', errors);

assertContains(solver, 'scoreCandidateWithTargets', 'explicit active-target scoring function', errors);
assertRegex(solver, /filter\(target\s*=>\s*target\.enabled\)/, 'run uses enabled targets', errors);
assertRegex(solver, /if\s*\(!target\.enabled\)[\s\S]*penalty:\s*0/, 'inactive targets contribute zero penalty', errors);
assertContains(solver, 'activeTargetPenalty', 'active target penalty term', errors);
assertContains(solver, 'uiScoreTransform', 'score transform documentation in code', errors);

assertContains(solver, 'SOLVER_BATCH_SIZE', 'batch size constant', errors);
assertContains(solver, 'scheduleSolverChunk', 'async chunk scheduler', errors);
assertRegex(solver, /requestIdleCallback|requestAnimationFrame|setTimeout/, 'browser-yield async scheduling primitive', errors);
assertRegex(solver, /function\s+pump\(\)[\s\S]*SOLVER_BATCH_SIZE[\s\S]*scheduleSolverChunk\(pump\)/, 'chunked pump loop', errors);
assertNotContains(solver, 'function walk(depth, values, candidate)', 'old recursive blocking walk loop', errors);

assertContains(index, 'id="solverSpinner"', 'spinner DOM', errors);
assertContains(index, 'id="solverProgressText"', 'progress text DOM', errors);
assertContains(index, 'id="solverCancelBtn"', 'cancel button DOM', errors);
assertContains(solver, 'isCalculating', 'isCalculating state', errors);
assertContains(solver, 'solverAbortRequested', 'abort/cancel state', errors);
assertContains(solver, 'evaluatedCount', 'evaluated count state', errors);
assertContains(solver, 'estimatedGridCount', 'estimated grid count state', errors);
assertContains(solver, 'cappedEvaluationCount', 'capped evaluation count state', errors);
assertContains(solver, 'renderSolverProgress', 'progress render function', errors);

assertContains(solver, 'baselineState', 'baseline state in session model', errors);
assertContains(solver, 'workingState', 'working state in session model', errors);
assertContains(solver, 'variables', 'variables session field', errors);
assertContains(solver, 'targets', 'targets session field', errors);
assertContains(solver, 'selectedCandidate', 'selected candidate session field', errors);

assertContains(solver, 'withVirtualState', 'virtual solver state guard', errors);
assertContains(solver, 'Object.assign(state, savedState)', 'state restore guard', errors);
assertRegex(solver, /function\s+applySelectedCandidate\(\)[\s\S]*Object\.keys\(result\.values\)\.forEach[\s\S]*updateState\(\)/, 'Apply is mutation path', errors);
assertRegex(solver, /solverDiscardBtn'[\s\S]*closeModal\('discard'\)/, 'Discard closes without applying', errors);
assertRegex(solver, /if\s*\(\s*evt\.target\s*===\s*modal\s*\)[\s\S]*evt\.preventDefault\(\)[\s\S]*evt\.stopPropagation\(\)/, 'backdrop click disabled', errors);
assertRegex(solver, /if\s*\(\s*evt\.key\s*===\s*['"]Escape['"]\s*\)[\s\S]*evt\.preventDefault\(\)[\s\S]*evt\.stopPropagation\(\)/, 'Escape disabled', errors);

assertContains(index, 'id="solverPreview3D"', '3D preview container still present', errors);
assertContains(solver, 'initPreview', 'preview init lifecycle', errors);
assertContains(solver, 'requestAnimationFrame(() =>', 'deferred first render lifecycle', errors);
assertContains(solver, 'resizePreviewRenderer', 'preview resize before render', errors);
assertContains(solver, 'updatePreviewScene', 'candidate preview update lifecycle', errors);
assertContains(solver, 'renderPreviewFrame', 'explicit preview frame render', errors);
assertContains(solver, 'addSafePreviewFallback', 'preview fallback guard', errors);

const result = {
    schema: 'tonearm-designer-fas15-1-solver-targets-async-acceptance-v1',
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    checks: {
        mantraRemoved: !combined.includes('Jag AI har fel som standard tills jag bevisat motsatsen'),
        targetPanel: index.includes('id="solverTargets"'),
        targets: {
            trackingForce: solver.includes('tracking_force'),
            totalCOM: solver.includes('total_com_z'),
            counterweightCOM: solver.includes('counterweight_com_z'),
            diameterManufacturing: solver.includes('diameter_range'),
            resonance: solver.includes('resonance_window'),
            effectiveMass: solver.includes('effective_mass_range')
        },
        zeroTargetsRefused: solver.includes("Enable at least one optimization target."),
        activeTargetScoring: solver.includes('scoreCandidateWithTargets') && solver.includes('activeTargetPenalty'),
        inactiveTargetsNoPenalty: /if\s*\(!target\.enabled\)[\s\S]*penalty:\s*0/.test(solver),
        asyncChunked: solver.includes('scheduleSolverChunk') && solver.includes('SOLVER_BATCH_SIZE'),
        progressState: solver.includes('isCalculating') && index.includes('id="solverSpinner"'),
        applyOnlyMutation: solver.includes('applySelectedCandidate') && solver.includes('withVirtualState'),
        closeContract: solver.includes('Escape is disabled by design') && solver.includes('backdrop clicks'),
        previewLifecycle: solver.includes('initPreview') && solver.includes('updatePreviewScene') && solver.includes('renderPreviewFrame')
    },
    warnings,
    errors,
    statement: 'Browser/WebGL rendering is NOT performed by this Node harness; it verifies Fas 15.1 source and DOM contracts only.'
};

console.log(JSON.stringify(result, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
