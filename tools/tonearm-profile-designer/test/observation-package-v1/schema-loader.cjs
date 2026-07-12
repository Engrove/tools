// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Load, inventory, register, and compile every observation package v1 Draft 2020-12 schema.
 * Inputs: Repository-relative schema paths.
 * Outputs: Parsed schema inventory, Ajv instance, and compiled root validator.
 * Safe edits: Explicit schema inventory and deterministic reference checks.
 * Do not: Own fixtures, semantic validation, network references, or fallback loading.
 * Verification: schema-contract.test.cjs and module-boundaries.test.cjs.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_FILES = Object.freeze([
  "schema/tonearm-observation-package-v1/shared.schema.json",
  "schema/tonearm-observation-package-v1/object.schema.json",
  "schema/tonearm-observation-package-v1/object-frame.schema.json",
  "schema/tonearm-observation-package-v1/camera.schema.json",
  "schema/tonearm-observation-package-v1/view.schema.json",
  "schema/tonearm-observation-package-v1/geometry.schema.json",
  "schema/tonearm-observation-package-v1/relations.schema.json",
  "schema/tonearm-observation-package-v1/observation.schema.json",
  "schema/tonearm-observation-package-v1/uncertainty.schema.json",
  "schema/tonearm-observation-package-v1/provenance.schema.json",
  "schema/tonearm-observation-package-v1/decision.schema.json",
  "schema/tonearm-observation-package-v1/package.schema.json",
  "schema/engrove_tonearm_observation_package_v1.schema.json",
]);

function loadSchemas(repositoryRoot) {
  const schemas = SCHEMA_FILES.map((relativePath) => {
    const absolutePath = path.join(repositoryRoot, relativePath);
    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    } catch (error) {
      throw new Error(`SCHEMA_LOAD_FAILED: ${relativePath}: ${error.message}`);
    }
    if (!schema.$id) throw new Error(`SCHEMA_ID_MISSING: ${relativePath}`);
    return { relativePath, absolutePath, schema };
  });

  const ids = new Map();
  for (const item of schemas) {
    if (ids.has(item.schema.$id)) {
      throw new Error(
        `SCHEMA_ID_DUPLICATE: ${item.schema.$id}: ${ids.get(item.schema.$id)} and ${item.relativePath}`,
      );
    }
    ids.set(item.schema.$id, item.relativePath);
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    allowUnionTypes: false,
  });
  for (const item of schemas) ajv.addSchema(item.schema, item.schema.$id);

  const root = schemas.at(-1);
  let validate;
  try {
    validate = ajv.getSchema(root.schema.$id);
    if (!validate) validate = ajv.compile(root.schema);
  } catch (error) {
    throw new Error(
      `SCHEMA_COMPILE_FAILED: ${root.relativePath}: ${error.message}`,
    );
  }

  assertAllSchemasReachable(schemas, root.schema.$id);
  return { schemas, rootSchema: root.schema, ajv, validate };
}

function assertAllSchemasReachable(schemas, rootId) {
  const byId = new Map(schemas.map((item) => [item.schema.$id, item]));
  const visited = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const item = byId.get(id);
    if (!item) throw new Error(`SCHEMA_REFERENCE_UNREGISTERED: ${id}`);
    for (const reference of collectReferences(item.schema)) {
      if (reference.startsWith("#")) continue;
      const target = resolveReferenceId(id, reference);
      if (!byId.has(target)) {
        throw new Error(
          `SCHEMA_REFERENCE_UNREGISTERED: ${item.relativePath}: ${reference}`,
        );
      }
      queue.push(target);
    }
  }
  const unused = schemas.filter((item) => !visited.has(item.schema.$id));
  if (unused.length) {
    throw new Error(
      `SCHEMA_FILE_UNUSED: ${unused.map((item) => item.relativePath).join(", ")}`,
    );
  }
  assertAcyclicReferences(schemas);
}

function assertAcyclicReferences(schemas) {
  const graph = new Map();
  for (const item of schemas) {
    const targets = collectReferences(item.schema)
      .filter((reference) => !reference.startsWith("#"))
      .map((reference) => resolveReferenceId(item.schema.$id, reference));
    graph.set(item.schema.$id, [...new Set(targets)]);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visiting.has(id)) {
      throw new Error(`SCHEMA_REFERENCE_CYCLE: ${[...stack, id].join(" -> ")}`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of graph.get(id) || []) visit(target, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id, []);
}

function collectReferences(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, output));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") output.push(item);
      else collectReferences(item, output);
    }
  }
  return output;
}

function resolveReferenceId(baseId, reference) {
  const pathPart = reference.split("#", 1)[0];
  const baseParts = baseId.split("/");
  baseParts.pop();
  const combined = [...baseParts, ...pathPart.split("/")];
  const normalized = [];
  for (const part of combined) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

module.exports = { SCHEMA_FILES, loadSchemas };
