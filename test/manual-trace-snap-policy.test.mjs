/**
 * AI-CODING NOTE:
 * Responsibility: Regression coverage for Manual Trace object-snap and optional last-point continuation policy.
 * Inputs: tools/manual-trace/app-07.js loaded in an isolated VM with browser/state mocks.
 * Outputs: Node test assertions that fail when continuation becomes implicit or control handles become object-snap targets.
 * Safe edits: Keep the harness limited to the public interaction contract.
 * Do not: Treat implementation-string presence as behavioral verification.
 */
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../tools/manual-trace/app-07.js', import.meta.url), 'utf8');

function createContext() {
  const listeners = [];
  const context = {
    S: {
      continueLastPoint: undefined,
      svgTrace: {},
      img: null,
      shapes: [],
      sel: null,
      tool: 'line',
      cur: { type: 'line' },
      anchor: null,
      snap: true,
      snapHit: null,
      frame: {},
      project_meta: {}
    },
    $: () => ({ onclick: null, onchange: null, value: '', checked: false, closest: () => null }),
    document: {
      querySelectorAll: () => [],
      createElement: () => ({ childNodes: [], append() {}, after() {}, setAttribute() {}, className: '', title: '' }),
      createTextNode: text => ({ nodeType: 3, textContent: text })
    },
    window: {
      addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
      confirm: () => true
    },
    cv: { addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }) },
    clone: value => JSON.parse(JSON.stringify(value)),
    sync() {},
    projectPayload: () => ({ workspace: { settings: {} } }),
    applyProjectPackage() {},
    applyTraceObject() {},
    isProjectPackage: value => value?.package_type === 'engrove_trace_project',
    loadImg() {},
    loadSvgTraceFile() {},
    loadProject() {},
    loadJ() {},
    saveProject() {},
    hist() {},
    setAnchor(point) { context.S.anchor = point ? { x: point.x, y: point.y } : null; },
    commitCurrentKeepAnchor() {
      context.S.cur = null;
      context.S.anchor = { x: 10, y: 20 };
      return true;
    },
    undoActivePoint: () => false,
    undo() {},
    redo() {},
    draw() {},
    clickToolAt() {},
    originHit: () => false,
    scr: () => ({ x: 0, y: 0 }),
    toImg: point => point,
    d: () => 0,
    moveOriginTo() {},
    isKeyboardOwnedByUi: () => false,
    ORIGIN_SEL: 'trace_frame.origin',
    console,
    listeners
  };
  context.globalThis = context;
  return context;
}

function runAssertions(assertionSource) {
  const context = createContext();
  vm.runInNewContext(`${source}\n${assertionSource}`, context, { filename: 'app-07.js' });
}

test('completed geometry does not implicitly continue by default', () => {
  runAssertions(`
    commitCurrentKeepAnchor();
    if (S.continueLastPoint !== false) throw new Error('continuation must default to false');
    if (S.anchor !== null) throw new Error('default completion must clear the last-point anchor');
  `);
});

test('explicit continuation preserves the completed endpoint and persists in project settings', () => {
  runAssertions(`
    S.continueLastPoint = true;
    commitCurrentKeepAnchor();
    if (!S.anchor || S.anchor.x !== 10 || S.anchor.y !== 20) throw new Error('enabled continuation must preserve the endpoint');
    const payload = projectPayload();
    if (payload.workspace.settings.continue_last_point !== true) throw new Error('continuation setting must persist');
  `);
});

test('object snap accepts geometric points but rejects Bezier control handles', () => {
  runAssertions(`
    const node = objectSnapPointFromHit({ kind: 'node', point: { x: 3, y: 4 } });
    if (!node || node.x !== 3 || node.y !== 4) throw new Error('geometry node must be a snap target');
    if (objectSnapPointFromHit({ kind: 'in', point: { x: 1, y: 2 } }) !== null) throw new Error('Bezier in-handle must not be a snap target');
    if (objectSnapPointFromHit({ kind: 'out', point: { x: 1, y: 2 } }) !== null) throw new Error('Bezier out-handle must not be a snap target');
  `);
});
