#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Run modular observation package v1 contract suites in deterministic order.
 * Inputs: Modular schemas, semantic validator, fixtures, and domain test modules.
 * Outputs: Blocking assertions and a scoped machine-readable summary.
 * Safe edits: Test-suite ordering and summary fields.
 * Do not: Embed domain fixtures, schema definitions, or validation logic.
 * Verification: Run directly and through npm test.
 */
"use strict";

const path = require("node:path");
const fixture = require("./observation-package-v1/fixture-factory.cjs");
const { createAssertions } = require("./observation-package-v1/assertions.cjs");
const { loadSchemas } = require("./observation-package-v1/schema-loader.cjs");

const SUITES = Object.freeze([
  "schema-contract.test.cjs",
  "vocabulary-parity.test.cjs",
  "object-frame.test.cjs",
  "camera-view.test.cjs",
  "geometry.test.cjs",
  "references.test.cjs",
  "decision.test.cjs",
  "determinism.test.cjs",
  "module-boundaries.test.cjs",
]);

const repositoryRoot = path.resolve(__dirname, "../../..");
const schemaInventory = loadSchemas(repositoryRoot);
const semanticValidator = require(
  path.join(
    repositoryRoot,
    "schema/engrove_tonearm_observation_package_v1.validator.cjs",
  ),
);
const assertions = createAssertions({
  validateSchema: schemaInventory.validate,
  semanticValidator,
});
const context = {
  repositoryRoot,
  schemaInventory,
  semanticValidator,
  assertions,
  fixture,
};

for (const suite of SUITES) {
  require(path.join(__dirname, "observation-package-v1", suite)).run(context);
}

console.log(
  JSON.stringify(
    {
      status: "PASS_WITH_SCOPE",
      test: "observation-package-contract",
      schemaDraft: "2020-12",
      schemaId: schemaInventory.rootSchema.$id,
      schemaFiles: schemaInventory.schemas.length,
      suites: SUITES.length,
      validCases: assertions.counts.valid,
      structuralNegativeCases: assertions.counts.structuralInvalid,
      semanticNegativeCases: assertions.counts.semanticInvalid,
      vocabularyParity: true,
      envelopeRoleParity: true,
      deterministic: true,
      inputMutation: false,
      moduleBoundaries: true,
    },
    null,
    2,
  ),
);
