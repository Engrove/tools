// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Provide reusable structural and primitive checks without tonearm-domain semantics.
 * Inputs: A validation context and immutable contract constants.
 * Outputs: Pure check functions that append stable errors and queue references.
 * Safe edits: Primitive type, shape, collection, point, source, and quantified-value checks.
 * Do not: Add tonearm-domain rules, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const { ENUMS, ID_PATTERN, DATE_TIME_PATTERN } = require("./constants.cjs");

function createPrimitiveChecks(context) {
  const isObject = (item) =>
    item !== null && typeof item === "object" && !Array.isArray(item);
  const own = (item, key) => Object.prototype.hasOwnProperty.call(item, key);

  function shape(item, path, required, allowed = required) {
    if (!isObject(item)) {
      context.add("OBJECT_REQUIRED", path, "Contract object required.");
      return false;
    }
    for (const key of required) {
      if (!own(item, key)) {
        context.add(
          "PROPERTY_REQUIRED",
          `${path}.${key}`,
          "Required contract property is missing.",
        );
      }
    }
    for (const key of Object.keys(item)) {
      if (!allowed.includes(key)) {
        context.add(
          "PROPERTY_UNKNOWN",
          `${path}.${key}`,
          "Unknown contract property is not permitted.",
        );
      }
    }
    return true;
  }

  function text(item, path, min = 0, max = 2048) {
    if (typeof item !== "string") {
      context.add("STRING_REQUIRED", path, "String value required.");
      return false;
    }
    if (item.length < min) {
      context.add(
        "STRING_TOO_SHORT",
        path,
        "String does not meet the minimum length.",
      );
    }
    if (item.length > max) {
      context.add(
        "STRING_TOO_LONG",
        path,
        "String exceeds the maximum length.",
      );
    }
    return true;
  }

  function id(item, path) {
    if (!text(item, path, 1, 128)) return false;
    if (!ID_PATTERN.test(item)) {
      context.add(
        "STRING_PATTERN_INVALID",
        path,
        "String does not match the contract identifier pattern.",
      );
      return false;
    }
    return true;
  }

  function nullableId(item, path) {
    return item === null || id(item, path);
  }

  function finite(item, path) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      context.add("FINITE_NUMBER_REQUIRED", path, "Finite number required.");
      return false;
    }
    return true;
  }

  function bool(item, path) {
    if (typeof item !== "boolean") {
      context.add("BOOLEAN_REQUIRED", path, "Boolean value required.");
      return false;
    }
    return true;
  }

  function controlled(item, path, values) {
    if (typeof item !== "string" || !values.includes(item)) {
      context.add(
        "VALUE_ENUM_INVALID",
        path,
        "Value is not part of the controlled vocabulary.",
      );
      return false;
    }
    return true;
  }

  function constant(item, path, expected) {
    if (item !== expected) {
      context.add(
        "CONTRACT_CONST_MISMATCH",
        path,
        "Value does not match the required contract constant.",
      );
      return false;
    }
    return true;
  }

  function list(item, path, min, max, visit) {
    if (!Array.isArray(item)) {
      context.add("ARRAY_REQUIRED", path, "Array value required.");
      return false;
    }
    if (item.length < min) {
      context.add(
        "ARRAY_TOO_SHORT",
        path,
        "Array does not meet the minimum item count.",
      );
    }
    if (item.length > max) {
      context.add(
        "ARRAY_TOO_LONG",
        path,
        "Array exceeds the maximum item count.",
      );
    }
    item
      .slice(0, max)
      .forEach((entry, index) => visit(entry, `${path}[${index}]`, index));
    return true;
  }

  function idList(item, path, min = 0, max = 4096) {
    return list(item, path, min, max, id);
  }

  function point2(item, path) {
    if (!shape(item, path, ["x", "y"])) return;
    finite(item.x, `${path}.x`);
    finite(item.y, `${path}.y`);
  }

  function point3(item, path) {
    if (!shape(item, path, ["x", "y", "z"])) return;
    finite(item.x, `${path}.x`);
    finite(item.y, `${path}.y`);
    finite(item.z, `${path}.z`);
  }

  function vector(item, path, length = 3) {
    return list(item, path, length, length, finite);
  }

  function dateTime(item, path) {
    if (!text(item, path, 1, 64)) return;
    if (!DATE_TIME_PATTERN.test(item) || !Number.isFinite(Date.parse(item))) {
      context.add("DATE_TIME_INVALID", path, "RFC 3339 date-time required.");
    }
  }

  function nullableReference(domain, item, path, code) {
    if (nullableId(item, path) && item !== null) {
      context.reference(domain, item, path, code);
    }
  }

  function source(item, path, nullable = false) {
    if (nullable && item === null) return;
    if (
      !shape(item, path, [
        "provenance_entity_id",
        "provenance_activity_id",
        "provenance_agent_id",
        "note",
      ])
    ) {
      return;
    }
    if (id(item.provenance_entity_id, `${path}.provenance_entity_id`)) {
      context.reference(
        "provenance_entity",
        item.provenance_entity_id,
        `${path}.provenance_entity_id`,
        "SOURCE_PROVENANCE_ENTITY_UNRESOLVED",
      );
    }
    nullableReference(
      "provenance_activity",
      item.provenance_activity_id,
      `${path}.provenance_activity_id`,
      "SOURCE_PROVENANCE_ACTIVITY_UNRESOLVED",
    );
    nullableReference(
      "provenance_agent",
      item.provenance_agent_id,
      `${path}.provenance_agent_id`,
      "SOURCE_PROVENANCE_AGENT_UNRESOLVED",
    );
    text(item.note, `${path}.note`);
  }

  function quantified(item, path) {
    if (
      !shape(item, path, [
        "value",
        "unit",
        "knowledge_state",
        "source",
        "uncertainty_id",
      ])
    ) {
      return;
    }
    finite(item.value, `${path}.value`);
    text(item.unit, `${path}.unit`, 1, 32);
    controlled(
      item.knowledge_state,
      `${path}.knowledge_state`,
      ENUMS.KnowledgeState,
    );
    source(item.source, `${path}.source`);
    nullableReference(
      "uncertainty",
      item.uncertainty_id,
      `${path}.uncertainty_id`,
      "UNCERTAINTY_REFERENCE_UNRESOLVED",
    );
  }

  return {
    isObject,
    shape,
    text,
    id,
    nullableId,
    finite,
    bool,
    controlled,
    constant,
    list,
    idList,
    point2,
    point3,
    vector,
    dateTime,
    source,
    quantified,
  };
}

module.exports = { createPrimitiveChecks };
