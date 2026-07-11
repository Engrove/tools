#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas15_3_cartridge_picker_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Fas 15.3 cartridge picker + compact cartridge data acceptance.
 *
 * Static/contract harness only:
 * - Browser/WebGL is not executed here.
 * - It verifies compact JS data presence/shape, picker UI contract, filtering
 *   source contract, Apply-only mutation path and help documentation.
 */

const fs = require('fs');
const path = require('path');

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

function walkObject(value, visitor, pathLabel = '$') {
    if (Array.isArray(value)) {
        value.forEach((item, idx) => walkObject(item, visitor, pathLabel + '[' + idx + ']'));
    } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(key => {
            visitor(key, value[key], pathLabel + '.' + key);
            walkObject(value[key], visitor, pathLabel + '.' + key);
        });
    }
}

const errors = [];
const warnings = [];

const dataRel = 'data/tonearmdesigner-cartridges.min.js';
assert(exists(dataRel), 'compact cartridge JS data file exists in app package', errors);
const dataScript = read(dataRel);
assertContains(dataScript, 'window.TONEARMDESIGNER_CARTRIDGES=', 'compact cartridge JS global assignment', errors);
const dataMatch = dataScript.match(/window\.TONEARMDESIGNER_CARTRIDGES\s*=\s*([\s\S]*);\s*$/);
assert(!!dataMatch, 'compact cartridge JS parseable global assignment', errors);
let cartridges = [];
if (dataMatch) {
    cartridges = JSON.parse(dataMatch[1]);
}
assert(Array.isArray(cartridges), 'compact cartridge JS data is an array', errors);
assert(cartridges.length >= 1000, 'compact cartridge JS data contains expected app-scale dataset', errors);

const forbiddenFields = new Set(['source', 'source_url', 'notes', 'reviews', 'images', 'history']);
walkObject(cartridges, (key, value, pathLabel) => {
    if (forbiddenFields.has(key)) errors.push('compact JS data contains forbidden field ' + key + ' at ' + pathLabel);
});

const goldring = cartridges.find(c =>
    String(c.manufacturer || '').toLowerCase() === 'goldring' &&
    String(c.model || '').toLowerCase() === '1042'
);
assert(!!goldring, 'Goldring 1042 exists in compact JS data', errors);
if (goldring) {
    assert(typeof goldring.mass_g === 'number' && goldring.mass_g > 0, 'Goldring 1042 has mass_g', errors);
    assert(typeof goldring.compliance_10hz_cu === 'number' && goldring.compliance_10hz_cu > 0, 'Goldring 1042 has compliance_10hz_cu', errors);
    assert(goldring.tracking_force_g && typeof goldring.tracking_force_g === 'object', 'Goldring 1042 has tracking_force_g object', errors);
    assert(typeof goldring.tracking_force_g.min === 'number', 'Goldring 1042 has tracking force min', errors);
    assert(typeof goldring.tracking_force_g.max === 'number', 'Goldring 1042 has tracking force max', errors);
    assert(typeof goldring.tracking_force_g.recommended === 'number', 'Goldring 1042 has tracking force recommended', errors);
}

const index = read('index.html');
const css = read('css/style.css');
const picker = read('js/cartridge-picker.js');
const ui = read('js/ui.js');
const physics = read('js/physics.js');
const session = read('js/session.js');
const report = read('js/report-exporter.js');
const help = read('help.html');
const combinedUiHelp = index + '\n' + help;
const combinedSource = index + '\n' + css + '\n' + picker + '\n' + ui + '\n' + physics + '\n' + session + '\n' + report + '\n' + help;

assertContains(index, 'id="cartridgePickerOpenBtn"', 'cartridge picker open button UI', errors);
assertContains(index, 'id="cartridgePickerModal"', 'cartridge picker modal UI', errors);
assertContains(index, 'id="cartridgePickerApplyBtn"', 'cartridge picker Apply button', errors);
assertContains(index, 'id="cartridgePickerCancelBtn"', 'cartridge picker Cancel button', errors);
assertContains(index, 'id="cartridgePickerCloseBtn"', 'cartridge picker X close button', errors);
assertContains(index, 'value="selected"', 'Selected Cartridge cartMode option', errors);
assertContains(index, '<script src="data/tonearmdesigner-cartridges.min.js"></script>', 'cartridge data script include', errors);
assertContains(index, '<script src="js/cartridge-picker.js"></script>', 'cartridge picker script include', errors);

assertContains(index, 'id="cartridgeSearchInput"', 'search input exists', errors);
assertContains(index, 'id="cartridgeTypeFilter"', 'type filter exists', errors);
assertContains(index, 'id="cartridgeMassMin"', 'mass min filter exists', errors);
assertContains(index, 'id="cartridgeMassMax"', 'mass max filter exists', errors);
assertContains(index, 'id="cartridgeComplianceMin"', 'compliance min filter exists', errors);
assertContains(index, 'id="cartridgeComplianceMax"', 'compliance max filter exists', errors);
assertContains(index, 'id="cartridgeTrackingForceMin"', 'tracking force min filter exists', errors);
assertContains(index, 'id="cartridgeTrackingForceMax"', 'tracking force max filter exists', errors);
assertContains(index, 'id="cartridgeResultCount"', 'result count exists', errors);
assertContains(index, 'id="cartridgePickerPreview"', 'selected cartridge preview exists', errors);
assertContains(index, 'id="cartridgeEstimatedIndicator"', 'estimated compliance indicator exists', errors);

