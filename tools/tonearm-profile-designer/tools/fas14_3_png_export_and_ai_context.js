#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas14_3_png_export_and_ai_context.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Fas 14.3 local acceptance harness: AI-context cleanup + read-only 800x600 3D PNG export API.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function makeElement(id, opts = {}) {
  const el = {
    id,
    type: opts.type || 'text',
    tagName: (opts.tagName || 'INPUT').toUpperCase(),
    value: opts.value !== undefined ? String(opts.value) : '',
    textContent: opts.textContent !== undefined ? String(opts.textContent) : '',
    innerText: opts.innerText !== undefined ? String(opts.innerText) : '',
    innerHTML: opts.innerHTML !== undefined ? String(opts.innerHTML) : '',
    checked: !!opts.checked,
    disabled: false,
    classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} },
    style: {},
    attributes: {},
    eventLog: [],
    options: (opts.options || []).map((value) => ({ value })),
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      this[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    addEventListener(type, fn) {
      this._listeners = this._listeners || {};
      this._listeners[type] = this._listeners[type] || [];
      this._listeners[type].push(fn);
    },
    dispatchEvent(evt) {
      const type = evt && evt.type ? evt.type : String(evt);
      this.eventLog.push(type);
      (typeof document !== 'undefined' ? document : fakeDocument).dispatchedEvents.push({ id: this.id, type });
      const listeners = (this._listeners && this._listeners[type]) || [];
      listeners.forEach((fn) => fn.call(this, evt));
      return true;
    },
    click() {
      this.eventLog.push('click');
    },
    focus() {}
  };
  Object.defineProperty(el, 'valueAsNumber', {
    get() {
      const n = Number(this.value);
      return Number.isFinite(n) ? n : NaN;
    },
    set(v) {
      if (Number.isFinite(Number(v))) this.value = String(Number(v));
    }
  });
  return el;
}

const fakeDocument = {
  readyState: 'complete',
  elements: Object.create(null),
  dispatchedEvents: [],
  body: {
    appendChild() {},
    removeChild() {}
  },
  addEventListener() {},
  createEvent(type) {
    return {
      type,
      initEvent(name) { this.type = name; }
    };
  },
  createElement(tag) {
    return makeElement('', { tagName: tag });
  },
  getElementById(id) {
    return this.elements[id] || null;
  },
  querySelectorAll(selector) {
    if (selector !== 'input, select') return [];
    return Object.values(this.elements).filter((el) => {
      const tag = String(el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'select';
    });
  }
};

const context = {
  console,
  document: fakeDocument,
  window: null,
  globalThis: null,
  setTimeout(fn) { if (typeof fn === 'function') fn(); },
  clearTimeout() {},
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  Date,
  Math,
  JSON
};
context.window = context;
context.globalThis = context;

vm.createContext(context);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, { filename: rel });
}

load('js/config.js');

vm.runInContext(`
  (function setupDomFromConfig() {
    inputs.forEach(function(id) {
      document.elements[id] = (${makeElement.toString()})(id, {
        tagName: 'input',
        type: 'number',
        value: state[id] !== undefined ? state[id] : 0
      });
      document.elements['val_' + id] = (${makeElement.toString()})('val_' + id, {
        tagName: 'span',
        textContent: state[id] !== undefined ? state[id] : 0
      });
    });

    SessionSelectIdsForTest = ['exportType', 'exportFormat', 'rearMode', 'material', 'cartMode', 'alignmentPreset', 'renderMode'];
    SessionSelectIdsForTest.forEach(function(id) {
      document.elements[id] = (${makeElement.toString()})(id, {
        tagName: 'select',
        value: state[id] !== undefined ? state[id] : '',
        options: [state[id] !== undefined ? state[id] : '']
      });
    });

    SessionCheckboxIdsForTest = [
      'showRearCG', 'showNeutralLine', 'showTowerClearance', 'includeRearWeightDiscsInExport',
      'showRearWeights', 'showFineTrimScrew', 'showVerticalPivot', 'showTotalCOM', 'showRearCOM',
      'showCounterweightCOM', 'showCartridgeCOM', 'showInertiaAxes', 'showMeasureLines',
      'showForce', 'showMass', 'showLpTopPlane', 'stylusLockedToLP'
    ];
    SessionCheckboxIdsForTest.forEach(function(id) {
      document.elements[id] = (${makeElement.toString()})(id, {
        tagName: 'input',
        type: 'checkbox',
        checked: !!state[id]
      });
    });

    [
      'container3D', 'axesInset', 'stylusInfo', 'exportModelBtn', 'export3dPngBtn'
    ].forEach(function(id) {
      if (!document.elements[id]) {
        document.elements[id] = (${makeElement.toString()})(id, {
          tagName: id === 'export3dPngBtn' || id === 'exportModelBtn' ? 'button' : 'div',
          textContent: ''
        });
      }
      document.elements[id].clientWidth = 640;
      document.elements[id].clientHeight = 360;
      document.elements[id].appendChild = function() {};
    });
  })();
`, context);

