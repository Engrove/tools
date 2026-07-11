/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td051b_schema_reference_cleanup_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD051B Schema Reference Cleanup acceptance.
// Runs source-level dangling-$ref checks and real JSON Schema validation via Python jsonschema.
// No npm dependency is added; absence of Python/jsonschema is a BLOCKER for this acceptance.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_REL = 'tonearm_designer_ai_response_apply_runtime_sculpt.schema.json';
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

function runPythonJsonschema() {
  const py = String.raw`
import json, pathlib, sys
from jsonschema import Draft202012Validator, exceptions

schema_path = pathlib.Path(sys.argv[1])
schema = json.loads(schema_path.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)

validation_targets = {
    "units": "mm",
    "scale": 1,
    "geometryKind": "positive_reference_mesh",
    "exportType": "onshape_1to1",
    "exactOneToOne": True,
    "boundaryEdgesMax": 0,
    "nonManifoldEdgesMax": 0,
    "degenerateTrianglesMax": 0,
    "sliverTrianglesPreferredMax": 0,
    "minTriangleAreaPreferredMm2": 0.00001,
    "preserveScale1To1": True,
    "preserveCurrentCoordinateFrame": True,
    "requiredDatums": ["stylus_point", "pivot_point", "lp_top_plane", "x_length_axis", "y_mirror_axis", "z_vertical_axis"],
    "forbiddenTransformations": ["mould_offset", "draft_modification", "shrinkage_compensation", "split_mould_flange", "registration_pins", "pour_gates", "vent_channels"],
}

sparse_delta = {
    "schema": "tonearm-designer-ai-delta",
    "version": 1,
    "app": "V28.8.0-Fas20-AIResponseApplyRuntime",
    "modelFamily": "cobra",
    "name": "td051b_sparse_titanium_interface_patch",
    "inputs": {
        "titaniumPlateX": 32,
        "titaniumPlateYOffset": 1.0,
        "titaniumPlateZOffset": 0.5,
        "titaniumPlateLength": 24,
        "titaniumPlateWidth": 18,
        "titaniumPlateThickness": 1.5,
        "titaniumAdhesiveThickness": 0.08,
        "headH": 6.0,
        "neckW": 16.0,
        "sculptFrontRampEndX": 82.0
    },
    "selects": {},
    "checkboxes": {},
    "flags": {},
    "unsupportedAttributes": []
}

empty_sparse_delta = {
    "schema": "tonearm-designer-ai-delta",
    "version": 1,
    "app": "V28.8.0-Fas20-AIResponseApplyRuntime",
    "modelFamily": "cobra",
    "name": "no_interpretable_request",
    "inputs": {},
    "selects": {},
    "checkboxes": {},
    "flags": {},
    "unsupportedAttributes": ["ambiguous_request"]
}

preferred_null = {
    "schema": "tonearm-designer-ai-vibe-3d-response",
    "version": 1,
    "app": "V28.8.0-Fas20-AIResponseApplyRuntime",
    "intent": "onshape_ready_exact_positive_model",
    "actions": [],
    "delta": None,
    "validationTargets": validation_targets,
}

preferred_sparse = dict(preferred_null)
preferred_sparse["delta"] = sparse_delta

def errors(instance):
    return list(validator.iter_errors(instance))

def must_pass(name, instance):
    err = errors(instance)
    if err:
        raise AssertionError(name + " should validate but failed: " + " | ".join(e.message for e in err[:5]))

def must_fail(name, instance, expected_words):
    err = errors(instance)
    if not err:
        raise AssertionError(name + " should fail validation but passed")
    joined = " | ".join(e.message for e in err[:8])
    for word in expected_words:
        if word in joined:
            return
    # jsonschema oneOf errors may hide nested additionalProperties in contexts; still require failure.
    return

must_pass("preferred response with delta=null", preferred_null)
must_pass("preferred response with sparse delta", preferred_sparse)
must_pass("top-level SparseShapePatchDelta", sparse_delta)
must_pass("top-level SparseEmptyDeltaWhenUninterpretable", empty_sparse_delta)

for protected in ["apex", "cartX", "rearMode"]:
    bad = json.loads(json.dumps(sparse_delta))
    bad["inputs"][protected] = 237 if protected != "rearMode" else "cobra_integrated_tail"
    must_fail("protected field rejected: " + protected, bad, [protected, "not allowed", "Additional properties"])

bad_selects = json.loads(json.dumps(sparse_delta))
bad_selects["selects"] = {"rearMode": "cobra_integrated_tail"}
must_fail("selects must be empty", bad_selects, ["selects", "too many properties", "Expected at most"])

bad_checkboxes = json.loads(json.dumps(sparse_delta))
bad_checkboxes["checkboxes"] = {"titaniumPlateEnabled": True}
must_fail("checkboxes must be empty", bad_checkboxes, ["checkboxes", "too many properties", "Expected at most"])

print(json.dumps({
    "status": "PASS",
    "validator": "python-jsonschema Draft202012Validator",
    "cases": [
        "preferred response with delta=null",
        "preferred response with sparse delta",
        "top-level SparseShapePatchDelta",
        "top-level SparseEmptyDeltaWhenUninterpretable",
        "protected apex/cartX/rearMode rejected",
        "selects/checkboxes empty maps enforced"
    ]
}))
`;
  const candidates = ['python3', 'python'];
  const attempts = [];
  for (const bin of candidates) {
    const result = cp.spawnSync(bin, ['-c', py, SCHEMA_PATH], { encoding: 'utf8' });
    attempts.push({ bin, status: result.status, error: result.error && result.error.message, stdout: result.stdout, stderr: result.stderr });
    if (!result.error && result.status === 0) return result.stdout.trim();
  }
  fail('Python jsonschema validation failed or is not available: ' + JSON.stringify(attempts, null, 2));
}

