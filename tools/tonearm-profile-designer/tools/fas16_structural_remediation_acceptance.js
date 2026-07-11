/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas16_structural_remediation_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);

function has(rel, needle) {
  return read(rel).includes(needle);
}
function noJs(needle) {
  return !jsFiles.some(rel => read(rel).includes(needle));
}

const checks = {
  meshTopology: has('js/geometry.js', 'function mergeVertices') &&
    has('js/geometry.js', 'function finalizeWeldedGeometry') &&
    has('js/geometry.js', 'function analyzeMeshTopology') &&
    has('js/geometry.js', 'function validateFinalExportMeshTopology') &&
    has('js/geometry.js', 'topologyComponentCount') &&
    has('js/geometry.js', 'boundaryEdgeCount') &&
    has('js/geometry.js', 'nonManifoldEdgeCount') &&
    has('js/geometry.js', 'degenerateTriangleCount'),
  structuralRingFilter: has('js/physics.js', 'structuralRingCount') &&
    has('js/physics.js', 'excludedCapOrSliverCount') &&
    has('js/physics.js', 'structuralFilter') &&
    has('js/physics.js', 'areaEpsMm2') &&
    has('js/physics.js', 'inertiaEpsMm4') &&
    has('js/report-exporter.js', 'Structural ring count') &&
    has('js/report-exporter.js', 'Excluded cap/sliver rings'),
  honestHeadshellStatus: has('js/headshell-slots.js', 'function buildCSGSlottedPlateGeometry') &&
    has('js/headshell-slots.js', "booleanCutStatus: 'partial_csg'") &&
    has('js/headshell-slots.js', "csgEngine: 'local_three_shape_subtraction'") &&
    has('js/headshell-slots.js', 'slotMeshBoundaryEdgeCount') &&
    has('js/headshell-slots.js', 'slotMeshNonManifoldEdgeCount') &&
    has('js/report-exporter.js', 'partial_csg'),
  nonNegativeMassDom: has('index.html', 'id="customMass" min="0"') &&
    has('index.html', 'id="rearWeightDiscMass" min="0"') &&
    has('index.html', 'id="rearFineTrimScrewMassEquivalent" min="0"'),
  nonNegativeMassModel: has('js/config.js', 'function sanitizeInputValue') &&
    has('js/config.js', 'function sanitizeMassFieldsOnObject') &&
    has('js/physics.js', 'sanitizeMass') &&
    has('js/session.js', 'sanitizeInputValue') &&
    has('js/solver-modal.js', 'isNonNegativeMassInput'),
  counterweightZOffset: has('index.html', 'id="counterweightZOffset"') &&
    has('js/config.js', 'counterweightZOffset') &&
    has('js/parameter-metadata.js', "id: 'counterweightZOffset'") &&
    has('js/physics.js', 'getCounterweightZOffset') &&
    has('js/cobra-disc-counterweight.js', 'zOffsetMm'),
  rearDiscExportTopology: has('js/cobra-disc-counterweight.js', 'unifiedRearTerminalCapContact') &&
    has('js/cobra-disc-counterweight.js', 'terminal_support_bridge_downward') &&
    has('js/cobra-disc-counterweight.js', 'rear_terminal_cap_contact') &&
    has('js/cobra-disc-counterweight.js', 'supportBridge') &&
    has('js/exporters.js', 'function getRearDiscStackExportGeometry') &&
    has('js/exporters.js', 'closed_shells_with_overlapping_support_bridge_no_exact_contact') &&
    has('js/exporters.js', 'validateFinalExportMeshTopology'),
  cobraContextNotCanonicalMutation: has('js/cobra-acceptance.js', 'NON_CANONICAL_CONTEXT') &&
    has('js/cobra-acceptance.js', 'isCanonicalAuditRequired') &&
    has('js/cobra-acceptance.js', 'Cobra context detected but cobraArchitecture.enabled=false') &&
    has('js/headshell-slots.js', 'isCanonicalCobraPresetActive'),
  canopyRidge: has('js/cobra-eggshell-wand.js', 'canopyRidgeEnabled') &&
    has('js/cobra-eggshell-wand.js', 'buildRidgeSplinePoint') &&
    has('js/cobra-eggshell-wand.js', "id: 'cobra_canopy_ridge'") &&
    !has('js/ai-modal.js', "'cobra_canopy_ridge'"),
  mechanicalSwashPlate: has('js/cobra-mechanical-assembly.js', 'swashPlate') &&
    has('js/cobra-mechanical-assembly.js', "id: 'sapphire_vee_jewel_swash_plate'") &&
    !has('js/ai-modal.js', "'sapphire_vee_jewel_swash_plate'")
};

const errors = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const report = {
  schema: 'tonearm-designer-fas16-1c-structural-topology-acceptance-v1',
  status: errors.length ? 'FAIL' : 'PASS',
  checks,
  errors,
  statement: 'Source-level acceptance for Fas16.1c: cap/sliver structural filtering, honest headshell slot status, non-mutating Cobra context handling, rear-disc topology strategy and final export topology audit. Browser/WebGL, actual UI import/export and external FEA are not executed by this Node harness.'
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
