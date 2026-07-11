/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td049_sparse_cobra_contract_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD049 Sparse Cobra Continuity Contract acceptance test.
// Verifies prompt/spec/schema contract, protected-field filtering, Cobra invariants
// and front-ramp continuity replay without requiring browser, npm or external deps.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function requireText(file, needle) {
  const text = read(file);
  assert(text.includes(needle), file + ' missing required text: ' + needle);
}
function rejectText(file, needle) {
  const text = read(file);
  assert(!text.includes(needle), file + ' contains forbidden text: ' + needle);
}
function sectionBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  assert(start >= 0, 'missing section start: ' + startNeedle);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, 'missing section end after: ' + startNeedle);
  return text.slice(start, end);
}

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: err.message }); process.exitCode = 1; }
}

function makeInput(id, value, min, max, step) {
  return {
    id,
    value: String(value),
    min: String(min == null ? -10000 : min),
    max: String(max == null ? 10000 : max),
    step: String(step == null ? 0.01 : step),
    dispatchEvent: function () {}
  };
}
function makeSelect(id, value, options) {
  return {
    id,
    value,
    options: options.map(v => ({ value: v })),
    dispatchEvent: function () {}
  };
}
function makeCheckbox(id, checked) {
  return {
    id,
    checked: !!checked,
    dispatchEvent: function () {}
  };
}

