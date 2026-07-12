// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify deterministic error ordering, non-mutation, and absence of fabricated records.
 * Inputs: Public semantic validator and fresh valid/invalid fixtures.
 * Outputs: Determinism and mutation assertions.
 * Safe edits: Determinism, purity, and no-default regression cases.
 * Do not: Own domain-specific validity rules.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions, fixture, semanticValidator }) {
  const valid = fixture.makePackage();
  const validBefore = JSON.stringify(valid);
  const validOne = semanticValidator.validateObservationPackage(valid);
  const validTwo = semanticValidator.validateObservationPackage(valid);
  assertions.assert.deepEqual(validOne, validTwo);
  assertions.assert.deepEqual(validOne, { valid: true, errors: [] });
  assertions.assert.equal(JSON.stringify(valid), validBefore);

  const invalid = fixture.makePackage();
  invalid.observations[0].component_id = "component.missing";
  invalid.observations[0].station_id = "station.missing";
  const invalidBefore = JSON.stringify(invalid);
  const invalidOne = semanticValidator.validateObservationPackage(invalid);
  const invalidTwo = semanticValidator.validateObservationPackage(invalid);
  assertions.assert.deepEqual(invalidOne, invalidTwo);
  assertions.assert.equal(JSON.stringify(invalid), invalidBefore);
  assertions.assert.equal(invalid.object.components.length, 1);
  assertions.assert.equal(invalid.stations.length, 1);
  assertions.assert.equal(invalid.landmarks.length, 1);
  assertions.assert.deepEqual(
    invalidOne.errors,
    [...invalidOne.errors].sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message),
    ),
  );
}

module.exports = { run };
