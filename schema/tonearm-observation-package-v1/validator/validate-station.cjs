// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate station records and their typed references.
 * Inputs: Station record and JSON-style path.
 * Outputs: A station-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, text, id, controlled, idList, source, quantified } = checks;
  const ref = context.reference;
  function validateStation(item, path) {
    if (
      shape(item, path, [
        "station_id",
        "name",
        "component_id",
        "longitudinal_position",
        "view_ids",
        "observation_ids",
        "knowledge_state",
        "source",
      ])
    ) {
      id(item.station_id, `${path}.station_id`);
      text(item.name, `${path}.name`, 1, 160);
      if (id(item.component_id, `${path}.component_id`)) {
        ref(
          "component",
          item.component_id,
          `${path}.component_id`,
          "COMPONENT_REFERENCE_UNRESOLVED",
        );
      }
      quantified(item.longitudinal_position, `${path}.longitudinal_position`);
      idList(item.view_ids, `${path}.view_ids`, 1, 64);
      if (Array.isArray(item.view_ids)) {
        item.view_ids.forEach((entry, index) =>
          ref(
            "view",
            entry,
            `${path}.view_ids[${index}]`,
            "VIEW_REFERENCE_UNRESOLVED",
          ),
        );
      }
      idList(item.observation_ids, `${path}.observation_ids`);
      if (Array.isArray(item.observation_ids)) {
        item.observation_ids.forEach((entry, index) =>
          ref(
            "observation",
            entry,
            `${path}.observation_ids[${index}]`,
            "OBSERVATION_REFERENCE_UNRESOLVED",
          ),
        );
      }
      controlled(
        item.knowledge_state,
        `${path}.knowledge_state`,
        ENUMS.KnowledgeState,
      );
      source(item.source, `${path}.source`);
    }
  }
  return validateStation;
}
module.exports = {
  createValidator,
};