function buildAIModalHarness() {
  const controls = {};
  const sculptInputs = [
    'padOffset', 'noseL', 'headW', 'padL', 'headH',
    'sculptHeadFlatEnabled', 'sculptHeadFlatStartX', 'sculptHeadFlatEndX',
    'sculptHeadBottomZ', 'sculptHeadBlendLength', 'sculptHeadFlatWidthFraction',
    'sculptStepSuppressor', 'sculptFrontStiffnessRampEnabled', 'sculptFrontMinHeight',
    'sculptFrontRampStartX', 'sculptFrontRampEndX', 'sculptFrontRampTargetHeight',
    'sculptFrontTopBias', 'neckW', 'neckL', 'asym', 'maxH', 'maxW', 'bow',
    'thick', 'canopyRidgeHeight', 'canopyRidgeWidthFraction', 'canopyRidgeSharpness',
    'rearBlendLength', 'rearBendStartX', 'rearBendDropZ', 'rearBendLength',
    'rearMouthWidth', 'rearMouthLength', 'bulge', 'tailD',
    'rearWeightDiscDiameter', 'rearWeightDiscThickness', 'rearWeightDiscCount',
    'rearWeightDiscMass', 'rearFineTrimScrewLength', 'rearFineTrimScrewMassEquivalent',
    'counterweightZOffset', 'rearSupportBridgeLength', 'rearSupportBridgeRadius',
    'rearSupportBridgeOverlap'
  ];
  const defaults = {
    padOffset: 0, noseL: 8, headW: 18, padL: 35, headH: 3.2,
    sculptHeadFlatEnabled: 0, sculptHeadFlatStartX: 0, sculptHeadFlatEndX: 36,
    sculptHeadBottomZ: -3, sculptHeadBlendLength: 12, sculptHeadFlatWidthFraction: 0.72,
    sculptStepSuppressor: 0, sculptFrontStiffnessRampEnabled: 0, sculptFrontMinHeight: 5.8,
    sculptFrontRampStartX: 0, sculptFrontRampEndX: 78, sculptFrontRampTargetHeight: 10,
    sculptFrontTopBias: 0.95, neckW: 9, neckL: 45, asym: 0, maxH: 18, maxW: 32,
    bow: 0, thick: 1.2, canopyRidgeHeight: 0, canopyRidgeWidthFraction: 0.45,
    canopyRidgeSharpness: 0.5, rearBlendLength: 24, rearBendStartX: 250,
    rearBendDropZ: 10, rearBendLength: 20, rearMouthWidth: 10, rearMouthLength: 10,
    bulge: 0, tailD: 20, rearWeightDiscDiameter: 0, rearWeightDiscThickness: 0,
    rearWeightDiscCount: 0, rearWeightDiscMass: 0, rearFineTrimScrewLength: 0,
    rearFineTrimScrewMassEquivalent: 0, counterweightZOffset: 0,
    rearSupportBridgeLength: 0, rearSupportBridgeRadius: 0, rearSupportBridgeOverlap: 0
  };
  sculptInputs.forEach(id => { controls[id] = makeInput(id, defaults[id] == null ? 0 : defaults[id], -10000, 10000, 0.01); });
  ['apex', 'cartX', 'counterweightMass', 'effectiveMass', 'targetVTF', 'pivotOffsetZ', 'exportScale'].forEach(id => {
    controls[id] = makeInput(id, id === 'apex' ? 222 : 0, -10000, 10000, 0.01);
  });
  controls.rearMode = makeSelect('rearMode', 'classic_tail', ['classic_tail', 'cobra_integrated_tail']);
  controls.cobraArchitectureEnabled = makeCheckbox('cobraArchitectureEnabled', false);
  controls.enableCobraArchitecture = makeCheckbox('enableCobraArchitecture', false);
  controls.includeRearWeightDiscsInExport = makeCheckbox('includeRearWeightDiscsInExport', false);
  controls.someDisplayCheckbox = makeCheckbox('someDisplayCheckbox', true);
  controls.aiModelFamily = makeSelect('aiModelFamily', 'shape_designer', ['shape_designer', 'cobra_tonearm']);

  const state = {};
  Object.keys(controls).forEach(id => {
    if (controls[id].options) state[id] = controls[id].value;
    else if (Object.prototype.hasOwnProperty.call(controls[id], 'checked')) state[id] = controls[id].checked;
    else state[id] = Number(controls[id].value);
  });
  state.cobraArchitecture = { enabled: false };

  const metadata = {};
  sculptInputs.forEach(id => {
    metadata[id] = { id, min: -10000, max: 10000, step: 0.01, precision: 2, aiWritable: true };
  });
  ['apex', 'cartX', 'counterweightMass', 'effectiveMass', 'targetVTF', 'pivotOffsetZ', 'exportScale'].forEach(id => {
    metadata[id] = { id, min: -10000, max: 10000, step: 0.01, precision: 2, aiWritable: false };
  });

  const context = {
    console,
    Math,
    Number,
    Object,
    Array,
    JSON,
    Date,
    Set,
    Map,
    String,
    Boolean,
    RegExp,
    parseFloat,
    isNaN,
    Infinity,
    Event: function Event(name, opts) { this.type = name; this.bubbles = !!(opts && opts.bubbles); },
    state,
    updateState: function () {},
    window: {
      Session: {
        APP_VERSION: 'V28.8.0-Fas20-AIResponseApplyRuntime',
        collect: function () {
          const inputs = {};
          const selects = {};
          const checkboxes = {};
          Object.keys(controls).forEach(id => {
            const c = controls[id];
            if (c.options) selects[id] = c.value;
            else if (Object.prototype.hasOwnProperty.call(c, 'checked')) checkboxes[id] = c.checked;
            else inputs[id] = Number(c.value);
          });
          return { schema: 'tonearm-designer-session', version: 1, app: 'V28.8.0-Fas20-AIResponseApplyRuntime', inputs, selects, checkboxes, flags: {}, cobraArchitecture: state.cobraArchitecture };
        }
      },
      ParameterMetadata: {
        aiWritableIds: function () { return sculptInputs.slice(); },
        get: function (id) { return metadata[id] || null; },
        promptSummary: function () { return { aiWritableIds: sculptInputs.slice() }; }
      },
      CobraArchitecture: {
        getCobraArchitecture: function () { return state.cobraArchitecture; },
        isCobraArchitectureContext: function () { return { detected: true }; }
      }
    },
    document: {
      readyState: 'loading',
      addEventListener: function () {},
      getElementById: function (id) { return controls[id] || null; }
    }
  };
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.state = state;
  context.globalThis = context;
  vm.runInNewContext(read('js/ai-modal.js'), context, { filename: 'js/ai-modal.js' });
  return { context, controls, state, sculptInputs };
}

check('No full-state prompt examples', () => {
  const forbiddenIds = [
    ['full', 'passthrough'].join('_'),
    ['full', 'state'].join('_'),
    ['complete', 'session'].join('_'),
    ['legacy', 'full', 'delta'].join('_')
  ];
  ['js/ai-modal.js', 'index.html'].forEach(file => {
    forbiddenIds.forEach(id => rejectText(file, id));
  });
  const text = read('js/ai-modal.js');
  const cobraExample = sectionBetween(text, 'function buildCobraExample', 'function outputContractForPrompt');
  assert(cobraExample.includes("name: 'cobra_sparse_shape_patch'"), 'Cobra example id is not sparse');
  assert(cobraExample.includes('selects: {}'), 'Cobra example must not copy session selects');
  assert(cobraExample.includes('checkboxes: {}'), 'Cobra example must not copy session checkboxes');
  assert(cobraExample.includes('flags: {}'), 'Cobra example must not copy session flags');
  assert(!cobraExample.includes('Object.assign({}, (s && s.selects)'), 'Cobra example still copies selects');
  assert(!cobraExample.includes('Object.assign({}, (s && s.checkboxes)'), 'Cobra example still copies checkboxes');
  assert(!cobraExample.includes('Object.assign({}, (s && s.flags)'), 'Cobra example still copies flags');
});

