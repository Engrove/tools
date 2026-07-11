#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_2_solver_slider_help_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.2 solver evaluation slider + help.html documentation acceptance.
 *
 * Static/contract harness only:
 * - Browser/WebGL is not executed here.
 * - It verifies the slider DOM/source contract, selected-cap scoring path,
 *   preserved async/chunking path, and user-facing help.html coverage.
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
const help = read('help.html');
const combinedUi = index + '\n' + help;
const combinedSource = index + '\n' + css + '\n' + solver + '\n' + help;

const errors = [];
const warnings = [];

assertContains(index, 'id="solverEvaluationLimit"', 'solver evaluation slider DOM', errors);
assertRegex(index, /id="solverEvaluationLimit"[^>]*type="range"/, 'solver evaluation slider range input', errors);
assertRegex(index, /id="solverEvaluationLimit"[^>]*min="2500"/, 'slider min 2500', errors);
assertRegex(index, /id="solverEvaluationLimit"[^>]*max="15000"/, 'slider max 15000', errors);
assertRegex(index, /id="solverEvaluationLimit"[^>]*step="500"/, 'slider step 500', errors);
assertContains(index, 'id="solverEvaluationLimitValue"', 'slider selected value output', errors);
assertContains(index, '2,500 candidates', 'default selected cap displayed', errors);
assertContains(css, '.solver-evaluation-control', 'slider styling', errors);

assertContains(solver, 'MIN_EVALUATION_LIMIT = 2500', 'source min evaluation limit', errors);
assertContains(solver, 'MAX_EVALUATION_LIMIT = 15000', 'source max evaluation limit', errors);
assertContains(solver, 'DEFAULT_EVALUATION_LIMIT = 2500', 'default evaluation limit', errors);
assertContains(solver, 'normalizeEvaluationLimit', 'normalised slider limit', errors);
assertContains(solver, 'onEvaluationLimitInput', 'slider input handler', errors);
assertContains(solver, 'session.evaluationLimit', 'session evaluation limit field', errors);
assertContains(solver, 'session.maxEvaluations', 'session maxEvaluations field', errors);
assertRegex(solver, /const\s+selectedLimit\s*=\s*getSelectedEvaluationLimit\(\)[\s\S]*const\s+capped\s*=\s*Math\.min\(est\.raw,\s*selectedLimit\)/, 'solver uses selected slider value as cap', errors);
assertContains(solver, 'selectedEvaluationLimit: selectedLimit', 'last run records selected limit', errors);
assertContains(solver, 'maxEvaluations: selectedLimit', 'last run records max evaluations', errors);

assertContains(solver, 'SOLVER_BATCH_SIZE', 'batch size constant preserved', errors);
assertContains(solver, 'scheduleSolverChunk', 'async scheduler preserved', errors);
assertRegex(solver, /requestIdleCallback|requestAnimationFrame|setTimeout/, 'async yield primitive preserved', errors);
assertRegex(solver, /function\s+pump\(\)[\s\S]*session\.evaluatedCount\s*<\s*capped[\s\S]*SOLVER_BATCH_SIZE[\s\S]*scheduleSolverChunk\(pump\)/, 'chunked solver pump uses cap and batch', errors);
assertContains(index, 'id="solverSpinner"', 'spinner DOM preserved', errors);
assertContains(index, 'id="solverProgressText"', 'progress DOM preserved', errors);
assertRegex(solver, /Calculating candidates[\s\S]*selected cap|selected limit|actual cap/, 'progress/status references selected cap or evaluated count', errors);
assertNotContains(solver, 'function walk(depth, values, candidate)', 'old recursive one-shot brute force loop', errors);
assertNotContains(solver, 'for (let i = 0; i < est.raw; i += 1)', 'one-shot raw-grid for loop', errors);

assertContains(solver, 'scoreCandidateWithTargets', 'Fas 15.1 active target scoring still present', errors);
assertContains(solver, 'tracking_force', 'tracking force target still present', errors);
assertContains(solver, 'total_com_z', 'total COM target still present', errors);
assertContains(solver, 'counterweight_com_z', 'counterweight COM target still present', errors);
assertContains(solver, 'diameter_range', 'diameter manufacturing target still present', errors);
assertContains(solver, "status('Enable at least one optimization target.'", 'zero active target refusal still present', errors);

