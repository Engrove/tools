// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate uncertainty model fields, entries, and typed target references.
 * Inputs: Uncertainty model and JSON-style path.
 * Outputs: An uncertainty-domain validator with deferred target and provenance references.
 * Safe edits: Uncertainty model and entry parity with uncertainty.schema.json.
 * Do not: Add interval ordering rules, defaults, mutation, fabrication, or unrelated domains.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const {
    ENUMS,
    UNCERTAINTY_KINDS,
    UNCERTAINTY_METHODS,
    UNCERTAINTY_TARGET_TYPES,
  } = constants;
  const { shape, text, id, finite, controlled, list, source } = checks;
  const add = context.add;
  const reference = context.reference;

  function validateNullableFinite(value, path) {
    if (value === null) {
      return true;
    }
    return finite(value, path);
  }

  function validateEntry(entry, path) {
    if (
      !shape(entry, path, [
        "uncertainty_id",
        "target_type",
        "target_id",
        "kind",
        "value",
        "unit",
        "lower",
        "upper",
        "knowledge_state",
        "source",
      ])
    ) {
      return;
    }

    id(entry.uncertainty_id, `${path}.uncertainty_id`);
    const validTargetType = controlled(
      entry.target_type,
      `${path}.target_type`,
      UNCERTAINTY_TARGET_TYPES,
    );
    const validTargetId = id(entry.target_id, `${path}.target_id`);
    if (validTargetType && validTargetId) {
      reference(
        entry.target_type,
        entry.target_id,
        `${path}.target_id`,
        "UNCERTAINTY_TARGET_UNRESOLVED",
      );
    }
    controlled(entry.kind, `${path}.kind`, UNCERTAINTY_KINDS);
    validateNullableFinite(entry.value, `${path}.value`);
    text(entry.unit, `${path}.unit`, 1, 32);
    validateNullableFinite(entry.lower, `${path}.lower`);
    validateNullableFinite(entry.upper, `${path}.upper`);
    controlled(
      entry.knowledge_state,
      `${path}.knowledge_state`,
      ENUMS.KnowledgeState,
    );
    source(entry.source, `${path}.source`);
  }

  return function validateUncertainty(item, path) {
    if (
      !shape(item, path, [
        "model_id",
        "method",
        "default_length_mm",
        "confidence_level",
        "entries",
      ])
    ) {
      return;
    }

    id(item.model_id, `${path}.model_id`);
    controlled(item.method, `${path}.method`, UNCERTAINTY_METHODS);

    if (validateNullableFinite(item.default_length_mm, `${path}.default_length_mm`)) {
      if (item.default_length_mm !== null && item.default_length_mm < 0) {
        add(
          "NUMBER_MINIMUM_VIOLATION",
          `${path}.default_length_mm`,
          "Default uncertainty length must be greater than or equal to zero.",
        );
      }
    }

    if (validateNullableFinite(item.confidence_level, `${path}.confidence_level`)) {
      if (
        item.confidence_level !== null &&
        (item.confidence_level <= 0 || item.confidence_level > 1)
      ) {
        add(
          "NUMBER_RANGE_VIOLATION",
          `${path}.confidence_level`,
          "Confidence level must be greater than zero and at most one.",
        );
      }
    }

    list(item.entries, `${path}.entries`, 0, 4096, validateEntry);
  };
}

module.exports = { createValidator };
