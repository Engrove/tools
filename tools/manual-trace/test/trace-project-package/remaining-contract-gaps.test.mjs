/**
 * AI-CODING NOTE:
 * Responsibility: Focused regression coverage for manifest self-inventory, canonical trace paths, and mandatory bidirectional asset ownership.
 * Inputs: Existing deterministic positive fixtures and the composed test-only contract validator.
 * Outputs: Stable diagnostic assertions only; no product behavior.
 * Do not: Claim exporter, importer, ZIP runtime, browser, production, or 3D coverage.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJsonBytes, loadSchemas, validatePackage } from './contract-validator.mjs';

const here = new URL('./', import.meta.url);
const schemas = await loadSchemas(new URL('../../../../schema/trace-project-package/', here));
const load = async name => JSON.parse(await readFile(new URL(`positive/${name}.fixture.json`, here), 'utf8')).package;
const minimal = await load('minimal-top-side-project');
const rich = await load('rich-tonearm-project');
const copy = structuredClone;
const project = pkg => pkg.entries['project.json'].content;
const trace = (pkg, path) => pkg.entries[path].content;
const manifestFile = (pkg, path) => pkg.manifest.files.find(item => item?.path === path);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function refreshJson(pkg, path) {
  const bytes = canonicalJsonBytes(pkg.entries[path].content);
  const file = manifestFile(pkg, path);
  assert.ok(file, `${path} must exist in manifest`);
  file.sizeBytes = bytes.length;
  file.sha256 = digest(bytes);
}
function result(pkg) { return validatePackage(pkg, schemas); }
function accepts(label, pkg) {
  const actual = result(pkg);
  assert.equal(actual.ok, true, `${label}: ${JSON.stringify(actual, null, 2)}`);
}
function blocks(label, pkg, errorClass) {
  const actual = result(pkg);
  assert.equal(actual.ok, false, `${label} accepted`);
  assert.ok(actual.errors.some(item => item.errorClass === errorClass), `${label} expected ${errorClass}: ${JSON.stringify(actual, null, 2)}`);
}
function addManifestSelfEntry(pkg, role) {
  const content = { note: 'manifest self-inventory regression probe' };
  const bytes = canonicalJsonBytes(content);
  const identity = ['source_image', 'source_svg', 'sidecar'].includes(role) ? { assetId: `asset-self-${role}` } : {};
  pkg.entries['manifest.json'] = { kind: 'json', content };
  pkg.manifest.files.push({
    path: 'manifest.json',
    mediaType: 'application/json',
    role,
    sha256: digest(bytes),
    sizeBytes: bytes.length,
    ...identity
  });
}
function moveTrace(pkg, from, to) {
  const record = project(pkg).traceFiles.find(item => item.path === from);
  const file = manifestFile(pkg, from);
  assert.ok(record && file && pkg.entries[from], `${from} must form a complete trace chain`);
  pkg.entries[to] = pkg.entries[from];
  delete pkg.entries[from];
  record.path = to;
  file.path = to;
  refreshJson(pkg, 'project.json');
}
function asset(pkg, id) {
  const found = project(pkg).assets.find(item => item.assetId === id);
  assert.ok(found, `asset ${id} must exist`);
  return found;
}

// Manifest inventories payload files, never itself.
test('manifest self-inventory positive: ordinary package omits manifest.json from files', () => accepts('ordinary manifest inventory', copy(minimal)));
for (const role of ['readme', 'project', 'source_image']) {
  test(`manifest self-inventory rejects manifest.json with role ${role}`, () => {
    const pkg = copy(minimal);
    addManifestSelfEntry(pkg, role);
    blocks(`manifest.json as ${role}`, pkg, 'MANIFEST_SELF_INVENTORY');
  });
}

// Trace path is an identity-derived exact path, not an approximate match.
test('canonical trace path positive: trace-top uses traces/trace-top.json', () => {
  const pkg = copy(minimal);
  assert.equal(project(pkg).traceFiles.find(item => item.traceId === 'trace-top').path, 'traces/trace-top.json');
  accepts('canonical trace path', pkg);
});
for (const path of ['trace-top.json', 'trace/trace-top.json', 'traces/subdir/trace-top.json', 'traces/another-identity.json']) {
  test(`canonical trace path rejects ${path}`, () => {
    const pkg = copy(minimal);
    moveTrace(pkg, 'traces/trace-top.json', path);
    blocks(`noncanonical trace path ${path}`, pkg, 'TRACE_PATH_NONCANONICAL');
  });
}

// Every project asset has one or more owners and every association is reciprocal.
test('asset ownership positive: image and SVG have one owner and sidecar is shared by two reciprocal traces', () => {
  const pkg = copy(rich);
  assert.deepEqual(asset(pkg, 'asset-top-image').traceIds, ['trace-top-rich']);
  assert.deepEqual(asset(pkg, 'asset-top-svg').traceIds, ['trace-top-rich']);
  assert.deepEqual(asset(pkg, 'asset-notes').traceIds, ['trace-top-rich', 'trace-side-rich']);
  accepts('bidirectional asset ownership', pkg);
});
test('asset ownership rejects empty traceIds', () => {
  const pkg = copy(rich);
  asset(pkg, 'asset-notes').traceIds = [];
  refreshJson(pkg, 'project.json');
  blocks('empty asset owners', pkg, 'ASSET_TRACE_OWNER_REQUIRED');
});
test('asset ownership rejects unknown owner trace', () => {
  const pkg = copy(rich);
  asset(pkg, 'asset-notes').traceIds = ['trace-unknown'];
  refreshJson(pkg, 'project.json');
  blocks('unknown asset owner', pkg, 'ASSET_TRACE_UNKNOWN');
});
test('asset ownership rejects duplicate owner trace', () => {
  const pkg = copy(rich);
  asset(pkg, 'asset-top-image').traceIds = ['trace-top-rich', 'trace-top-rich'];
  refreshJson(pkg, 'project.json');
  blocks('duplicate asset owner', pkg, 'ASSET_TRACE_ASSOCIATION_MISMATCH');
});
test('asset ownership rejects owner trace without reverse reference', () => {
  const pkg = copy(rich);
  asset(pkg, 'asset-top-image').traceIds = ['trace-top-rich', 'trace-side-rich'];
  refreshJson(pkg, 'project.json');
  blocks('owner lacks reverse reference', pkg, 'ASSET_TRACE_ASSOCIATION_MISMATCH');
});
test('asset ownership rejects trace reference when asset does not name that trace', () => {
  const pkg = copy(rich);
  asset(pkg, 'asset-notes').traceIds = ['trace-top-rich'];
  refreshJson(pkg, 'project.json');
  blocks('trace reference lacks forward ownership', pkg, 'ASSET_TRACE_ASSOCIATION_MISMATCH');
});
test('asset ownership rejects detached sidecar despite complete manifest/project/package inventory', () => {
  const pkg = copy(rich);
  asset(pkg, 'asset-notes').traceIds = [];
  for (const path of ['traces/trace-top-rich.json', 'traces/trace-side-rich.json']) {
    trace(pkg, path).assets.sidecarAssetIds = [];
    refreshJson(pkg, path);
  }
  refreshJson(pkg, 'project.json');
  blocks('detached sidecar', pkg, 'ASSET_TRACE_OWNER_REQUIRED');
});
