/**
 * AI-CODING NOTE:
 * Responsibility: Final matched closure coverage for bidirectional inventories, order-independent stations, view origins, binding methods, and engineering frames.
 * Inputs: Existing positive fixtures and the composed test-only contract validator.
 * Outputs: Stable error-class and permutation-invariance assertions.
 * Do not: Claim exporter, importer, ZIP runtime, browser, production, or 3D behavior.
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
const copy = structuredClone;
const project = pkg => pkg.entries['project.json'].content;
const trace = (pkg, path) => pkg.entries[path].content;
const mf = (pkg, path) => pkg.manifest.files.find(item => item?.path === path);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function refresh(pkg, path) {
  const bytes = canonicalJsonBytes(pkg.entries[path].content);
  const file = mf(pkg, path);
  assert.ok(file, `${path} must exist in manifest`);
  file.sizeBytes = bytes.length;
  file.sha256 = digest(bytes);
}
function addJsonEntry(pkg, path, role, content, identity = {}) {
  const bytes = canonicalJsonBytes(content);
  pkg.entries[path] = { kind: 'json', content };
  pkg.manifest.files.push({ path, mediaType: 'application/json', role, sha256: digest(bytes), sizeBytes: bytes.length, ...identity });
}
function addTextEntry(pkg, path, role, content, identity = {}) {
  const bytes = Buffer.from(content, 'utf8');
  pkg.entries[path] = { kind: 'text', content };
  pkg.manifest.files.push({ path, mediaType: 'text/plain', role, sha256: digest(bytes), sizeBytes: bytes.length, ...identity });
}
function result(pkg) { return validatePackage(pkg, schemas); }
function classes(pkg) { return [...new Set(result(pkg).errors.map(item => item.errorClass))].sort(); }
function accepts(label, pkg) { const actual = result(pkg); assert.equal(actual.ok, true, `${label}: ${JSON.stringify(actual, null, 2)}`); }
function blocks(label, pkg, errorClass) {
  const actual = result(pkg);
  assert.equal(actual.ok, false, `${label} accepted`);
  assert.ok(actual.errors.some(item => item.errorClass === errorClass), `${label} expected ${errorClass}: ${JSON.stringify(actual, null, 2)}`);
}
function station(id, xMm, usage = 'longitudinal_loft_station') {
  return {
    stationId: id,
    name: id,
    index: 0,
    orientation: { engineeringAxis: 'X', direction: 1, meaning: 'longitudinal station' },
    definition: { viewAxis: 'u', valuePx: xMm * 2 },
    engineeringPosition: { xMm, derived: false, derivation: 'closure fixture' },
    references: [],
    usage,
    geometricUse: 'used_for_geometry'
  };
}
function reorderInventories(pkg, order, reverseManifest = false) {
  const rank = new Map(order.map((path, index) => [path, index]));
  project(pkg).traceFiles.sort((a, b) => rank.get(a.path) - rank.get(b.path));
  const other = pkg.manifest.files.filter(file => file.role !== 'trace');
  const traces = pkg.manifest.files.filter(file => file.role === 'trace').sort((a, b) => rank.get(a.path) - rank.get(b.path));
  if (reverseManifest) traces.reverse();
  pkg.manifest.files = [...other, ...traces];
  refresh(pkg, 'project.json');
}
function addThirdTrace(pkg) {
  const sourcePath = 'traces/trace-top.json';
  const path = 'traces/trace-third.json';
  const document = copy(trace(pkg, sourcePath));
  document.traceId = 'trace-third';
  document.geometry.primaryContourId = 'trace-third-outer';
  document.geometry.contours[0].contourId = 'trace-third-outer';
  document.provenance.sourceFileName = 'trace-third.json';
  document.provenance.semanticNames = ['trace-third'];
  document.provenance.sourceFields = ['traces.trace-third.geometry', 'traces.trace-third.view'];
  addJsonEntry(pkg, path, 'trace', document, { traceId: 'trace-third' });
  project(pkg).traceFiles.push({ traceId: 'trace-third', objectId: project(pkg).object.objectId, path, geometricUse: 'used_for_geometry' });
  project(pkg).provenance.sourceFields.push(...document.provenance.sourceFields);
  project(pkg).fieldDisposition.push(
    { sourcePath: 'traces.trace-third.geometry', status: 'used_for_geometry', reason: 'closure fixture', targetPath: 'normalizedObject.geometry' },
    { sourcePath: 'traces.trace-third.view', status: 'preserved_as_provenance', reason: 'closure fixture' }
  );
  return path;
}
function stationPermutationPackage({ positions, usages = {}, order, reverseManifest = false, reverseStations = false }) {
  const pkg = copy(minimal);
  const paths = ['traces/trace-top.json', 'traces/trace-side.json', addThirdTrace(pkg)];
  paths.forEach((path, index) => {
    const document = trace(pkg, path);
    document.calibration.toleranceMm = 1.1;
    document.geometry.stations.push(station(`station-decoy-${index}`, 100 + index));
    document.geometry.stations.push(station('station-shared', positions[index], usages[index] || 'longitudinal_loft_station'));
    if (reverseStations) document.geometry.stations.reverse();
    refresh(pkg, path);
  });
  reorderInventories(pkg, order || paths, reverseManifest);
  return pkg;
}
function addSecondStationTrace(pkg, conflict = false, reverseStations = false) {
  const sourcePath = 'traces/trace-top-station.json';
  const path = 'traces/trace-top-station-2.json';
  const document = copy(trace(pkg, sourcePath));
  document.traceId = 'trace-top-station-2';
  document.geometry.primaryContourId = 'trace-top-station-2-outer';
  document.geometry.contours[0].contourId = 'trace-top-station-2-outer';
  document.geometry.stations[0].engineeringPosition.xMm = conflict ? 31 : 30;
  document.geometry.stations.push({ ...station('station-decoy-binding', 90), orientation: { engineeringAxis: 'Y', direction: 1, meaning: 'decoy' } });
  if (reverseStations) document.geometry.stations.reverse();
  document.provenance.sourceFileName = 'trace-top-station-2.json';
  document.provenance.semanticNames = ['trace-top-station-2'];
  document.provenance.sourceFields = ['traces.trace-top-station-2.geometry', 'traces.trace-top-station-2.view'];
  addJsonEntry(pkg, path, 'trace', document, { traceId: document.traceId });
  project(pkg).traceFiles.push({ traceId: document.traceId, objectId: project(pkg).object.objectId, path, geometricUse: 'used_for_geometry' });
  project(pkg).provenance.sourceFields.push(...document.provenance.sourceFields);
  project(pkg).fieldDisposition.push(
    { sourcePath: 'traces.trace-top-station-2.geometry', status: 'used_for_geometry', reason: 'closure fixture', targetPath: 'normalizedObject.geometry' },
    { sourcePath: 'traces.trace-top-station-2.view', status: 'preserved_as_provenance', reason: 'closure fixture' }
  );
  return path;
}
function bindingPermutationPackage({ conflict = false, order, reverseManifest = false, reverseStations = false }) {
  const pkg = copy(section);
  const added = addSecondStationTrace(pkg, conflict, reverseStations);
  const sectionRecord = project(pkg).traceFiles.find(item => trace(pkg, item.path).view.viewType === 'section');
  trace(pkg, sectionRecord.path).view.sectionBinding.xMm = 30;
  refresh(pkg, sectionRecord.path);
  const paths = project(pkg).traceFiles.map(item => item.path);
  reorderInventories(pkg, order || [added, ...paths.filter(path => path !== added)], reverseManifest);
  return pkg;
}
function setBasis(pkg, x, y, z) {
  const axes = project(pkg).object.engineeringFrame.axes;
  axes.x.unitVector = x;
  axes.y.unitVector = y;
  axes.z.unitVector = z;
  refresh(pkg, 'project.json');
}

// Bidirectional inventories and explicit readme policy.
test('inventory positive: every trace and asset participates in a complete bidirectional chain', () => accepts('complete inventories', copy(rich)));
test('readme positive: manifest-only readme carries no identity and is absent from project assets', () => {
  const pkg = copy(rich);
  const readme = pkg.manifest.files.find(file => file.role === 'readme');
  assert.ok(readme);
  assert.equal(readme.traceId, undefined);
  assert.equal(readme.assetId, undefined);
  assert.equal(project(pkg).assets.some(asset => asset.path === readme.path), false);
  accepts('manifest-only readme', pkg);
});
test('inventory blocks orphan manifest trace', () => {
  const pkg = copy(minimal); const document = copy(trace(pkg, 'traces/trace-top.json')); document.traceId = 'trace-orphan';
  addJsonEntry(pkg, 'traces/trace-orphan.json', 'trace', document, { traceId: document.traceId });
  blocks('orphan manifest trace', pkg, 'ORPHAN_MANIFEST_TRACE');
});
test('inventory blocks orphan trace package entry', () => {
  const pkg = copy(minimal); const document = copy(trace(pkg, 'traces/trace-top.json')); document.traceId = 'trace-unlisted';
  pkg.entries['traces/trace-unlisted.json'] = { kind: 'json', content: document };
  blocks('orphan trace entry', pkg, 'ORPHAN_TRACE_ENTRY');
  blocks('undeclared trace document', pkg, 'TRACE_DOCUMENT_UNDECLARED');
});
test('inventory blocks orphan manifest asset', () => {
  const pkg = copy(minimal); addTextEntry(pkg, 'assets/notes/orphan.txt', 'sidecar', 'orphan\n', { assetId: 'asset-orphan' });
  blocks('orphan manifest asset', pkg, 'ORPHAN_MANIFEST_ASSET');
});
test('inventory blocks orphan asset package entry', () => {
  const pkg = copy(minimal); pkg.entries['assets/notes/unlisted.txt'] = { kind: 'text', content: 'unlisted\n' };
  blocks('orphan asset entry', pkg, 'ORPHAN_ASSET_ENTRY');
});
test('readme rejects traceId and assetId', () => {
  const pkg = copy(rich); const readme = pkg.manifest.files.find(file => file.role === 'readme'); readme.assetId = 'asset-readme';
  blocks('readme identity', pkg, 'README_IDENTITY_FORBIDDEN');
});
test('reverse inventory blocks multiple project trace claims', () => {
  const pkg = copy(minimal); const duplicate = copy(project(pkg).traceFiles[0]); duplicate.traceId = 'trace-duplicate-claim'; project(pkg).traceFiles.push(duplicate); refresh(pkg, 'project.json');
  blocks('duplicate reverse trace claim', pkg, 'TRACE_INVENTORY_MISMATCH');
});
test('reverse inventory blocks multiple project asset claims', () => {
  const pkg = copy(rich); const duplicate = copy(project(pkg).assets[0]); duplicate.assetId = 'asset-duplicate-claim'; project(pkg).assets.push(duplicate); refresh(pkg, 'project.json');
  blocks('duplicate reverse asset claim', pkg, 'ASSET_INVENTORY_MISMATCH');
});

// Station order independence and complete-group tolerance semantics.
const traceOrders = [
  ['traces/trace-top.json', 'traces/trace-side.json', 'traces/trace-third.json'],
  ['traces/trace-side.json', 'traces/trace-third.json', 'traces/trace-top.json'],
  ['traces/trace-third.json', 'traces/trace-top.json', 'traces/trace-side.json']
];
test('station consistent group is accepted in every inventory and occurrence permutation', () => {
  traceOrders.forEach((order, index) => accepts(`station valid permutation ${index}`, stationPermutationPackage({ positions: [0, 0.5, 1], order, reverseManifest: index % 2 === 1, reverseStations: index % 2 === 0 })));
});
test('station non-transitive tolerance group is blocked in every permutation', () => {
  const observed = traceOrders.map((order, index) => classes(stationPermutationPackage({ positions: [0, 1, 2], order, reverseManifest: index % 2 === 1, reverseStations: index % 2 === 0 })));
  observed.forEach(list => assert.ok(list.includes('STATION_ID_CONFLICT'), JSON.stringify(observed)));
  assert.deepEqual(observed.map(list => list.filter(item => item === 'STATION_ID_CONFLICT')), observed.map(() => ['STATION_ID_CONFLICT']));
});
test('station usage conflict is blocked in every permutation', () => {
  traceOrders.forEach((order, index) => blocks(`station usage permutation ${index}`, stationPermutationPackage({ positions: [10, 10, 10], usages: { 1: 'annotation' }, order, reverseManifest: index % 2 === 0, reverseStations: index % 2 === 1 }), 'STATION_ID_CONFLICT'));
});
test('section binding verdict is invariant across trace, manifest, and station order', () => {
  const valid = traceOrders.map((_, index) => bindingPermutationPackage({ reverseManifest: index % 2 === 0, reverseStations: index % 2 === 1 }));
  valid.forEach((pkg, index) => accepts(`binding valid permutation ${index}`, pkg));
  const invalidClasses = traceOrders.map((_, index) => classes(bindingPermutationPackage({ conflict: true, reverseManifest: index % 2 === 1, reverseStations: index % 2 === 0 })));
  invalidClasses.forEach(list => assert.ok(list.includes('STATION_ID_CONFLICT'), JSON.stringify(invalidClasses)));
});

// View-frame datum resolution.
test('view origin positive: multiple traces resolve the same project datum', () => accepts('shared project origin datum', copy(minimal)));
test('view origin rejects unknown project datum', () => {
  const pkg = copy(minimal); trace(pkg, 'traces/trace-top.json').view.viewFrame.engineeringOriginDatumId = 'datum-unknown'; refresh(pkg, 'traces/trace-top.json');
  blocks('unknown view origin', pkg, 'VIEW_ORIGIN_DATUM_UNKNOWN');
});
test('view origin rejects ambiguous project datum', () => {
  const pkg = copy(minimal); project(pkg).object.engineeringFrame.datums.push(copy(project(pkg).object.engineeringFrame.datums[0])); refresh(pkg, 'project.json');
  blocks('ambiguous view origin', pkg, 'VIEW_ORIGIN_DATUM_AMBIGUOUS');
});
test('view origin does not resolve a trace-local datum as project datum', () => {
  const pkg = copy(minimal); const top = trace(pkg, 'traces/trace-top.json'); top.geometry.datums.push({ datumId: 'datum-local-only', name: 'local', kind: 'point', definition: 'local', references: [], geometricUse: 'used_for_geometry' }); top.view.viewFrame.engineeringOriginDatumId = 'datum-local-only'; refresh(pkg, 'traces/trace-top.json');
  blocks('trace-local origin', pkg, 'VIEW_ORIGIN_DATUM_UNKNOWN');
});

// Strict section-binding method ownership.
test('binding explicit_station accepts stationId only', () => accepts('explicit_station stationId', copy(section)));
test('binding explicit_station accepts matching stationId and xMm', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); trace(pkg, item.path).view.sectionBinding.xMm = 30; refresh(pkg, item.path); accepts('explicit_station with x', pkg);
});
test('binding explicit_station rejects xMm without stationId', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); const binding = trace(pkg, item.path).view.sectionBinding; delete binding.stationId; binding.xMm = 30; refresh(pkg, item.path); blocks('explicit_station missing stationId', pkg, 'SECTION_BINDING_METHOD_INVALID');
});
test('binding explicit_x accepts xMm without stationId', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); const binding = trace(pkg, item.path).view.sectionBinding; binding.bindingMethod = 'explicit_x'; binding.xMm = 30; delete binding.stationId; refresh(pkg, item.path); accepts('explicit_x', pkg);
});
test('binding explicit_x rejects stationId without xMm', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); const binding = trace(pkg, item.path).view.sectionBinding; binding.bindingMethod = 'explicit_x'; delete binding.xMm; refresh(pkg, item.path); blocks('explicit_x station-only', pkg, 'SECTION_BINDING_METHOD_INVALID');
});
test('binding explicit_x rejects contradictory stationId plus xMm', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); const binding = trace(pkg, item.path).view.sectionBinding; binding.bindingMethod = 'explicit_x'; binding.xMm = 30; refresh(pkg, item.path); blocks('explicit_x extra station', pkg, 'SECTION_BINDING_METHOD_INVALID');
});
test('binding explicit_station rejects contradictory station and x position', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); trace(pkg, item.path).view.sectionBinding.xMm = 40; refresh(pkg, item.path); blocks('station x conflict', pkg, 'STATION_ID_CONFLICT');
});
test('binding derived_station is outside v1', () => {
  const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); trace(pkg, item.path).view.sectionBinding.bindingMethod = 'derived_station'; refresh(pkg, item.path); blocks('derived station', pkg, 'SECTION_BINDING_METHOD_INVALID');
});

// Engineering coordinate frame.
test('engineering frame accepts canonical right-handed orthonormal basis', () => accepts('canonical basis', copy(minimal)));
test('engineering frame accepts rotated right-handed orthonormal basis', () => {
  const pkg = copy(minimal); setBasis(pkg, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }); accepts('rotated basis', pkg);
});
test('engineering frame rejects zero-length axis', () => {
  const pkg = copy(minimal); setBasis(pkg, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }); blocks('zero axis', pkg, 'ENGINEERING_FRAME_DEGENERATE');
});
test('engineering frame rejects non-unit axis', () => {
  const pkg = copy(minimal); setBasis(pkg, { x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }); blocks('non-unit axis', pkg, 'ENGINEERING_FRAME_NON_UNIT');
});
test('engineering frame rejects parallel axes', () => {
  const pkg = copy(minimal); setBasis(pkg, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }); blocks('parallel axes', pkg, 'ENGINEERING_FRAME_DEGENERATE');
});
test('engineering frame rejects non-orthogonal unit axes', () => {
  const pkg = copy(minimal); setBasis(pkg, { x: 1, y: 0, z: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, { x: 0, y: 0, z: 1 }); blocks('non-orthogonal axes', pkg, 'ENGINEERING_FRAME_NON_ORTHOGONAL');
});
test('engineering frame rejects left-handed basis declared right-handed', () => {
  const pkg = copy(minimal); setBasis(pkg, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }); blocks('left-handed basis', pkg, 'ENGINEERING_FRAME_HANDEDNESS');
});
test('engineering frame rejects non-finite origin and datum coordinates', () => {
  const pkg = copy(minimal); project(pkg).object.engineeringFrame.origin.xMm = Number.NaN; project(pkg).object.engineeringFrame.datums[0].positionMm.z = Number.POSITIVE_INFINITY; refresh(pkg, 'project.json'); blocks('non-finite coordinates', pkg, 'ENGINEERING_COORDINATE_INVALID');
});

// Exact eight-case closure probe.
test('EIC final closure probe blocks all eight previously accepted cases', () => {
  const probes = [];
  {
    const pkg = copy(minimal); const document = copy(trace(pkg, 'traces/trace-top.json')); document.traceId = 'trace-orphan-probe'; addJsonEntry(pkg, 'traces/trace-orphan-probe.json', 'trace', document, { traceId: document.traceId }); probes.push(['ORPHAN_MANIFEST_TRACE', pkg]);
  }
  {
    const pkg = copy(minimal); addTextEntry(pkg, 'assets/notes/orphan-probe.txt', 'sidecar', 'orphan\n', { assetId: 'asset-orphan-probe' }); probes.push(['ORPHAN_MANIFEST_ASSET', pkg]);
  }
  probes.push(['STATION_ID_CONFLICT', stationPermutationPackage({ positions: [0, 1, 2], order: traceOrders[1] })]);
  {
    const pkg = copy(minimal); trace(pkg, 'traces/trace-top.json').view.viewFrame.engineeringOriginDatumId = 'datum-unknown-probe'; refresh(pkg, 'traces/trace-top.json'); probes.push(['VIEW_ORIGIN_DATUM_UNKNOWN', pkg]);
  }
  {
    const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); const binding = trace(pkg, item.path).view.sectionBinding; delete binding.stationId; binding.xMm = 30; refresh(pkg, item.path); probes.push(['SECTION_BINDING_METHOD_INVALID', pkg]);
  }
  {
    const pkg = copy(section); const item = project(pkg).traceFiles.find(record => trace(pkg, record.path).view.viewType === 'section'); const binding = trace(pkg, item.path).view.sectionBinding; binding.bindingMethod = 'explicit_x'; delete binding.xMm; refresh(pkg, item.path); probes.push(['SECTION_BINDING_METHOD_INVALID', pkg]);
  }
  {
    const pkg = copy(minimal); setBasis(pkg, { x: 1, y: 0, z: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, { x: 0, y: 0, z: 1 }); probes.push(['ENGINEERING_FRAME_NON_ORTHOGONAL', pkg]);
  }
  {
    const pkg = copy(minimal); setBasis(pkg, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }); probes.push(['ENGINEERING_FRAME_HANDEDNESS', pkg]);
  }
  probes.forEach(([errorClass, pkg], index) => blocks(`closure probe ${index + 1}`, pkg, errorClass));
});