check('Protected field filtering and Cobra invariant after sanitize/apply', () => {
  const { context, controls, state } = buildAIModalHarness();
  const raw = {
    schema: 'tonearm-designer-ai-delta',
    version: 1,
    app: 'V28.8.0-Fas20-AIResponseApplyRuntime',
    modelFamily: 'cobra_tonearm',
    name: 'hostile_copied_session_like_delta',
    inputs: {
      sculptHeadFlatEnabled: 1,
      apex: 999,
      cartX: 12.34,
      pivotOffsetZ: 42,
      counterweightMass: 123,
      effectiveMass: 88,
      targetVTF: 5,
      rearWeightDiscMass: 1,
      rearFineTrimScrewMassEquivalent: 1
    },
    selects: { rearMode: 'classic_tail' },
    checkboxes: { cobraArchitectureEnabled: false, enableCobraArchitecture: false, includeRearWeightDiscsInExport: false, someDisplayCheckbox: false },
    flags: { isEstimatedC10: true, globalDebugFlag: true },
    unsupportedAttributes: []
  };
  const result = context.window.applyAIDelta(JSON.stringify(raw));
  assert(result.ok === true, 'applyAIDelta failed: ' + JSON.stringify(result.errors));
  assert(result.delta.inputs.apex === undefined, 'apex survived protected filtering');
  assert(result.delta.inputs.cartX === undefined, 'cartX survived protected filtering');
  assert(result.delta.inputs.pivotOffsetZ === undefined, 'geometry-root field survived protected filtering');
  assert(result.delta.inputs.counterweightMass === undefined, 'mass/physics field survived protected filtering');
  assert(result.delta.selects.rearMode === undefined, 'rearMode survived select filtering');
  assert(Object.keys(result.delta.selects).length === 0, 'selects were not sparse/empty after sanitize');
  assert(Object.keys(result.delta.checkboxes).length === 0, 'checkboxes were not sparse/empty after sanitize');
  assert(result.delta.flags.globalDebugFlag === undefined, 'unknown/global flag survived filtering');

  assert(controls.rearMode.value === 'cobra_integrated_tail', 'Cobra invariant rearMode not applied');
  assert(Number(controls.apex.value) === 237, 'Cobra invariant apex not applied');
  assert(Number(controls.cartX.value) === -0.05, 'Cobra invariant cartX not applied');
  assert(controls.cobraArchitectureEnabled.checked === true, 'Cobra gate invariant not applied');
  assert(controls.enableCobraArchitecture.checked === true, 'Cobra gate alias invariant not applied');
  assert(Number(controls.headH.value) >= 5.8, 'Cobra invariant headH minimum not applied');
  assert(Number(controls.neckW.value) >= 16, 'Cobra invariant neckW minimum not applied');
  assert(controls.includeRearWeightDiscsInExport.checked === true, 'Cobra export disc invariant not applied');
});

