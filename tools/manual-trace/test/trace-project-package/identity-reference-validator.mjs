/**
 * AI-CODING NOTE:
 * Responsibility: Semantic identity, exact-reference, and cross-view station checks for the test-only package validator.
 * Inputs: A structurally guarded virtual package fixture.
 * Outputs: Deterministically ordered contract diagnostics.
 * Do not: Use as production package handling or resolve by array order/first match.
 */
const ASSET_ROLES = new Set(['source_image', 'source_svg', 'sidecar', 'readme']);
const rec = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const err = (errorClass, message, path) => ({ errorClass, message, path });

function records(value, path, fields, errors) {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.forEach((record, index) => {
    const itemPath = `${path}[${index}]`;
    if (!rec(record) || fields.some(field => typeof record[field] !== 'string' || !record[field])) return;
    out.push({ record, index, path: itemPath });
  });
  return out;
}
function index(items, key) {
  const map = new Map();
  for (const item of items) {
    const id = key(item.record);
    if (typeof id !== 'string' || !id) continue;
    const matches = map.get(id) || [];
    matches.push(item);
    map.set(id, matches);
  }
  return map;
}
function duplicates(map, errorClass, label, errors) {
  for (const [id, items] of map) for (let i = 1; i < items.length; i += 1) {
    errors.push(err(errorClass, `${label} ${id} duplicates ${items[0].path}`, items[i].path));
  }
}
function resolve(map, id, path, label, unknownClass, ambiguousClass, errors) {
  const matches = typeof id === 'string' ? map.get(id) || [] : [];
  if (!matches.length) {
    errors.push(err(unknownClass, `${label} ${String(id)} does not resolve`, path));
    return null;
  }
  if (matches.length !== 1) {
    errors.push(err(ambiguousClass, `${label} ${id} resolves ${matches.length} times`, path));
    return null;
  }
  return matches[0];
}
function target(map, id, kind, path, record) {
  if (typeof id !== 'string' || !id) return;
  const matches = map.get(id) || [];
  matches.push({ id, kind, path, record });
  map.set(id, matches);
}
function referenceList(values, registry, path, errors) {
  if (!Array.isArray(values)) return;
  values.forEach((id, index) => {
    if (typeof id === 'string' && id) resolve(registry, id, `${path}[${index}]`, 'reference', 'REFERENCE_UNKNOWN', 'REFERENCE_AMBIGUOUS', errors);
  });
}
function globalCollision(registry, id, kind, path, errors) {
  if (typeof id !== 'string' || !id) return;
  const found = registry.get(id) || [];
  if (found.length && !found.some(item => item.kind === kind)) errors.push(err('PACKAGE_ID_DUPLICATE', `${kind} ${id} conflicts with ${found[0].kind} at ${found[0].path}`, path));
  found.push({ kind, path });
  registry.set(id, found);
}
function tolerance(trace) {
  return Number.isFinite(trace?.calibration?.toleranceMm) ? Math.max(0, trace.calibration.toleranceMm) : 1e-9;
}
function stationDifference(a, b, allowed) {
  if (a.orientation?.engineeringAxis !== b.orientation?.engineeringAxis) return 'engineering axis';
  if (Number.isFinite(a.engineeringPosition?.xMm) && Number.isFinite(b.engineeringPosition?.xMm) && Math.abs(a.engineeringPosition.xMm - b.engineeringPosition.xMm) > allowed) return 'engineering position';
  if (a.usage !== b.usage) return 'usage';
  if (a.geometricUse !== b.geometricUse) return 'geometric disposition';
  return null;
}

