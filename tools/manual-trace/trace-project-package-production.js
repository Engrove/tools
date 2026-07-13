/**
 * Production closure for Manual Trace package export.
 * Loads the merged v1 schemas, canonicalizes every JSON payload, applies
 * locale-independent ordering, validates fail-closed, then creates ZIP bytes.
 */
(function installProductionPackageExport(globalScope) {
  "use strict";

  const base = globalScope.EngroveTraceProjectPackage;
  if (!base) throw new Error("Trace Project Package runtime failed to load.");

  const schemaCache = new Map();
  const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const compareCodeUnits = (left, right) => {
    const a = String(left);
    const b = String(right);
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const roleRank = role => ({ project: 0, trace: 1, source_image: 2, source_svg: 3, sidecar: 4, readme: 5 }[role] ?? 9);
  const compareFiles = (left, right) => roleRank(left.role) - roleRank(right.role) || compareCodeUnits(left.path, right.path);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalText(value) {
    return new TextDecoder().decode(base.canonicalJsonBytes(value));
  }

  function normalizeModel(model) {
    const normalized = clone(model);
    normalized.traces = [...(normalized.traces || [])].sort((a, b) => compareCodeUnits(a.traceId, b.traceId));
    normalized.assets = [...(normalized.assets || [])].map(asset => {
      if (asset.mediaType !== "application/json") return asset;
      let value;
      if (asset.json !== undefined) value = asset.json;
      else if (asset.content !== undefined && isRecord(asset.content)) value = asset.content;
      else if (typeof asset.text === "string") value = JSON.parse(asset.text);
      else throw new Error(`JSON asset ${asset.assetId} lacks parseable content.`);
      return { ...asset, text: canonicalText(value), json: undefined, content: undefined, bytes: undefined };
    }).sort((a, b) => compareCodeUnits(a.path, b.path));
    return normalized;
  }

  function resolvePointer(root, reference) {
    if (!reference.startsWith("#/")) throw new Error(`Unsupported schema reference: ${reference}`);
    return reference.slice(2).split("/").reduce((node, token) => node[token.replace(/~1/g, "/").replace(/~0/g, "~")], root);
  }

  function equal(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function matchesType(value, type) {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return isRecord(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
  }

  function schemaErrors(value, schema, root = schema, path = "$") {
    if (!schema || typeof schema !== "object") return [];
    if (schema.$ref) return schemaErrors(value, resolvePointer(root, schema.$ref), root, path);
    const errors = [];
    if (schema.allOf) schema.allOf.forEach(item => errors.push(...schemaErrors(value, item, root, path)));
    if (schema.anyOf && !schema.anyOf.some(item => schemaErrors(value, item, root, path).length === 0)) errors.push(`${path}: anyOf`);
    if (schema.oneOf) {
      const count = schema.oneOf.filter(item => schemaErrors(value, item, root, path).length === 0).length;
      if (count !== 1) errors.push(`${path}: oneOf matched ${count}`);
    }
    if (schema.not && schemaErrors(value, schema.not, root, path).length === 0) errors.push(`${path}: not`);
    if (schema.const !== undefined && !equal(value, schema.const)) errors.push(`${path}: const`);
    if (schema.enum && !schema.enum.some(item => equal(item, value))) errors.push(`${path}: enum`);
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(type => matchesType(value, type))) return [...errors, `${path}: expected ${types.join("|")}`];
    }
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: minLength`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: maxLength`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
      if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: date-time`);
    }
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum`);
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: exclusiveMinimum`);
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
      if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) errors.push(`${path}: uniqueItems`);
      if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, root, `${path}[${index}]`)));
      if (schema.contains) {
        const count = value.filter(item => schemaErrors(item, schema.contains, root, path).length === 0).length;
        if (count < (schema.minContains ?? 1) || count > (schema.maxContains ?? Infinity)) errors.push(`${path}: contains`);
      }
    }
    if (isRecord(value)) {
      (schema.required || []).forEach(key => { if (!(key in value)) errors.push(`${path}.${key}: required`); });
      const properties = schema.properties || {};
      if (schema.additionalProperties === false) Object.keys(value).forEach(key => { if (!(key in properties)) errors.push(`${path}.${key}: additional`); });
      Object.entries(properties).forEach(([key, child]) => { if (key in value) errors.push(...schemaErrors(value[key], child, root, `${path}.${key}`)); });
    }
    return errors;
  }

  async function loadSchemas(options = {}) {
    if (options.schemas) return options.schemas;
    const node = typeof process !== "undefined" && process.versions?.node;
    const key = node ? `node:${options.schemaDirectory || "schema/trace-project-package"}` : options.schemaBaseUrl || "browser-default";
    if (!schemaCache.has(key)) schemaCache.set(key, (async () => {
      if (node) {
        const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
        const directory = path.resolve(process.cwd(), options.schemaDirectory || "schema/trace-project-package");
        const read = async name => JSON.parse(await readFile(path.join(directory, `${name}.schema.json`), "utf8"));
        return { manifest: await read("manifest"), project: await read("project"), trace: await read("trace") };
      }
      const baseUrl = options.schemaBaseUrl || new URL("../../schema/trace-project-package/", document.baseURI).href;
      const read = async name => {
        const response = await fetch(new URL(`${name}.schema.json`, baseUrl), { cache: "no-cache", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Could not load ${name} contract schema (${response.status}).`);
        return response.json();
      };
      return { manifest: await read("manifest"), project: await read("project"), trace: await read("trace") };
    })());
    return schemaCache.get(key);
  }

  function entryBytes(entry) {
    if (entry.kind === "json") return base.canonicalJsonBytes(entry.content);
    if (entry.kind === "base64") return Uint8Array.from(atob(entry.content), character => character.charCodeAt(0));
    return new TextEncoder().encode(entry.content);
  }

  async function normalizeVirtualPackage(pkg) {
    pkg.project.traceFiles.sort((a, b) => compareCodeUnits(a.traceId, b.traceId));
    pkg.project.assets.sort((a, b) => compareCodeUnits(a.path, b.path));
    pkg.entries["project.json"] = { kind: "json", content: pkg.project };
    const projectBytes = base.canonicalJsonBytes(pkg.project);
    const projectFile = pkg.manifest.files.find(file => file.role === "project");
    projectFile.sizeBytes = projectBytes.byteLength;
    projectFile.sha256 = await base.sha256Hex(projectBytes);
    pkg.manifest.files.sort(compareFiles);
    const ordered = [{ path: "manifest.json", bytes: base.canonicalJsonBytes(pkg.manifest), kind: "json", content: pkg.manifest }];
    for (const file of pkg.manifest.files) ordered.push({ path: file.path, bytes: entryBytes(pkg.entries[file.path]) });
    pkg.orderedEntries = ordered;
    pkg.orderedPaths = ordered.map(entry => entry.path);
    return pkg;
  }

  async function validateMergedSchemas(pkg, options = {}) {
    const schemas = await loadSchemas(options);
    const traces = pkg.project.traceFiles.map(record => pkg.entries[record.path]?.content);
    const diagnostics = [
      ...schemaErrors(pkg.manifest, schemas.manifest, schemas.manifest, "manifest"),
      ...schemaErrors(pkg.project, schemas.project, schemas.project, "project"),
      ...traces.flatMap((trace, index) => schemaErrors(trace, schemas.trace, schemas.trace, `traces[${index}]`))
    ].sort(compareCodeUnits);
    if (diagnostics.length) {
      const error = new Error(`Merged contract validation failed: ${diagnostics.join("; ")}`);
      error.code = "CONTRACT_VALIDATION_FAILED";
      error.diagnostics = diagnostics;
      throw error;
    }
    return true;
  }

  async function buildValidatedZipPackage(model, options = {}) {
    const normalizedModel = normalizeModel(model);
    const pkg = await base.buildVirtualPackage(normalizedModel, options);
    await normalizeVirtualPackage(pkg);
    await validateMergedSchemas(pkg, options);
    await base.validateVirtualPackage(pkg, options);
    const zipBytes = base.createDeterministicZip(pkg.orderedEntries, options.limits);
    return { ...pkg, zipBytes };
  }

  globalScope.EngroveTraceProjectPackageProduction = Object.freeze({
    compareCodeUnits,
    canonicalText,
    normalizeModel,
    schemaErrors,
    loadSchemas,
    validateMergedSchemas,
    buildValidatedZipPackage
  });
})(globalThis);
