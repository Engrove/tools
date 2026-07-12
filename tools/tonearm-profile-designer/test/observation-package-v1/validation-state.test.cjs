// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify validation-state structure, issue records, and status consistency.
 * Inputs: Fresh package fixtures and shared schema/semantic assertions.
 * Outputs: Validation-state contract regression assertions.
 * Safe edits: Validation-state fields, issue records, and status cases only.
 * Do not: Own unrelated package-domain or provenance-reference tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions }) {
  assertions.expectValid("baseline not-validated state");
  assertions.expectValid("valid validation state", (value) => {
    value.validation = validState();
  });
  assertions.expectValid("invalid validation state", (value) => {
    value.validation = invalidState();
  });

  assertions.structuralCase(
    "validation state must be an object",
    (value) => {
      value.validation = 42;
    },
    "OBJECT_REQUIRED",
  );
  assertions.structuralCase(
    "validation status is required",
    (value) => {
      delete value.validation.status;
    },
    "PROPERTY_REQUIRED",
  );
  assertions.structuralCase(
    "validation status vocabulary",
    (value) => {
      value.validation.status = "pending";
    },
    "VALUE_ENUM_INVALID",
  );
  assertions.structuralCase(
    "validation schema identity",
    (value) => {
      value.validation.schema_id = "other_schema";
    },
    "CONTRACT_CONST_MISMATCH",
  );
  assertions.structuralCase(
    "validation state rejects unknown property",
    (value) => {
      value.validation.extra = true;
    },
    "PROPERTY_UNKNOWN",
  );
  assertions.structuralCase(
    "validation name length",
    (value) => {
      value.validation.validator_name = "";
    },
    "STRING_TOO_SHORT",
  );
  assertions.structuralCase(
    "validation date-time",
    (value) => {
      value.validation.validated_at = "not-a-date";
    },
    "DATE_TIME_INVALID",
  );
  assertions.structuralCase(
    "validation issue record shape",
    (value) => {
      value.validation = invalidState();
      delete value.validation.errors[0].message;
    },
    "PROPERTY_REQUIRED",
  );
  assertions.structuralCase(
    "validation issue code pattern",
    (value) => {
      value.validation = invalidState();
      value.validation.errors[0].code = "bad";
    },
    "STRING_PATTERN_INVALID",
  );
  assertions.structuralCase(
    "validation issue rejects unknown property",
    (value) => {
      value.validation = invalidState();
      value.validation.errors[0].extra = true;
    },
    "PROPERTY_UNKNOWN",
  );
  assertions.structuralCase(
    "validation issue path length",
    (value) => {
      value.validation = invalidState();
      value.validation.errors[0].path = "";
    },
    "STRING_TOO_SHORT",
  );
  assertions.structuralCase(
    "validation issue message length",
    (value) => {
      value.validation = invalidState();
      value.validation.errors[0].message = "x".repeat(513);
    },
    "STRING_TOO_LONG",
  );
  assertions.structuralCase(
    "validation version length",
    (value) => {
      value.validation.validator_version = "";
    },
    "STRING_TOO_SHORT",
  );

  assertions.semanticCase(
    "not-validated state rejects validator metadata",
    (value) => {
      value.validation.validator_name = "validator";
      value.validation.validator_version = "1.0.0";
      value.validation.validated_at = "2026-07-12T12:00:00Z";
    },
    "VALIDATION_NOT_VALIDATED_METADATA_FORBIDDEN",
  );
  assertions.semanticCase(
    "not-validated state rejects errors",
    (value) => {
      value.validation.errors = invalidState().errors;
    },
    "VALIDATION_NOT_VALIDATED_ERRORS_FORBIDDEN",
  );
  assertions.semanticCase(
    "valid state requires validator identity",
    (value) => {
      value.validation.status = "valid";
      value.validation.validated_at = "2026-07-12T12:00:00Z";
    },
    "VALIDATION_VALID_IDENTITY_REQUIRED",
  );
  assertions.semanticCase(
    "valid state rejects errors",
    (value) => {
      value.validation = validState();
      value.validation.errors = invalidState().errors;
    },
    "VALIDATION_VALID_ERRORS_FORBIDDEN",
  );
  assertions.semanticCase(
    "invalid state requires errors",
    (value) => {
      value.validation.status = "invalid";
    },
    "VALIDATION_INVALID_ERRORS_REQUIRED",
  );
}

function validState() {
  return {
    status: "valid",
    schema_id: "engrove_tonearm_observation_package_v1",
    validator_name: "engrove-observation-validator",
    validator_version: "1.0.0",
    validated_at: "2026-07-12T12:00:00Z",
    errors: [],
  };
}

function invalidState() {
  return {
    status: "invalid",
    schema_id: "engrove_tonearm_observation_package_v1",
    validator_name: null,
    validator_version: null,
    validated_at: null,
    errors: [
      {
        code: "EXAMPLE_ERROR",
        path: "$.observations[0]",
        message: "Example validation issue.",
      },
    ],
  };
}

module.exports = { run };
