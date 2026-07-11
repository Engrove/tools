/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052_freeform_schema_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Freeform Loft schema acceptance.
// Local source/package candidate only; no browser/runtime/Onshape claim.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_REL = 'tonearm_designer_ai_freeform_loft.schema.json';
const SCHEMA_PATH = path.join(ROOT, SCHEMA_REL);

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

function collectRefs(value, loc, out) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectRefs(item, loc + '[' + i + ']', out));
    return out;
  }
  if (value && typeof value === 'object') {
    if (typeof value.$ref === 'string') out.push({ loc, ref: value.$ref });
    Object.keys(value).forEach(key => collectRefs(value[key], loc + '.' + key, out));
  }
  return out;
}

function resolveLocalRef(schema, ref) {
  if (!ref.startsWith('#/')) return true;
  const parts = ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = schema;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return false;
    cur = cur[part];
  }
  return true;
}

function runPythonJsonschema() {
  const py = String.raw`
import json, pathlib, sys
from jsonschema import Draft202012Validator

schema_path = pathlib.Path(sys.argv[1])
schema = json.loads(schema_path.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)

known_good = {
  "schema": "tonearm-designer-ai-freeform-loft-response",
  "version": 1,
  "app": "V28.8.0-Fas20-AIResponseApplyRuntime",
  "mode": "freeform_centerline_ring_loft",
  "name": "cobra_freeform_patch",
  "centerlinePatch": {
    "curveType": "catmull_rom",
    "points": [
      { "id": "headshell_interface", "s": 0.14, "x": 34, "y": -2.5, "z": 2.5 },
      { "id": "mid_armwand", "s": 0.5, "x": 125, "y": 0, "z": 6.5 }
    ]
  },
  "ringPatch": {
    "rings": [
      { "id": "ring_front", "s": 0.06, "shapeFamily": "flat_bottom_headshell", "widthMm": 24, "heightMm": 5.5, "wallThicknessMm": 1.1, "bottomFlatness": 0.9 },
      { "id": "ring_mid_01", "s": 0.45, "shapeFamily": "custom_bezier_loop", "widthMm": 14.5, "heightMm": 8.2, "wallThicknessMm": 1.45, "rotationDeg": 2, "tiltDeg": 0, "cornerSharpness": 0.4, "superellipseExponent": 2.6, "asymmetryY": 0.08, "asymmetryZ": 0.18, "topRidgeHeightMm": 1.2, "bottomFlatness": 0.2, "crescentCutDepth": 0, "controlPoints": [
        {"y": 0.5, "z": 0.0}, {"y": 0.3, "z": 0.5}, {"y": -0.3, "z": 0.5}, {"y": -0.5, "z": 0.0},
        {"y": -0.3, "z": -0.5}, {"y": 0.3, "z": -0.5}
      ] }
    ]
  },
  "featurePatch": {
    "integratedHeadshell": { "enabled": True, "detachable": False, "cartridgeDatumValid": True, "headshellPlaneValid": True },
    "titaniumMountPlate": { "enabled": True, "type": "structural_laminated_interface_plate", "looseUndersidePlate": False, "followsTD051Rule": True },
    "cartridgeSlots": { "enabled": True, "separateFeature": True, "slotGeometryValid": True },
    "counterweightStack": { "enabled": True, "separateRearTerminalAssembly": True, "fakeWithRingOrTail": False }
  },
  "analysisTargets": {
    "targetBodyMassG": 22,
    "targetVerticalResonanceHz": 10,
    "materialDensityGPerCm3": 1.25
  },
  "unsupportedAttributes": []
}

invalid_cases = {
  "protected_datum_movement": dict(known_good, centerlinePatch={"points": [{"id":"stylus_front", "x": 1}]}),
  "unknown_top_level": dict(known_good, mysteryField=True),
  "direct_mesh_triangles": dict(known_good, triangles=[[0,1,2]]),
  "unknown_centerline_field": dict(known_good, centerlinePatch={"points": [{"id":"headshell_interface", "foo": 1}]}),
  "unknown_ring_field": dict(known_good, ringPatch={"rings": [{"id":"ring_mid_01", "s": 0.5, "shapeFamily": "circle", "widthMm": 10, "heightMm": 8, "wallThicknessMm": 1.1, "foo": 1}]}),
  "lt_mechanism_write": dict(known_good, P1=1),
  "loose_titanium_plate": dict(known_good, featurePatch={"titaniumMountPlate": {"enabled": True, "type": "loose_underside_plate", "looseUndersidePlate": True}}),
}

def errors(obj):
    return list(validator.iter_errors(obj))

valid_errors = errors(known_good)
if valid_errors:
    print("known_good validation errors:")
    for err in valid_errors:
        print("-", "/".join(str(p) for p in err.path), err.message)
    sys.exit(2)

for name, obj in invalid_cases.items():
    if not errors(obj):
        print("invalid case unexpectedly accepted:", name)
        sys.exit(3)

print("PY_JSONSCHEMA_PASS")
`;
  const attempts = ['python3', 'python'];
  let last = null;
  for (const bin of attempts) {
    const res = cp.spawnSync(bin, ['-c', py, SCHEMA_PATH], { encoding: 'utf8' });
    last = res;
    if (res.error && res.error.code === 'ENOENT') continue;
    assert(res.status === 0, bin + ' jsonschema validation failed: ' + (res.stdout || '') + (res.stderr || ''));
    assert((res.stdout || '').includes('PY_JSONSCHEMA_PASS'), 'jsonschema pass marker missing');
    return;
  }
  fail('python/jsonschema not available for schema acceptance: ' + String(last && last.error || 'no runner'));
}

check('schema file exists', () => {
  assert(fs.existsSync(SCHEMA_PATH), SCHEMA_REL + ' missing');
});

check('no dangling local $refs', () => {
  const schema = JSON.parse(read(SCHEMA_REL));
  const refs = collectRefs(schema, '#', []);
  assert(refs.length > 0, 'expected schema to contain local refs');
  const dangling = refs.filter(item => !resolveLocalRef(schema, item.ref));
  assert(dangling.length === 0, 'dangling refs: ' + JSON.stringify(dangling));
});

check('schema declares required TD052 contract', () => {
  const text = read(SCHEMA_REL);
  [
    'tonearm-designer-ai-freeform-loft-response',
    'freeform_centerline_ring_loft',
    'centerlinePatch',
    'ringPatch',
    'featurePatch',
    'unsupportedAttributes',
    'custom_bezier_loop',
    'crescent',
    'structural_laminated_interface_plate'
  ].forEach(needle => assert(text.includes(needle), 'missing required schema text ' + needle));
  ['LegacyFullPassthroughDelta', 'P1', 'P2', 'P3', 'STATOR', 'L23'].forEach(forbidden => {
    assert(!text.includes('"' + forbidden + '"'), 'forbidden legacy/LT write surface appears in schema: ' + forbidden);
  });
});

check('jsonschema validates good and rejects bad responses', runPythonJsonschema);

console.log(JSON.stringify({
  status: process.exitCode ? 'FAIL' : 'PASS',
  test: 'td052_freeform_schema_acceptance',
  checks
}, null, 2));
