// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Expose the stable public observation package v1 validator API.
 * Inputs: Arbitrary JavaScript values supplied to validateObservationPackage.
 * Outputs: Immutable contract metadata and the semantic validation function.
 * Safe edits: Public API compatibility and facade wiring only.
 * Do not: Add domain validation logic, defaults, mutation, or reconstruction behavior.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const constants = require("./tonearm-observation-package-v1/validator/constants.cjs");
const {
  validateObservationPackage,
} = require("./tonearm-observation-package-v1/validator/index.cjs");

module.exports = Object.freeze({
  schema: constants.SCHEMA,
  schemaId: constants.SCHEMA_ID,
  version: constants.VERSION,
  frameTolerance: constants.FRAME_TOLERANCE,
  topLevelRequired: constants.TOP_LEVEL_REQUIRED,
  enums: constants.ENUMS,
  envelopeRoles: constants.ENVELOPE_ROLES,
  validateObservationPackage,
});
