/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas16_1c_counterweight_support_bridge_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  cross(v) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  normalize() { const l = this.length(); if (l > 0) { this.x /= l; this.y /= l; this.z /= l; } return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
class BufferAttribute {
  constructor(array, itemSize) {
    this.array = Array.isArray(array) ? Float32Array.from(array) : array;
    this.itemSize = itemSize;
    this.count = this.array.length / itemSize;
    this.needsUpdate = false;
  }
}
class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) { super(Float32Array.from(array), itemSize); }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.groups = []; this.userData = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  getAttribute(name) { return this.attributes[name]; }
  setIndex(indices) { this.index = { array: Array.isArray(indices) ? Uint32Array.from(indices) : indices, needsUpdate: false }; return this; }
  addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
  clearGroups() { this.groups = []; }
  computeVertexNormals() { return this; }
  clone() {
    const g = new this.constructor.__baseClass();
    for (const [name, attr] of Object.entries(this.attributes)) g.setAttribute(name, new BufferAttribute(attr.array.slice(), attr.itemSize));
    if (this.index) g.setIndex(this.index.array.slice());
    g.groups = this.groups.map(group => Object.assign({}, group));
    g.userData = Object.assign({}, this.userData);
    return g;
  }
  toNonIndexed() {
    if (!this.index) return this.clone();
    const pos = this.getAttribute('position').array;
    const out = [];
    for (const idx of this.index.array) out.push(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(out, 3));
    g.groups = this.groups.map(group => Object.assign({}, group));
    g.userData = Object.assign({}, this.userData);
    return g;
  }
  rotateX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const pos = this.getAttribute('position').array;
    for (let i = 0; i < pos.length; i += 3) {
      const y = pos[i + 1], z = pos[i + 2];
      pos[i + 1] = y * c - z * s;
      pos[i + 2] = y * s + z * c;
    }
    return this;
  }
  rotateZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const pos = this.getAttribute('position').array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1];
      pos[i] = x * c - y * s;
      pos[i + 1] = x * s + y * c;
    }
    return this;
  }
  translate(x, y, z) {
    const pos = this.getAttribute('position').array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += x;
      pos[i + 1] += y;
      pos[i + 2] += z;
    }
    return this;
  }
}
BufferGeometry.__baseClass = BufferGeometry;

class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 32) {
    super();
    const n = Math.max(3, Math.round(radialSegments || 32));
    const h2 = height / 2;
    const p = [];
    const add = (x, y, z) => { p.push(x, y, z); };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = (Math.PI * 2 * i) / n;
      const a1 = (Math.PI * 2 * j) / n;
      const b0 = [Math.cos(a0) * radiusBottom, -h2, Math.sin(a0) * radiusBottom];
      const b1 = [Math.cos(a1) * radiusBottom, -h2, Math.sin(a1) * radiusBottom];
      const t0 = [Math.cos(a0) * radiusTop, h2, Math.sin(a0) * radiusTop];
      const t1 = [Math.cos(a1) * radiusTop, h2, Math.sin(a1) * radiusTop];
      add(...b0); add(...b1); add(...t0);
      add(...b1); add(...t1); add(...t0);
      add(0, h2, 0); add(...t0); add(...t1);
      add(0, -h2, 0); add(...b1); add(...b0);
    }
    this.setAttribute('position', new Float32BufferAttribute(p, 3));
  }
}
CylinderGeometry.__baseClass = BufferGeometry;

const THREE = { Vector3, BufferGeometry, BufferAttribute, Float32BufferAttribute, CylinderGeometry };
const fixturePath = fs.existsSync(path.join(ROOT, 'tools/fixtures/Gemini_3_1.json'))
  ? path.join(ROOT, 'tools/fixtures/Gemini_3_1.json')
  : path.join(ROOT, 'tools/fixtures/Gemini_3.json');
const session = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