load('js/session.js');
load('js/render3d.js');

vm.runInContext(`
  Object.assign(state, {
    apex: 231,
    cartX: 8.2,
    rearMode: REAR_MODES.CLASSIC,
    rearBendStartX: 236,
    armBodyDatumOffsetZ: 20.5,
    rearWeightDiscCount: 4,
    rearWeightDiscThickness: 4,
    rearWeightDiscMass: 18,
    rearWeightDiscDiameter: 14,
    showRearWeights: true,
    showFineTrimScrew: false,
    includeRearWeightDiscsInExport: false
  });
  state.cobraArchitecture.enabled = false;

  document.getElementById('apex').value = '231';
  document.getElementById('cartX').value = '8.2';
  document.getElementById('rearMode').value = REAR_MODES.CLASSIC;
  document.getElementById('rearBendStartX').value = '236';
  document.getElementById('armBodyDatumOffsetZ').value = '20.5';
  document.getElementById('rearWeightDiscCount').value = '4';
  document.getElementById('rearWeightDiscThickness').value = '4';
  document.getElementById('rearWeightDiscMass').value = '18';
  document.getElementById('rearWeightDiscDiameter').value = '14';

  document.getElementById('showRearWeights').checked = true;
  document.getElementById('showFineTrimScrew').checked = false;
  document.getElementById('includeRearWeightDiscsInExport').checked = false;
`, context);

function assert(condition, label) {
  if (!condition) throw new Error(label);
}
function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(label + ' expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function assertNoMatch(label, text, regex) {
  if (regex.test(text)) throw new Error(label + ' forbidden pattern ' + regex);
}
function assertMatch(label, text, regex) {
  if (!regex.test(text)) throw new Error(label + ' missing pattern ' + regex);
}

