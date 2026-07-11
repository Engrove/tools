#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas14_2_report_export_no_mutation.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Fas 14.2 local acceptance harness: report export must be read-only.

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
    checked: !!opts.checked,
    disabled: false,
    classList: { toggle() {} },
    style: {},
    attributes: {},
    eventLog: [],
    options: (opts.options || []).map((value) => ({ value })),
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      this[name] = String(value);
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
    }
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
      initEvent(name) {
        this.type = name;
      }
    };
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
  },
  createElement(tag) {
    return makeElement('', { tagName: tag });
  }
};

const context = {
  console,
  document: fakeDocument,
  window: null,
  globalThis: null,
  Blob: class Blob {
    constructor(parts, opts) {
      this.parts = parts;
      this.opts = opts;
    }
  },
  URL: {
    createObjectURL() { return 'blob:fas14_2_report_export_no_mutation'; },
    revokeObjectURL() {}
  },
  Event: class Event {
    constructor(type, init) {
      this.type = type;
      this.bubbles = !!(init && init.bubbles);
    }
  },
  setTimeout(fn) {
    if (typeof fn === 'function') fn();
  }
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
      document.elements[id] = ${makeElement.toString()}(id, {
        tagName: 'input',
        type: 'number',
        value: state[id] !== undefined ? state[id] : 0
      });
      document.elements['val_' + id] = ${makeElement.toString()}('val_' + id, {
        tagName: 'span',
        textContent: state[id] !== undefined ? state[id] : 0
      });
    });

    SessionSelectIdsForTest = ['exportType', 'exportFormat', 'rearMode', 'material', 'cartMode', 'alignmentPreset', 'renderMode'];
    SessionSelectIdsForTest.forEach(function(id) {
      document.elements[id] = ${makeElement.toString()}(id, {
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
      document.elements[id] = ${makeElement.toString()}(id, {
        tagName: 'input',
        type: 'checkbox',
        checked: !!state[id]
      });
    });

    [
      'calcMass', 'calcResonance', 'sessionStatus', 'sessionName',
      'dataPivot', 'dataStylus', 'dataTotalCOM', 'dataRearCOM', 'dataCounterCOM',
      'dataDistSP', 'dataDistPT', 'dataDistPR', 'dataDistPCW', 'dataDistTCW', 'dataDistST',
      'dataTrackingForce', 'dataTrackingMoment', 'dataIzz', 'dataIyy', 'dataKzz',
      'dataEIMin', 'dataEIApex', 'dataGJMin', 'dataFirstBending', 'dataFirstTorsion',
      'dataStructuralStatus', 'readLpTopZ', 'readPivotAboveLP', 'readStylusZ',
      'readPivotStylusDz', 'readBodyEnvelopeZ', 'readStylusToLpDz', 'stylusLpStatus'
    ].forEach(function(id) {
      if (!document.elements[id]) {
        document.elements[id] = ${makeElement.toString()}(id, {
          tagName: 'span',
          textContent: '—'
        });
      }
    });
  })();
`, context);

load('js/session.js');
load('js/cobra-acceptance.js');
load('js/cobra-manual-verification.js');
load('js/report-exporter.js');

vm.runInContext(`
  Object.assign(state, {
    designLoaded: true,
    designSource: 'acceptance_harness',
    apex: 231,
    cartX: 142.33456,
    rearMode: REAR_MODES.CLASSIC,
    rearBendStartX: 236.78901,
    armBodyDatumOffsetZ: 20.54321
  });
  state.cobraArchitecture.enabled = false;

  document.getElementById('apex').value = '231';
  document.getElementById('cartX').value = '142.33456';
  document.getElementById('rearMode').value = REAR_MODES.CLASSIC;
  document.getElementById('rearBendStartX').value = '236.78901';
  document.getElementById('armBodyDatumOffsetZ').value = '20.54321';

  document.getElementById('val_apex').textContent = '231';
  document.getElementById('val_cartX').textContent = '142.33456';
  document.getElementById('val_rearBendStartX').textContent = '236.78901';
  document.getElementById('val_armBodyDatumOffsetZ').textContent = '20.54321';
