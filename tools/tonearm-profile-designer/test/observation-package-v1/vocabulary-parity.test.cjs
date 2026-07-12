// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify schema, version, required-field, vocabulary, and envelope-role parity.
 * Inputs: Loaded schema inventory and public semantic validator API.
 * Outputs: Exact-set parity assertions.
 * Safe edits: Contract vocabulary and parity expectations.
 * Do not: Duplicate domain behavior tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions, schemaInventory, semanticValidator }) {
  const { assert } = assertions;
  const root = schemaInventory.rootSchema;
  const packageSchema = findSchema(schemaInventory, "package.schema.json");
  const sharedSchema = findSchema(schemaInventory, "shared.schema.json");

  assert.equal(root.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(root.$id, semanticValidator.schemaId);
  assert.equal(packageSchema.properties.schema.const, semanticValidator.schema);
  assert.equal(
    packageSchema.properties.version.const,
    semanticValidator.version,
  );
  assert.deepEqual(packageSchema.required, [
    ...semanticValidator.topLevelRequired,
  ]);
  assert.deepEqual(sharedSchema.$defs.EnvelopeGeometryRole.enum, [
    ...semanticValidator.envelopeRoles,
  ]);

  for (const [name, values] of Object.entries(semanticValidator.enums)) {
    const definition = findDefinition(schemaInventory, name);
    assert.ok(definition?.enum, `Missing schema enum definition: ${name}`);
    assert.deepEqual(
      definition.enum,
      [...values],
      `Vocabulary mismatch: ${name}`,
    );
  }
  assert.ok(
    !sharedSchema.$defs.AcceptanceScope.enum.includes(
      "reconstruction_candidate",
    ),
  );
}

function findSchema(inventory, suffix) {
  return inventory.schemas.find((item) => item.relativePath.endsWith(suffix))
    .schema;
}

function findDefinition(inventory, name) {
  for (const item of inventory.schemas) {
    if (item.schema.$defs?.[name]) return item.schema.$defs[name];
  }
  return null;
}

module.exports = { run };
