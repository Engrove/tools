/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td051_titanium_plate_contract_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD051 Titanium Head Interface Plate Placement and Prompt Contract acceptance.
// Source-level + geometry-helper regression without browser, npm or external deps.
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
function loadJson(rel) { return JSON.parse(read(rel)); }

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: err.message }); process.exitCode = 1; }
}

function loadTitaniumHarness() {
  const sandbox = { console, globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('js/titanium-mount-plate.js'), sandbox, { filename: 'titanium-mount-plate.vm.js' });
  assert(sandbox.TitaniumMountPlate, 'TitaniumMountPlate global was not registered');
  return sandbox.TitaniumMountPlate;
}

function loadHeadshellHarness() {
  const sandbox = { console, globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('js/headshell-slots.js'), sandbox, { filename: 'headshell-slots.vm.js' });
  assert(sandbox.HeadshellSlots, 'HeadshellSlots global was not registered');
  return sandbox.HeadshellSlots;
}

function baseState(overrides) {
  return Object.assign({
    apex: 237,
    cartX: -0.05,
    padL: 26,
    noseL: 16,
    neckL: 45,
    headH: 6,
    titaniumPlateEnabled: true,
    titaniumPlateLength: 24,
    titaniumPlateWidth: 18,
    titaniumPlateThickness: 1.5,
    titaniumPlateMass: 2.85,
    titaniumPlateX: 32,
    titaniumPlateYOffset: 0,
    titaniumPlateZOffset: 0,
    titaniumAdhesiveThickness: 0.08,
    titaniumAdhesiveDampingLossFactor: 0.18
  }, overrides || {});
}

check('titaniumPlateEnabled=false disables titaniumMountPlate render/export geometry', () => {
  const T = loadTitaniumHarness();
  const off = T.resolveTitaniumMountPlatePose(baseState({ titaniumPlateEnabled: false }));
  assert(off.enabled === false, 'pose enabled despite titaniumPlateEnabled=false');
  const geom = T.buildGeometry(baseState({ titaniumPlateEnabled: false }));
  assert(geom && geom.enabled === false, 'disabled buildGeometry must return disabled descriptor');
  assert(geom.userData && geom.userData.featureId === 'titaniumMountPlate', 'disabled descriptor must still identify titaniumMountPlate boundary');

  requireText('js/exporters.js', 'function getTitaniumMountPlateExportGeometry()');
  requireText('js/exporters.js', 'if (!pose || pose.enabled !== true) return null;');
  requireText('js/render3d.js', 'function isTitaniumMountPlateRenderEnabled()');
  requireText('js/render3d.js', 'resolveTitaniumMountPlatePose(state).enabled === true');
});

check('titaniumPlateX/Y/ZOffset affect actual titaniumMountPlate pose/bbox', () => {
  const T = loadTitaniumHarness();
  const a = T.resolveTitaniumMountPlatePose(baseState());
  const x = T.resolveTitaniumMountPlatePose(baseState({ titaniumPlateX: 38 }));
  const y = T.resolveTitaniumMountPlatePose(baseState({ titaniumPlateYOffset: 2.2 }));
  const z = T.resolveTitaniumMountPlatePose(baseState({ titaniumPlateZOffset: 1.1 }));

  assert(x.xMm !== a.xMm && x.bbox.minX !== a.bbox.minX && x.bbox.maxX !== a.bbox.maxX, 'titaniumPlateX did not change pose/bbox');
  assert(y.yMm !== a.yMm && y.bbox.minY !== a.bbox.minY && y.bbox.maxY !== a.bbox.maxY, 'titaniumPlateYOffset did not change pose/bbox');
  assert(z.zMm !== a.zMm && z.bbox.minZ !== a.bbox.minZ && z.bbox.maxZ !== a.bbox.maxZ, 'titaniumPlateZOffset did not change pose/bbox');
});

check('default titanium plate is in interface zone, not underside cartridge-slot zone', () => {
  const T = loadTitaniumHarness();
  const pose = T.resolveTitaniumMountPlatePose(baseState());
  assert(pose.semanticType === 'structural_laminated_interface_plate', 'wrong titanium semanticType');
  assert(!pose.undersideLoosePlateZone, 'pose is still classified as underside/loose plate zone');
  assert(pose.contactsIntegratedHeadshellInterface === true, 'pose does not contact integrated headshell interface');
  assert(pose.bbox.minX > 14, 'pose starts too far forward into cartridge underside area');
  assert(pose.xMm >= pose.interfaceZone.minX && pose.xMm <= pose.interfaceZone.maxX, 'pose X not clamped to interface zone');
  assert(pose.bbox.minZ >= 1.0, 'pose is below/at underside zone instead of laminated interface surface');
});

check('headshell slot carrier and titaniumMountPlate are semantically separated', () => {
  const H = loadHeadshellHarness();
  const spec = H.normalizeSpec(H.getDefaultSpec());
  assert(spec.slotCarrierPlate, 'missing headshellSlots.slotCarrierPlate');
  assert(spec.plate, 'missing legacy headshellSlots.plate alias');
  assert(spec.slotCarrierPlate !== spec.plate, 'slotCarrierPlate and legacy plate alias are the same object');
  assert(spec.slotCarrierPlate.semanticType === 'slot_carrier_reference_geometry', 'slotCarrierPlate semanticType missing/wrong');
  assert(spec.plate.semanticType === 'legacy_slot_carrier_alias_not_titanium', 'legacy headshellSlots.plate alias must be not-titanium');
  requireText('js/headshell-slots.js', 'built by js/titanium-mount-plate.js, never by this module');
  requireText('js/cobra-architecture.js', 'do not map titaniumPlate* controls onto headshellSlots.plate');
});

