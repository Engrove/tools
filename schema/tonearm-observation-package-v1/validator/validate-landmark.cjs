// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate landmark records and their typed references.
 * Inputs: Landmark record and JSON-style path.
 * Outputs: A landmark-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, text, id, controlled, point2, point3, source, nullableId } =
    checks;
  const ref = context.reference;
  const nullableRef = (domain, item, path, code) => {
    if (nullableId(item, path) && item !== null) {
      ref(domain, item, path, code);
    }
  };
  function validateLandmark(item, path) {
    if (
      shape(item, path, [
        "landmark_id",
        "name",
        "kind",
        "component_id",
        "view_id",
        "station_id",
        "position_2d",
        "position_3d",
        "knowledge_state",
        "source",
        "uncertainty_id",
      ])
    ) {
      id(item.landmark_id, `${path}.landmark_id`);
      text(item.name, `${path}.name`, 1, 160);
      controlled(item.kind, `${path}.kind`, ENUMS.LandmarkKind);
      nullableRef(
        "component",
        item.component_id,
        `${path}.component_id`,
        "COMPONENT_REFERENCE_UNRESOLVED",
      );
      nullableRef(
        "view",
        item.view_id,
        `${path}.view_id`,
        "VIEW_REFERENCE_UNRESOLVED",
      );
      nullableRef(
        "station",
        item.station_id,
        `${path}.station_id`,
        "STATION_REFERENCE_UNRESOLVED",
      );
      if (null !== item.position_2d) {
        point2(item.position_2d, `${path}.position_2d`);
      }
      if (null !== item.position_3d) {
        point3(item.position_3d, `${path}.position_3d`);
      }
      controlled(
        item.knowledge_state,
        `${path}.knowledge_state`,
        ENUMS.KnowledgeState,
      );
      source(item.source, `${path}.source`);
      nullableRef(
        "uncertainty",
        item.uncertainty_id,
        `${path}.uncertainty_id`,
        "UNCERTAINTY_REFERENCE_UNRESOLVED",
      );
    }
  }
  return validateLandmark;
}
module.exports = {
  createValidator,
};
