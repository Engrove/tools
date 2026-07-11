#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3a_cartridge_dynamic_ranges_search_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3a cartridge dynamic ranges + file:// search acceptance.
 *
 * Static + lightweight runtime harness:
 * - verifies JS runtime data, not JSON fetch
 * - verifies file://-safe picker structure
 * - verifies Goldring search with empty numeric filters
 * - verifies Apply expands controller ranges before setting exact values
 * - verifies Cancel/X/search/preview source paths do not expand ranges
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function exists(rel) {
    return fs.existsSync(path.join(__dirname, '..', rel));
}

function assert(condition, label, errors) {
    if (!condition) errors.push(label);
}

function assertContains(haystack, needle, label, errors) {
    if (!haystack.includes(needle)) errors.push(label + ' missing: ' + needle);
}

function assertNotContains(haystack, needle, label, errors) {
    if (haystack.includes(needle)) errors.push(label + ' forbidden: ' + needle);
}

function assertRegex(haystack, regex, label, errors) {
    if (!regex.test(haystack)) errors.push(label + ' missing pattern: ' + regex);
}

function parseDataScript(dataScript) {
    const match = dataScript.match(/window\.TONEARMDESIGNER_CARTRIDGES\s*=\s*([\s\S]*);\s*$/);
    if (!match) throw new Error('Unable to parse window.TONEARMDESIGNER_CARTRIDGES assignment');
    return JSON.parse(match[1]);
}

function scriptIndex(html, src) {
    return html.indexOf('<script src="' + src + '"></script>');
}

function makeClassList() {
    return {
        values: new Set(),
        add(name) { this.values.add(name); },
        remove(name) { this.values.delete(name); },
        contains(name) { return this.values.has(name); }
    };
}

