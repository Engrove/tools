// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Collect deterministic errors, identity domains, records, and deferred references.
 * Inputs: Immutable contract constants and validator calls.
 * Outputs: A fresh per-validation context with no shared mutation.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const { ID_PATTERN } = require("./constants.cjs");

function createValidationContext() {
  const errors = [];
  const references = [];
  const domains = Object.create(null);
  const records = Object.create(null);

  function add(code, path, message) {
    errors.push({ code, path, message });
  }

  function reference(domain, id, path, code) {
    if (typeof id === "string" && ID_PATTERN.test(id)) {
      references.push({ domain, id, path, code });
    }
  }

  function register(items, idKey, domain, path) {
    const ids = new Set();
    const map = new Map();
    domains[domain] = ids;
    records[domain] = map;
    if (!Array.isArray(items)) return;
    items.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      const id = entry[idKey];
      if (typeof id !== "string" || !ID_PATTERN.test(id)) return;
      if (ids.has(id)) {
        add(
          `${domain.toUpperCase()}_ID_DUPLICATE`,
          `${path}[${index}].${idKey}`,
          "Identifier is duplicated within its identity domain.",
        );
        return;
      }
      ids.add(id);
      map.set(id, entry);
    });
  }

  function resolveReferences() {
    for (const item of references) {
      if (!domains[item.domain]?.has(item.id)) {
        add(
          item.code,
          item.path,
          "Reference does not resolve in the declared identity domain.",
        );
      }
    }
  }

  function finish() {
    errors.sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message),
    );
    return { valid: errors.length === 0, errors };
  }

  return { add, reference, register, resolveReferences, records, finish };
}

module.exports = { createValidationContext };
