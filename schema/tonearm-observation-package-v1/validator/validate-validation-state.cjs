// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate the package validation-state record and status consistency.
 * Inputs: Validation-state record and JSON-style path.
 * Outputs: Deterministic structural and state-consistency errors.
 * Safe edits: Validation-state fields, issue records, and status invariants only.
 * Do not: Validate other package domains, mutate input, or infer validator results.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const {
    SCHEMA,
    VALIDATION_ERROR_CODE_PATTERN,
    VALIDATION_STATUSES,
  } = constants;
  const { shape, text, controlled, constant, list, dateTime } = checks;
  const add = context.add;

  function validateNullableText(value, path, max) {
    if (value === null) {
      return;
    }
    text(value, path, 1, max);
  }

  function validateNullableDateTime(value, path) {
    if (value === null) {
      return;
    }
    dateTime(value, path);
  }

  function validateIssue(issue, path) {
    if (!shape(issue, path, ["code", "path", "message"])) {
      return;
    }

    if (text(issue.code, `${path}.code`, 3, 128)) {
      if (!VALIDATION_ERROR_CODE_PATTERN.test(issue.code)) {
        add(
          "STRING_PATTERN_INVALID",
          `${path}.code`,
          "Validation error code does not match the contract pattern.",
        );
      }
    }
    text(issue.path, `${path}.path`, 1, 512);
    text(issue.message, `${path}.message`, 1, 512);
  }

  function validateStatusConsistency(item, path) {
    const errors = Array.isArray(item.errors) ? item.errors : null;

    if (item.status === "not_validated") {
      if (
        item.validator_name !== null ||
        item.validator_version !== null ||
        item.validated_at !== null
      ) {
        add(
          "VALIDATION_NOT_VALIDATED_METADATA_FORBIDDEN",
          path,
          "Not-validated state must not contain validator result metadata.",
        );
      }
      if (errors && errors.length > 0) {
        add(
          "VALIDATION_NOT_VALIDATED_ERRORS_FORBIDDEN",
          `${path}.errors`,
          "Not-validated state must have an empty error list.",
        );
      }
      return;
    }

    if (item.status === "valid") {
      if (
        typeof item.validator_name !== "string" ||
        typeof item.validator_version !== "string"
      ) {
        add(
          "VALIDATION_VALID_IDENTITY_REQUIRED",
          path,
          "Valid state requires validator name and version.",
        );
      }
      if (typeof item.validated_at !== "string") {
        add(
          "VALIDATION_VALID_TIMESTAMP_REQUIRED",
          `${path}.validated_at`,
          "Valid state requires a validation timestamp.",
        );
      }
      if (errors && errors.length > 0) {
        add(
          "VALIDATION_VALID_ERRORS_FORBIDDEN",
          `${path}.errors`,
          "Valid state must have an empty error list.",
        );
      }
      return;
    }

    if (item.status === "invalid" && errors && errors.length === 0) {
      add(
        "VALIDATION_INVALID_ERRORS_REQUIRED",
        `${path}.errors`,
        "Invalid state requires at least one validation error.",
      );
    }
  }

  return function validateValidationState(item, path) {
    if (
      !shape(item, path, [
        "status",
        "schema_id",
        "validator_name",
        "validator_version",
        "validated_at",
        "errors",
      ])
    ) {
      return;
    }

    controlled(item.status, `${path}.status`, VALIDATION_STATUSES);
    constant(item.schema_id, `${path}.schema_id`, SCHEMA);
    validateNullableText(item.validator_name, `${path}.validator_name`, 160);
    validateNullableText(
      item.validator_version,
      `${path}.validator_version`,
      128,
    );
    validateNullableDateTime(item.validated_at, `${path}.validated_at`);
    list(item.errors, `${path}.errors`, 0, 4096, validateIssue);
    validateStatusConsistency(item, path);
  };
}

module.exports = { createValidator };
