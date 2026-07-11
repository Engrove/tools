/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053d_freeform_cobra_fidelity_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053D acceptance. Local source/Node checks only; no browser/WebGL/CAD/FEA/manufacturing claim.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}
[
  'js/freeform-centerline.js',
  'js/freeform-rings.js',
  'js/freeform-features.js',
  'js/freeform-schema.js',
  'js/freeform-loft-kernel.js',
  'js/freeform-analysis-adapter.js',
  'js/freeform-section-properties.js',
  'js/freeform-resonance-analysis.js',
  'js/freeform-geometry-audit.js',
  'js/freeform-physical-analysis.js',
  'js/freeform-form-fidelity.js',
  'js/freeform-target-compliance.js',
  'js/freeform-mode-audit.js'
].forEach(load);

function makeLongText(label, repeat) {
  return Array(repeat || 8).fill(label + ' Cobra CFRP epoxy monocoque asymmetric wing-body integrated headshell canopy rear root apex separate rear terminal deterministic analysis handoff.').join(' ');
}
function makeHybridPayload() {
  return {
    schema: 'tonearm-designer-ai-freeform-loft-response',
    version: 1,
    app: 'V28.8.0-Fas20-AIResponseApplyRuntime',
    mode: 'freeform_centerline_ring_loft',
    name: 'cobra_cfrp_monocoque_hybrid',
    designIntent: makeLongText('designIntent', 8),
    centerlinePatch: {
      curveType: 'catmull_rom',
      points: [
        { id: 'headshell_nose', s: 0.045, x: 12, y: -1.8, z: 0.8 },
        { id: 'headshell_interface', s: 0.14, x: 34, y: -2.5, z: 2.0 },
        { id: 'cobra_rise_1', s: 0.25, x: 62, y: -1.2, z: 5.5 },
        { id: 'mid_armwand', s: 0.52, x: 128, y: 0.6, z: 6.2 },
        { id: 'damping_rib_anchor', s: 0.72, x: 178, y: 0.4, z: 3.4 },
        { id: 'rear_terminal', s: 0.91, x: 220, y: 0, z: 1.5 }
      ]
    },
    ringPatch: {
      rings: [
        { id: 'ff_r00', s: 0.04, shapeFamily: 'flat_bottom_headshell', widthMm: 24, heightMm: 7, wallThicknessMm: 1.2, bottomFlatness: 0.8, topRidgeHeightMm: 0.7, rotationDeg: 0, tiltDeg: 0, asymmetryY: 0.16, asymmetryZ: 0.10 },
        { id: 'ff_r01', s: 0.12, shapeFamily: 'rounded_rectangle', widthMm: 22, heightMm: 8, wallThicknessMm: 1.2, cornerSharpness: 0.45, rotationDeg: 0, tiltDeg: 2, asymmetryY: 0.16, asymmetryZ: 0.10 },
        { id: 'ff_r02', s: 0.24, shapeFamily: 'superellipse', widthMm: 18, heightMm: 9, wallThicknessMm: 1.15, superellipseExponent: 3.2, rotationDeg: 2, tiltDeg: 3, asymmetryY: 0.18, asymmetryZ: 0.12 },
        { id: 'ff_r03', s: 0.36, shapeFamily: 'asymmetric_egg', widthMm: 15, heightMm: 8, wallThicknessMm: 1.05, rotationDeg: 3, tiltDeg: 3, asymmetryY: 0.22, asymmetryZ: -0.1, topRidgeHeightMm: 1.2 },
        { id: 'ff_r04', s: 0.50, shapeFamily: 'asymmetric_egg', widthMm: 14, heightMm: 7, wallThicknessMm: 1.0, asymmetryY: 0.22, asymmetryZ: -0.1, rotationDeg: 0, tiltDeg: 2, topRidgeHeightMm: 1.1 },
        { id: 'ff_r05', s: 0.64, shapeFamily: 'crescent', widthMm: 14, heightMm: 6, wallThicknessMm: 0.95, crescentCutDepth: 0.25, rotationDeg: -2, tiltDeg: 0, asymmetryY: 0.2, asymmetryZ: 0.12 },
        { id: 'ff_r06', s: 0.78, shapeFamily: 'custom_bezier_loop', widthMm: 13, heightMm: 6, wallThicknessMm: 0.9, rotationDeg: 0, tiltDeg: 0, asymmetryY: 0.18, asymmetryZ: 0.10, controlPoints: [{y:0.9,z:0},{y:0,z:0.8},{y:-0.9,z:0},{y:0,z:-0.7}] },
        { id: 'ff_r07', s: 0.91, shapeFamily: 'circle', widthMm: 10, heightMm: 10, wallThicknessMm: 1.1, rotationDeg: 0, tiltDeg: 0, asymmetryY: 0.08, asymmetryZ: 0.08 }
      ]
    },
    featurePatch: {
      integratedHeadshell: { enabled: true, integrated: true, detachable: false, lengthMm: 42, widthMm: 24, planeZMm: 0, mountStyle: 'integrated fixed slots with laminated interface', cartridgeDatumValid: true, headshellPlaneValid: true },
      titaniumMountPlate: { enabled: true, type: 'structural_laminated_interface_plate', looseUndersidePlate: false, followsTD051Rule: true, xMm: 32, yMm: 0, zMm: 0.8, lengthMm: 32, widthMm: 18, thicknessMm: 1.2, adhesiveThicknessMm: 0.08 },
      cartridgeSlots: { enabled: true, separateFeature: true, slotCount: 2, slotLengthMm: 15, slotWidthMm: 2.8, spacingMm: 12.7, slotGeometryValid: true },
      wireDuct: { enabled: true, separateFeature: true, diameterMm: 1.6, clearanceMm: 0.7, path: 'internal' },
      rearTerminal: { enabled: true, separateFeature: true, s: 0.92, terminalDiameterMm: 12, terminalLengthMm: 12 },
      counterweightStack: { enabled: true, separateFeature: true, fakeWithRingOrTail: false, mount: 'rear_terminal_disc_stack', discCount: 3, discDiameterMm: 28, discThicknessMm: 3, discMassG: 16, fineTrimMassG: 2, separateRearTerminalAssembly: true }
    },
    analysisTargets: {
      targetBodyMassG: 28,
      targetTotalMovingMassG: 36,
      targetVerticalResonanceHz: 10,
      targetHorizontalResonanceHz: 10,
      targetFirstBendingModeHz: 450,
      targetEIProxy: 120000,
      materialDensityGPerCm3: 1.55,
      compliance10Hz: 12,
      wireDuctMinClearanceMm: 0.6
    },
    targets: { massG: 36, movingMassG: 36, effectiveMassVerticalG: 13, effectiveMassHorizontalG: 13, lfResonanceHz: 10, counterweightBalanceResidualMaxGmm: 250 },
    analysisRequests: ['mass','COM','inertia','effective_mass','LF_resonance','EI_distribution','torsion_proxy','export_audit','geometry_audit'],
    aiEstimates: { massG: 32, effectiveMassVerticalG: 12.5, effectiveMassHorizontalG: 13, lfResonanceHz: 10, reasoningSummary: makeLongText('reasoningSummary', 6), confidence: 0.54 },
    analysisPolicy: {
      deterministicAuthority: 'app_kernel',
      aiRole: 'design_intent_targets_and_estimates_only',
      forbiddenDeterministicResultFields: ['analysis.massG','analysis.COM','analysis.effectiveMassVerticalG','analysis.status','deterministicAnalysis'],
      claimBoundary: 'AI estimates are not final physical analysis; app/kernel calculates deterministic proxy analysis'
    },
    assumptions: [makeLongText('assumption', 2)],
    unsupportedAttributes: [makeLongText('unsupported exact FEA lamination cure schedule', 1)]
  };
}