const aiText = fs.readFileSync(path.join(ROOT, 'js/ai-modal.js'), 'utf8');
const zoneMapText = fs.readFileSync(path.join(ROOT, 'js/zone-map.js'), 'utf8');
const activeAiGuidanceText = aiText + '\n' + zoneMapText;
assertNoMatch('no pivot/tower-adjacent counterweight', activeAiGuidanceText, /pivot\/tower-adjacent\s+(?:balance\s+mass|counterweight)/i);
assertNoMatch('no counterweight near pivot/tower', activeAiGuidanceText, /counterweight\s+near\s+pivot\/tower/i);
assertNoMatch('no counterweight should be adjacent to pivot/tower', activeAiGuidanceText, /counterweight\s+should\s+be\s+adjacent/i);
assertNoMatch('no counterweight belongs near pivot/tower/bearing', activeAiGuidanceText, /counterweight\s+(?:belongs|is|sits|located|mounted|situated)[^.\n]{0,120}(?:pivot|tower|bearing)/i);
assertNoMatch('no heart counterweight near pivot/tower', activeAiGuidanceText, /heart[-\s]*counterweight[^.\n]{0,120}(?:pivot|tower|bearing)/i);
assertNoMatch('no fine tracking force screw as canonical proxy', activeAiGuidanceText, /fine[^.\n]{0,80}tracking[^.\n]{0,80}screw[^.\n]{0,120}proxy/i);
assertNoMatch('no @counterweight_stack xRange based on pivotX', aiText, /tag:\s*['"]@counterweight_stack['"][\s\S]{0,320}xRange\s*:[^\n]*pivotX/i);
assertMatch('rear-terminal disc stack exists in AI modal', aiText, /rear-terminal\s+(?:top-anchored\s+downward\s+)?disc[-\s]stack/i);
assertMatch('rear-terminal disc stack exists in zone map', zoneMapText, /rear-terminal\s+disc\s+stack/i);
assertMatch('top-anchored downward exists', activeAiGuidanceText, /top-anchored\s+downward/i);
assertMatch('rearWeightDisc canonical path exists', activeAiGuidanceText, /rearWeightDisc\*/);
assertMatch('rearFineTrim canonical path exists', activeAiGuidanceText, /rearFineTrim\*/);
assertMatch('legacy heart reference is explicitly non-canonical', zoneMapText, /@heart_counterweight[\s\S]{0,520}legacy_reference_only_non_canonical[\s\S]{0,260}canonicalCounterweightGuidance:\s*false/i);

const render3dText = fs.readFileSync(path.join(ROOT, 'js/render3d.js'), 'utf8');
assertMatch('PNG export explicitly clones geometry', render3dText, /sourceGeometry\.clone\(\)|\.geometry\.clone\(\)/);
assertMatch('PNG export marks geometry ownership', render3dText, /pngExportGeometryOwnership:\s*['"]owned_clone['"]/);
assertMatch('PNG export dispose gated by ownership', render3dText, /pngExportGeometryOwnership\s*===\s*['"]owned_clone['"][\s\S]{0,260}geometry\.dispose\(\)/);
assertNoMatch('PNG export must not unconditionally dispose geometry', render3dText, /if\s*\(obj\.geometry\s*&&\s*typeof\s+obj\.geometry\.dispose\s*===\s*['"]function['"]\)\s*obj\.geometry\.dispose\(\)/);

const acceptanceText = fs.readFileSync(path.join(ROOT, 'js/cobra-acceptance.js'), 'utf8');
assertMatch('unknown export evidence normalizes to INDETERMINATE', acceptanceText, /missing_explicit_export_evidence/);
assertMatch('normalizeExportStatusValue exists', acceptanceText, /function\s+normalizeExportStatusValue/);
assertNoMatch('export acceptance must not default missing export to PASS', acceptanceText, /return\s*\{\s*exportValidation:\s*['"]PASS['"]\s*\}\s*;/);
assertNoMatch('known-good mode must not inject placeholder export PASS', acceptanceText, /exportResult\s*=\s*\{\s*exportValidation:\s*['"]PASS['"]/);
assertNoMatch('override mode must not use placeholder export PASS', acceptanceText, /opts\.export[^\n]{0,120}\|\|\s*\{\s*exportValidation:\s*['"]PASS['"]/);

const indexText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const uiText = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
assertMatch('Export 3D PNG button exists', indexText, /id="export3dPngBtn"[\s\S]{0,120}Export 3D PNG \(800x600\)/);
assertMatch('Export 3D PNG binding exists', uiText, /export3dPngBtn[\s\S]{0,160}download3dPng800x600/);

vm.runInContext(`state.designLoaded = true; state.designSource = 'acceptance_harness';`, context);
const before = vm.runInContext(`Session.collect('before_png_export')`, context);
const eventCountBefore = vm.runInContext(`document.dispatchedEvents.length`, context);
const result = vm.runInContext(`Tonearm3DPngExporter.export3dPng800x600({
  width: 800,
  height: 600,
  fitCoverage: 0.95,
  now: new Date('2026-05-05T09:00:00Z')
})`, context);
const after = vm.runInContext(`Session.collect('after_png_export')`, context);
const eventCountAfter = vm.runInContext(`document.dispatchedEvents.length`, context);

assert(result, 'export result exists');
assertEqual('PNG width', result.width, 800);
assertEqual('PNG height', result.height, 600);
assert(result.type === 'image/png' || result.mimeType === 'image/png', 'PNG MIME/type is image/png');
assert(/^data:image\/png/.test(result.dataUrl || ''), 'PNG dataUrl begins with data:image/png');
assert(result.metadata && result.metadata.objectBounds, 'metadata.objectBounds exists');
assertEqual('metadata imageWidth', result.metadata.imageWidth, 800);
assertEqual('metadata imageHeight', result.metadata.imageHeight, 600);
assertEqual('fit coverage target', result.metadata.fitCoverageTarget, 0.95);
assert(result.metadata.measuredCoverageX !== undefined, 'metadata.measuredCoverageX exists');
assert(result.metadata.measuredCoverageY !== undefined, 'metadata.measuredCoverageY exists');
assert(result.metadata.clipping === false, 'metadata.clipping is false');

const measuredCoverage = Number(result.metadata.measuredCoverageMax || result.metadata.measuredCoverage || Math.max(result.metadata.measuredCoverageX, result.metadata.measuredCoverageY));
assert(measuredCoverage >= 0.90 && measuredCoverage <= 0.98, 'measured coverage in 0.90–0.98, got ' + measuredCoverage);

[
  ['inputs.apex', after.inputs.apex, before.inputs.apex],
  ['inputs.cartX', after.inputs.cartX, before.inputs.cartX],
  ['selects.rearMode', after.selects.rearMode, before.selects.rearMode],
  ['cobraArchitecture.enabled', after.cobraArchitecture.enabled, before.cobraArchitecture.enabled],
  ['inputs.rearWeightDiscCount', after.inputs.rearWeightDiscCount, before.inputs.rearWeightDiscCount],
  ['inputs.rearWeightDiscThickness', after.inputs.rearWeightDiscThickness, before.inputs.rearWeightDiscThickness],
  ['inputs.rearWeightDiscMass', after.inputs.rearWeightDiscMass, before.inputs.rearWeightDiscMass]
].forEach(([label, actual, expected]) => assertEqual(label + ' unchanged', actual, expected));

assertEqual('no input/change events dispatched by PNG export', eventCountAfter, eventCountBefore);

console.log('AI-context cleanup: PASS');
console.log('PNG export 800x600: PASS');
console.log('PNG export read-only/no-mutation: PASS');
console.log('fit coverage target: ' + result.metadata.fitCoverageTarget);
console.log('measured coverage: X=' + Number(result.metadata.measuredCoverageX).toFixed(3) + ', Y=' + Number(result.metadata.measuredCoverageY).toFixed(3) + ', max=' + measuredCoverage.toFixed(3));
console.log('before apex/cartX/rearMode/cobraArchitecture.enabled:', before.inputs.apex + '/' + before.inputs.cartX + '/' + before.selects.rearMode + '/' + before.cobraArchitecture.enabled);
console.log('after apex/cartX/rearMode/cobraArchitecture.enabled:', after.inputs.apex + '/' + after.inputs.cartX + '/' + after.selects.rearMode + '/' + after.cobraArchitecture.enabled);
console.log('before rearWeightDiscCount/rearWeightDiscThickness/rearWeightDiscMass:', before.inputs.rearWeightDiscCount + '/' + before.inputs.rearWeightDiscThickness + '/' + before.inputs.rearWeightDiscMass);
console.log('after rearWeightDiscCount/rearWeightDiscThickness/rearWeightDiscMass:', after.inputs.rearWeightDiscCount + '/' + after.inputs.rearWeightDiscThickness + '/' + after.inputs.rearWeightDiscMass);
console.log('all unchanged');
console.log('browser/visual verification NOT performed by Hjalmar');
console.log('release-ready PASS NOT claimed');
