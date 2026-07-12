// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate feature records and their observation, landmark, and component links.
 * Inputs: Feature record and path.
 * Outputs: A feature-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, id, text, controlled, idList, source } = checks;
  const ref = context.reference;
  return function validateFeature(item, path) {
    if (
      !shape(item, path, [
        "feature_id",
        "name",
        "feature_type",
        "status",
        "component_id",
        "observation_ids",
        "landmark_ids",
        "knowledge_state",
        "source",
      ])
    )
      return;
    id(item.feature_id, `${path}.feature_id`);
    text(item.name, `${path}.name`, 1, 160);
    controlled(item.feature_type, `${path}.feature_type`, [
      "slot",
      "inner_void",
      "surface_zone",
      "separate_component",
      "material_interface",
      "attachment",
      "other",
    ]);
    controlled(item.status, `${path}.status`, [
      "candidate",
      "confirmed",
      "rejected",
    ]);
    if (id(item.component_id, `${path}.component_id`))
      ref(
        "component",
        item.component_id,
        `${path}.component_id`,
        "COMPONENT_REFERENCE_UNRESOLVED",
      );
    idList(item.observation_ids, `${path}.observation_ids`, 1);
    item.observation_ids?.forEach((value, index) =>
      ref(
        "observation",
        value,
        `${path}.observation_ids[${index}]`,
        "OBSERVATION_REFERENCE_UNRESOLVED",
      ),
    );
    idList(item.landmark_ids, `${path}.landmark_ids`);
    item.landmark_ids?.forEach((value, index) =>
      ref(
        "landmark",
        value,
        `${path}.landmark_ids[${index}]`,
        "LANDMARK_REFERENCE_UNRESOLVED",
      ),
    );
    controlled(
      item.knowledge_state,
      `${path}.knowledge_state`,
      ENUMS.KnowledgeState,
    );
    source(item.source, `${path}.source`);
  };
}
module.exports = {
  createValidator,
};
