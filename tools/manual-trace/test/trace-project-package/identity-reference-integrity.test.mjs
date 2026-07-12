/**
 * AI-CODING NOTE:
 * Responsibility: Matched identity/reference acceptance and rejection coverage for Trace Project Package v1.
 * Inputs: Existing positive fixtures and the composed test-only validator.
 * Outputs: Stable error-class assertions.
 * Do not: Claim ZIP, browser, exporter, importer, or production behavior.
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
const section = await load('section-bound-to-station');
const copy = value => structuredClone(value);
const project = pkg => pkg.entries['project.json'].content;
const trace = (pkg, path) => pkg.entries[path].content;
const mf = (pkg, path) => pkg.manifest.files.find(item => item?.path === path);
function refresh(pkg, path) {
  const bytes = canonicalJsonBytes(pkg.entries[path].content);
  const file = mf(pkg, path);
  file.sizeBytes = bytes.length;
  file.sha256 = createHash('sha256').update(bytes).digest('hex');
}
function result(pkg) { return validatePackage(pkg, schemas); }
function accepts(label, pkg) { const actual = result(pkg); assert.equal(actual.ok, true, `${label}: ${JSON.stringify(actual, null, 2)}`); }
function blocks(label, pkg, errorClass) {
  const actual = result(pkg);
  assert.equal(actual.ok, false, `${label} accepted`);
  assert.ok(actual.errors.some(item => item.errorClass === errorClass), `${label} expected ${errorClass}: ${JSON.stringify(actual, null, 2)}`);
}
const datum = id => ({ datumId: id, name: id, kind: 'point', definition: 'fixture datum', references: [], geometricUse: 'used_for_geometry' });
const relation = (id, sourceId, targetId) => ({ relationId: id, type: 'aligned_with', sourceId, targetId, description: id, usedForGeometry: true });
const station = (id, xMm = 40, usage = 'datum') => ({ stationId: id, name: id, index: 0, orientation: { engineeringAxis: 'X', direction: 1, meaning: 'shared station' }, definition: { viewAxis: 'u', valuePx: 80 }, engineeringPosition: { xMm, derived: false, derivation: 'fixture' }, references: [], usage, geometricUse: 'used_for_geometry' });
const reference = (id, sourceId, targetId) => ({ referenceId: id, type: 'aligned_with', sourceId, targetId, description: id });

test('trace identity positive: two unique trace chains agree', () => accepts('trace chain', copy(minimal)));
test('asset identity positive: one asset associates with multiple valid traces', () => accepts('multi-trace asset', copy(rich)));
test('project datum/reference positive: origin, direction, and reference resolve', () => {
  const pkg = copy(minimal); project(pkg).object.engineeringFrame.references.push(reference('ref-ok', 'datum-stylus', 'datum-pivot')); refresh(pkg, 'project.json'); accepts('project reference', pkg);
});
test('trace-local positive: unique contour, datum, relation and reference resolve', () => {
  const pkg = copy(minimal); const top = trace(pkg, 'traces/trace-top.json'); top.geometry.datums.push(datum('local-center')); top.geometry.relations.push(relation('rel-center', top.geometry.primaryContourId, 'local-center')); top.geometry.contours[0].references.push('rel-center'); refresh(pkg, 'traces/trace-top.json'); accepts('local registry', pkg);
});
test('trace-local IDs may repeat in another trace without implicit cross-trace resolution', () => {
  const pkg = copy(minimal); trace(pkg, 'traces/trace-top.json').geometry.datums.push(datum('local-reused')); trace(pkg, 'traces/trace-side.json').geometry.datums.push(datum('local-reused')); refresh(pkg, 'traces/trace-top.json'); refresh(pkg, 'traces/trace-side.json'); accepts('local reuse', pkg);
});
test('station positive: same physical station is consistent across top and side', () => {
  const pkg = copy(minimal); trace(pkg, 'traces/trace-top.json').geometry.stations.push(station('station-shared')); trace(pkg, 'traces/trace-side.json').geometry.stations.push(station('station-shared')); refresh(pkg, 'traces/trace-top.json'); refresh(pkg, 'traces/trace-side.json'); accepts('station consistency', pkg);
});

const cases = [
  ['project/document traceId mismatch', 'TRACE_ID_MISMATCH', minimal, pkg => { trace(pkg, 'traces/trace-top.json').traceId = 'trace-other'; refresh(pkg, 'traces/trace-top.json'); }],
  ['manifest/project traceId mismatch', 'MANIFEST_TRACE_ID_MISMATCH', minimal, pkg => { mf(pkg, 'traces/trace-top.json').traceId = 'trace-other'; }],
  ['missing manifest traceId', 'MANIFEST_TRACE_ID_MISSING', minimal, pkg => { delete mf(pkg, 'traces/trace-top.json').traceId; }],
  ['duplicate traceId', 'TRACE_ID_DUPLICATE', minimal, pkg => { project(pkg).traceFiles[1].traceId = project(pkg).traceFiles[0].traceId; refresh(pkg, 'project.json'); }],
  ['duplicate trace path', 'TRACE_PATH_DUPLICATE', minimal, pkg => { project(pkg).traceFiles[1].path = project(pkg).traceFiles[0].path; refresh(pkg, 'project.json'); }],
  ['trace manifest role mismatch', 'TRACE_MANIFEST_ENTRY_MISSING', minimal, pkg => { mf(pkg, 'traces/trace-top.json').role = 'sidecar'; mf(pkg, 'traces/trace-top.json').assetId = 'asset-wrong-role'; }],
  ['trace object mismatch', 'TRACE_OBJECT_MISMATCH', minimal, pkg => { trace(pkg, 'traces/trace-side.json').objectId = 'object-other'; refresh(pkg, 'traces/trace-side.json'); }],
  ['trace geometric use mismatch', 'TRACE_GEOMETRIC_USE_MISMATCH', minimal, pkg => { project(pkg).traceFiles[0].geometricUse = 'preserved_as_provenance'; refresh(pkg, 'project.json'); }],
  ['duplicate assetId', 'ASSET_ID_DUPLICATE', rich, pkg => { project(pkg).assets[1].assetId = project(pkg).assets[0].assetId; refresh(pkg, 'project.json'); }],
  ['unknown asset traceId', 'ASSET_TRACE_UNKNOWN', rich, pkg => { project(pkg).assets[0].traceIds.push('trace-unknown'); refresh(pkg, 'project.json'); }],
  ['manifest/project assetId mismatch', 'MANIFEST_ASSET_ID_MISMATCH', rich, pkg => { mf(pkg, 'assets/images/top.png').assetId = 'asset-other'; }],
  ['missing manifest assetId', 'MANIFEST_ASSET_ID_MISSING', rich, pkg => { delete mf(pkg, 'assets/images/top.png').assetId; }],
  ['trace unknown asset', 'ASSET_REFERENCE_UNKNOWN', minimal, pkg => { trace(pkg, 'traces/trace-top.json').assets.sidecarAssetIds.push('asset-unknown'); refresh(pkg, 'traces/trace-top.json'); }],
  ['asset path conflicting identities', 'ASSET_PATH_DUPLICATE', rich, pkg => { const other = copy(project(pkg).assets[0]); other.assetId = 'asset-path-other'; project(pkg).assets.push(other); refresh(pkg, 'project.json'); }],
  ['asset manifest role conflict', 'ASSET_ROLE_MISMATCH', rich, pkg => { mf(pkg, 'assets/images/top.png').role = 'source_svg'; }],
  ['duplicate project datumId', 'DATUM_ID_DUPLICATE', minimal, pkg => { project(pkg).object.engineeringFrame.datums[1].datumId = 'datum-stylus'; refresh(pkg, 'project.json'); }],
  ['unknown origin datum', 'DATUM_REFERENCE_UNKNOWN', minimal, pkg => { project(pkg).object.engineeringFrame.origin.datumId = 'datum-unknown'; refresh(pkg, 'project.json'); }],
  ['unknown direction datum', 'DATUM_REFERENCE_UNKNOWN', minimal, pkg => { project(pkg).object.engineeringFrame.objectDirection.toDatum = 'datum-unknown'; refresh(pkg, 'project.json'); }],
  ['identical direction endpoints', 'OBJECT_DIRECTION_INVALID', minimal, pkg => { project(pkg).object.engineeringFrame.objectDirection.toDatum = 'datum-stylus'; refresh(pkg, 'project.json'); }],
  ['duplicate project referenceId', 'REFERENCE_ID_DUPLICATE', minimal, pkg => { const refs = project(pkg).object.engineeringFrame.references; refs.push(reference('ref-dup', 'datum-stylus', 'datum-pivot'), reference('ref-dup', 'datum-pivot', 'datum-stylus')); refresh(pkg, 'project.json'); }],
  ['unknown project reference target', 'REFERENCE_TARGET_UNKNOWN', minimal, pkg => { project(pkg).object.engineeringFrame.references.push(reference('ref-unknown', 'datum-stylus', 'unknown')); refresh(pkg, 'project.json'); }],
  ['ambiguous project reference target', 'REFERENCE_TARGET_AMBIGUOUS', minimal, pkg => { project(pkg).object.engineeringFrame.datums.push(copy(project(pkg).object.engineeringFrame.datums[0])); project(pkg).object.engineeringFrame.references.push(reference('ref-ambiguous', 'datum-pivot', 'datum-stylus')); refresh(pkg, 'project.json'); }],
  ['duplicate contourId', 'CONTOUR_ID_DUPLICATE', minimal, pkg => { const top = trace(pkg, 'traces/trace-top.json'); const duplicate = copy(top.geometry.contours[0]); duplicate.status = 'secondary'; top.geometry.contours.push(duplicate); refresh(pkg, 'traces/trace-top.json'); }],
  ['duplicate trace datumId', 'TRACE_DATUM_ID_DUPLICATE', minimal, pkg => { const top = trace(pkg, 'traces/trace-top.json'); top.geometry.datums.push(datum('local-dup'), datum('local-dup')); refresh(pkg, 'traces/trace-top.json'); }],
  ['duplicate relationId', 'RELATION_ID_DUPLICATE', minimal, pkg => { const top = trace(pkg, 'traces/trace-top.json'); top.geometry.relations.push(relation('rel-dup', top.geometry.primaryContourId, 'datum-stylus'), relation('rel-dup', top.geometry.primaryContourId, 'datum-pivot')); refresh(pkg, 'traces/trace-top.json'); }],
  ['unknown primary contour', 'PRIMARY_CONTOUR_UNKNOWN', minimal, pkg => { trace(pkg, 'traces/trace-top.json').geometry.primaryContourId = 'contour-unknown'; refresh(pkg, 'traces/trace-top.json'); }],
  ['unknown relation target', 'REFERENCE_UNKNOWN', minimal, pkg => { const top = trace(pkg, 'traces/trace-top.json'); top.geometry.relations.push(relation('rel-unknown', top.geometry.primaryContourId, 'unknown')); refresh(pkg, 'traces/trace-top.json'); }],
  ['ambiguous bare reference', 'REFERENCE_AMBIGUOUS', minimal, pkg => { const top = trace(pkg, 'traces/trace-top.json'); top.geometry.datums.push(datum(top.geometry.primaryContourId)); top.geometry.contours[0].references.push(top.geometry.primaryContourId); refresh(pkg, 'traces/trace-top.json'); }],
  ['duplicate stationId in one trace', 'STATION_ID_DUPLICATE', minimal, pkg => { const list = trace(pkg, 'traces/trace-top.json').geometry.stations; list.push(station('station-dup'), station('station-dup')); refresh(pkg, 'traces/trace-top.json'); }],
  ['station cross-trace position conflict', 'STATION_ID_CONFLICT', minimal, pkg => { trace(pkg, 'traces/trace-top.json').geometry.stations.push(station('station-conflict', 40)); trace(pkg, 'traces/trace-side.json').geometry.stations.push(station('station-conflict', 41)); refresh(pkg, 'traces/trace-top.json'); refresh(pkg, 'traces/trace-side.json'); }],
  ['station cross-trace usage conflict', 'STATION_ID_CONFLICT', minimal, pkg => { trace(pkg, 'traces/trace-top.json').geometry.stations.push(station('station-conflict', 40, 'datum')); trace(pkg, 'traces/trace-side.json').geometry.stations.push(station('station-conflict', 40, 'annotation')); refresh(pkg, 'traces/trace-top.json'); refresh(pkg, 'traces/trace-side.json'); }],
  ['section binding unknown station', 'SECTION_STATION_UNKNOWN', section, pkg => { const item = project(pkg).traceFiles.find(file => trace(pkg, file.path).view.viewType === 'section'); trace(pkg, item.path).view.sectionBinding.stationId = 'station-unknown'; refresh(pkg, item.path); }],
  ['section binding conflicting station', 'STATION_ID_CONFLICT', rich, pkg => { trace(pkg, 'traces/trace-section-030.json').geometry.stations.push({ ...station('station-030', 31, 'longitudinal_loft_station'), orientation: { engineeringAxis: 'Y', direction: 1, meaning: 'section station' } }); refresh(pkg, 'traces/trace-section-030.json'); }]
];
for (const [label, errorClass, baseline, mutate] of cases) test(`identity/reference blocks ${label} with ${errorClass}`, () => { const pkg = copy(baseline); mutate(pkg); blocks(label, pkg, errorClass); });

test('EIC probe confirms all ten originally ambiguous chains now block by intended class', () => {
  const expected = ['TRACE_ID_MISMATCH', 'MANIFEST_TRACE_ID_MISMATCH', 'TRACE_ID_DUPLICATE', 'TRACE_PATH_DUPLICATE', 'CONTOUR_ID_DUPLICATE', 'DATUM_ID_DUPLICATE', 'ASSET_TRACE_UNKNOWN', 'MANIFEST_ASSET_ID_MISMATCH', 'TRACE_MANIFEST_ENTRY_MISSING', 'ASSET_ROLE_MISMATCH'];
  const selected = [cases[0], cases[1], cases[3], cases[4], cases[22], cases[15], cases[9], cases[10], cases[5], cases[14]];
  selected.forEach(([label, errorClass, baseline, mutate], index) => { const pkg = copy(baseline); mutate(pkg); blocks(label, pkg, expected[index]); assert.equal(errorClass, expected[index]); });
});
