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
import test from 'node:test';
import { canonicalJsonBytes, collectSchemaFields, loadSchemas, validatePackage } from './contract-validator.mjs';

const here = new URL('./', import.meta.url);
const schemaDir = new URL('../../../../schema/trace-project-package/', here);
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

test('fixture suite contains both emit and block cases', () => {
  assert.ok(positives.length >= 5, 'at least five positive fixtures required');
  assert.ok(negatives.length >= 14, 'at least fourteen negative fixtures required');
  assert.ok(positives.some(fixture => (fixture.expected.warningClasses || []).length > 0), 'warning/emit fixture required');
});

for (const fixture of positives) test(`positive fixture accepts: ${fixture.name}`, () => {
  assert.equal(digest(fixture.package), fixture.canonicalDigest, 'fixture package digest must be deterministic');
  const result = validatePackage(fixture.package, schemas);
  assert.equal(result.ok, true, JSON.stringify(result,null,2));
  assert.deepEqual([...new Set(result.warnings.map(item => item.warningClass))].sort(), [...fixture.expected.warningClasses].sort());
});

for (const fixture of negatives) test(`negative fixture blocks with ${fixture.expected.errorClass}: ${fixture.name}`, () => {
  assert.equal(digest(fixture.package), fixture.canonicalDigest, 'fixture package digest must be deterministic');
  const result = validatePackage(fixture.package, schemas);
  assert.equal(result.ok, false, 'negative fixture must not be accepted');
  assert.equal(result.errors[0]?.errorClass, fixture.expected.errorClass, JSON.stringify(result,null,2));
});

test('manifest integrity covers every payload entry and excludes only the manifest itself', () => {
  for (const fixture of positives) {
    const declared = fixture.package.manifest.files.map(file => file.path).sort();
    const present = Object.keys(fixture.package.entries).sort();
    assert.deepEqual(declared,present,fixture.name);
    assert.equal(declared.includes('manifest.json'),false,'manifest must not recursively hash itself');
  }
});

test('schema properties and field matrix have exact-set parity with valid dispositions', () => {
  const schemaFields = Object.entries(schemas).flatMap(([name,schema]) => collectSchemaFields(schema,name));
  const normalize = item => `${item.schema}|${item.schemaLocation}|${item.fieldName}|${item.disposition}`;
  assert.ok(schemaFields.every(item => matrix.allowedDispositions.includes(item.disposition)), 'every schema field requires a valid disposition annotation');
  const matrixFields = Object.entries(matrix.fields).map(([key,disposition]) => `${key}|${disposition}`);
  assert.deepEqual(schemaFields.map(normalize).sort(),matrixFields.sort());
});

test('every declared source field has exactly one disposition in positive fixtures', () => {
  for (const fixture of positives) {
    const project = fixture.package.entries['project.json'].content;
    const traces = project.traceFiles.map(item => fixture.package.entries[item.path].content);
    const sourceFields = new Set([...project.provenance.sourceFields,...traces.flatMap(trace => trace.provenance.sourceFields)]);
    const classified = project.fieldDisposition.map(item => item.sourcePath);
    assert.equal(new Set(classified).size,classified.length,`${fixture.name}: duplicate classification`);
    assert.deepEqual([...sourceFields].sort(),classified.sort(),`${fixture.name}: disposition coverage`);
  }
});

test('validator cannot pass if replaced by always-accept or always-block behavior', () => {
  const valid = validatePackage(positives[0].package,schemas);
  const invalid = validatePackage(negatives[0].package,schemas);
  assert.equal(valid.ok,true,'valid package proves emit path');
  assert.equal(invalid.ok,false,'invalid package proves block path');
});
