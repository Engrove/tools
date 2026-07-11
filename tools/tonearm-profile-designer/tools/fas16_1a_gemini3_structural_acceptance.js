/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas16_1a_gemini3_structural_acceptance.js behavior as a cohesive legacy module.
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
    const g = new BufferGeometry();
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
}
const THREE = { Vector3, BufferGeometry, BufferAttribute, Float32BufferAttribute };
const session = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/Gemini_3.json'), 'utf8'));

let code = '';
[
  'js/config.js',
  'js/math.js',
  'js/geometry.js',
  'js/cobra-disc-counterweight.js',
  'js/cobra-mechanical-assembly.js',
  'js/physics.js'
].forEach(rel => { code += fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n'; });

code += `
Object.assign(state, ${JSON.stringify(session.inputs)});
Object.assign(state, ${JSON.stringify(session.selects)});
Object.assign(state, ${JSON.stringify(session.checkboxes)});
if (${JSON.stringify(session.cobraArchitecture || null)}) state.cobraArchitecture = ${JSON.stringify(session.cobraArchitecture || null)};
sanitizeMassFieldsOnObject(state);
updateGeometryCache();
const analysis = Physics.getComprehensiveAnalysis(state, state.cartMode, GLOBAL_RINGSCache);
const structural = analysis.structural || {};
const report = {
  schema: 'tonearm-designer-fas16-1a-gemini3-structural-acceptance-v1',
  status: structural.EI_min_Nm2 > 0 && structural.firstBendingHz > 0 && structural.structuralRingCount >= 2 && structural.excludedCapOrSliverCount > 0 ? 'PASS' : 'FAIL',
  preservedSessionValues: {
    apex: state.apex,
    cartX: state.cartX,
    rearMode: state.rearMode,
    cobraArchitectureEnabled: state.cobraArchitecture && state.cobraArchitecture.enabled,
    rearFineTrimScrewMassEquivalent: state.rearFineTrimScrewMassEquivalent
  },
  structural: {
    totalRingCount: structural.totalRingCount,
    structuralRingCount: structural.structuralRingCount,
    excludedCapOrSliverCount: structural.excludedCapOrSliverCount,
    EI_min_Nm2: structural.EI_min_Nm2,
    GJ_min_Nm2: structural.GJ_min_Nm2,
    firstBendingHz: structural.firstBendingHz,
    firstTorsionHz: structural.firstTorsionHz,
    bendingStatus: structural.bendingStatus,
    torsionStatus: structural.torsionStatus,
    source: structural.source
  }
};
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') throw new Error('Gemini_3 structural filtering acceptance failed');
if (state.apex !== 237.1 || state.cartX !== -0.6 || state.cobraArchitecture.enabled !== false) throw new Error('Session values were mutated');
if (state.rearFineTrimScrewMassEquivalent !== 0) throw new Error('Negative fine trim mass was not sanitized to 0');
`;

vm.runInNewContext(code, { console, Math, Number, Object, Array, JSON, THREE, window: {}, Set, Map, Infinity, Float32Array, Uint32Array });
