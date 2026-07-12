/**
 * AI-CODING NOTE:
 * Responsibility: Test-only validation of the Trace Project Package v1 schema, integrity, references, and geometry-placement invariants.
 * Inputs: Canonical schemas and deterministic virtual package fixtures.
 * Outputs: Structured errors and warnings; no product state mutation.
 * Safe edits: Add contract rules and diagnostics together with matched positive and negative fixtures.
 * Do not: Export this helper as a production API, weaken failures to make fixtures pass, or claim browser ZIP/SVG safety.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?![A-Za-z]:[\\/])(?!https?:\/\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EXECUTABLE_EXT = /\.(?:js|mjs|cjs|html?|wasm|exe|dll|sh|bat|cmd|ps1)$/i;

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function entryBytes(entry) {
  if (!isRecord(entry) || !['json', 'text', 'base64'].includes(entry.kind)) {
    throw new Error('fixture entry kind must be json, text, or base64');
  }
  if (entry.kind === 'json') return canonicalJsonBytes(entry.content);
  return Buffer.from(entry.content, entry.kind === 'base64' ? 'base64' : 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function typeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isRecord(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}
function resolvePointer(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported schema reference: ${ref}`);
  return ref.slice(2).split('/').reduce((node, token) => node[token.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}
function schemaErrors(value, schema, root = schema, path = '$') {
  if (!schema || typeof schema !== 'object') return [];
  if (schema.$ref) return schemaErrors(value, resolvePointer(root, schema.$ref), root, path);
  const errors = [];
  if (schema.allOf) for (const item of schema.allOf) errors.push(...schemaErrors(value, item, root, path));
  if (schema.anyOf && !schema.anyOf.some(item => schemaErrors(value, item, root, path).length === 0)) errors.push(`${path}: anyOf failed`);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(item => schemaErrors(value, item, root, path).length === 0).length;
    if (matches !== 1) errors.push(`${path}: oneOf matched ${matches}`);
  }
  if (schema.not && schemaErrors(value, schema.not, root, path).length === 0) errors.push(`${path}: not matched`);
  if (schema.const !== undefined && !deepEqual(value, schema.const)) errors.push(`${path}: const mismatch`);
  if (schema.enum && !schema.enum.some(item => deepEqual(item, value))) errors.push(`${path}: enum mismatch`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => typeMatches(value, type))) return [...errors, `${path}: expected ${types.join('|')}`];
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: maxLength`);
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push(`${path}: pattern`);
    if (schema.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path}: date-time`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: exclusiveMinimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
    if (schema.uniqueItems) {
      const unique = new Set(value.map(item => JSON.stringify(item)));
      if (unique.size !== value.length) errors.push(`${path}: uniqueItems`);
    }
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, root, `${path}[${index}]`)));
    if (schema.contains) {
      const count = value.filter(item => schemaErrors(item, schema.contains, root, path).length === 0).length;
      const min = schema.minContains ?? 1;
      const max = schema.maxContains ?? Infinity;
      if (count < min || count > max) errors.push(`${path}: contains count ${count}`);
    }
  }
  if (isRecord(value)) {
    for (const required of schema.required || []) if (!(required in value)) errors.push(`${path}.${required}: required`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in props)) errors.push(`${path}.${key}: additional property`);
    for (const [key, child] of Object.entries(props)) if (key in value) errors.push(...schemaErrors(value[key], child, root, `${path}.${key}`));
  }
  return errors;
}

function fail(errorClass, message, path) { return { errorClass, message, path }; }
function warning(warningClass, message, path) { return { warningClass, message, path }; }

function checkedRecords(value, arrayPath, requiredStringFields, errors) {
  if (!Array.isArray(value)) return [];
  const records = [];
  for (const [index, candidate] of value.entries()) {
    const path = `${arrayPath}[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(fail('MALFORMED_RECORD', `${path} must be an object record`, path));
      continue;
    }
    const missing = requiredStringFields.filter(field => typeof candidate[field] !== 'string' || candidate[field].length === 0);
    if (missing.length) {
      errors.push(fail('MALFORMED_RECORD', `${path} lacks required identity/path fields: ${missing.join(', ')}`, path));
      continue;
    }
    records.push({ record: candidate, index });
  }
  return records;
}

export async function loadSchemas(schemaDir) {
  const load = async name => JSON.parse(await readFile(new URL(`${name}.schema.json`, schemaDir), 'utf8'));
  return { manifest: await load('manifest'), project: await load('project'), trace: await load('trace') };
}

export function validateSchemaValue(value, schema, root = schema, path = '$') {
  return schemaErrors(value, schema, root, path);
}

export function validatePackage(pkg, schemas) {
  const errors = [];
  const warnings = [];
  const manifest = pkg?.manifest;
  const entries = pkg?.entries;
  if (!isRecord(manifest)) return { ok: false, errors: [fail('MANIFEST_INVALID', 'manifest missing', '$')], warnings };
  if (!isRecord(entries)) return { ok: false, errors: [fail('PACKAGE_ENTRIES_INVALID', 'entries missing', '$')], warnings };

  const version = String(manifest.packageVersion || '');
  if (version.split('.')[0] !== '1') errors.push(fail('UNSUPPORTED_PACKAGE_MAJOR', `unsupported package major: ${version}`, 'manifest.packageVersion'));

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const validFiles = checkedRecords(files, 'manifest.files', ['path'], errors);
  const seen = new Map();
  for (const { record: file, index } of validFiles) {
    const p = file.path;
    if (!SAFE_PATH.test(p) || p.includes('\\') || EXECUTABLE_EXT.test(p)) errors.push(fail('UNSAFE_PATH', `unsafe package path: ${p}`, `manifest.files[${index}].path`));
    if (seen.has(p)) errors.push(fail('DUPLICATE_PATH', `duplicate package path: ${p}`, `manifest.files[${index}].path`));
    else seen.set(p, index);
    if (!SHA256.test(String(file.sha256 || ''))) errors.push(fail('CHECKSUM_FORMAT', `invalid SHA-256 for ${p}`, `manifest.files[${index}].sha256`));
  }

  const projectFile = manifest.projectFile;
  const projects = validFiles.filter(({ record }) => record.role === 'project');
  if (typeof projectFile !== 'string' || projects.length !== 1 || projects[0]?.record.path !== projectFile || !(projectFile in entries)) {
    errors.push(fail('PROJECT_FILE_MISSING', 'manifest must declare exactly one available project file', 'manifest.projectFile'));
  }

  for (const { record: file, index } of validFiles) {
    const entry = entries[file.path];
    if (!entry) {
      errors.push(fail('DECLARED_FILE_MISSING', `declared file missing: ${file.path}`, `manifest.files[${index}]`));
      continue;
    }
    let bytes;
    try {
      bytes = entryBytes(entry);
    } catch (error) {
      errors.push(fail('PACKAGE_ENTRY_INVALID', `${file.path}: ${error.message}`, `entries.${file.path}`));
      continue;
    }
    if (bytes.length !== file.sizeBytes) errors.push(fail('SIZE_MISMATCH', `size mismatch: ${file.path}`, `manifest.files[${index}].sizeBytes`));
    if (sha256(bytes) !== file.sha256) errors.push(fail('CHECKSUM_MISMATCH', `digest mismatch: ${file.path}`, `manifest.files[${index}].sha256`));
  }
  for (const path of Object.keys(entries)) if (!seen.has(path)) errors.push(fail('UNDECLARED_FILE', `entry absent from manifest: ${path}`, `entries.${path}`));

  const project = typeof projectFile === 'string' ? entries[projectFile]?.content : undefined;
  if (!isRecord(project)) errors.push(fail('PROJECT_FILE_INVALID', 'project file content must be an object', 'project.json'));

  const traceRecords = checkedRecords(project?.traceFiles, 'project.traceFiles', ['traceId', 'objectId', 'path'], errors);
  const traces = [];
  for (const { record, index } of traceRecords) {
    const entry = entries[record.path];
    if (!isRecord(entry) || entry.kind !== 'json' || !isRecord(entry.content)) {
      errors.push(fail('TRACE_FILE_INVALID', `trace ${record.traceId} must resolve to an object JSON entry`, `project.traceFiles[${index}]`));
      continue;
    }
    traces.push({ document: entry.content, record, recordIndex: index });
  }

  const objectId = project?.object?.objectId;
  for (const { document: traceDoc, record, recordIndex } of traces) {
    if (record.objectId !== objectId || traceDoc.objectId !== objectId) {
      errors.push(fail('TRACE_OBJECT_MISMATCH', `trace ${record.traceId} does not reference shared object`, `project.traceFiles[${recordIndex}]`));
    }
  }

  const stationRecordsByTrace = new Map();
  const contourRecordsByTrace = new Map();
  for (const { document: trace, recordIndex } of traces) {
    stationRecordsByTrace.set(trace, checkedRecords(trace?.geometry?.stations, `traces[${recordIndex}].geometry.stations`, ['stationId'], errors));
    contourRecordsByTrace.set(trace, checkedRecords(trace?.geometry?.contours, `traces[${recordIndex}].geometry.contours`, ['contourId'], errors));
  }
  const allStationIds = new Set([...stationRecordsByTrace.values()].flat().map(({ record }) => record.stationId));

  const assetRecords = checkedRecords(project?.assets, 'project.assets', ['assetId', 'path'], errors);
  const projectAssets = new Map();
  for (const { record: asset, index } of assetRecords) {
    if (projectAssets.has(asset.assetId)) errors.push(fail('MALFORMED_RECORD', `duplicate asset identity: ${asset.assetId}`, `project.assets[${index}]`));
    else projectAssets.set(asset.assetId, asset);
  }
  const manifestByPath = new Map(validFiles.map(({ record }) => [record.path, record]));
  for (const { record: asset, index } of assetRecords) {
    const file = manifestByPath.get(asset.path);
    if (!file || file.sha256 !== asset.sha256 || file.sizeBytes !== asset.sizeBytes || file.mediaType !== asset.mediaType || file.role !== asset.role) {
      errors.push(fail('ASSET_NOT_DECLARED', `asset ${asset.assetId} lacks matching manifest entry`, `project.assets[${index}]`));
    }
  }

  for (const [traceIndex, { document: trace, recordIndex }] of traces.entries()) {
    const tracePath = `traces[${recordIndex}]`;
    const frame = trace?.view?.viewFrame;
    const maps = [frame?.uAxis?.engineeringAxis, frame?.vAxis?.engineeringAxis, frame?.normalAxis?.engineeringAxis];
    if (maps.some(axis => !['X', 'Y', 'Z'].includes(axis)) || new Set(maps).size !== 3) {
      errors.push(fail('VIEW_FRAME_MAPPING', `trace ${trace?.traceId} lacks a complete one-to-one engineering-axis mapping`, `${tracePath}.view.viewFrame`));
    }

    const viewType = trace?.view?.viewType;
    const geometricUse = trace?.view?.geometricUse;
    const binding = trace?.view?.sectionBinding;
    if (['front', 'section'].includes(viewType) && geometricUse === 'used_for_geometry') {
      if (!isRecord(binding) || (!binding.stationId && !Number.isFinite(binding.xMm))) {
        errors.push(fail('SECTION_BINDING_REQUIRED', `geometric ${viewType} trace requires stationId or xMm`, `${tracePath}.view.sectionBinding`));
      } else if (binding.stationId && !allStationIds.has(binding.stationId)) {
        errors.push(fail('SECTION_STATION_UNKNOWN', `unknown section station ${binding.stationId}`, `${tracePath}.view.sectionBinding.stationId`));
      }
    } else if (['front', 'section'].includes(viewType) && !binding) {
      warnings.push(warning('UNPLACED_VIEW_PRESERVED', `unbound ${viewType} retained as provenance`, `${tracePath}.view`));
    }

    const contours = contourRecordsByTrace.get(trace) || [];
    if (geometricUse === 'used_for_geometry') {
      const primary = contours.map(({ record }) => record).filter(contour => contour.role === 'outer_contour' && contour.status === 'primary' && contour.closed === true);
      if (primary.length !== 1 || trace?.geometry?.primaryContourId !== primary[0]?.contourId) {
        errors.push(fail('PRIMARY_CONTOUR_AMBIGUOUS', `trace ${trace?.traceId} must select exactly one primary closed outer contour`, `${tracePath}.geometry.primaryContourId`));
      }
    }

    const c = isRecord(trace?.calibration) ? trace.calibration : {};
    const ratio = c.sourceRealLength / c.sourcePixelLength;
    const allowed = Math.max(1e-9 * Math.max(1, Math.abs(ratio)), Number(c.toleranceMm || 0) / Math.max(1, Number(c.sourcePixelLength || 1)));
    if (![c.unitPerPx, c.sourcePixelLength, c.sourceRealLength].every(Number.isFinite) || Math.abs(c.unitPerPx - ratio) > allowed) {
      errors.push(fail('CALIBRATION_CONFLICT', `trace ${trace?.traceId} calibration values disagree`, `${tracePath}.calibration`));
    }

    const planeAxes = new Set([frame?.uAxis?.engineeringAxis, frame?.vAxis?.engineeringAxis]);
    for (const { record: station, index } of stationRecordsByTrace.get(trace) || []) {
      if (!planeAxes.has(station?.orientation?.engineeringAxis)) {
        errors.push(fail('STATION_ORIENTATION_UNMAPPABLE', `station ${station.stationId} orientation is not in the view plane`, `${tracePath}.geometry.stations[${index}]`));
      }
    }

    const sidecarIds = Array.isArray(trace?.assets?.sidecarAssetIds) ? trace.assets.sidecarAssetIds : [];
    const ids = [trace?.assets?.sourceImageAssetId, trace?.assets?.sourceSvgAssetId, ...sidecarIds].filter(id => typeof id === 'string' && id.length > 0);
    for (const id of ids) if (!projectAssets.has(id)) errors.push(fail('ASSET_REFERENCE_UNKNOWN', `trace asset ${id} not in project inventory`, `${tracePath}.assets`));

    if (!isRecord(trace)) errors.push(fail('TRACE_FILE_INVALID', `trace at index ${traceIndex} is not an object`, tracePath));
  }

  const projectSourceFields = Array.isArray(project?.provenance?.sourceFields) ? project.provenance.sourceFields : [];
  const traceSourceFields = traces.flatMap(({ document: trace }) => Array.isArray(trace?.provenance?.sourceFields) ? trace.provenance.sourceFields : []);
  const sourceFields = new Set([...projectSourceFields, ...traceSourceFields].filter(path => typeof path === 'string' && path.length > 0));
  const dispositionRecords = checkedRecords(project?.fieldDisposition, 'project.fieldDisposition', ['sourcePath', 'status'], errors);
  const dispositions = new Map();
  for (const { record: item, index } of dispositionRecords) {
    if (dispositions.has(item.sourcePath)) errors.push(fail('FIELD_DISPOSITION_DUPLICATE', `duplicate field disposition: ${item.sourcePath}`, `project.fieldDisposition[${index}]`));
    else dispositions.set(item.sourcePath, item);
    if (item.status === 'unsupported_warning') warnings.push(warning(item.warningCode || 'UNSUPPORTED_SOURCE_FIELD', item.reason, item.sourcePath));
    if (item.status === 'unsupported_error') errors.push(fail('UNSUPPORTED_SOURCE_FIELD', item.reason, item.sourcePath));
  }
  for (const path of sourceFields) if (!dispositions.has(path)) errors.push(fail('FIELD_DISPOSITION_MISSING', `source field lacks disposition: ${path}`, 'project.fieldDisposition'));

  const manifestSchemaErrors = schemaErrors(manifest, schemas.manifest);
  const projectSchemaErrors = schemaErrors(project, schemas.project);
  const traceSchemaErrors = traces.flatMap(({ document: trace, recordIndex }) => schemaErrors(trace, schemas.trace, schemas.trace, `traces[${recordIndex}]`));
  if (manifestSchemaErrors.length || projectSchemaErrors.length || traceSchemaErrors.length) {
    errors.push(fail('SCHEMA_VALIDATION', [...manifestSchemaErrors, ...projectSchemaErrors, ...traceSchemaErrors].join('; '), '$'));
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function collectSchemaFields(schema, schemaName) {
  const fields = [];
  function walk(node, location) {
    if (!node || typeof node !== 'object' || node['x-field-matrix-skip'] === true) return;
    if (node.properties && typeof node.properties === 'object') for (const [name, child] of Object.entries(node.properties)) {
      const schemaLocation = `${location}/properties/${name}`;
      fields.push({ schema: schemaName, schemaLocation, fieldName: name, disposition: child['x-disposition'] });
      walk(child, schemaLocation);
    }
    if (node.$defs) for (const [name, child] of Object.entries(node.$defs)) walk(child, `${location}/$defs/${name}`);
    for (const [key, value] of Object.entries(node)) if (!['properties', '$defs'].includes(key)) {
      if (Array.isArray(value)) value.forEach((child, index) => walk(child, `${location}/${key}/${index}`));
      else if (value && typeof value === 'object') walk(value, `${location}/${key}`);
    }
  }
  walk(schema, '#');
  return fields.sort((a, b) => `${a.schema}:${a.schemaLocation}`.localeCompare(`${b.schema}:${b.schemaLocation}`));
}