const K = globalThis.FreeformLoftKernel;
const F = globalThis.FreeformFormFidelity;

check('form fidelity API is exposed', () => {
  ['analyzeCobraFidelity','scoreLongLowProfile','scoreAsymmetricWingBody','scoreFrontCanopy','scoreRearRootApex','scoreIntegratedHeadshellContinuity','scoreRearTerminalSeparation','classifyFormIntent'].forEach(name => assert(typeof F[name] === 'function', 'missing ' + name));
});

check('cobra_cfrp_monocoque_hybrid gets visible fidelity metrics', () => {
  const payload = makeHybridPayload();
  const applied = K.applyResponse(K.defaultState('long_low_cobra_monocoque'), payload);
  assert(applied.ok, 'payload did not apply: ' + (applied.errors || []).join('; '));
  const go = K.buildFreeformGeometry(applied.state, { stationCount: 18, segmentCount: 32 });
  const fidelity = F.analyzeCobraFidelity(applied.state, go, applied.state.analysisTargets);
  ['cobraFormFidelityScore','frontCanopyScore','rearRootApexScore','asymmetricWingBodyScore','lowLongProfileScore','integratedHeadshellContinuityScore','rearTerminalSeparationScore'].forEach(k => assert(Number.isFinite(Number(fidelity[k])), 'missing finite ' + k));
  assert(['PASS_WITH_SCOPE','PARTIAL_PASS','FORM_INTENT_MISMATCH'].includes(fidelity.status), 'bad fidelity status');
});

check('schema-pass generic smooth banana cannot pass Cobra fidelity', () => {
  const generic = K.defaultState('straight_low_mass_lt_arm');
  generic.designIntent = 'cobra CFRP monocoque wing-body canopy';
  generic.rings = generic.rings.map(r => Object.assign({}, r, { shapeFamily: 'ellipse', asymmetryY: 0, asymmetryZ: 0, topRidgeHeightMm: 0, crescentCutDepth: 0, widthMm: 10, heightMm: 10 }));
  generic.features.integratedHeadshell.enabled = false;
  generic.features.counterweightStack.fakeWithRingOrTail = true;
  const go = K.buildFreeformGeometry(generic, { stationCount: 18, segmentCount: 32 });
  const fidelity = F.analyzeCobraFidelity(generic, go, generic.analysisTargets);
  assert(fidelity.status === 'FORM_INTENT_MISMATCH', 'generic smooth banana/teardrop falsely passed: ' + JSON.stringify(fidelity));
});

console.log(JSON.stringify({ checks }, null, 2));
