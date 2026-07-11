/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052b_freeform_com_sanity_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052B freeform COM sanity acceptance.
// Local Node kernel/adapter test; no browser/WebGL/FEA claim.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}
function finite(n) { return Number.isFinite(Number(n)); }
function inside(com, b, t) {
  return com.x >= b.minX - t && com.x <= b.maxX + t &&
    com.y >= b.minY - t && com.y <= b.maxY + t &&
    com.z >= b.minZ - t && com.z <= b.maxZ + t;
}

load('js/freeform-centerline.js');
load('js/freeform-rings.js');
load('js/freeform-features.js');
load('js/freeform-schema.js');
load('js/freeform-loft-kernel.js');
load('js/freeform-analysis-adapter.js');

const K = globalThis.FreeformLoftKernel;
const A = globalThis.FreeformAnalysisAdapter;

['long_low_cobra_monocoque', 'straight_low_mass_lt_arm', 'integrated_side_bent_headshell'].forEach(preset => {
  check('COM sanity for ' + preset, () => {
    const go = K.buildFreeformGeometry(K.defaultState(preset), { stationCount: 18, segmentCount: 32 });
    const adapted = A.makeAdapterInput(go);
    const b = adapted.geometryFields.bounds;
    assert(adapted.volume.mm3 > 0, 'volume must be > 0');
    assert(adapted.volume.absTetraVolumeMm3 > 0, 'absTetraVolume must be > 0');
    assert(b.maxX > b.minX && b.maxY > b.minY && b.maxZ > b.minZ, 'bbox must be valid');
    assert(finite(adapted.COM.x) && finite(adapted.COM.y) && finite(adapted.COM.z), 'COM must be finite');
    assert(inside(adapted.COM, b, 2), 'COM outside bbox tolerance: ' + JSON.stringify({ preset, COM: adapted.COM, bounds: b, warnings: adapted.warnings }));
    assert(adapted.status !== 'PASS', 'local analysis adapter must not claim full PASS');
    assert(adapted.comSanity && adapted.comSanity.ok === true, 'comSanity must be ok after fallback/guard');
    assert(adapted.comSanity.status === 'PASS', 'comSanity.status must be PASS after robust guard');
  });
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
