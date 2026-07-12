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

function entryBytes(entry) {
  if (!entry || !['json','text','base64'].includes(entry.kind)) throw new Error('fixture entry kind must be json, text, or base64');
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
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
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
      const min = schema.minContains ?? 1; const max = schema.maxContains ?? Infinity;
      if (count < min || count > max) errors.push(`${path}: contains count ${count}`);
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) if (!(required in value)) errors.push(`${path}.${required}: required`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in props)) errors.push(`${path}.${key}: additional property`);
    for (const [key, child] of Object.entries(props)) if (key in value) errors.push(...schemaErrors(value[key], child, root, `${path}.${key}`));
  }
  return errors;
}

function fail(errorClass, message, path) { return { errorClass, message, path }; }
function warning(warningClass, message, path) { return { warningClass, message, path }; }

export async function loadSchemas(schemaDir) {
  const load = async name => JSON.parse(await readFile(new URL(`${name}.schema.json`, schemaDir), 'utf8'));
  return { manifest: await load('manifest'), project: await load('project'), trace: await load('trace') };
}

export function validatePackage(pkg, schemas) {
  const errors = []; const warnings = [];
  const manifest = pkg?.manifest; const entries = pkg?.entries;
  if (!manifest || typeof manifest !== 'object') return { ok: false, errors: [fail('MANIFEST_INVALID','manifest missing','$')], warnings };
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return { ok: false, errors: [fail('PACKAGE_ENTRIES_INVALID','entries missing','$')], warnings };

  const version = String(manifest.packageVersion || '');
  if (version.split('.')[0] !== '1') errors.push(fail('UNSUPPORTED_PACKAGE_MAJOR',`unsupported package major: ${version}`,'manifest.packageVersion'));
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const seen = new Map();
  for (const [index, file] of files.entries()) {
    const p = file?.path;
    if (typeof p !== 'string' || !SAFE_PATH.test(p) || p.includes('\\') || EXECUTABLE_EXT.test(p)) errors.push(fail('UNSAFE_PATH',`unsafe package path: ${p}`,`manifest.files[${index}].path`));
    if (seen.has(p)) errors.push(fail('DUPLICATE_PATH',`duplicate package path: ${p}`,`manifest.files[${index}].path`)); else seen.set(p,index);
    if (!SHA256.test(String(file?.sha256 || ''))) errors.push(fail('CHECKSUM_FORMAT',`invalid SHA-256 for ${p}`,`manifest.files[${index}].sha256`));
  }
  const projects = files.filter(file => file?.role === 'project');
  if (projects.length !== 1 || projects[0]?.path !== manifest.projectFile || !(manifest.projectFile in entries)) errors.push(fail('PROJECT_FILE_MISSING','manifest must declare exactly one available project file','manifest.projectFile'));
  if (errors.length) return { ok:false, errors, warnings };

  for (const [index, file] of files.entries()) {
    const entry = entries[file.path];
    if (!entry) { errors.push(fail('DECLARED_FILE_MISSING',`declared file missing: ${file.path}`,`manifest.files[${index}]`)); continue; }
    const bytes = entryBytes(entry);
    if (bytes.length !== file.sizeBytes) errors.push(fail('SIZE_MISMATCH',`size mismatch: ${file.path}`,`manifest.files[${index}].sizeBytes`));
    if (sha256(bytes) !== file.sha256) errors.push(fail('CHECKSUM_MISMATCH',`digest mismatch: ${file.path}`,`manifest.files[${index}].sha256`));
  }
  for (const path of Object.keys(entries)) if (!seen.has(path)) errors.push(fail('UNDECLARED_FILE',`entry absent from manifest: ${path}`,`entries.${path}`));
  if (errors.length) return { ok:false, errors, warnings };

  const project = entries[manifest.projectFile]?.content;
  const traceRecords = Array.isArray(project?.traceFiles) ? project.traceFiles : [];
  const traces = [];
  for (const record of traceRecords) {
    const entry = entries[record.path];
    if (entry?.kind === 'json') traces.push(entry.content);
  }
  const objectId = project?.object?.objectId;
  for (const [index, record] of traceRecords.entries()) {
    const traceDoc = traces.find(trace => trace?.traceId === record.traceId);
    if (record.objectId !== objectId || traceDoc?.objectId !== objectId) errors.push(fail('TRACE_OBJECT_MISMATCH',`trace ${record.traceId} does not reference shared object`,`project.traceFiles[${index}]`));
  }

  const allStationIds = new Set(traces.flatMap(trace => trace?.geometry?.stations || []).map(station => station.stationId));
  const projectAssets = new Map((project?.assets || []).map(asset => [asset.assetId, asset]));
  const manifestByPath = new Map(files.map(file => [file.path,file]));
  for (const [index, asset] of (project?.assets || []).entries()) {
    const file = manifestByPath.get(asset.path);
    if (!file || file.sha256 !== asset.sha256 || file.sizeBytes !== asset.sizeBytes || file.mediaType !== asset.mediaType || file.role !== asset.role) errors.push(fail('ASSET_NOT_DECLARED',`asset ${asset.assetId} lacks matching manifest entry`,`project.assets[${index}]`));
  }

  for (const [index, trace] of traces.entries()) {
    const frame = trace?.view?.viewFrame;
    const maps = [frame?.uAxis?.engineeringAxis,frame?.vAxis?.engineeringAxis,frame?.normalAxis?.engineeringAxis];
    if (maps.some(axis => !['X','Y','Z'].includes(axis)) || new Set(maps).size !== 3) errors.push(fail('VIEW_FRAME_MAPPING',`trace ${trace?.traceId} lacks a complete one-to-one engineering-axis mapping`,`traces[${index}].view.viewFrame`));

    const viewType = trace?.view?.viewType; const geometricUse = trace?.view?.geometricUse; const binding = trace?.view?.sectionBinding;
    if (['front','section'].includes(viewType) && geometricUse === 'used_for_geometry') {
      if (!binding || (!binding.stationId && !Number.isFinite(binding.xMm))) errors.push(fail('SECTION_BINDING_REQUIRED',`geometric ${viewType} trace requires stationId or xMm`,`traces[${index}].view.sectionBinding`));
      else if (binding.stationId && !allStationIds.has(binding.stationId)) errors.push(fail('SECTION_STATION_UNKNOWN',`unknown section station ${binding.stationId}`,`traces[${index}].view.sectionBinding.stationId`));
    } else if (['front','section'].includes(viewType) && !binding) warnings.push(warning('UNPLACED_VIEW_PRESERVED',`unbound ${viewType} retained as provenance`,`traces[${index}].view`));

    const contours = trace?.geometry?.contours || [];
    if (geometricUse === 'used_for_geometry') {
      const primary = contours.filter(contour => contour.role === 'outer_contour' && contour.status === 'primary' && contour.closed === true);
      if (primary.length !== 1 || trace?.geometry?.primaryContourId !== primary[0]?.contourId) errors.push(fail('PRIMARY_CONTOUR_AMBIGUOUS',`trace ${trace?.traceId} must select exactly one primary closed outer contour`,`traces[${index}].geometry.primaryContourId`));
    }

    const c = trace?.calibration || {}; const ratio = c.sourceRealLength / c.sourcePixelLength;
    const allowed = Math.max(1e-9 * Math.max(1,Math.abs(ratio)), Number(c.toleranceMm || 0) / Math.max(1,Number(c.sourcePixelLength || 1)));
    if (![c.unitPerPx,c.sourcePixelLength,c.sourceRealLength].every(Number.isFinite) || Math.abs(c.unitPerPx-ratio) > allowed) errors.push(fail('CALIBRATION_CONFLICT',`trace ${trace?.traceId} calibration values disagree`,`traces[${index}].calibration`));

    const planeAxes = new Set([frame?.uAxis?.engineeringAxis,frame?.vAxis?.engineeringAxis]);
    for (const station of trace?.geometry?.stations || []) if (!planeAxes.has(station?.orientation?.engineeringAxis)) errors.push(fail('STATION_ORIENTATION_UNMAPPABLE',`station ${station?.stationId} orientation is not in the view plane`,`traces[${index}].geometry.stations`));

    const ids = [trace?.assets?.sourceImageAssetId,trace?.assets?.sourceSvgAssetId,...(trace?.assets?.sidecarAssetIds || [])].filter(Boolean);
    for (const id of ids) if (!projectAssets.has(id)) errors.push(fail('ASSET_REFERENCE_UNKNOWN',`trace asset ${id} not in project inventory`,`traces[${index}].assets`));
  }

  const sourceFields = new Set([...(project?.provenance?.sourceFields || []),...traces.flatMap(trace => trace?.provenance?.sourceFields || [])]);
  const dispositions = new Map();
  for (const item of project?.fieldDisposition || []) {
    if (dispositions.has(item.sourcePath)) errors.push(fail('FIELD_DISPOSITION_DUPLICATE',`duplicate field disposition: ${item.sourcePath}`,'project.fieldDisposition'));
    dispositions.set(item.sourcePath,item);
    if (item.status === 'unsupported_warning') warnings.push(warning(item.warningCode || 'UNSUPPORTED_SOURCE_FIELD',item.reason,item.sourcePath));
    if (item.status === 'unsupported_error') errors.push(fail('UNSUPPORTED_SOURCE_FIELD',item.reason,item.sourcePath));
  }
  for (const path of sourceFields) if (!dispositions.has(path)) errors.push(fail('FIELD_DISPOSITION_MISSING',`source field lacks disposition: ${path}`,'project.fieldDisposition'));

  if (errors.length) return { ok:false, errors, warnings };
  const manifestSchemaErrors = schemaErrors(manifest,schemas.manifest);
  const projectSchemaErrors = schemaErrors(project,schemas.project);
  const traceSchemaErrors = traces.flatMap((trace,index) => schemaErrors(trace,schemas.trace,schemas.trace,`traces[${index}]`));
  if (manifestSchemaErrors.length || projectSchemaErrors.length || traceSchemaErrors.length) errors.push(fail('SCHEMA_VALIDATION',[...manifestSchemaErrors,...projectSchemaErrors,...traceSchemaErrors].join('; '),'$'));
  return { ok: errors.length === 0, errors, warnings };
}

export function collectSchemaFields(schema, schemaName) {
  const fields=[];
  function walk(node, location) {
    if (!node || typeof node !== 'object') return;
    if (node.properties && typeof node.properties === 'object') for (const [name,child] of Object.entries(node.properties)) {
      const schemaLocation=`${location}/properties/${name}`;
      fields.push({schema:schemaName,schemaLocation,fieldName:name,disposition:child['x-disposition']});
      walk(child,schemaLocation);
    }
    if (node.$defs) for (const [name,child] of Object.entries(node.$defs)) walk(child,`${location}/$defs/${name}`);
    for (const [key,value] of Object.entries(node)) if (!['properties','$defs'].includes(key)) {
      if (Array.isArray(value)) value.forEach((child,index)=>walk(child,`${location}/${key}/${index}`));
      else if (value && typeof value === 'object') walk(value,`${location}/${key}`);
    }
  }
  walk(schema,'#');
  return fields.sort((a,b)=>`${a.schema}:${a.schemaLocation}`.localeCompare(`${b.schema}:${b.schemaLocation}`));
}