function makeElement(id, props = {}) {
    return {
        id,
        value: props.value !== undefined ? String(props.value) : '',
        min: props.min !== undefined ? String(props.min) : '',
        max: props.max !== undefined ? String(props.max) : '',
        step: props.step !== undefined ? String(props.step) : '',
        hidden: !!props.hidden,
        disabled: false,
        textContent: '',
        innerText: '',
        innerHTML: '',
        className: '',
        style: {},
        classList: makeClassList(),
        listeners: {},
        focus() {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        setAttribute(name, value) {
            this[name] = String(value);
        },
        getAttribute(name) {
            return this[name] !== undefined ? String(this[name]) : null;
        },
        querySelectorAll() { return []; }
    };
}

function buildRuntime(cartridges) {
    const elements = {};
    const defaults = {
        cartridgeDataStatus: {},
        cartridgePickerStatus: {},
        cartridgePickerOpenBtn: {},
        cartridgePickerCloseBtn: {},
        cartridgePickerCancelBtn: {},
        cartridgePickerApplyBtn: {},
        cartridgePickerResetBtn: {},
        cartridgePickerModal: { hidden: true },
        cartridgeResults: {},
        cartridgeResultCount: {},
        cartridgePickerPreview: {},
        cartridgeSearchInput: { value: '' },
        cartridgeTypeFilter: { value: '' },
        cartridgeStylusFilter: { value: '' },
        cartridgeMassMin: { value: '' },
        cartridgeMassMax: { value: '' },
        cartridgeComplianceMin: { value: '' },
        cartridgeComplianceMax: { value: '' },
        cartridgeTrackingForceMin: { value: '' },
        cartridgeTrackingForceMax: { value: '' },
        cartridgeOutputMin: { value: '' },
        cartridgeOutputMax: { value: '' },
        selectedCartridgeSummary: {},
        selectedCartridgeMeta: {},
        cartridgeEstimatedIndicator: {},
        cartMode: { value: 'custom' },
        customMass: { min: '2', max: '30', value: '7.6', step: '0.1' },
        comp10: { min: '5', max: '40', value: '13', step: '0.5' },
        comp100: { min: '2', max: '30', value: '7.6', step: '0.1' },
        compK: { min: '1.2', max: '2.5', value: '1.7', step: '0.05' },
        targetVTF: { min: '0.5', max: '5', value: '2', step: '0.1' },
        val_customMass: {},
        val_comp10: {},
        val_comp100: {},
        val_targetVTF: {}
    };
    Object.keys(defaults).forEach(id => { elements[id] = makeElement(id, defaults[id]); });

    const sandbox = {
        console,
        window: {},
        globalThis: null,
        document: {
            body: { classList: makeClassList() },
            getElementById(id) { return elements[id] || null; }
        },
        state: {
            cartMode: 'custom',
            customMass: 7.6,
            comp10: 13,
            targetVTF: 2
        },
        Physics: {
            calcEstimatedC100(c10, k) { return Number(c10) / Number(k); }
        },
        syncComplianceUI() {},
        updateState() {
            sandbox.updateStateCount += 1;
            ['customMass', 'comp10', 'comp100', 'targetVTF'].forEach(id => {
                const el = elements[id];
                if (!el) return;
                const n = Number(el.value);
                if (Number.isFinite(n)) sandbox.state[id] = n;
            });
            const mode = elements.cartMode.value;
            sandbox.state.cartMode = mode;
        },
        Session_setIsEstimatedC10() {},
        updateStateCount: 0
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window.TONEARMDESIGNER_CARTRIDGES = cartridges;
    return { sandbox, elements };
}

const errors = [];

const index = read('index.html');
const picker = read('js/cartridge-picker.js');
const help = read('help.html');
const dataScript = read('data/tonearmdesigner-cartridges.min.js');
const combinedUiHelp = index + '\n' + help;

assert(exists('data/tonearmdesigner-cartridges.min.js'), 'cartridge runtime data is JS file', errors);
assert(!exists('data/tonearmdesigner-cartridges.min.json'), 'runtime cartridge JSON file is not packaged as dependency', errors);
assertContains(dataScript, 'window.TONEARMDESIGNER_CARTRIDGES=', 'JS data defines window.TONEARMDESIGNER_CARTRIDGES', errors);

const dataIdx = scriptIndex(index, 'data/tonearmdesigner-cartridges.min.js');
const pickerIdx = scriptIndex(index, 'js/cartridge-picker.js');
assert(dataIdx >= 0, 'index.html loads cartridge JS data', errors);
assert(pickerIdx >= 0, 'index.html loads cartridge picker JS', errors);
assert(dataIdx >= 0 && pickerIdx >= 0 && dataIdx < pickerIdx, 'cartridge JS data loads before cartridge-picker.js', errors);

assertContains(picker, "DATA_GLOBAL = 'TONEARMDESIGNER_CARTRIDGES'", 'picker uses data global name', errors);
assertContains(picker, 'root[DATA_GLOBAL]', 'picker reads window.TONEARMDESIGNER_CARTRIDGES', errors);
assertNotContains(picker, 'fetch(DATA_PATH)', 'picker does not fetch cartridge data', errors);
assertNotContains(picker, 'tonearmdesigner-cartridges.min.json', 'picker does not reference JSON data dependency', errors);
assertNotContains(index, '<iframe', 'cartridge picker uses no iframe', errors);
assertNotContains(index, '<object', 'cartridge picker uses no object', errors);
assertNotContains(picker, 'index.html', 'cartridge picker does not self-load index.html', errors);
assertNotContains(picker, 'window.open', 'cartridge picker does not open self windows', errors);

assertContains(picker, "if (typeof value === 'string' && value.trim() === '') return null;", 'empty numeric filters parse as null', errors);
assertContains(picker, 'resetFilters', 'clear filters implementation exists', errors);
assertRegex(picker, /cartridgeSearchInput[\s\S]*el\.value\s*=\s*''[\s\S]*renderResults\(\)/, 'clear filters resets search and renders', errors);
assertContains(picker, 'requiredRangeExpansions', 'range expansion preview helper exists', errors);
assertContains(picker, 'applyRequiredRangeExpansions', 'Apply range expansion helper exists', errors);
assertRegex(picker, /applyRequiredRangeExpansions\(cart\)[\s\S]*setNumberControl\('customMass', mass\)/, 'Apply expands ranges before setting customMass', errors);
assertRegex(picker, /applyRequiredRangeExpansions\(cart\)[\s\S]*setNumberControl\('comp10', compliance\)/, 'Apply expands ranges before setting comp10', errors);
assertRegex(picker, /applyRequiredRangeExpansions\(cart\)[\s\S]*setNumberControl\('targetVTF', trackingForce\)/, 'Apply expands ranges before setting targetVTF', errors);
assertRegex(picker, /function\s+setNumberControl[\s\S]*expandControlRangeForValue\(id,\s*n\)[\s\S]*el\.value\s*=\s*exactValueString\(n\)/, 'setNumberControl expands range and sets exact value', errors);
assertContains(picker, 'Applying this cartridge will expand controller ranges', 'UI warns before Apply when expansion is required', errors);
assertContains(picker, 'Controller range expanded for selected cartridge', 'UI reports range expansion after Apply', errors);
assertRegex(picker, /function\s+renderPreview[\s\S]*requiredRangeExpansions\(cart\)[\s\S]*rangeNotice/, 'preview computes warning without applying range mutation', errors);
assertRegex(picker, /function\s+closeModal[\s\S]*draftSelection\s*=\s*null[\s\S]*modal\.hidden\s*=\s*true/, 'Cancel/X close path clears draft and does not apply', errors);

assertContains(help, 'controller ranges', 'help documents dynamic controller ranges', errors);
assertContains(help, 'silently clamped', 'help documents no silent clamping', errors);
assertContains(help, 'script loading', 'help documents JS script loading behavior', errors);
const forbiddenProtocolText = [
    ['AI is wrong', ' by default until proven otherwise'].join(''),
    ['AI har fel', ' som standard'].join(''),
    ['wrong', ' by default'].join('')
];
forbiddenProtocolText.forEach(value => {
    assertNotContains(combinedUiHelp, value, 'AI protocol/mantra in UI/help', errors);
});

let cartridges = [];
try {
    cartridges = parseDataScript(dataScript);
} catch (err) {
    errors.push('parse runtime JS dataset: ' + err.message);
}
const goldring = cartridges.find(c =>
    String(c.manufacturer || '').toLowerCase() === 'goldring' &&
    String(c.model || '').toLowerCase() === '1042'
);
assert(!!goldring, 'Goldring 1042 exists in runtime dataset', errors);

if (!errors.length) {
    const { sandbox, elements } = buildRuntime(cartridges);
    vm.createContext(sandbox);
    try {
        vm.runInContext(picker, sandbox, { filename: 'cartridge-picker.js' });
    } catch (err) {
        errors.push('runtime load cartridge-picker.js: ' + err.stack);
    }

    if (sandbox.CartridgePicker) {
        elements.cartridgeSearchInput.value = 'Goldring';
        const goldringMatches = sandbox.CartridgePicker.filterCartridges();
        assert(goldringMatches.some(c => c.id === goldring.id), 'search logic for Goldring returns Goldring 1042', errors);

        elements.cartridgeSearchInput.value = '';
        [
            'cartridgeMassMin', 'cartridgeMassMax', 'cartridgeComplianceMin', 'cartridgeComplianceMax',
            'cartridgeTrackingForceMin', 'cartridgeTrackingForceMax', 'cartridgeOutputMin', 'cartridgeOutputMax'
        ].forEach(id => { elements[id].value = ''; });
        const allMatches = sandbox.CartridgePicker.filterCartridges();
        assert(allMatches.length === cartridges.length, 'empty numeric filters do not exclude records', errors);

        const beforeRanges = {
            customMass: [elements.customMass.min, elements.customMass.max],
            comp10: [elements.comp10.min, elements.comp10.max],
            targetVTF: [elements.targetVTF.min, elements.targetVTF.max]
        };
        sandbox.CartridgePicker.requiredRangeExpansions({
            id: 'synthetic-preview-only',
            manufacturer: 'Synthetic',
            model: 'Preview Only',
            mass_g: 1.1,
            compliance_10hz_cu: 44,
            tracking_force_g: { min: 0.2, max: 0.4, recommended: 0.25 }
        });
        assert(elements.customMass.min === beforeRanges.customMass[0] && elements.customMass.max === beforeRanges.customMass[1], 'preview/range check does not mutate customMass range', errors);
        assert(elements.comp10.min === beforeRanges.comp10[0] && elements.comp10.max === beforeRanges.comp10[1], 'preview/range check does not mutate comp10 range', errors);
        assert(elements.targetVTF.min === beforeRanges.targetVTF[0] && elements.targetVTF.max === beforeRanges.targetVTF[1], 'preview/range check does not mutate targetVTF range', errors);

        const lowEdge = {
            id: 'synthetic-low-edge',
            manufacturer: 'Synthetic',
            model: 'Low Edge',
            type: 'MC',
            mass_g: 1.1,
            compliance_10hz_cu: 4.2,
            compliance_10hz_estimated: true,
            tracking_force_g: { min: 0.2, max: 0.4, recommended: 0.25 }
        };
        sandbox.CartridgePicker.applySelectedCartridge(lowEdge);
        assert(Number(elements.customMass.min) <= 1.1, 'Apply expands customMass min before setting low mass', errors);
        assert(Number(elements.comp10.min) <= 4.2, 'Apply expands comp10 min before setting low compliance', errors);
        assert(Number(elements.targetVTF.min) <= 0.25, 'Apply expands targetVTF min before setting low tracking force', errors);
        assert(Number(elements.customMass.value) === 1.1, 'Apply sets exact low mass without clamp', errors);
        assert(Number(elements.comp10.value) === 4.2, 'Apply sets exact low compliance without clamp', errors);
        assert(Number(elements.targetVTF.value) === 0.25, 'Apply sets exact low tracking force without clamp', errors);

        const highEdge = {
            id: 'synthetic-high-edge',
            manufacturer: 'Synthetic',
            model: 'High Edge',
            type: 'MI',
            mass_g: 32.4,
            compliance_10hz_cu: 45.5,
            compliance_10hz_estimated: false,
            tracking_force_g: { min: 5.6, max: 6.0, recommended: 5.75 }
        };
        const updateCountBefore = sandbox.updateStateCount;
        sandbox.CartridgePicker.applySelectedCartridge(highEdge);
        assert(Number(elements.customMass.max) >= 32.4, 'Apply expands customMass max before setting high mass', errors);
        assert(Number(elements.comp10.max) >= 45.5, 'Apply expands comp10 max before setting high compliance', errors);
        assert(Number(elements.targetVTF.max) >= 5.75, 'Apply expands targetVTF max before setting high tracking force', errors);
        assert(Number(elements.customMass.value) === 32.4, 'Apply sets exact high mass without clamp', errors);
        assert(Number(elements.comp10.value) === 45.5, 'Apply sets exact high compliance without clamp', errors);
        assert(Number(elements.targetVTF.value) === 5.75, 'Apply sets exact high tracking force without clamp', errors);
        assert(sandbox.state.customMass === 32.4, 'state uses exact high mass', errors);
        assert(sandbox.state.comp10 === 45.5, 'state uses exact high compliance', errors);
        assert(sandbox.state.targetVTF === 5.75, 'state uses exact high tracking force', errors);
        assert(sandbox.updateStateCount === updateCountBefore + 1, 'Apply triggers normal app update pipeline once', errors);
    } else {
        errors.push('CartridgePicker public API missing after runtime load');
    }
}

if (errors.length) {
    console.error('Fas 15.3a cartridge dynamic ranges/search acceptance: FAIL');
    errors.forEach(err => console.error('- ' + err));
    process.exit(1);
}

console.log('Fas 15.3a cartridge dynamic ranges/search acceptance: PASS');
console.log('- runtime data: JS bundle, no JSON fetch dependency');
console.log('- compact JS data records: ' + cartridges.length);
console.log('- search Goldring returns Goldring 1042');
console.log('- empty numeric filters do not exclude records');
console.log('- synthetic low/high edge cartridges expand customMass, comp10 and targetVTF ranges');
console.log('- Apply sets exact selected values without silent clamp');
console.log('- Cancel/X/search/preview source paths do not mutate live controller ranges');
