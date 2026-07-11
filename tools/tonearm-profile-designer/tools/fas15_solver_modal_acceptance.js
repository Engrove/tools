/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_solver_modal_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.x solver modal acceptance.
 *
 * Static/contract harness only:
 * - Browser/WebGL is not executed here.
 * - It verifies the UI and source contracts that prevent live-state mutation by default.
 */

const fs = require('fs');
const path = require('path');

function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function assertContains(haystack, needle, label, errors) {
    if (!haystack.includes(needle)) errors.push(label + ' missing: ' + needle);
}

function assertRegex(haystack, regex, label, errors) {
    if (!regex.test(haystack)) errors.push(label + ' missing pattern: ' + regex);
}

const index = read('index.html');
const css = read('css/style.css');
const solver = read('js/solver-modal.js');

const errors = [];
const warnings = [];

assertContains(index, 'id="solverModal"', 'solver modal markup', errors);
assertContains(index, 'id="openSolverBtn"', 'solver open button', errors);
assertContains(index, 'id="solverCloseBtn"', 'solver X close button', errors);
assertContains(index, 'id="solverDiscardBtn"', 'solver Discard button', errors);
assertContains(index, 'id="solverResetBtn"', 'solver Reset button', errors);
assertContains(index, 'id="solverApplyBtn"', 'solver Apply button', errors);
assertContains(index, 'id="solverPreview3D"', 'solver own 3D preview container', errors);
assertContains(index, '<script src="js/solver-modal.js"></script>', 'solver script include', errors);

assertContains(css, '.solver-modal', 'solver modal css', errors);
assertContains(css, 'position: fixed;', 'fullscreen fixed modal', errors);
assertContains(css, 'width: 100vw;', 'fullscreen width', errors);
assertContains(css, 'height: 100vh;', 'fullscreen height', errors);
assertContains(css, 'z-index: 10000;', 'modal top layer', errors);

assertRegex(index + '\n' + solver, /^(?![\s\S]*Jag AI har fel som standard tills jag bevisat motsatsen)[\s\S]*$/, 'AI mantra removed from user-facing solver sources', errors);
assertContains(solver, 'locked:', 'variable lock policy', errors);
assertContains(solver, 'min:', 'variable min policy', errors);
assertContains(solver, 'max:', 'variable max policy', errors);
assertContains(solver, 'step:', 'variable step policy', errors);
assertContains(solver, 'MAX_EVALUATED_CANDIDATES', 'bounded brute force cap', errors);
assertContains(solver, 'withVirtualState', 'virtual solver state guard', errors);
assertContains(solver, 'Object.assign(state, savedState)', 'state restore guard', errors);
assertContains(solver, 'Escape is disabled by design', 'Escape close disabled', errors);
assertContains(solver, 'backdrop clicks', 'backdrop close disabled notice', errors);
assertContains(solver, 'applySelectedCandidate', 'apply selected candidate path', errors);
assertContains(solver, 'updatePreviewScene', 'own preview render path', errors);
assertContains(solver, 'renderPreviewFrame', 'explicit preview frame render', errors);
assertContains(solver, 'resizePreviewRenderer', 'preview resize before render', errors);
assertContains(solver, 'requestAnimationFrame(() =>', 'deferred first modal preview render', errors);
assertContains(solver, 'addSafePreviewFallback', 'preview fallback guard', errors);
assertRegex(solver, /function\s+setOpen\(open\)[\s\S]*if\s*\(\s*!open\s*\)\s*stopPreviewLoop\(\)/, 'setOpen does not cancel first preview loop on open', errors);

assertRegex(solver, /if\s*\(\s*evt\.target\s*===\s*modal\s*\)[\s\S]*evt\.preventDefault\(\)[\s\S]*evt\.stopPropagation\(\)/, 'backdrop click guard', errors);
assertRegex(solver, /if\s*\(\s*evt\.key\s*===\s*['"]Escape['"]\s*\)[\s\S]*evt\.preventDefault\(\)[\s\S]*evt\.stopPropagation\(\)/, 'escape guard', errors);
assertRegex(solver, /Object\.keys\(result\.values\)\.forEach/, 'apply only selected candidate values', errors);

if (!solver.includes('root.TonearmSolver')) warnings.push('TonearmSolver test surface not exposed.');

const result = {
    schema: 'tonearm-designer-fas15-solver-modal-acceptance-v1',
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    checks: {
        modalMarkup: index.includes('id="solverModal"'),
        fullscreenCss: css.includes('width: 100vw;') && css.includes('height: 100vh;'),
        ownPreview: index.includes('id="solverPreview3D"') && solver.includes('updatePreviewScene') && solver.includes('renderPreviewFrame'),
        variableLocking: solver.includes('locked:') && solver.includes('solver-var-enabled'),
        ranges: solver.includes('solver-var-min') && solver.includes('solver-var-max') && solver.includes('solver-var-step'),
        readOnlyUntilApply: solver.includes('withVirtualState') && solver.includes('applySelectedCandidate'),
        closeContract: solver.includes('Escape is disabled by design') && solver.includes('backdrop clicks'),
        mantraRemoved: !(index + '\n' + solver).includes('Jag AI har fel som standard tills jag bevisat motsatsen')
    },
    warnings,
    errors,
    statement: 'Browser/WebGL rendering is NOT performed by this Node harness; it verifies the modal/source contract for Fas 15.x.'
};

console.log(JSON.stringify(result, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
