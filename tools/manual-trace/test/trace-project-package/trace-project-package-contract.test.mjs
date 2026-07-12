/**
 * AI-CODING NOTE:
 * Responsibility: Contract, fixture, integrity, semantic-placement, and field-disposition regression coverage for Trace Project Package v1.
 * Inputs: Canonical schemas, field matrix, validator, and committed positive/negative golden fixtures.
 * Outputs: Node test failures with stable contract error classes.
 * Safe edits: Extend coverage with matched allow/block fixtures and explicit contract diagnostics.
 * Do not: Substitute source inspection for behavior, accept snapshots blindly, or claim ZIP/browser/runtime validation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJsonBytes,
  collectSchemaFields,
  loadSchemas,
  validatePackage,
  validateSchemaValue
} from './contract-validator.mjs';

const here = new URL('./', import.meta.url);
const repositoryRoot = new URL('../../../../', here);
const schemaDir = new URL('schema/trace-project-package/', repositoryRoot);
const schemas = await loadSchemas(schemaDir);
const matrix = JSON.parse(await readFile(new URL('field-matrix.json', schemaDir), 'utf8'));

const positiveDir = new URL('./positive/', here);
const positiveNames = (await readdir(positiveDir)).filter(name => name.endsWith('.fixture.json')).sort();
const positives = await Promise.all(positiveNames.map(async name => JSON.parse(await readFile(new URL(name, positiveDir), 'utf8'))));
const negativeSet = JSON.parse(await readFile(new URL('./negative-fixtures.json', here), 'utf8'));
const positiveByName = new Map(positives.map(fixture => [fixture.name, fixture]));
function clone(value) { return structuredClone(value); }
function pointerTokens(pointer) { return pointer.split('/').slice(1).map(token => token.replace(/~1/g, '/').replace(/~0/g, '~')); }
function applyPatch(document, operations) {
  const target = clone(document);
  for (const operation of operations) {
    const tokens = pointerTokens(operation.path);
    const key = tokens.pop();
    const parent = tokens.reduce((value, token) => value[Array.isArray(value) ? Number(token) : token], target);
    const property = Array.isArray(parent) ? Number(key) : key;
    if (operation.op === 'remove') Array.isArray(parent) ? parent.splice(property, 1) : delete parent[property];
    else if (operation.op === 'add' || operation.op === 'replace') parent[property] = clone(operation.value);
    else throw new Error(`unsupported fixture patch operation: ${operation.op}`);
  }
  return target;
}
const negatives = negativeSet.fixtures.map(descriptor => ({
  name: descriptor.name,
  expected: descriptor.expected,
  canonicalDigest: descriptor.canonicalDigest,
  package: applyPatch(positiveByName.get(descriptor.baseFixture).package, descriptor.patch)
}));

function digest(value) { return createHash('sha256').update(canonicalJsonBytes(value)).digest('hex'); }
function fixturePackage(name) { return clone(positiveByName.get(name).package); }
function refreshJsonEntry(pkg, entryPath) {
  const entry = pkg.entries[entryPath];
  assert.equal(entry?.kind, 'json', `${entryPath} must be a JSON fixture entry`);
  const bytes = canonicalJsonBytes(entry.content);
  const manifestEntry = pkg.manifest.files.find(file => file?.path === entryPath);
  assert.ok(manifestEntry, `${entryPath} must be declared in the fixture manifest`);
  manifestEntry.sizeBytes = bytes.length;
  manifestEntry.sha256 = createHash('sha256').update(bytes).digest('hex');
}
function assertMalformedPackageDoesNotThrow(label, pkg) {
  let result;
  assert.doesNotThrow(() => { result = validatePackage(pkg, schemas); }, `${label} must not throw`);
  assert.equal(result.ok, false, `${label} must be rejected`);
  assert.ok(result.errors.some(item => item.errorClass === 'MALFORMED_RECORD'), `${label}: ${JSON.stringify(result, null, 2)}`);
}

test('fixture suite contains both emit and block cases', () => {
  assert.ok(positives.length >= 5, 'at least five positive fixtures required');
  assert.ok(negatives.length >= 14, 'at least fourteen negative fixtures required');
  assert.ok(positives.some(fixture => (fixture.expected.warningClasses || []).length > 0), 'warning/emit fixture required');
});

for (const fixture of positives) test(`positive fixture accepts: ${fixture.name}`, () => {
  assert.equal(digest(fixture.package), fixture.canonicalDigest, 'fixture package digest must be deterministic');
  const result = validatePackage(fixture.package, schemas);
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual([...new Set(result.warnings.map(item => item.warningClass))].sort(), [...fixture.expected.warningClasses].sort());
});

for (const fixture of negatives) test(`negative fixture blocks with ${fixture.expected.errorClass}: ${fixture.name}`, () => {
  assert.equal(digest(fixture.package), fixture.canonicalDigest, 'fixture package digest must be deterministic');
  const result = validatePackage(fixture.package, schemas);
  assert.equal(result.ok, false, 'negative fixture must not be accepted');
  assert.equal(result.errors[0]?.errorClass, fixture.expected.errorClass, JSON.stringify(result, null, 2));
});

test('manifest integrity covers every payload entry and excludes only the manifest itself', () => {
  for (const fixture of positives) {
    const declared = fixture.package.manifest.files.map(file => file.path).sort();
    const present = Object.keys(fixture.package.entries).sort();
    assert.deepEqual(declared, present, fixture.name);
    assert.equal(declared.includes('manifest.json'), false, 'manifest must not recursively hash itself');
  }
});

test('schema properties and field matrix have exact-set parity with valid dispositions', () => {
  const schemaFields = Object.entries(schemas).flatMap(([name, schema]) => collectSchemaFields(schema, name));
  const normalize = item => `${item.schema}|${item.schemaLocation}|${item.fieldName}|${item.disposition}`;
  assert.ok(schemaFields.every(item => matrix.allowedDispositions.includes(item.disposition)), 'every schema field requires a valid disposition annotation');
  const matrixFields = Object.entries(matrix.fields).map(([key, disposition]) => `${key}|${disposition}`);
  assert.deepEqual(schemaFields.map(normalize).sort(), matrixFields.sort());
});

test('every declared source field has exactly one disposition in positive fixtures', () => {
  for (const fixture of positives) {
    const project = fixture.package.entries['project.json'].content;
    const traces = project.traceFiles.map(item => fixture.package.entries[item.path].content);
    const sourceFields = new Set([...project.provenance.sourceFields, ...traces.flatMap(trace => trace.provenance.sourceFields)]);
    const classified = project.fieldDisposition.map(item => item.sourcePath);
    assert.equal(new Set(classified).size, classified.length, `${fixture.name}: duplicate classification`);
    assert.deepEqual([...sourceFields].sort(), classified.sort(), `${fixture.name}: disposition coverage`);
  }
});

test('validator cannot pass if replaced by always-accept or always-block behavior', () => {
  const valid = validatePackage(positives[0].package, schemas);
  const invalid = validatePackage(negatives[0].package, schemas);
  assert.equal(valid.ok, true, 'valid package proves emit path');
  assert.equal(invalid.ok, false, 'invalid package proves block path');
});

const malformedRecordCases = [
  ['null manifest entry', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.manifest.files.push(null);
    return pkg;
  }],
  ['null project trace record', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.entries['project.json'].content.traceFiles.push(null);
    refreshJsonEntry(pkg, 'project.json');
    return pkg;
  }],
  ['null project asset', () => {
    const pkg = fixturePackage('rich-tonearm-project');
    pkg.entries['project.json'].content.assets.push(null);
    refreshJsonEntry(pkg, 'project.json');
    return pkg;
  }],
  ['null station', () => {
    const pkg = fixturePackage('rich-tonearm-project');
    const tracePath = 'traces/trace-top-rich.json';
    pkg.entries[tracePath].content.geometry.stations.push(null);
    refreshJsonEntry(pkg, tracePath);
    return pkg;
  }],
  ['null contour', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    const tracePath = 'traces/trace-top.json';
    pkg.entries[tracePath].content.geometry.contours.push(null);
    refreshJsonEntry(pkg, tracePath);
    return pkg;
  }],
  ['null field-disposition record', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.entries['project.json'].content.fieldDisposition.push(null);
    refreshJsonEntry(pkg, 'project.json');
    return pkg;
  }],
  ['undefined manifest entry', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.manifest.files.push(undefined);
    return pkg;
  }],
  ['primitive trace record', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.entries['project.json'].content.traceFiles.push(17);
    refreshJsonEntry(pkg, 'project.json');
    return pkg;
  }],
  ['asset record missing path', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.entries['project.json'].content.assets.push({ assetId: 'asset-missing-path' });
    refreshJsonEntry(pkg, 'project.json');
    return pkg;
  }],
  ['primitive station record', () => {
    const pkg = fixturePackage('rich-tonearm-project');
    const tracePath = 'traces/trace-top-rich.json';
    pkg.entries[tracePath].content.geometry.stations.push('not-a-station');
    refreshJsonEntry(pkg, tracePath);
    return pkg;
  }],
  ['contour record missing identity', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    const tracePath = 'traces/trace-top.json';
    pkg.entries[tracePath].content.geometry.contours.push({ role: 'outer_contour' });
    refreshJsonEntry(pkg, tracePath);
    return pkg;
  }],
  ['undefined field-disposition record', () => {
    const pkg = fixturePackage('minimal-top-side-project');
    pkg.entries['project.json'].content.fieldDisposition.push(undefined);
    refreshJsonEntry(pkg, 'project.json');
    return pkg;
  }]
];

for (const [label, createPackage] of malformedRecordCases) test(`malformed records return errors without throwing: ${label}`, () => {
  assertMalformedPackageDoesNotThrow(label, createPackage());
});

const point = (x, y) => ({ x, y });
const node = (x, y) => ({ point: point(x, y), in: null, out: null });
const validGeometryPayloads = {
  polyline: { type: 'polyline', points: [point(0, 0), point(1, 1)] },
  polygon: { type: 'polygon', points: [point(0, 0), point(1, 0), point(0, 1)] },
  line: { type: 'line', points: [point(0, 0), point(1, 1)] },
  bezier_path: { type: 'bezier_path', nodes: [node(0, 0), node(1, 1)] },
  circle: { type: 'circle', center: point(0, 0), radius: 1 },
  rectangle: { type: 'rectangle', x: 0, y: 0, width: 2, height: 1 }
};

for (const [geometryType, payload] of Object.entries(validGeometryPayloads)) test(`geometry payload accepts complete ${geometryType}`, () => {
  assert.deepEqual(validateSchemaValue(payload, schemas.trace.$defs.geometryPayload, schemas.trace), []);
});

const invalidGeometryPayloads = {
  'polyline missing points': { type: 'polyline' },
  'polygon with circle fields instead of points': { type: 'polygon', center: point(0, 0), radius: 1 },
  'line with three points': { type: 'line', points: [point(0, 0), point(1, 1), point(2, 2)] },
  'bezier path with points but no nodes': { type: 'bezier_path', points: [point(0, 0), point(1, 1)] },
  'circle missing center and radius': { type: 'circle' },
  'rectangle missing height': { type: 'rectangle', x: 0, y: 0, width: 2 },
  'circle with an irrelevant points representation': { type: 'circle', center: point(0, 0), radius: 1, points: [point(0, 0), point(1, 1)] }
};

for (const [label, payload] of Object.entries(invalidGeometryPayloads)) test(`geometry payload rejects ${label}`, () => {
  assert.notDeepEqual(validateSchemaValue(payload, schemas.trace.$defs.geometryPayload, schemas.trace), [], label);
});

async function listTextFiles(absolute) {
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...await listTextFiles(child));
    else files.push(child);
  }
  return files;
}

test('changed contract text contains no hidden or bidirectional Unicode controls', async () => {
  const files = [
    ...await listTextFiles(fileURLToPath(new URL('schema/trace-project-package/', repositoryRoot))),
    ...await listTextFiles(fileURLToPath(new URL('tools/manual-trace/test/trace-project-package/', repositoryRoot))),
    fileURLToPath(new URL('.github/workflows/manual-trace-project-package-contract.yml', repositoryRoot))
  ];
  const forbidden = /[\u00A0\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;
  const findings = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(forbidden)) {
      findings.push(`${path.relative(fileURLToPath(repositoryRoot), file)}:${match.index}:U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  assert.deepEqual(findings, []);
});
