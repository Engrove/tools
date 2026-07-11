/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052_standard_presets_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Standard presets acceptance.
// Local source/package candidate only; no browser/runtime/Onshape claim.
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function load(rel) { require(path.join(ROOT, rel)); }

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

load('js/freeform-centerline.js');
load('js/freeform-rings.js');
load('js/freeform-features.js');
load('js/freeform-loft-kernel.js');

function bounds(points, axis) {
  return points.reduce((acc, p) => ({ min: Math.min(acc.min, p[axis]), max: Math.max(acc.max, p[axis]) }), { min: Infinity, max: -Infinity });
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

check('Cobra Freeform Standard is long-low, non-worm and feature-separated', () => {
  const s = globalThis.FreeformLoftKernel.defaultState('long_low_cobra_monocoque');
  const x = bounds(s.centerline.points, 'x');
  const z = bounds(s.centerline.points, 'z');
  assert(x.max - x.min > 220, 'cobra is not long enough');
  assert(z.max <= 12 && z.min >= -4, 'cobra not low controlled');
  const families = new Set(s.rings.map(r => r.shapeFamily));
  assert(families.size >= 4, 'cobra ring progression too worm-like / not varied');
  assert(s.features.integratedHeadshell.enabled === true && s.features.integratedHeadshell.detachable === false, 'cobra headshell not integrated');
  assert(s.features.counterweightStack.enabled === true && s.features.counterweightStack.separateRearTerminalAssembly === true, 'cobra counterweight stack not separate');
  assert(s.features.counterweightStack.fakeWithRingOrTail === false, 'cobra counterweight faked by ring/tail');
  assert(s.features.titaniumMountPlate.type === 'structural_laminated_interface_plate', 'cobra titanium plate not structural laminated');
  assert(s.features.titaniumMountPlate.looseUndersidePlate === false, 'cobra titanium loose underside plate');
});

check('Straight LT Standard is straight/near-straight and not Cobra rear elbow', () => {
  const s = globalThis.FreeformLoftKernel.defaultState('straight_low_mass_lt_arm');
  const y = bounds(s.centerline.points, 'y');
  const z = bounds(s.centerline.points, 'z');
  assert(y.max - y.min <= 2.5, 'straight LT has side bend');
  assert(z.max - z.min <= 5.5, 'straight LT not low/near straight in z');
  const rear = s.centerline.points.find(p => p.id === 'rear_terminal');
  const mid = s.centerline.points.find(p => p.id === 'mid_armwand');
  assert(Math.abs(rear.y - mid.y) <= 1.5, 'straight LT has Cobra rear elbow side offset');
  const avgWidth = avg(s.rings.map(r => r.widthMm));
  assert(avgWidth <= 15, 'straight LT not low-mass-width intent');
  assert(s.features.integratedHeadshell.enabled === true && s.features.integratedHeadshell.detachable === false, 'straight LT headshell not integrated');
});

check('Integrated side-bent headshell preset keeps datum and slot validity', () => {
  const s = globalThis.FreeformLoftKernel.defaultState('integrated_side_bent_headshell');
  const head = s.centerline.points.find(p => p.id === 'headshell_interface');
  const stylus = s.centerline.points.find(p => p.id === 'stylus_front');
  assert(head && stylus && Math.abs(head.y - stylus.y) >= 5, 'side bend not present in headshell/centerline geometry');
  assert(s.features.integratedHeadshell.enabled === true && s.features.integratedHeadshell.detachable === false, 'side-bent headshell not integrated');
  assert(s.features.integratedHeadshell.cartridgeDatumValid === true, 'cartridge datum invalid');
  assert(s.features.integratedHeadshell.headshellPlaneValid === true, 'headshell plane invalid');
  assert(s.features.sideBentHeadshellMount.enabled === true && s.features.sideBentHeadshellMount.integratedWithArm === true, 'side-bent mount not integrated');
  assert(s.features.cartridgeSlots.enabled === true && s.features.cartridgeSlots.separateFeature === true, 'cartridge slots not separate');
  assert(s.features.cartridgeSlots.slotGeometryValid === true, 'slot geometry invalid');
});

check('all presets validate through TD052 response and loft kernel', () => {
  ['long_low_cobra_monocoque', 'straight_low_mass_lt_arm', 'integrated_side_bent_headshell'].forEach((preset) => {
    const response = globalThis.FreeformLoftKernel.knownGoodResponse(preset);
    const valid = globalThis.FreeformLoftKernel.validateResponse(response);
    assert(valid.ok === true, preset + ' known-good response invalid: ' + JSON.stringify(valid.errors));
    const geom = globalThis.FreeformLoftKernel.createIntermediateGeometryObject(globalThis.FreeformLoftKernel.defaultState(preset), { stationCount: 12, segmentCount: 16 });
    assert(geom.mesh.closed === true, preset + ' mesh open');
  });
});

console.log(JSON.stringify({
  status: process.exitCode ? 'FAIL' : 'PASS',
  test: 'td052_standard_presets_acceptance',
  checks
}, null, 2));
