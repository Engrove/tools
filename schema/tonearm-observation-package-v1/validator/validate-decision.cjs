// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate neutral operator decision records and decision scope.
 * Inputs: Operator decision or null and JSON-style path.
 * Outputs: A decision-domain validator and deferred references.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, text, id, controlled, idList, dateTime } = checks;
  const add = context.add;
  const ref = context.reference;
  function validateAcceptance(item, path) {
    if (null === item) return;
    if (
      shape(item, path, [
        "decision_id",
        "status",
        "scope",
        "decided_by_agent_id",
        "decided_at",
        "notes",
        "observation_ids",
      ])
    ) {
      id(item.decision_id, `${path}.decision_id`);
      controlled(item.status, `${path}.status`, ENUMS.AcceptanceStatus);
      controlled(item.scope, `${path}.scope`, ENUMS.AcceptanceScope);
      if (id(item.decided_by_agent_id, `${path}.decided_by_agent_id`)) {
        ref(
          "provenance_agent",
          item.decided_by_agent_id,
          `${path}.decided_by_agent_id`,
          "OPERATOR_DECISION_AGENT_UNRESOLVED",
        );
      }
      dateTime(item.decided_at, `${path}.decided_at`);
      text(item.notes, `${path}.notes`);
      idList(item.observation_ids, `${path}.observation_ids`);
      item.observation_ids?.forEach((x, i) =>
        ref(
          "observation",
          x,
          `${path}.observation_ids[${i}]`,
          "OPERATOR_DECISION_OBSERVATION_UNRESOLVED",
        ),
      );
      "observation_subset" !== item.scope ||
        (Array.isArray(item.observation_ids) &&
          0 !== item.observation_ids.length) ||
        add(
          "OPERATOR_DECISION_SCOPE_EMPTY",
          `${path}.observation_ids`,
          "Observation-subset decision requires at least one observation reference.",
        );
      if (
        "package" === item.scope &&
        Array.isArray(item.observation_ids) &&
        item.observation_ids.length
      ) {
        add(
          "OPERATOR_DECISION_PACKAGE_IDS_FORBIDDEN",
          `${path}.observation_ids`,
          "Package decision must not list observation references.",
        );
      }
    }
  }
  return validateAcceptance;
}
module.exports = {
  createValidator,
};