assertContains(picker, "DATA_PATH = 'data/tonearmdesigner-cartridges.min.js'", 'local JS data path source contract', errors);
assertContains(picker, "DATA_GLOBAL = 'TONEARMDESIGNER_CARTRIDGES'", 'local JS data global source contract', errors);
assertContains(picker, 'root[DATA_GLOBAL]', 'script-provided cartridge data source', errors);
assertNotContains(picker, 'fetch(DATA_PATH)', 'JSON fetch removed for file:// compatibility', errors);
assertContains(picker, 'FALLBACK_CARTRIDGES', 'Goldring/default fallback source', errors);
assertContains(picker, 'matchesSearch', 'manufacturer/model search function', errors);
assertRegex(picker, /manufacturer[\s\S]*model[\s\S]*join\(' '\)/, 'search uses manufacturer plus model', errors);
assertContains(picker, 'withinRange(cart.mass_g', 'numeric mass filtering', errors);
assertContains(picker, 'withinRange(cart.compliance_10hz_cu', 'numeric compliance filtering', errors);
assertContains(picker, 'withinRange(trackingForceValue(cart)', 'numeric tracking force filtering', errors);
assertContains(picker, 'cartridgeStylusFilter', 'optional stylus filtering', errors);
assertContains(picker, 'cartridgeOutputMin', 'optional output filtering', errors);
assertContains(picker, 'localeCompare', 'alphabetical sorting', errors);

assertContains(picker, 'applySelectedCartridge', 'Apply path function exists', errors);
assertContains(picker, "cartMode: 'selected'", 'Apply path selects dataset cartridge mode', errors);
assertContains(picker, "setNumberControl('customMass', mass)", 'Apply path updates cartridge mass control', errors);
assertContains(picker, "setNumberControl('comp10', compliance)", 'Apply path updates compliance control', errors);
assertContains(picker, "setNumberControl('targetVTF', trackingForce)", 'Apply path updates tracking force target', errors);
assertContains(picker, 'selectedCartridgeTrackingForceMinG', 'Apply path preserves tracking force min reference', errors);
assertContains(picker, 'selectedCartridgeTrackingForceMaxG', 'Apply path preserves tracking force max reference', errors);
assertContains(picker, 'selectedCartridgeTrackingForceRecommendedG', 'Apply path preserves tracking force recommended reference', errors);
assertContains(picker, 'trackingForceValue', 'tracking midpoint/recommended helper exists', errors);
assertRegex(picker, /const\s+rec\s*=\s*num\(tf\.recommended\)[\s\S]*return\s+\(min\s+\+\s+max\)\s*\/\s*2/, 'recommended tracking force with midpoint fallback', errors);

assertContains(picker, 'closeModal', 'close/cancel path exists', errors);
assertContains(picker, 'draftSelection = null', 'Cancel/close clears draft selection', errors);
assertContains(picker, 'Backdrop click ignored', 'backdrop click is non-applying', errors);
assertRegex(picker, /if\s*\(evt\.target\s*===\s*modal\)[\s\S]*preventDefault\(\)[\s\S]*Backdrop click ignored/, 'backdrop click does not call apply', errors);

assertContains(ui, '[Estimated compliance]', 'estimated compliance UI label', errors);
assertContains(ui, 'state.cartridgeComplianceEstimated', 'estimated compliance state represented', errors);
assertContains(session, 'flags.selectedCartridge', 'selected cartridge stored in session snapshot', errors);
assertContains(report, 'Selected cartridge', 'technical report includes selected cartridge', errors);
assertContains(report, 'Selected cartridge compliance C10', 'technical report includes selected cartridge compliance', errors);
assertContains(physics, "mode === 'selected'", 'physics supports selected cartridge mode', errors);

assertContains(help, 'Cartridge Picker', 'help.html documents cartridge picker', errors);
assertContains(help, 'Search and filters', 'help.html documents search/filter behavior', errors);
assertContains(help, 'Apply', 'help.html documents Apply behavior', errors);
assertContains(help, 'Mass', 'help.html documents mass meaning', errors);
assertContains(help, 'Compliance', 'help.html documents compliance meaning', errors);
assertContains(help, 'Tracking force', 'help.html documents tracking force meaning', errors);
assertContains(help, 'estimated compliance', 'help.html documents estimated compliance indicator', errors);
assertContains(help, 'script loading', 'help.html documents local JS data script fallback behavior', errors);
assertContains(help, 'Solver and resonance assumptions', 'help.html documents solver/resonance assumptions', errors);

assertNotContains(combinedUiHelp, 'AI is wrong by default until proven otherwise', 'AI protocol/mantra in UI/help', errors);
assertNotContains(combinedUiHelp, 'AI har fel som standard', 'AI protocol/mantra in UI/help', errors);
assertNotContains(combinedUiHelp, 'wrong by default', 'AI protocol/mantra in UI/help', errors);

if (errors.length) {
    console.error('Fas 15.3 cartridge picker acceptance: FAIL');
    errors.forEach(err => console.error('- ' + err));
    if (warnings.length) warnings.forEach(w => console.warn('warning: ' + w));
    process.exit(1);
}

console.log('Fas 15.3 cartridge picker acceptance: PASS');
console.log('- compact JS data records: ' + cartridges.length);
console.log('- Goldring 1042:', JSON.stringify({
    mass_g: goldring.mass_g,
    compliance_10hz_cu: goldring.compliance_10hz_cu,
    tracking_force_g: goldring.tracking_force_g
}));
console.log('- picker UI: modal/search/filter/apply/cancel contracts present');
console.log('- estimated compliance indicator and help.html documentation present');
if (warnings.length) warnings.forEach(w => console.warn('warning: ' + w));