let code = '';
[
  'js/config.js',
  'js/math.js',
  'js/geometry.js',
  'js/cobra-disc-counterweight.js',
  'js/physics.js',
  'js/exporters.js'
].forEach(rel => { code += fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n'; });

code += `
Object.assign(state, ${JSON.stringify(session.inputs)});
Object.assign(state, ${JSON.stringify(session.selects)});
Object.assign(state, ${JSON.stringify(session.checkboxes)});
if (${JSON.stringify(session.cobraArchitecture || null)}) state.cobraArchitecture = ${JSON.stringify(session.cobraArchitecture || null)};
sanitizeMassFieldsOnObject(state);
updateGeometryCache();

const cdcw = (window && window.CobraDiscCounterweightAssembly) || globalThis.CobraDiscCounterweightAssembly;
const terminal = getUnifiedRearTerminal(state);
const disc = cdcw.getDiscStackState(state);
const validation = cdcw.validateCounterweight(state);
const rearCom = Physics.getRearWeightCOM(state);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(terminal && terminal.available === true, 'rear terminal unavailable');
assert(disc && disc.enabled === true, 'disc stack disabled');
assert(disc.count === 4, 'Gemini_3 disc count changed');
assert(disc.mount && disc.mount.available === true, 'disc mount unavailable');
assert(disc.mount.source === 'unifiedRearTerminalCapContact', 'disc mount must use cap-contact source');
assert(disc.mount.mountRelation === 'rear_terminal_cap_contact', 'disc mount relation must be cap contact');
assert(disc.stackingMode === 'terminal_support_bridge_downward', 'disc stack must use support-bridge stacking mode');
assert(disc.supportBridge && disc.supportBridge.enabled === true, 'support bridge must be enabled');
assert(Math.abs(Number(disc.xMm) - Number(terminal.x)) <= 1e-6, 'disc stack x must equal rear terminal x');
assert(Math.abs(Number(disc.anchorZ) - Number(terminal.z)) <= 1e-6, 'anchorZ must equal rear terminal contact z');
assert(Number(disc.stackTopZ) < Number(terminal.z), 'stackTopZ must be below rear terminal to avoid exact tangent/coplanar STL contact');
assert(Math.abs(Number(disc.stackTopZ) - (Number(terminal.z) - Number(disc.supportBridgeLengthMm))) <= 1e-6, 'stackTopZ must equal terminal.z - supportBridgeLength');
assert(Number(disc.supportBridge.topZ) > Number(terminal.z), 'support bridge top must overlap terminal body');
assert(Number(disc.supportBridge.bottomZ) < Number(disc.stackTopZ), 'support bridge bottom must overlap disc stack');
assert(Number(validation.measured.supportGapMm) === 0, 'support bridge must report no visual gap');
assert(rearCom && rearCom.enabled === true, 'Physics rear weight COM must be enabled');
assert(Math.abs(Number(rearCom.z) - Number(disc.stackCOMZ)) <= 1e-6, 'Physics rear weight COM must use bridged stack COM');
assert(validation && validation.status === 'PASS', 'Counterweight validation failed: ' + JSON.stringify(validation.errors));

const oldBadAnchor = Number(terminal.z) - (Number(terminal.heightMm || 0) / 2) - 0.05;
assert(Math.abs(Number(disc.anchorZ) - oldBadAnchor) > 1, 'disc stack still uses old terminal.height/2 underside anchor');

const baseGeo = getPrimaryArmwandGeometry(() => generateOuterShellGeometry());
const finalGeo = getExportGeometryWithAccessories(baseGeo);
const audit = validateFinalExportMeshTopology(finalGeo, {
  mode: 'tonearm_solid_plug.stl',
  allowMultipleClosedShells: true
});
assert(audit && audit.isValid === true, 'final export topology audit failed: ' + JSON.stringify(audit));
assert(audit.metrics.finalBoundaryEdgeCount === 0, 'final export boundary edges != 0');
assert(audit.metrics.finalNonManifoldEdgeCount === 0, 'final export non-manifold edges != 0');
assert(audit.metrics.finalDegenerateTriangleCount === 0, 'final export degenerate triangles != 0');

console.log(JSON.stringify({
  schema: 'tonearm-designer-fas16-1c-counterweight-support-bridge-acceptance-v1',
  status: 'PASS',
  appVersionExpected: 'V28.4.4-Fas16.1c-CounterweightSupportBridge',
  rearMode: state.rearMode,
  rearTerminal: {
    x: terminal.x,
    y: terminal.y,
    z: terminal.z,
    heightMm: terminal.heightMm,
    widthMm: terminal.widthMm,
    geometrySource: terminal.geometrySource
  },
  discMount: {
    source: disc.mount.source,
    mountRelation: disc.mount.mountRelation,
    x: disc.mount.x,
    y: disc.mount.y,
    z: disc.mount.z,
    terminalHeightMmMetadataOnly: disc.mount.terminalHeightMm
  },
  supportBridge: disc.supportBridge,
  stack: {
    stackingMode: disc.stackingMode,
    stackTopZ: disc.stackTopZ,
    stackBottomZ: disc.stackBottomZ,
    stackCOMZ: disc.stackCOMZ,
    discCenterZList: disc.discCenterZList
  },
  finalExportAudit: audit.metrics,
  oldBadAnchorZ: oldBadAnchor,
  validationStatus: validation.status
}, null, 2));
`;
const sandbox = {
  console, require, process, THREE, window: {}, Math, Date, JSON, Number, Object, Array,
  Float32Array, Uint32Array, Int32Array, Map, Set, Error, Infinity, isFinite,
  Blob: function(parts, opts) { this.parts = parts; this.opts = opts; },
  alert: function(msg) { throw new Error('Unexpected alert: ' + msg); },
  downloadBlob: function() {}
};
vm.runInNewContext(code, sandbox);
