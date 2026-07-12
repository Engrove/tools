// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Prove semantic dispatch for every mandatory top-level package domain.
 * Inputs: Public semantic validator and fresh package fixtures.
 * Outputs: Runtime assertions for direct top-level validator coverage.
 * Safe edits: Mandatory top-level domain dispatch cases only.
 * Do not: Replace runtime validation with source-text inspection or Ajv assertions.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const DOMAINS = Object.freeze([
  "object",
  "target_consumer",
  "object_frame",
  "views",
  "landmarks",
  "observations",
  "stations",
  "features",
  "constraints",
  "uncertainty_model",
  "provenance",
  "validation",
  "operator_acceptance",
]);

function run({ assertions, fixture, semanticValidator }) {
  for (const domain of DOMAINS) {
    const value = fixture.makePackage();
    value[domain] = 42;
    const result = semanticValidator.validateObservationPackage(value);
    const path = `$.${domain}`;

    assertions.assert.equal(
      result.valid,
      false,
      `${domain}: semantic validator unexpectedly accepted invalid type`,
    );
    assertions.assert.ok(
      result.errors.some((error) => error.path === path),
      `${domain}: no semantic error was dispatched at ${path}: ${JSON.stringify(
        result.errors,
        null,
        2,
      )}`,
    );
  }
}

module.exports = { DOMAINS, run };
