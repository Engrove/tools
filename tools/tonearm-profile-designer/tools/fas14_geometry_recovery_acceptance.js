#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas14_geometry_recovery_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Fase 14 local acceptance harness: geometry recovery / single source of truth.
// Runs without browser/DOM. Expected result is HOLD until manual visual verification exists.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  cross(v) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  normalize() {
    const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) || 1;
    this.x /= l; this.y /= l; this.z /= l;
    return this;
  }
  clone() { return new Vector3(this.x, this.y, this.z); }
}
class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
}
class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) { super(Float32Array.from(array), itemSize); }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.groups = []; this.userData = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  getAttribute(name) { return this.attributes[name]; }
  setIndex(index) {
    this.index = { array: Array.isArray(index) ? index : Array.from(index), count: index.length };
    return this;
  }
  clearGroups() { this.groups = []; }
  addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
  computeVertexNormals() { return this; }
  clone() {
    const g = new BufferGeometry();
    g.attributes = this.attributes;
    g.index = this.index;
    g.groups = this.groups.slice();
    g.userData = Object.assign({}, this.userData);
    return g;
  }
  toNonIndexed() { return this; }
}

const context = {
  console,
  window: {},
  THREE: { Vector3, BufferGeometry, BufferAttribute, Float32BufferAttribute },
  globalThis: null
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

[
  'js/config.js',
  'js/math.js',
  'js/geometry.js',
  'js/cobra-disc-counterweight.js',
  'js/physics.js',
  'js/cobra-acceptance.js'
].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, { filename: rel });
});

function configureBaseState() {
  vm.runInContext(`
    Object.assign(state, {
      rearMode: REAR_MODES.COBRA_GOOSE,
      apex: 237,
      cartX: -0.05,
      material: 'carbon',
      cartMode: 'g1042',
      exportType: EXPORT_TYPES.HOLLOW,
      rearWeightDiscMass: 18,
      rearWeightDiscDiameter: 14,
      includeRearWeightDiscsInExport: true,
      showRearWeights: true,
      showMechanicalAssemblyDebug: false,
      useCobraEggshellWandDebug: false,
      useCobraEggshellExportDebug: false
    });
    state.cobraArchitecture.enabled = true;
    state.cobraArchitecture.counterweight.mountSource = 'unifiedRearTerminal';
    state.cobraArchitecture.counterweight.discStack.xMm = null;
    state.cobraArchitecture.counterweight.discStack.zMm = null;
    state.cobraArchitecture.mechanical.showDebug = false;
    state.cobraArchitecture.mechanical.debugOverlay = false;
  `, context);
}