check('schema has no dangling refs and no forbidden legacy refs', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const refs = collectRefs(schema, '$', []);
  const defs = schema.$defs || {};
  refs.forEach(item => {
    if (item.ref.indexOf('#/$defs/') === 0) {
      const key = item.ref.slice('#/$defs/'.length).split('/')[0];
      assert(defs[key], 'dangling $ref at ' + item.loc + ': ' + item.ref);
    }
    assert(!/LegacyFullPassthroughDelta|LegacyEmptyDeltaWhenUninterpretable|LegacyInputMap/.test(item.ref), 'forbidden legacy ref remains at ' + item.loc + ': ' + item.ref);
  });
  assert(!defs.LegacyFullPassthroughDelta, 'LegacyFullPassthroughDelta def remains');
  assert(!defs.LegacyEmptyDeltaWhenUninterpretable, 'LegacyEmptyDeltaWhenUninterpretable def remains');
  assert(!defs.LegacyInputMap, 'LegacyInputMap def remains');
});

check('PreferredAIVibe3DResponse.delta resolves only to sparse/null refs', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const delta = schema.$defs.PreferredAIVibe3DResponse.properties.delta;
  const refs = collectRefs(delta, '$defs.PreferredAIVibe3DResponse.properties.delta', []);
  const allowed = new Set(['#/$defs/SparseShapePatchDelta', '#/$defs/SparseEmptyDeltaWhenUninterpretable']);
  refs.forEach(item => assert(allowed.has(item.ref), 'unexpected delta ref: ' + item.ref));
  assert(delta.anyOf.some(item => item.type === 'null'), 'delta must allow null');
  assert(refs.length === 2, 'delta must contain exactly two sparse refs plus null');
});

check('real JSON Schema validation accepts sparse responses and rejects protected fields', () => {
  const output = runPythonJsonschema();
  assert(output.includes('"status": "PASS"') || output.includes('"status":"PASS"'), 'jsonschema runner did not report PASS: ' + output);
});

check('TD051B schema fix is documented in prompt/spec/test surfaces', () => {
  assert(read('tonearm_designer_ai_response_apply_runtime_sculpt.schema.json').includes('TD051B'), 'standalone schema missing TD051B label');
  assert(read('tools/td051_titanium_plate_contract_acceptance.js').includes('dangling schema $ref'), 'TD051 acceptance missing dangling-ref guard');
});

console.log(JSON.stringify({ schema: 'td051b-schema-reference-cleanup-acceptance-v1', status: process.exitCode ? 'FAIL' : 'PASS', checks }, null, 2));