`, context);

const before = vm.runInContext(`Session.collect('before_report')`, context);
const report = vm.runInContext(`TonearmReportExporter.buildMarkdownReport('mutation_test')`, context);
const after = vm.runInContext(`Session.collect('after_report')`, context);
const stateAfter = vm.runInContext(`({
  apex: state.apex,
  cartX: state.cartX,
  rearMode: state.rearMode,
  cobraArchitectureEnabled: state.cobraArchitecture.enabled,
  rearBendStartX: state.rearBendStartX,
  armBodyDatumOffsetZ: state.armBodyDatumOffsetZ
})`, context);
const eventCount = vm.runInContext(`document.dispatchedEvents.length`, context);

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(label + ' expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertMatch(label, text, regex) {
  if (!regex.test(text)) {
    throw new Error(label + ' missing pattern ' + regex);
  }
}

function assertNoMatch(label, text, regex) {
  if (regex.test(text)) {
    throw new Error(label + ' forbidden pattern ' + regex);
  }
}

assertEqual('before.inputs.apex == after.inputs.apex', after.inputs.apex, before.inputs.apex);
assertEqual('before.inputs.cartX == after.inputs.cartX', after.inputs.cartX, before.inputs.cartX);
assertEqual('before.selects.rearMode == after.selects.rearMode', after.selects.rearMode, before.selects.rearMode);
assertEqual('before.cobraArchitecture.enabled == after.cobraArchitecture.enabled', after.cobraArchitecture.enabled, before.cobraArchitecture.enabled);
assertEqual('before.inputs.rearBendStartX == after.inputs.rearBendStartX', after.inputs.rearBendStartX, before.inputs.rearBendStartX);
assertEqual('before.inputs.armBodyDatumOffsetZ == after.inputs.armBodyDatumOffsetZ', after.inputs.armBodyDatumOffsetZ, before.inputs.armBodyDatumOffsetZ);

assertEqual('state.apex unchanged', stateAfter.apex, 231);
assertEqual('state.cartX unchanged', stateAfter.cartX, 142.33456);
assertEqual('state.rearMode unchanged', stateAfter.rearMode, 'classic_tail');
assertEqual('state.cobraArchitecture.enabled unchanged', stateAfter.cobraArchitectureEnabled, false);
assertEqual('state.rearBendStartX unchanged', stateAfter.rearBendStartX, 236.78901);
assertEqual('state.armBodyDatumOffsetZ unchanged', stateAfter.armBodyDatumOffsetZ, 20.54321);
assertEqual('no DOM input/change events dispatched', eventCount, 0);

assertMatch('Report identity rear mode', report, /\|\s*Rear mode\s*\|\s*classic_tail\s*\|/);
assertMatch('Runtime state sync apex triplet', report, /\|\s*DOM\/session\/state apex\s*\|\s*state=231(?:\.0+)?\s*\/\s*DOM=231(?:\.0+)?\s*\/\s*session=231(?:\.0+)?\s*\|/);
assertMatch('Runtime state sync cartX high precision triplet', report, /\|\s*DOM\/session\/state cartX\s*\|\s*state=142\.33456\s*\/\s*DOM=142\.33456\s*\/\s*session=142\.33456\s*\|/);
assertMatch('Complete UI snapshot apex', report, /\|\s*input\s*\|\s*apex\s*\|[^|]*\|\s*231(?:\.0+)?\s*\|/);
assertMatch('Complete UI snapshot cartX high precision', report, /\|\s*input\s*\|\s*cartX\s*\|[^|]*\|\s*142\.33456\s*\|/);
assertMatch('Complete UI snapshot rearBendStartX high precision', report, /\|\s*input\s*\|\s*rearBendStartX\s*\|[^|]*\|\s*236\.78901\s*\|/);
assertMatch('Complete UI snapshot armBodyDatumOffsetZ high precision', report, /\|\s*input\s*\|\s*armBodyDatumOffsetZ\s*\|[^|]*\|\s*20\.54321\s*\|/);
assertMatch('Session JSON apex', report, /"apex":\s*231/);
assertMatch('Session JSON cartX high precision', report, /"cartX":\s*142\.33456/);
assertMatch('Session JSON rearMode', report, /"rearMode":\s*"classic_tail"/);
assertMatch('Session JSON rearBendStartX high precision', report, /"rearBendStartX":\s*236\.78901/);
assertMatch('Session JSON armBodyDatumOffsetZ high precision', report, /"armBodyDatumOffsetZ":\s*20\.54321/);
assertMatch('Session JSON cobra enabled', report, /"enabled":\s*false/);

assertNoMatch('Complete UI control snapshot must not show canonical apex=237', report, /\|\s*input\s*\|\s*apex\s*\|[^|]*\|\s*237(?:\.0+)?\s*\|/);
assertNoMatch('Complete UI control snapshot must not show canonical cartX=-0.05', report, /\|\s*input\s*\|\s*cartX\s*\|[^|]*\|\s*-0\.05(?:0+)?\s*\|/);
assertNoMatch('Session JSON snapshot must not show canonical rearMode', report, /"rearMode":\s*"cobra_integrated_tail"/);

console.log('report export no-mutation: PASS');
console.log('before apex/cartX/rearMode/cobraArchitecture.enabled:', before.inputs.apex + '/' + before.inputs.cartX + '/' + before.selects.rearMode + '/' + before.cobraArchitecture.enabled);
console.log('after apex/cartX/rearMode/cobraArchitecture.enabled:', after.inputs.apex + '/' + after.inputs.cartX + '/' + after.selects.rearMode + '/' + after.cobraArchitecture.enabled);
console.log('before rearBendStartX/armBodyDatumOffsetZ:', before.inputs.rearBendStartX + '/' + before.inputs.armBodyDatumOffsetZ);
console.log('after rearBendStartX/armBodyDatumOffsetZ:', after.inputs.rearBendStartX + '/' + after.inputs.armBodyDatumOffsetZ);
console.log('all unchanged');
console.log('browser/visual verification NOT performed by Hjalmar');
console.log('release-ready PASS NOT claimed');