function runCase(count, thickness) {
  configureBaseState();
  vm.runInContext(`
    state.rearWeightDiscCount = ${JSON.stringify(count)};
    state.rearWeightDiscThickness = ${JSON.stringify(thickness)};
    state.cobraArchitecture.counterweight.discStack.count = ${JSON.stringify(count)};
    state.cobraArchitecture.counterweight.discStack.thicknessMm = ${JSON.stringify(thickness)};
    updateGeometryCache();
  `, context);

  const result = vm.runInContext(`
    CobraAcceptance.runGeometryRecoveryAcceptance({
      state,
      exportResult: {
        exportValidation: 'PASS',
        exportGeometrySource: 'td026_full_ring_geometry',
        metrics: { exportGeometrySource: 'td026_full_ring_geometry' }
      },
      visualEvidence: {}
    })
  `, context);

  const rearWeightCom = vm.runInContext(`Physics.getRearWeightCOM(state)`, context);
  const discStack = vm.runInContext(`CobraDiscCounterweightAssembly.getDiscStackState(state)`, context);
  const supportBridgeLengthMm = Number.isFinite(Number(discStack.supportBridgeLengthMm)) ? Number(discStack.supportBridgeLengthMm) : 0;
  const expectedStackTopZ = Number.isFinite(Number(discStack.anchorZ)) ? Number(discStack.anchorZ) - supportBridgeLengthMm : null;
  const expectedDiscCenterZList = Array.from({ length: count }, (_, i) => expectedStackTopZ - (thickness / 2) - (i * thickness));
  const expectedStackCOMZ = count > 0 ? expectedStackTopZ - ((count * thickness) / 2) : null;

  return {
    caseName: `count_${count}_thickness_${thickness}`,
    count,
    thickness,
    status: result.status,
    automaticStatus: result.automaticStatus,
    manualVisualStatus: result.manualVisualStatus,
    rearTerminal: result.measured.rearTerminal,
    rearTerminalZ: result.measured.rearTerminal ? result.measured.rearTerminal.z : null,
    discMount: result.measured.discMount,
    discMountSource: result.measured.discMountSource,
    discMountDeltaMm: result.measured.discMountDeltaMm,
    anchorZ: discStack.anchorZ,
    stackTopZ: discStack.stackTopZ,
    stackBottomZ: discStack.stackBottomZ,
    stackCOMZ: discStack.stackCOMZ,
    supportBridge: discStack.supportBridge,
    supportBridgeLengthMm,
    expectedStackTopZ,
    expectedStackCOMZ,
    discCenterZList: discStack.discCenterZList,
    expectedDiscCenterZList,
    primaryGeometrySource: result.measured.primaryGeometrySource,
    exportGeometrySource: result.measured.exportGeometrySource,
    physicsGeometrySource: result.measured.physicsGeometrySource,
    physicsRearWeightCOM: rearWeightCom,
    mechanicalAssemblyDebug: result.geometryAudit.mechanicalAssemblyDebug,
    normalRenderForbiddenNames: result.geometryAudit.normalRenderForbiddenNames,
    manualVisualVerification: result.measured.manualVisualVerification,
    errors: result.errors,
    warnings: result.warnings
  };
}

const cases = [
  runCase(0, 10),
  runCase(1, 10),
  runCase(3, 10)
];

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Math.abs(Number(v) - Number(b[i])) < 1e-6);
}

cases.forEach((c) => {
  if (!arraysEqual(c.discCenterZList, c.expectedDiscCenterZList)) {
    c.errors.push('discCenterZList mismatch for ' + c.caseName);
  }
  if (c.count === 0) {
    if (c.stackCOMZ !== null) c.errors.push('count=0 stackCOMZ must be null');
    if (!Array.isArray(c.discCenterZList) || c.discCenterZList.length !== 0) c.errors.push('count=0 discCenterZList must be []');
    if (!c.physicsRearWeightCOM || c.physicsRearWeightCOM.enabled !== false || Number(c.physicsRearWeightCOM.mass || c.physicsRearWeightCOM.massG || 0) !== 0) {
      c.errors.push('count=0 physics rear-weight component must be disabled/zero mass');
    }
  } else if (Math.abs(Number(c.stackCOMZ) - Number(c.expectedStackCOMZ)) > 1e-6) {
    c.errors.push('stackCOMZ mismatch for ' + c.caseName);
  }
  if (c.discMountSource === 'pivot' || c.discMountSource === 'tower' || c.discMountSource === 'bearing_area') {
    c.errors.push('disc mount source must not be pivot/tower/bearing area');
  }
});

const summary = {
  schema: 'tonearm-designer-fas14-4-downward-disc-stack-acceptance-v2',
  cases,
  statement: 'Automatic geometry math may PASS, but browser/visual verification is NOT performed by this Node harness; total status remains HOLD until manual browser/WebGL verification exists.'
};

console.log(JSON.stringify(summary, null, 2));

const failed = cases.some((c) =>
  c.automaticStatus !== 'PASS' ||
  c.status !== 'HOLD' ||
  c.manualVisualStatus !== 'HOLD' ||
  (Array.isArray(c.errors) && c.errors.length > 0)
);

if (failed) {
  process.exit(1);
}