export function validateIdentityReferences(pkg) {
  const errors = [];
  const manifest = rec(pkg?.manifest) ? pkg.manifest : {};
  const entries = rec(pkg?.entries) ? pkg.entries : {};
  const project = rec(entries[manifest.projectFile]?.content) ? entries[manifest.projectFile].content : {};
  const frame = project.object?.engineeringFrame || {};
  const files = records(manifest.files, 'manifest.files', ['path'], errors);
  const traces = records(project.traceFiles, 'project.traceFiles', ['traceId', 'objectId', 'path'], errors);
  const assets = records(project.assets, 'project.assets', ['assetId', 'path'], errors);
  const datums = records(frame.datums, 'project.object.engineeringFrame.datums', ['datumId'], errors);
  const projectRefs = records(frame.references, 'project.object.engineeringFrame.references', ['referenceId', 'sourceId', 'targetId'], errors);
  const traceIds = index(traces, item => item.traceId);
  const tracePaths = index(traces, item => item.path);
  const assetIds = index(assets, item => item.assetId);
  const assetPaths = index(assets, item => item.path);
  const datumIds = index(datums, item => item.datumId);
  const referenceIds = index(projectRefs, item => item.referenceId);
  duplicates(traceIds, 'TRACE_ID_DUPLICATE', 'traceId', errors);
  duplicates(tracePaths, 'TRACE_PATH_DUPLICATE', 'trace path', errors);
  duplicates(assetIds, 'ASSET_ID_DUPLICATE', 'assetId', errors);
  duplicates(assetPaths, 'ASSET_PATH_DUPLICATE', 'asset path', errors);
  duplicates(datumIds, 'DATUM_ID_DUPLICATE', 'datumId', errors);
  duplicates(referenceIds, 'REFERENCE_ID_DUPLICATE', 'referenceId', errors);

  const globals = new Map();
  globalCollision(globals, project.projectId, 'projectId', 'project.projectId', errors);
  globalCollision(globals, project.object?.objectId, 'objectId', 'project.object.objectId', errors);
  traces.forEach(item => globalCollision(globals, item.record.traceId, 'traceId', `${item.path}.traceId`, errors));
  assets.forEach(item => globalCollision(globals, item.record.assetId, 'assetId', `${item.path}.assetId`, errors));
  datums.forEach(item => globalCollision(globals, item.record.datumId, 'project datumId', `${item.path}.datumId`, errors));
  projectRefs.forEach(item => globalCollision(globals, item.record.referenceId, 'project referenceId', `${item.path}.referenceId`, errors));

  const entities = new Map();
  target(entities, project.projectId, 'project', 'project.projectId', project);
  target(entities, project.object?.objectId, 'object', 'project.object.objectId', project.object);
  traces.forEach(item => target(entities, item.record.traceId, 'trace', `${item.path}.traceId`, item.record));
  assets.forEach(item => target(entities, item.record.assetId, 'asset', `${item.path}.assetId`, item.record));
  datums.forEach(item => target(entities, item.record.datumId, 'project datum', `${item.path}.datumId`, item.record));

  const manifestTraces = files.filter(item => item.record.role === 'trace');
  const manifestTracePaths = index(manifestTraces, item => item.path);
  duplicates(index(manifestTraces.filter(item => item.record.traceId), item => item.traceId), 'TRACE_ID_DUPLICATE', 'manifest traceId', errors);
  const resolvedTraces = [];
  for (const item of traces) {
    const trace = item.record;
    const mf = resolve(manifestTracePaths, trace.path, `${item.path}.path`, 'manifest trace path', 'TRACE_MANIFEST_ENTRY_MISSING', 'TRACE_PATH_DUPLICATE', errors);
    if (mf && !mf.record.traceId) errors.push(err('MANIFEST_TRACE_ID_MISSING', `manifest trace ${trace.path} lacks traceId`, `${mf.path}.traceId`));
    else if (mf && mf.record.traceId !== trace.traceId) errors.push(err('MANIFEST_TRACE_ID_MISMATCH', `manifest traceId ${mf.record.traceId} differs from ${trace.traceId}`, `${mf.path}.traceId`));
    const document = entries[trace.path]?.content;
    if (!rec(document)) continue;
    if (document.traceId !== trace.traceId) errors.push(err('TRACE_ID_MISMATCH', `project traceId ${trace.traceId} differs from document ${String(document.traceId)}`, `${item.path}.traceId`));
    if (trace.objectId !== project.object?.objectId || document.objectId !== project.object?.objectId) errors.push(err('TRACE_OBJECT_MISMATCH', `trace ${trace.traceId} differs from shared object`, item.path));
    if (trace.geometricUse !== document.view?.geometricUse) errors.push(err('TRACE_GEOMETRIC_USE_MISMATCH', `trace ${trace.traceId} geometricUse differs`, `${item.path}.geometricUse`));
    resolvedTraces.push({ item, document, local: null });
  }

  const filesByPath = index(files, item => item.path);
  const manifestAssets = files.filter(item => ASSET_ROLES.has(item.record.role) && item.record.assetId);
  duplicates(index(manifestAssets, item => item.assetId), 'ASSET_ID_DUPLICATE', 'manifest assetId', errors);
  for (const item of assets) {
    const asset = item.record;
    const samePath = filesByPath.get(asset.path) || [];
    const sameRole = samePath.filter(candidate => candidate.record.role === asset.role);
    if (!samePath.length) errors.push(err('ASSET_NOT_DECLARED', `asset ${asset.assetId} path is absent`, item.path));
    else if (!sameRole.length) errors.push(err('ASSET_ROLE_MISMATCH', `asset ${asset.assetId} role differs`, `${item.path}.role`));
    else if (sameRole.length > 1) errors.push(err('ASSET_REFERENCE_AMBIGUOUS', `asset ${asset.assetId} manifest match is ambiguous`, `${item.path}.path`));
    else {
      const mf = sameRole[0].record;
      if (!mf.assetId) errors.push(err('MANIFEST_ASSET_ID_MISSING', `manifest asset ${asset.path} lacks assetId`, `${sameRole[0].path}.assetId`));
      else if (mf.assetId !== asset.assetId) errors.push(err('MANIFEST_ASSET_ID_MISMATCH', `manifest assetId ${mf.assetId} differs from ${asset.assetId}`, `${sameRole[0].path}.assetId`));
      if (mf.mediaType !== asset.mediaType || mf.sha256 !== asset.sha256 || mf.sizeBytes !== asset.sizeBytes) errors.push(err('ASSET_NOT_DECLARED', `asset ${asset.assetId} metadata differs`, item.path));
      if (mf.traceId && !(asset.traceIds || []).includes(mf.traceId)) errors.push(err('ASSET_TRACE_ASSOCIATION_MISMATCH', `manifest traceId ${mf.traceId} contradicts project asset`, `${sameRole[0].path}.traceId`));
    }
    (asset.traceIds || []).forEach((traceId, i) => resolve(traceIds, traceId, `${item.path}.traceIds[${i}]`, 'asset traceId', 'ASSET_TRACE_UNKNOWN', 'ASSET_REFERENCE_AMBIGUOUS', errors));
  }

  const datum = (id, path) => resolve(datumIds, id, path, 'project datum', 'DATUM_REFERENCE_UNKNOWN', 'DATUM_REFERENCE_AMBIGUOUS', errors);
  datum(frame.origin?.datumId, 'project.object.engineeringFrame.origin.datumId');
  datum(frame.objectDirection?.fromDatum, 'project.object.engineeringFrame.objectDirection.fromDatum');
  datum(frame.objectDirection?.toDatum, 'project.object.engineeringFrame.objectDirection.toDatum');
  if (frame.objectDirection?.fromDatum && frame.objectDirection.fromDatum === frame.objectDirection.toDatum) errors.push(err('OBJECT_DIRECTION_INVALID', 'object direction endpoints must differ', 'project.object.engineeringFrame.objectDirection'));
  datums.forEach(item => referenceList(item.record.references, entities, `${item.path}.references`, errors));
  projectRefs.forEach(item => {
    resolve(entities, item.record.sourceId, `${item.path}.sourceId`, 'project reference source', 'REFERENCE_TARGET_UNKNOWN', 'REFERENCE_TARGET_AMBIGUOUS', errors);
    resolve(entities, item.record.targetId, `${item.path}.targetId`, 'project reference target', 'REFERENCE_TARGET_UNKNOWN', 'REFERENCE_TARGET_AMBIGUOUS', errors);
  });

  const stationGroups = new Map();
  for (const trace of resolvedTraces) {
    const base = `traces[${trace.item.index}]`;
    const geometry = trace.document.geometry || {};
    const contours = records(geometry.contours, `${base}.geometry.contours`, ['contourId'], errors);
    const stations = records(geometry.stations, `${base}.geometry.stations`, ['stationId'], errors);
    const localDatums = records(geometry.datums, `${base}.geometry.datums`, ['datumId'], errors);
    const relations = records(geometry.relations, `${base}.geometry.relations`, ['relationId', 'sourceId', 'targetId'], errors);
    const contourIds = index(contours, item => item.contourId);
    const stationIds = index(stations, item => item.stationId);
    const localDatumIds = index(localDatums, item => item.datumId);
    const relationIds = index(relations, item => item.relationId);
    duplicates(contourIds, 'CONTOUR_ID_DUPLICATE', 'contourId', errors);
    duplicates(stationIds, 'STATION_ID_DUPLICATE', 'stationId', errors);
    duplicates(localDatumIds, 'TRACE_DATUM_ID_DUPLICATE', 'trace datumId', errors);
    duplicates(relationIds, 'RELATION_ID_DUPLICATE', 'relationId', errors);
    if (typeof geometry.primaryContourId === 'string') resolve(contourIds, geometry.primaryContourId, `${base}.geometry.primaryContourId`, 'primary contour', 'PRIMARY_CONTOUR_UNKNOWN', 'PRIMARY_CONTOUR_AMBIGUOUS', errors);
    const geometricTargets = new Map();
    const referenceTargets = new Map();
    const add = (items, key, kind, both = true) => items.forEach(item => {
      target(referenceTargets, key(item.record), kind, item.path, item.record);
      if (both) target(geometricTargets, key(item.record), kind, item.path, item.record);
    });
    add(contours, item => item.contourId, 'contour'); add(stations, item => item.stationId, 'station'); add(localDatums, item => item.datumId, 'trace datum'); add(relations, item => item.relationId, 'relation', false); add(datums, item => item.datumId, 'project datum');
    relations.forEach(item => {
      resolve(geometricTargets, item.record.sourceId, `${item.path}.sourceId`, 'relation source', 'REFERENCE_UNKNOWN', 'REFERENCE_AMBIGUOUS', errors);
      resolve(geometricTargets, item.record.targetId, `${item.path}.targetId`, 'relation target', 'REFERENCE_UNKNOWN', 'REFERENCE_AMBIGUOUS', errors);
    });
    contours.forEach(item => referenceList(item.record.references, referenceTargets, `${item.path}.references`, errors));
    stations.forEach(item => referenceList(item.record.references, referenceTargets, `${item.path}.references`, errors));
    localDatums.forEach(item => referenceList(item.record.references, referenceTargets, `${item.path}.references`, errors));
    const assetReference = (id, role, path) => {
      if (!id) return;
      const asset = resolve(assetIds, id, path, 'trace asset', 'ASSET_REFERENCE_UNKNOWN', 'ASSET_REFERENCE_AMBIGUOUS', errors);
      if (!asset) return;
      if (asset.record.role !== role) errors.push(err('ASSET_ROLE_MISMATCH', `asset ${id} cannot satisfy ${role}`, path));
      if (!(asset.record.traceIds || []).includes(trace.item.record.traceId)) errors.push(err('ASSET_TRACE_ASSOCIATION_MISMATCH', `asset ${id} is not associated with trace`, path));
    };
    assetReference(trace.document.assets?.sourceImageAssetId, 'source_image', `${base}.assets.sourceImageAssetId`);
    assetReference(trace.document.assets?.sourceSvgAssetId, 'source_svg', `${base}.assets.sourceSvgAssetId`);
    (trace.document.assets?.sidecarAssetIds || []).forEach((id, i) => assetReference(id, 'sidecar', `${base}.assets.sidecarAssetIds[${i}]`));
    contours.forEach(item => assetReference(item.record.sourceSvgElement?.assetId, 'source_svg', `${item.path}.sourceSvgElement.assetId`));
    stations.forEach(item => {
      const found = stationGroups.get(item.record.stationId) || [];
      found.push({ ...item, trace, tolerance: tolerance(trace.document) });
      stationGroups.set(item.record.stationId, found);
    });
    trace.local = { stations };
  }

  const conflicts = new Set();
  for (const [id, occurrences] of stationGroups) {
    const first = occurrences[0];
    for (let i = 1; i < occurrences.length; i += 1) {
      if (occurrences[i].trace === first.trace) conflicts.add(id);
      const difference = stationDifference(first.record, occurrences[i].record, Math.max(first.tolerance, occurrences[i].tolerance, 1e-9));
      if (difference) {
        conflicts.add(id);
        errors.push(err('STATION_ID_CONFLICT', `station ${id} conflicts on ${difference} with ${first.path}`, occurrences[i].path));
      }
    }
  }
  for (const trace of resolvedTraces) {
    const binding = trace.document.view?.sectionBinding;
    if (!rec(binding) || !binding.stationId) continue;
    const path = `traces[${trace.item.index}].view.sectionBinding.stationId`;
    const group = stationGroups.get(binding.stationId);
    if (!group) errors.push(err('SECTION_STATION_UNKNOWN', `station ${binding.stationId} does not resolve`, path));
    else if (conflicts.has(binding.stationId)) errors.push(err('STATION_ID_CONFLICT', `station ${binding.stationId} is not canonical`, path));
    else if (Number.isFinite(binding.xMm) && Number.isFinite(group[0].record.engineeringPosition?.xMm) && Math.abs(binding.xMm - group[0].record.engineeringPosition.xMm) > Math.max(group[0].tolerance, binding.toleranceMm || 0, 1e-9)) errors.push(err('STATION_ID_CONFLICT', `station ${binding.stationId} position differs`, `${path.replace(/stationId$/, 'xMm')}`));
  }
  return errors;
}