assertContains(help, '<section id="solver">', 'help solver section exists', errors);
assertContains(help, 'Solver Sandbox', 'help documents solver sandbox', errors);
assertContains(help, 'Live design changes only after Apply', 'help documents Apply-only behavior', errors);
assertRegex(help, /Discard[\s\S]*X[\s\S]*without applying|without applying[\s\S]*Discard[\s\S]*X/, 'help documents Discard/X close without applying', errors);
assertContains(help, 'Reset', 'help documents Reset behavior', errors);
assertContains(help, 'Run Solver', 'help documents Run Solver', errors);
assertContains(help, 'own 3D preview', 'help documents own 3D preview', errors);
assertRegex(help, /locked[\s\S]*unlocked|unlocked[\s\S]*locked/, 'help documents locked/unlocked variables', errors);
assertRegex(help, /min[\s\S]*max[\s\S]*step/, 'help documents min/max/step ranges', errors);
assertContains(help, 'Optimization Goals', 'help documents active solver targets', errors);
assertRegex(help, /Enabled targets contribute[\s\S]*disabled targets/, 'help documents enabled vs disabled target scoring', errors);
assertContains(help, 'enable at least one', 'help documents zero-target refusal', errors);
assertContains(help, 'Tracking force / needle pressure', 'help documents tracking force target', errors);
assertContains(help, 'Total tonearm COM', 'help documents total COM target', errors);
assertContains(help, 'Counterweight COM', 'help documents counterweight COM target', errors);
assertContains(help, 'Manufacturing diameter min/max', 'help documents manufacturing diameter min/max constraint', errors);
assertRegex(help, /carbon fiber sleeve|sock compatibility/, 'help documents carbon fiber sleeve/sock use', errors);
assertRegex(help, /Effective mass[\s\S]*resonance|resonance[\s\S]*Effective mass/, 'help documents effective mass / resonance', errors);
assertRegex(help, /spinner[\s\S]*progress|progress[\s\S]*spinner/, 'help documents async spinner/progress', errors);
assertRegex(help, /2,500[\s\S]*15,000/, 'help documents evaluation slider 2500 to 15000', errors);
assertRegex(help, /estimated grid[\s\S]*evaluated candidates|evaluated candidates[\s\S]*estimated grid/, 'help documents estimated grid vs evaluated candidates', errors);
assertRegex(help, /candidate suggestion[\s\S]*not proof|not proof[\s\S]*candidate suggestion/, 'help documents solver limitations', errors);

assertNotContains(combinedUi, 'Jag AI har fel som standard tills jag bevisat motsatsen', 'AI mantra in UI/help', errors);
assertNotContains(combinedUi, 'AI is wrong by default until proven otherwise', 'AI protocol sentence in UI/help', errors);

const result = {
    schema: 'tonearm-designer-fas15-2-solver-slider-help-acceptance-v1',
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    checks: {
        slider: {
            exists: index.includes('id="solverEvaluationLimit"'),
            min2500: /id="solverEvaluationLimit"[^>]*min="2500"/.test(index),
            max15000: /id="solverEvaluationLimit"[^>]*max="15000"/.test(index),
            displayedValue: index.includes('id="solverEvaluationLimitValue"')
        },
        capUsedBySolver: /const\s+selectedLimit\s*=\s*getSelectedEvaluationLimit\(\)[\s\S]*const\s+capped\s*=\s*Math\.min\(est\.raw,\s*selectedLimit\)/.test(solver),
        asyncChunked: solver.includes('scheduleSolverChunk') && solver.includes('SOLVER_BATCH_SIZE'),
        spinnerProgress: index.includes('id="solverSpinner"') && index.includes('id="solverProgressText"'),
        help: {
            exists: help.length > 0,
            solverSandbox: help.includes('Solver Sandbox'),
            variables: /locked[\s\S]*unlocked|unlocked[\s\S]*locked/.test(help),
            ranges: /min[\s\S]*max[\s\S]*step/.test(help),
            targets: help.includes('Optimization Goals'),
            evaluationSlider: /2,500[\s\S]*15,000/.test(help),
            noAiMantra: !combinedUi.includes('Jag AI har fel som standard tills jag bevisat motsatsen')
        }
    },
    warnings,
    errors,
    statement: 'Browser/WebGL rendering is NOT performed by this Node harness; it verifies Fas 15.2 source, DOM and help.html contracts only.'
};

console.log(JSON.stringify(result, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
