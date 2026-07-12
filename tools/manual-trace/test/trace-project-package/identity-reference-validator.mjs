/**
 * AI-CODING NOTE:
 * Responsibility: Semantic inventory, identity, exact-reference, coordinate-frame, and cross-view station checks for the test-only package validator.
 * Inputs: A structurally guarded virtual package fixture.
 * Outputs: Deterministically ordered contract diagnostics.
 * Do not: Use as production package handling or resolve by array order, first match, or last write.
 */
const PROJECT_ASSET_ROLES = new Set(['source_image', 'source_svg', 'sidecar']);
const FRAME_EPSILON = 1e-9;
const STATION_EPSILON_MM = 1e-9;
const rec = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const err = (errorClass, message, path) => ({ errorClass, message, path });

function records(value, path, fields) {
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
function sortedEntries(map) { return [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))); }
function duplicates(map, errorClass, label, errors) {
  for (const [id, rawItems] of sortedEntries(map)) {
    const items = [...rawItems].sort((a, b) => a.path.localeCompare(b.path));
    for (let i = 1; i < items.length; i += 1) errors.push(err(errorClass, `${label} ${id} duplicates ${items[0].path}`, items[i].path));
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
function traceTolerance(trace) {
  return Number.isFinite(trace?.calibration?.toleranceMm) ? Math.max(0, trace.calibration.toleranceMm) : STATION_EPSILON_MM;
}
function stationDifference(a, b, allowed) {
  if (a.orientation?.engineeringAxis !== b.orientation?.engineeringAxis) return 'engineering axis';
  if (!Number.isFinite(a.engineeringPosition?.xMm) || !Number.isFinite(b.engineeringPosition?.xMm)) return 'engineering position';
  if (Math.abs(a.engineeringPosition.xMm - b.engineeringPosition.xMm) > allowed) return 'engineering position';
  if (a.usage !== b.usage) return 'usage';
  if (a.geometricUse !== b.geometricUse) return 'geometric disposition';
  return null;
}
function sortDiagnostics(errors) {
  return errors.sort((a, b) => `${a.errorClass}|${a.path}|${a.message}`.localeCompare(`${b.errorClass}|${b.path}|${b.message}`));
}
function finiteVector(value) {
  return rec(value) && [value.x, value.y, value.z].every(Number.isFinite);
}
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function vectorDistance(a, b) { return norm({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }); }
function validateCoordinates(frame, datums, errors) {
  const originPath = 'project.object.engineeringFrame.origin';
  if (![frame.origin?.xMm, frame.origin?.yMm, frame.origin?.zMm].every(Number.isFinite)) errors.push(err('ENGINEERING_COORDINATE_INVALID', 'engineering origin coordinates must be finite', originPath));
  for (const item of datums) {
    if (item.record.positionMm !== undefined && !finiteVector(item.record.positionMm)) errors.push(err('ENGINEERING_COORDINATE_INVALID', `project datum ${item.record.datumId} position must be finite`, `${item.path}.positionMm`));
  }
}
function validateEngineeringFrame(frame, datums, errors) {
  validateCoordinates(frame, datums, errors);
  const vectors = {};
  const validNonZero = {};
  const unit = {};
  for (const axis of ['x', 'y', 'z']) {
    const path = `project.object.engineeringFrame.axes.${axis}.unitVector`;
    const vector = frame.axes?.[axis]?.unitVector;
    if (!finiteVector(vector)) {
      errors.push(err('ENGINEERING_COORDINATE_INVALID', `engineering ${axis.toUpperCase()} axis components must be finite`, path));
      continue;
    }
    vectors[axis] = vector;
    const length = norm(vector);
    if (length <= FRAME_EPSILON) {
      errors.push(err('ENGINEERING_FRAME_DEGENERATE', `engineering ${axis.toUpperCase()} axis has zero length`, path));
      continue;
    }
    validNonZero[axis] = true;
    if (Math.abs(length - 1) > FRAME_EPSILON) errors.push(err('ENGINEERING_FRAME_NON_UNIT', `engineering ${axis.toUpperCase()} axis length ${length} exceeds tolerance ${FRAME_EPSILON}`, path));
    else unit[axis] = true;
  }
  const pairs = [['x', 'y'], ['x', 'z'], ['y', 'z']];
  let orthogonal = true;
  for (const [a, b] of pairs) {
    if (!validNonZero[a] || !validNonZero[b]) continue;
    if (Math.abs(dot(vectors[a], vectors[b])) > FRAME_EPSILON) {
      orthogonal = false;
      errors.push(err('ENGINEERING_FRAME_NON_ORTHOGONAL', `engineering ${a.toUpperCase()} and ${b.toUpperCase()} axes are not orthogonal within ${FRAME_EPSILON}`, 'project.object.engineeringFrame.axes'));
    }
  }
  if (validNonZero.x && validNonZero.y && validNonZero.z) {
    const determinant = dot(cross(vectors.x, vectors.y), vectors.z);
    if (Math.abs(determinant) <= FRAME_EPSILON) errors.push(err('ENGINEERING_FRAME_DEGENERATE', 'engineering basis determinant is zero within tolerance', 'project.object.engineeringFrame.axes'));
    if (unit.x && unit.y && unit.z && orthogonal && frame.handedness === 'right' && vectorDistance(cross(vectors.x, vectors.y), vectors.z) > FRAME_EPSILON) errors.push(err('ENGINEERING_FRAME_HANDEDNESS', 'cross(X, Y) does not equal Z for the declared right-handed basis', 'project.object.engineeringFrame.handedness'));
  }
  const directionAxis = frame.objectDirection?.axis;
  if (!['X', 'Y', 'Z'].includes(directionAxis) || !vectors[String(directionAxis || '').toLowerCase()]) errors.push(err('OBJECT_DIRECTION_INVALID', `object direction axis ${String(directionAxis)} does not resolve to a valid engineering axis`, 'project.object.engineeringFrame.objectDirection.axis'));
}
function inventoryMetadataMatches(manifestFile, asset) {
  return manifestFile.role === asset.role && manifestFile.mediaType === asset.mediaType && manifestFile.sha256 === asset.sha256 && manifestFile.sizeBytes === asset.sizeBytes;
}

export function validateIdentityReferences(pkg) {
  const errors = [];
  const manifest = rec(pkg?.manifest) ? pkg.manifest : {};
  const entries = rec(pkg?.entries) ? pkg.entries : {};
  const project = rec(entries[manifest.projectFile]?.content) ? entries[manifest.projectFile].content : {};
  const frame = project.object?.engineeringFrame || {};
  const files = records(manifest.files, 'manifest.files', ['path']);
  const traces = records(project.traceFiles, 'project.traceFiles', ['traceId', 'objectId', 'path']);
  const assets = records(project.assets, 'project.assets', ['assetId', 'path']);
  const datums = records(frame.datums, 'project.object.engineeringFrame.datums', ['datumId']);
  const projectRefs = records(frame.references, 'project.object.engineeringFrame.references', ['referenceId', 'sourceId', 'targetId']);
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
    const mf = resolve(manifestTracePaths, trace.path, `${item.path}.path`, 'manifest trace path', 'TRACE_MANIFEST_ENTRY_MISSING', 'TRACE_INVENTORY_MISMATCH', errors);
    if (mf && !mf.record.traceId) errors.push(err('MANIFEST_TRACE_ID_MISSING', `manifest trace ${trace.path} lacks traceId`, `${mf.path}.traceId`));
    else if (mf && mf.record.traceId !== trace.traceId) errors.push(err('MANIFEST_TRACE_ID_MISMATCH', `manifest traceId ${mf.record.traceId} differs from ${trace.traceId}`, `${mf.path}.traceId`));
    const document = entries[trace.path]?.content;
    if (!rec(document)) continue;
    if (document.traceId !== trace.traceId) errors.push(err('TRACE_ID_MISMATCH', `project traceId ${trace.traceId} differs from document ${String(document.traceId)}`, `${item.path}.traceId`));
    if (trace.objectId !== project.object?.objectId || document.objectId !== project.object?.objectId) errors.push(err('TRACE_OBJECT_MISMATCH', `trace ${trace.traceId} differs from shared object`, item.path));
    if (trace.geometricUse !== document.view?.geometricUse) errors.push(err('TRACE_GEOMETRIC_USE_MISMATCH', `trace ${trace.traceId} geometricUse differs`, `${item.path}.geometricUse`));
    resolvedTraces.push({ item, document, local: null });
  }
  for (const mf of manifestTraces) {
    const claims = tracePaths.get(mf.record.path) || [];
    if (!claims.length) errors.push(err('ORPHAN_MANIFEST_TRACE', `manifest trace ${mf.record.path} has no project.traceFiles[] record`, mf.path));
    else if (claims.length !== 1) errors.push(err('TRACE_INVENTORY_MISMATCH', `manifest trace ${mf.record.path} is claimed ${claims.length} times`, mf.path));
    else if (claims[0].record.traceId !== mf.record.traceId) errors.push(err('TRACE_INVENTORY_MISMATCH', `manifest trace ${mf.record.path} identity disagrees with project inventory`, mf.path));
  }
  for (const path of Object.keys(entries).filter(value => value.startsWith('traces/')).sort()) {
    const manifestClaims = manifestTracePaths.get(path) || [];
    const projectClaims = tracePaths.get(path) || [];
    if (!manifestClaims.length) errors.push(err('TRACE_DOCUMENT_UNDECLARED', `trace package entry ${path} is not declared with role trace`, `entries.${path}`));
    if (!projectClaims.length) errors.push(err('ORPHAN_TRACE_ENTRY', `trace package entry ${path} is absent from project.traceFiles[]`, `entries.${path}`));
    if (manifestClaims.length > 1 || projectClaims.length > 1) errors.push(err('TRACE_INVENTORY_MISMATCH', `trace package entry ${path} does not have one manifest and one project owner`, `entries.${path}`));
  }

  const filesByPath = index(files, item => item.path);
  const manifestAssets = files.filter(item => PROJECT_ASSET_ROLES.has(item.record.role));
  const manifestAssetPaths = index(manifestAssets, item => item.path);
  duplicates(index(manifestAssets.filter(item => item.record.assetId), item => item.assetId), 'ASSET_ID_DUPLICATE', 'manifest assetId', errors);
  for (const item of assets) {
    const asset = item.record;
    if (asset.role === 'readme') errors.push(err('README_PROJECT_ASSET_FORBIDDEN', `readme ${asset.path} must not appear in project.assets[]`, item.path));
    const samePath = filesByPath.get(asset.path) || [];
    const sameRole = samePath.filter(candidate => candidate.record.role === asset.role);
    if (!samePath.length) errors.push(err('ASSET_NOT_DECLARED', `asset ${asset.assetId} path is absent`, item.path));
    else if (!sameRole.length) errors.push(err('ASSET_ROLE_MISMATCH', `asset ${asset.assetId} role differs`, `${item.path}.role`));
    else if (sameRole.length > 1) errors.push(err('ASSET_REFERENCE_AMBIGUOUS', `asset ${asset.assetId} manifest match is ambiguous`, `${item.path}.path`));
    else {
      const mf = sameRole[0].record;
      if (!mf.assetId) errors.push(err('MANIFEST_ASSET_ID_MISSING', `manifest asset ${asset.path} lacks assetId`, `${sameRole[0].path}.assetId`));
      else if (mf.assetId !== asset.assetId) errors.push(err('MANIFEST_ASSET_ID_MISMATCH', `manifest assetId ${mf.assetId} differs from ${asset.assetId}`, `${sameRole[0].path}.assetId`));
      if (!inventoryMetadataMatches(mf, asset)) errors.push(err('ASSET_INVENTORY_MISMATCH', `asset ${asset.assetId} metadata differs from manifest`, item.path));
      if (mf.traceId && !(asset.traceIds || []).includes(mf.traceId)) errors.push(err('ASSET_TRACE_ASSOCIATION_MISMATCH', `manifest traceId ${mf.traceId} contradicts project asset`, `${sameRole[0].path}.traceId`));
    }
    (asset.traceIds || []).forEach((traceId, i) => resolve(traceIds, traceId, `${item.path}.traceIds[${i}]`, 'asset traceId', 'ASSET_TRACE_UNKNOWN', 'ASSET_REFERENCE_AMBIGUOUS', errors));
  }
  for (const mf of manifestAssets) {
    const claims = assetPaths.get(mf.record.path) || [];
    if (!claims.length) errors.push(err('ORPHAN_MANIFEST_ASSET', `manifest asset ${mf.record.path} has no project.assets[] record`, mf.path));
    else if (claims.length !== 1) errors.push(err('ASSET_INVENTORY_MISMATCH', `manifest asset ${mf.record.path} is claimed ${claims.length} times`, mf.path));
    else if (claims[0].record.assetId !== mf.record.assetId || !inventoryMetadataMatches(mf.record, claims[0].record)) errors.push(err('ASSET_INVENTORY_MISMATCH', `manifest asset ${mf.record.path} disagrees with project inventory`, mf.path));
  }
  for (const path of Object.keys(entries).filter(value => value.startsWith('assets/')).sort()) {
    const manifestClaims = manifestAssetPaths.get(path) || [];
    const projectClaims = assetPaths.get(path) || [];
    if (!manifestClaims.length || !projectClaims.length) errors.push(err('ORPHAN_ASSET_ENTRY', `asset package entry ${path} lacks a complete manifest/project inventory chain`, `entries.${path}`));
    if (manifestClaims.length > 1 || projectClaims.length > 1) errors.push(err('ASSET_INVENTORY_MISMATCH', `asset package entry ${path} does not have one manifest and one project owner`, `entries.${path}`));
  }
  for (const readme of files.filter(item => item.record.role === 'readme')) {
    if (readme.record.traceId || readme.record.assetId) errors.push(err('README_IDENTITY_FORBIDDEN', `readme ${readme.record.path} must not carry traceId or assetId`, readme.path));
    if ((assetPaths.get(readme.record.path) || []).length) errors.push(err('README_PROJECT_ASSET_FORBIDDEN', `readme ${readme.record.path} must remain manifest-only`, readme.path));
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
  validateEngineeringFrame(frame, datums, errors);

  const stationGroups = new Map();
  for (const trace of resolvedTraces) {
    const base = `entries.${trace.item.record.path}.content`;
    resolve(datumIds, trace.document.view?.viewFrame?.engineeringOriginDatumId, `${base}.view.viewFrame.engineeringOriginDatumId`, 'view engineering origin datum', 'VIEW_ORIGIN_DATUM_UNKNOWN', 'VIEW_ORIGIN_DATUM_AMBIGUOUS', errors);
    const geometry = trace.document.geometry || {};
    const contours = records(geometry.contours, `${base}.geometry.contours`, ['contourId']);
    const stations = records(geometry.stations, `${base}.geometry.stations`, ['stationId']);
    const localDatums = records(geometry.datums, `${base}.geometry.datums`, ['datumId']);
    const relations = records(geometry.relations, `${base}.geometry.relations`, ['relationId', 'sourceId', 'targetId']);
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
      found.push({ ...item, trace, tolerance: traceTolerance(trace.document) });
      stationGroups.set(item.record.stationId, found);
    });
    trace.local = { stations };
  }

  const conflictingStations = new Set();
  for (const [id, rawOccurrences] of sortedEntries(stationGroups)) {
    const occurrences = [...rawOccurrences].sort((a, b) => `${a.trace.item.record.traceId}|${a.path}`.localeCompare(`${b.trace.item.record.traceId}|${b.path}`));
    for (let i = 0; i < occurrences.length; i += 1) for (let j = i + 1; j < occurrences.length; j += 1) {
      const a = occurrences[i]; const b = occurrences[j];
      if (a.trace.item.record.path === b.trace.item.record.path) conflictingStations.add(id);
      const allowed = Math.max(a.tolerance, b.tolerance, STATION_EPSILON_MM);
      const difference = stationDifference(a.record, b.record, allowed);
      if (difference) {
        conflictingStations.add(id);
        errors.push(err('STATION_ID_CONFLICT', `station ${id} conflicts on ${difference} between ${a.trace.item.record.traceId} and ${b.trace.item.record.traceId}`, b.path));
      }
    }
  }
  for (const trace of resolvedTraces) {
    const binding = trace.document.view?.sectionBinding;
    if (!rec(binding)) continue;
    const base = `entries.${trace.item.record.path}.content.view.sectionBinding`;
    const method = binding.bindingMethod;
    if (method === 'explicit_x') {
      if (!Number.isFinite(binding.xMm) || binding.stationId !== undefined) errors.push(err('SECTION_BINDING_METHOD_INVALID', 'explicit_x requires xMm and forbids stationId', base));
      continue;
    }
    if (method !== 'explicit_station') {
      errors.push(err('SECTION_BINDING_METHOD_INVALID', `unsupported section binding method ${String(method)}`, `${base}.bindingMethod`));
      continue;
    }
    if (typeof binding.stationId !== 'string' || !binding.stationId) {
      errors.push(err('SECTION_BINDING_METHOD_INVALID', 'explicit_station requires stationId', base));
      continue;
    }
    const group = stationGroups.get(binding.stationId) || [];
    if (!group.length) errors.push(err('SECTION_STATION_UNKNOWN', `station ${binding.stationId} does not resolve`, `${base}.stationId`));
    else if (conflictingStations.has(binding.stationId)) errors.push(err('STATION_ID_CONFLICT', `station ${binding.stationId} is not a consistent package station`, `${base}.stationId`));
    if (Number.isFinite(binding.xMm)) {
      for (const occurrence of group) {
        const stationX = occurrence.record.engineeringPosition?.xMm;
        const allowed = Math.max(occurrence.tolerance, Number.isFinite(binding.toleranceMm) ? Math.max(0, binding.toleranceMm) : 0, STATION_EPSILON_MM);
        if (!Number.isFinite(stationX) || Math.abs(binding.xMm - stationX) > allowed) errors.push(err('STATION_ID_CONFLICT', `station ${binding.stationId} binding position disagrees with ${occurrence.trace.item.record.traceId}`, `${base}.xMm`));
      }
    }
  }
  return sortDiagnostics(errors);
}
