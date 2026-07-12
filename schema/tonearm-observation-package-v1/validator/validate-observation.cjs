// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate observation state, envelope authority, geometry, and measurements.
 * Inputs: Observation record and JSON-style path.
 * Outputs: An observation-domain validator and deferred references.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants, validateGeometry }) {
  const { ENUMS, ENVELOPE_ROLES } = constants;
  const {
    shape,
    text,
    id,
    finite,
    bool,
    controlled,
    list,
    idList,
    source,
    nullableId,
  } = checks;
  const add = context.add;
  const ref = context.reference;
  const nullableRef = (domain, item, path, code) => {
    if (nullableId(item, path) && item !== null) {
      ref(domain, item, path, code);
    }
  };
  function validateObservation(item, path) {
    if (
      shape(item, path, [
        "observation_id",
        "view_id",
        "component_id",
        "station_id",
        "landmark_ids",
        "geometry_role",
        "material_side",
        "visibility",
        "knowledge_state",
        "completeness",
        "contributes_to_envelope",
        "geometry",
        "measurements",
        "uncertainty_id",
        "source",
      ])
    ) {
      id(item.observation_id, `${path}.observation_id`);
      if (id(item.view_id, `${path}.view_id`)) {
        ref(
          "view",
          item.view_id,
          `${path}.view_id`,
          "VIEW_REFERENCE_UNRESOLVED",
        );
      }
      nullableRef(
        "component",
        item.component_id,
        `${path}.component_id`,
        "COMPONENT_REFERENCE_UNRESOLVED",
      );
      nullableRef(
        "station",
        item.station_id,
        `${path}.station_id`,
        "STATION_REFERENCE_UNRESOLVED",
      );
      idList(item.landmark_ids, `${path}.landmark_ids`, 0, 256);
      if (Array.isArray(item.landmark_ids)) {
        item.landmark_ids.forEach((entry, index) =>
          ref(
            "landmark",
            entry,
            `${path}.landmark_ids[${index}]`,
            "LANDMARK_REFERENCE_UNRESOLVED",
          ),
        );
      }
      controlled(
        item.geometry_role,
        `${path}.geometry_role`,
        ENUMS.GeometryRole,
      );
      controlled(
        item.material_side,
        `${path}.material_side`,
        ENUMS.MaterialSide,
      );
      controlled(item.visibility, `${path}.visibility`, ENUMS.Visibility);
      controlled(
        item.knowledge_state,
        `${path}.knowledge_state`,
        ENUMS.KnowledgeState,
      );
      if (
        shape(item.completeness, `${path}.completeness`, [
          "state",
          "negative_state",
        ])
      ) {
        controlled(item.completeness.state, `${path}.completeness.state`, [
          "complete",
          "partial",
          "negative",
        ]);
        "negative" === item.completeness.state
          ? controlled(
              item.completeness.negative_state,
              `${path}.completeness.negative_state`,
              ENUMS.NegativeState,
            )
          : null !== item.completeness.negative_state &&
            add(
              "NEGATIVE_STATE_POLARITY_INVALID",
              `${path}.completeness.negative_state`,
              "Negative state must be null unless completeness state is negative.",
            );
      }
      bool(item.contributes_to_envelope, `${path}.contributes_to_envelope`);
      validateGeometry(item.geometry, `${path}.geometry`);
      "section_loop" !== item.geometry_role ||
        (null !== item.station_id &&
          item.geometry &&
          "section_loop_3d" === item.geometry.type) ||
        add(
          "OBSERVATION_SECTION_LOOP_STATION_REQUIRED",
          path,
          "Section-loop observation requires a physical station and section_loop_3d geometry.",
        );
      if (true === item.contributes_to_envelope) {
        if (null === item.component_id) {
          add(
            "OBSERVATION_ENVELOPE_COMPONENT_REQUIRED",
            `${path}.component_id`,
            "Envelope observation requires an explicit component reference.",
          );
        }
        ENVELOPE_ROLES.includes(item.geometry_role) ||
          add(
            "OBSERVATION_ENVELOPE_ROLE_FORBIDDEN",
            `${path}.geometry_role`,
            "Geometry role is not permitted to contribute to the envelope.",
          );
        ("visible" === item.visibility &&
          item.completeness &&
          "complete" === item.completeness.state &&
          [
            "observed",
            "measured",
            "calculated",
            "derived",
            "operator_defined",
          ].includes(item.knowledge_state)) ||
          add(
            "OBSERVATION_ENVELOPE_NOT_AUTHORITATIVE",
            path,
            "Envelope observation must be visible, complete, and explicitly authoritative.",
          );
        "outer_silhouette" !== item.geometry_role ||
          (item.geometry && "polygon_2d" === item.geometry.type) ||
          add(
            "OBSERVATION_ENVELOPE_GEOMETRY_INVALID",
            `${path}.geometry`,
            "Outer silhouette envelope requires closed polygon_2d geometry.",
          );
      }
      list(item.measurements, `${path}.measurements`, 0, 256, (m, mPath) => {
        if (
          shape(m, mPath, [
            "measurement_id",
            "quantity",
            "value",
            "unit",
            "knowledge_state",
            "source",
            "uncertainty_id",
          ])
        ) {
          id(m.measurement_id, `${mPath}.measurement_id`);
          controlled(m.quantity, `${mPath}.quantity`, [
            "length",
            "width",
            "height",
            "diameter",
            "angle",
            "area",
            "scale",
            "other",
          ]);
          finite(m.value, `${mPath}.value`);
          text(m.unit, `${mPath}.unit`, 1, 32);
          controlled(
            m.knowledge_state,
            `${mPath}.knowledge_state`,
            ENUMS.KnowledgeState,
          );
          source(m.source, `${mPath}.source`);
          nullableRef(
            "uncertainty",
            m.uncertainty_id,
            `${mPath}.uncertainty_id`,
            "UNCERTAINTY_REFERENCE_UNRESOLVED",
          );
        }
      });
      nullableRef(
        "uncertainty",
        item.uncertainty_id,
        `${path}.uncertainty_id`,
        "UNCERTAINTY_REFERENCE_UNRESOLVED",
      );
      source(item.source, `${path}.source`);
    }
  }
  return validateObservation;
}
module.exports = {
  createValidator,
};