check('prompt/spec/schema TD051 titanium contract is explicit and not false-writable', () => {
  requireText('js/ai-modal.js', 'titaniumMountPlateContract');
  requireText('js/ai-modal.js', 'TitaniumMountPlate.resolveTitaniumMountPlatePose consumes titaniumPlateX/Y/ZOffset');
  requireText('js/ai-modal.js', 'not headshellSlots.plate and not a loose underside');
  requireText('index.html', '# TD051 AI Vibe 3D Titanium Interface Plate Sparse Contract');
  requireText('index.html', 'titaniumMountPlate');
  requireText('AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md', 'Titanium mounting plate is a structural laminated interface');
  requireText('AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md', 'headshellSlots.plate');
  requireText('AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md', 'TitaniumMountPlate.resolveTitaniumMountPlatePose() uses `titaniumPlateX`');

  const titaniumSource = read('js/titanium-mount-plate.js');
  ['titaniumPlateX', 'titaniumPlateYOffset', 'titaniumPlateZOffset'].forEach(id => {
    assert(titaniumSource.includes("readValue(s, '" + id + "'"), id + ' is schema/prompt writable but not read by runtime resolver');
  });
});

check('schema is TD051 sparse and no longer exposes legacy full-state passthrough as external contract', () => {
  const schemaText = read('tonearm_designer_ai_response_apply_runtime_sculpt.schema.json');
  const schema = loadJson('tonearm_designer_ai_response_apply_runtime_sculpt.schema.json');
  assert(/^TonearmDesigner TD051B? Titanium Interface Plate Sparse Runtime Sculpt Contract$/.test(schema.title), 'schema title is not TD051/TD051B');
  assert(schema.$defs.SparseShapePatchDelta, 'missing SparseShapePatchDelta');
  assert(schema.$defs.SparseShapeInputMap, 'missing SparseShapeInputMap');
  assert(schema.$defs.SparseEmptyObjectMap, 'missing SparseEmptyObjectMap');
  assert(!schema.$defs.LegacyFullPassthroughDelta, 'LegacyFullPassthroughDelta must not remain an externally valid schema def');
  assert(!schema.$defs.LegacyInputMap, 'LegacyInputMap full-state map must not remain in standalone schema defs');
  const refs = [];
  (function collectRefs(value, loc) {
    if (Array.isArray(value)) return value.forEach((item, i) => collectRefs(item, loc + '[' + i + ']'));
    if (value && typeof value === 'object') {
      if (typeof value.$ref === 'string') refs.push({ loc, ref: value.$ref });
      Object.keys(value).forEach(key => collectRefs(value[key], loc + '.' + key));
    }
  })(schema, '$');
  refs.forEach(item => {
    if (item.ref.indexOf('#/$defs/') === 0) {
      const key = item.ref.slice('#/$defs/'.length).split('/')[0];
      assert(schema.$defs[key], 'dangling schema $ref at ' + item.loc + ': ' + item.ref);
    }
    assert(!/LegacyFullPassthroughDelta|LegacyEmptyDeltaWhenUninterpretable|LegacyInputMap/.test(item.ref), 'schema still references forbidden legacy def at ' + item.loc + ': ' + item.ref);
  });

  assert(!schemaText.includes('"LegacyFullPassthroughDelta"'), 'schema text still names LegacyFullPassthroughDelta');
  assert(!schema.$defs.SparseShapeInputMap.required, 'SparseShapeInputMap must not require full-state fields');
  assert(!schema.$defs.SparseShapeInputMap.properties.apex, 'apex must not be externally writable in sparse schema');
  assert(!schema.$defs.SparseShapeInputMap.properties.cartX, 'cartX must not be externally writable in sparse schema');
  assert(schema.$defs.SparseShapeInputMap.properties.titaniumPlateX, 'titaniumPlateX must remain writable because runtime consumes it');
  assert(schema.$defs.SparseEmptyObjectMap.maxProperties === 0, 'selects/checkboxes/flags maps must be empty in sparse contract');
});

check('prompt does not teach forbidden full-state or loose-underside semantics', () => {
  rejectText('js/ai-modal.js', 'full_passthrough');
  rejectText('js/ai-modal.js', 'complete_session');
  requireText('js/ai-modal.js', 'cobra_sparse_shape_patch');
  requireText('js/ai-modal.js', 'selects: {}');
  requireText('js/ai-modal.js', 'checkboxes: {}');
  requireText('js/ai-modal.js', 'flags: {}');
  const badLooseRole = /role\s*:\s*['"](?:loose|underside).*titanium/i;
  assert(!badLooseRole.test(read('js/ai-modal.js')), 'AI prompt source still roles titanium as loose/underside');
  assert(!badLooseRole.test(read('AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md')), 'TD051 spec roles titanium as loose/underside');
});

console.log(JSON.stringify({ schema: 'td051-titanium-plate-contract-acceptance-v1', status: process.exitCode ? 'FAIL' : 'PASS', checks }, null, 2));
