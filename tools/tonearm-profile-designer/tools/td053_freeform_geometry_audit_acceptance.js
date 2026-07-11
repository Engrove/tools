/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053_freeform_geometry_audit_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 geometry audit acceptance.
// Local source/proxy audit only; no actual browser export/manufacturing claim.
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
const P = globalThis.FreeformPhysicalAnalysis;

check('geometry audit contains TD053 fields and proxy scope markers', () => {
  const go = K.buildFreeformGeometry(K.defaultState('long_low_cobra_monocoque'), { stationCount: 18, segmentCount: 32 });
  const result = P.analyzeFreeformGeometry(go);
  const audit = result.analysis.geometryAudit;
  assert(audit && audit.meshVolumeMm3 > 0, 'mesh volume missing');
  assert(audit.exportBbox && finite(audit.exportBbox.minX) && finite(audit.exportBbox.maxX), 'bbox missing');
  assert(audit.datumAudit && audit.datumAudit.status, 'datum audit missing');
  assert(audit.wireDuctClearance && audit.wireDuctClearance.status, 'wire duct clearance missing');
  assert(audit.cartridgeSlotClearance && audit.cartridgeSlotClearance.status, 'cartridge slot clearance missing');
  assert(audit.titaniumPlatePlacementStatus && audit.titaniumPlatePlacementStatus.status, 'titanium placement missing');
  ['manifoldStatus','boundaryEdges','nonManifoldEdges','degenerateTriangles','sliverTriangles'].forEach(k => assert(audit[k] !== undefined, k + ' missing'));
  assert(audit.selfIntersectionProxy && audit.selfIntersectionProxy.status === 'PARTIAL_PASS', 'self intersection proxy scope missing');
  assert((audit.warnings || []).includes('self_intersection_proxy_only'), 'self intersection proxy warning missing');
});

console.log(JSON.stringify(checks, null, 2));
