/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas18b_onshape_1to1_acceptance.js behavior as a cohesive legacy module.
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
  crossVectors(a, b) { const x = a.y*b.z-a.z*b.y, y = a.z*b.x-a.x*b.z, z = a.x*b.y-a.y*b.x; this.x=x; this.y=y; this.z=z; return this; }
  length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
  multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
  add(v) { this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  normalize() { const l=this.length(); if (l>0) { this.x/=l; this.y/=l; this.z/=l; } return this; }
  dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }
}
class BufferAttribute { constructor(array, itemSize) { this.array = Array.isArray(array) ? Float32Array.from(array) : array; this.itemSize=itemSize; this.count=this.array.length/itemSize; this.needsUpdate=false; } }
class Float32BufferAttribute extends BufferAttribute { constructor(array, itemSize) { super(Float32Array.from(array), itemSize); } }
class BufferGeometry {
  constructor() { this.attributes={}; this.index=null; this.groups=[]; this.userData={}; }
  setAttribute(n,a) { this.attributes[n]=a; return this; }
  getAttribute(n) { return this.attributes[n]; }
  setIndex(i) { this.index={ array: Array.isArray(i) ? Uint32Array.from(i) : i, needsUpdate:false }; return this; }
  addGroup(start,count,materialIndex) { this.groups.push({start,count,materialIndex}); }
  clearGroups() { this.groups=[]; }
  computeVertexNormals() { return this; }
  clone() { const g=new BufferGeometry(); for (const [n,a] of Object.entries(this.attributes)) g.setAttribute(n,new BufferAttribute(a.array.slice(),a.itemSize)); if (this.index) g.setIndex(this.index.array.slice()); g.groups=this.groups.map(x=>Object.assign({},x)); g.userData=Object.assign({},this.userData); return g; }
  toNonIndexed() { if (!this.index) return this.clone(); const pos=this.getAttribute('position').array; const out=[]; for (const idx of this.index.array) out.push(pos[idx*3],pos[idx*3+1],pos[idx*3+2]); const g=new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(out,3)); g.groups=this.groups.map(x=>Object.assign({},x)); g.userData=Object.assign({},this.userData); return g; }
}
const THREE = { Vector3, BufferGeometry, BufferAttribute, Float32BufferAttribute };
const sessionPath = path.join(ROOT, '..', '..', 'tonearm_session_2026-07-05T18-53-03.json');
const session = fs.existsSync(sessionPath) ? JSON.parse(fs.readFileSync(sessionPath, 'utf8')) : { inputs: {}, selects: {}, checkboxes: {} };
let code = '';
['js/config.js','js/math.js','js/geometry.js','js/ai-vibe-3d.js'].forEach(rel => { code += fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n'; });
code += `
Object.assign(state, ${JSON.stringify(session.inputs || {})});
Object.assign(state, ${JSON.stringify(session.selects || {})});
Object.assign(state, ${JSON.stringify(session.checkboxes || {})});
state.exportType = 'onshape_1to1';
state.manufacturingMode = 'onshape_1to1';
state.onshapeUnitScale = 1;
state.onshapeStrictOneToOne = true;
state.onshapeMetadataSidecar = true;
state.aiVibePlugSurfaceOffset = 0;
state.aiVibeSandingAllowance = 0;
state.aiVibeShrinkagePercent = 0;
state.aiVibeDraftDeg = 0;
state.aiVibeSoftSliverPass = true;
state.aiVibeMinTriangleHardFailArea = 0.00001;
if (typeof sanitizeMassFieldsOnObject === 'function') sanitizeMassFieldsOnObject(state);
updateGeometryCache();
const onshapeValidation = validateExportGeometry('onshape_1to1', state);
const audit = AIVibe3D.runPrintabilityAudit(state);
const graph = AIVibe3D.getFeatureGraph(state);
const onshapeNode = graph.nodes.find(n => n.id === 'OnshapeExactModel');
const out = { schema:'tonearm-designer-fas18b-onshape-1to1-acceptance-v1', status:'PASS', app: state.app || 'runtime', onshapeValidation, auditSummary: audit.printability, featureNodeCount: graph.nodes.length, onshapeNode };
console.log(JSON.stringify(out, null, 2));
if (!onshapeValidation || !onshapeValidation.isValid) throw new Error(onshapeValidation && onshapeValidation.errorMsg ? onshapeValidation.errorMsg : 'onshape validation failed');
if (!onshapeNode) throw new Error('OnshapeExactModel feature node missing');
if (state.aiVibePlugSurfaceOffset !== 0 || state.aiVibeSandingAllowance !== 0 || state.aiVibeShrinkagePercent !== 0 || state.aiVibeDraftDeg !== 0) throw new Error('1:1 exact Onshape defaults were not enforced');
`;
vm.runInNewContext(code, { console, Math, Number, Object, Array, JSON, THREE, window: {}, Set, Map, Infinity, Float32Array, Uint32Array, Blob: function(){}, URL: {}, document: undefined });
