// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify Draft 2020-12 loading and structural package invariants.
 * Inputs: Compiled schema, semantic validator, fixtures, and shared assertions.
 * Outputs: Blocking structural assertions.
 * Safe edits: Structural positive and negative contract cases.
 * Do not: Own semantic cross-reference or domain-specific geometry tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions, fixture }) {
  const { expectValid, structuralCase } = assertions;
  expectValid("baseline package");

  structuralCase(
    "object revision required",
    (value) => {
      delete value.object.revision;
    },
    "PROPERTY_REQUIRED",
  );
  structuralCase(
    "unknown top property",
    (value) => {
      value.unexpected = true;
    },
    "PROPERTY_UNKNOWN",
  );
  structuralCase(
    "configuration extra property",
    (value) => {
      value.object.configuration.mounted = true;
    },
    "PROPERTY_UNKNOWN",
  );
  structuralCase(
    "configuration object required",
    (value) => {
      value.object.configuration = "as_captured";
    },
    "OBJECT_REQUIRED",
  );

  const value = fixture.makePackage();
  assertions.assert.equal(
    value.object.configuration.id,
    "complete_wand_without_cartridge",
  );
  assertions.assert.equal(
    value.object.configuration.assembly_state,
    "as_captured",
  );
}

module.exports = { run };
