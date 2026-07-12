// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Provide shared schema and semantic contract assertions.
 * Inputs: Compiled schema validator, semantic validator, and fresh fixture factory.
 * Outputs: Assertion helpers and per-suite counters.
 * Safe edits: Reusable assertion semantics and mutation guards.
 * Do not: Construct domain fixtures or execute suites during module load.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const assert = require("node:assert/strict");
const { makePackage } = require("./fixture-factory.cjs");

function createAssertions({ validateSchema, semanticValidator }) {
  const counts = { valid: 0, structuralInvalid: 0, semanticInvalid: 0 };
  const semanticCodes = (result) => result.errors.map((error) => error.code);

  function assertSchemaValid(value, label) {
    assert.equal(
      validateSchema(value),
      true,
      `${label}: ${JSON.stringify(validateSchema.errors, null, 2)}`,
    );
  }

  function assertSchemaInvalid(value, label) {
    assert.equal(
      validateSchema(value),
      false,
      `${label}: schema unexpectedly accepted fixture`,
    );
  }

  function assertSemanticValid(value, label) {
    assert.deepEqual(
      semanticValidator.validateObservationPackage(value),
      { valid: true, errors: [] },
      label,
    );
  }

  function assertSemanticInvalid(value, code, label) {
    const result = semanticValidator.validateObservationPackage(value);
    assert.equal(result.valid, false, label);
    assert.ok(
      semanticCodes(result).includes(code),
      `${label}: ${JSON.stringify(result.errors, null, 2)}`,
    );
    return result;
  }

  function expectValid(label, mutate = () => {}) {
    const value = makePackage();
    mutate(value);
    assertSchemaValid(value, label);
    assertSemanticValid(value, label);
    counts.valid += 1;
    return value;
  }

  function structuralCase(label, mutate, semanticCode) {
    const value = makePackage();
    mutate(value);
    assertSchemaInvalid(value, label);
    if (semanticCode) assertSemanticInvalid(value, semanticCode, label);
    counts.structuralInvalid += 1;
    return value;
  }

  function semanticCase(label, mutate, semanticCode) {
    const value = makePackage();
    mutate(value);
    assertSchemaValid(value, `${label} must remain structurally valid`);
    assertSemanticInvalid(value, semanticCode, label);
    counts.semanticInvalid += 1;
    return value;
  }

  return {
    assert,
    counts,
    assertSchemaValid,
    assertSchemaInvalid,
    assertSemanticValid,
    assertSemanticInvalid,
    expectValid,
    structuralCase,
    semanticCase,
  };
}

module.exports = { createAssertions };