function runGeometryReplay() {
  const code = [
    read('js/config.js'),
    read('js/math.js'),
    read('js/geometry.js')
  ].join('\n') + `
state.rearMode = REAR_MODES.COBRA_GOOSE;
state.apex = 237;
state.cartX = -0.05;
state.headH = 3.8;
state.neckW = 16;
state.neckL = 48;
state.padL = 34;
state.meshStepX = 1;
state.meshSegments = 48;
state.sculptHeadFlatEnabled = 1;
state.sculptHeadFlatStartX = 0;
state.sculptHeadFlatEndX = 36;
state.sculptHeadBottomZ = -3;
state.sculptHeadBlendLength = 22;
state.sculptHeadFlatWidthFraction = 0.72;
state.sculptStepSuppressor = 1;
state.sculptFrontStiffnessRampEnabled = 1;
state.sculptFrontMinHeight = 5.8;
state.sculptFrontRampStartX = 0;
state.sculptFrontRampEndX = 78;
state.sculptFrontRampTargetHeight = 13.5;
state.sculptFrontTopBias = 0.95;
updateGeometryCache();
const rings = getUnifiedRingCache();
const audit = analyzeProfileContinuity(rings, {
  minX: 2,
  xMax: 120,
  maxHeightDropPerMm: 0.55,
  maxTopDropPerMm: 0.55,
  maxAreaDropFractionPerMm: 0.20,
  minFrontWidthMm: 5.0
});
const aroundRamp = rings.filter(r => r && r.p && r.virtualX >= 77 && r.virtualX <= 82).map(r => ({
  x: r.virtualX,
  height: r.p.height,
  topZ: r.center.z + r.p.height / 2,
  width: r.p.width
}));
const result = {
  audit,
  aroundRamp,
  formContinuityOk: !!(audit && audit.ok),
  maxHeightDropPerMm: audit.metrics.maxHeightDropPerMm,
  maxTopZDropPerMm: audit.metrics.maxTopZDropPerMm,
  minFrontWidthMm: audit.metrics.minFrontWidthMm,
  failures: audit.failures
};
console.log(JSON.stringify(result, null, 2));
if (!result.formContinuityOk) throw new Error('TD049 continuity audit failed: ' + result.failures.join('; '));
if (result.maxHeightDropPerMm > 0.55) throw new Error('maxHeightDropPerMm exceeded tolerance');
if (result.maxTopZDropPerMm > 0.55) throw new Error('maxTopZDropPerMm exceeded tolerance');
if (result.minFrontWidthMm < 5.0) throw new Error('minFrontWidthMm below minimum');
if (result.failures.length !== 0) throw new Error('Continuity audit returned failures');
`;
  const sandbox = {
    console,
    Math, Number, Object, Array, JSON, Date, Set, Map, String, Boolean, RegExp,
    Infinity, Float32Array, Uint32Array,
    window: {},
    document: undefined,
    THREE: {
      Vector3: class Vector3 {
        constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
        clone(){ return new this.constructor(this.x,this.y,this.z); }
        subVectors(a,b){ this.x=a.x-b.x; this.y=a.y-b.y; this.z=a.z-b.z; return this; }
        crossVectors(a,b){ const x=a.y*b.z-a.z*b.y, y=a.z*b.x-a.x*b.z, z=a.x*b.y-a.y*b.x; this.x=x; this.y=y; this.z=z; return this; }
        length(){ return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z); }
        multiplyScalar(s){ this.x*=s; this.y*=s; this.z*=s; return this; }
        add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
        normalize(){ const l=this.length(); if(l>0){ this.x/=l; this.y/=l; this.z/=l; } return this; }
        dot(v){ return this.x*v.x+this.y*v.y+this.z*v.z; }
      },
      BufferGeometry: class BufferGeometry {
        constructor(){ this.attributes={}; this.index=null; this.groups=[]; this.userData={}; }
        setAttribute(n,a){ this.attributes[n]=a; return this; }
        getAttribute(n){ return this.attributes[n]; }
        setIndex(i){ this.index={ array:Array.isArray(i)?Uint32Array.from(i):i, needsUpdate:false }; return this; }
        addGroup(start,count,materialIndex){ this.groups.push({start,count,materialIndex}); }
        clearGroups(){ this.groups=[]; }
        computeVertexNormals(){ return this; }
      },
      Float32BufferAttribute: class Float32BufferAttribute {
        constructor(array,itemSize){ this.array=Float32Array.from(array); this.itemSize=itemSize; this.count=this.array.length/itemSize; this.needsUpdate=false; }
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'td049-geometry-replay.vm.js' });
}

check('TD048 broken ramp replay is continuous under TD049', () => {
  runGeometryReplay();
});

check('Prompt schema/spec embedding is TD051-primary while TD049 sparse regressions are preserved', () => {
  requireText('js/ai-modal.js', 'aiVibe3DSculptReferenceDocuments');
  requireText('js/ai-modal.js', 'schemaJson: readEmbeddedJsonDocument');
  requireText('js/ai-modal.js', 'markdownSpec: readEmbeddedDocumentText');
  requireText('js/ai-modal.js', 'sparse shape-patch JSON object');
  requireText('index.html', 'id="aiVibeSculptRuntimeSchema"');
  requireText('index.html', 'id="aiVibeSculptFormSpec"');
  assert(/"title": "TonearmDesigner TD051B? Titanium Interface Plate Sparse Runtime Sculpt Contract"/.test(read('index.html')), 'index.html schema title is not TD051/TD051B');
  requireText('index.html', '# TD051 AI Vibe 3D Titanium Interface Plate Sparse Contract');
  assert(/"title": "TonearmDesigner TD051B? Titanium Interface Plate Sparse Runtime Sculpt Contract"/.test(read('tonearm_designer_ai_response_apply_runtime_sculpt.schema.json')), 'standalone schema title is not TD051/TD051B');
  requireText('AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md', '# TD051 AI Vibe 3D Titanium Interface Plate Sparse Contract');
  const markdownStart = read('AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md').split(/\r?\n/)[0];
  assert(markdownStart.includes('TD051'), 'markdownSpec does not start with TD051 heading');
});

console.log(JSON.stringify({ schema: 'td049-sparse-cobra-contract-acceptance-v1', status: process.exitCode ? 'FAIL' : 'PASS', checks }, null, 2));
