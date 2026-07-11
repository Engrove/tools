/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053_freeform_section_stiffness_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 section stiffness acceptance.
// Local deterministic section proxy only; no FEA claim.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function finite(n) { return Number.isFinite(Number(n)); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}
function loadTD053() {
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
    'js/freeform-physical-analysis.js'
  ].forEach(load);
}

loadTD053();
const K = globalThis.FreeformLoftKernel;
const S = globalThis.FreeformSectionProperties;
const P = globalThis.FreeformPhysicalAnalysis;

check('station analysis contains section properties and EI/GJ proxies', () => {
  const go = K.buildFreeformGeometry(K.defaultState('long_low_cobra_monocoque'), { stationCount: 18, segmentCount: 32 });
  const result = P.analyzeFreeformGeometry(go);
  const stations = result.analysis.stationAnalysis;
  assert(Array.isArray(stations) && stations.length >= 4, 'stationAnalysis missing');
  stations.forEach((s, i) => {
    ['areaMm2','IyyMm4','IzzMm4','JApproxMm4','wallThicknessMm','localMassG','EIyyProxy','EIzzProxy','GJProxy','stiffnessDiscontinuityFromPrevious'].forEach(k => assert(finite(s[k]), 'station ' + i + ' ' + k + ' finite'));
    assert(s.areaMm2 > 0, 'station area must be > 0');
    assert(s.IyyMm4 > 0 && s.IzzMm4 > 0 && s.JApproxMm4 > 0, 'station inertia properties > 0');
  });
});

check('all ring families produce nonzero section properties', () => {
  globalThis.FreeformRings.shapeFamilies.forEach(shapeFamily => {
    const props = S.sectionPropertiesForRing({ shapeFamily, widthMm: 16, heightMm: 8, wallThicknessMm: 1.2 }, {});
    assert(props.areaMm2 > 0, shapeFamily + ' area <= 0');
    assert(props.IyyMm4 > 0 && props.IzzMm4 > 0 && props.JApproxMm4 > 0, shapeFamily + ' section properties <= 0');
  });
});

console.log(JSON.stringify(checks, null, 2));
