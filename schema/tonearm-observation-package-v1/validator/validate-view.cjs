// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate views, calibration, projection, dimensional-use, and camera consistency.
 * Inputs: View, path, and package capture-set identity.
 * Outputs: A view-domain validator and deferred component references.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants, validateCamera }) {
  const { ENUMS } = constants;
  const {
    isObject,
    shape,
    text,
    id,
    finite,
    controlled,
    constant,
    idList,
    point2,
    source,
    quantified,
  } = checks;
  const add = context.add;
  const ref = context.reference;
  function validateView(item, path, captureSetId) {
    if (
      shape(item, path, [
        "view_id",
        "capture_set_id",
        "name",
        "view_role",
        "projection_type",
        "dimension_source",
        "image_size",
        "object_to_view",
        "calibration",
        "perspective_model",
        "component_ids",
        "knowledge_state",
        "source",
      ])
    ) {
      if (
        (id(item.view_id, `${path}.view_id`),
        id(item.capture_set_id, `${path}.capture_set_id`),
        item.capture_set_id !== captureSetId &&
          add(
            "CAPTURE_SET_REFERENCE_MISMATCH",
            `${path}.capture_set_id`,
            "View capture-set reference must equal the package capture_set_id.",
          ),
        text(item.name, `${path}.name`, 1, 160),
        controlled(item.view_role, `${path}.view_role`, [
          "top",
          "side",
          "front",
          "oblique",
          "detail",
          "unknown",
        ]),
        controlled(
          item.projection_type,
          `${path}.projection_type`,
          ENUMS.ProjectionType,
        ),
        controlled(
          item.dimension_source,
          `${path}.dimension_source`,
          ENUMS.DimensionSource,
        ),
        shape(item.image_size, `${path}.image_size`, [
          "width_px",
          "height_px",
        ]) &&
          (finite(item.image_size.width_px, `${path}.image_size.width_px`),
          finite(item.image_size.height_px, `${path}.image_size.height_px`)),
        shape(item.object_to_view, `${path}.object_to_view`, [
          "horizontal_axis",
          "vertical_axis",
          "depth_axis",
        ]))
      ) {
        const mapped = [
          item.object_to_view.horizontal_axis,
          item.object_to_view.vertical_axis,
          item.object_to_view.depth_axis,
        ];
        mapped.forEach((v, i) =>
          controlled(
            v,
            `${path}.object_to_view.${["horizontal_axis", "vertical_axis", "depth_axis"][i]}`,
            ["+x", "-x", "+y", "-y", "+z", "-z"],
          ),
        );
        if (
          mapped.every((v) => "string" == typeof v) &&
          3 !== new Set(mapped.map((v) => v.slice(-1))).size
        ) {
          add(
            "VIEW_AXIS_MAPPING_AMBIGUOUS",
            `${path}.object_to_view`,
            "View axes must map to three distinct object-frame axes.",
          );
        }
      }
      if (null !== item.calibration && isObject(item.calibration)) {
        const c = item.calibration,
          cPath = `${path}.calibration`;
        if (
          shape(c, cPath, [
            "length_unit",
            "scale",
            "origin_px",
            "knowledge_state",
            "source",
          ])
        ) {
          constant(c.length_unit, `${cPath}.length_unit`, "mm");
          quantified(c.scale, `${cPath}.scale`);
          point2(c.origin_px, `${cPath}.origin_px`);
          controlled(
            c.knowledge_state,
            `${cPath}.knowledge_state`,
            ENUMS.KnowledgeState,
          );
          source(c.source, `${cPath}.source`);
        }
      }
      if (
        (null !== item.perspective_model &&
          validateCamera(item.perspective_model, `${path}.perspective_model`),
        "raw_perspective" === item.projection_type &&
          (isObject(item.perspective_model) ||
            add(
              "VIEW_RAW_PERSPECTIVE_METADATA_REQUIRED",
              `${path}.perspective_model`,
              "Raw perspective requires explicit camera and rectification metadata.",
            ),
          "forbidden" !== item.dimension_source &&
            add(
              "VIEW_RAW_PERSPECTIVE_DIMENSION_SOURCE_FORBIDDEN",
              `${path}.dimension_source`,
              "Raw perspective must be forbidden as a dimensional source.",
            ),
          isObject(item.perspective_model) &&
            true !== item.perspective_model.rectification_required &&
            add(
              "VIEW_RAW_PERSPECTIVE_RECTIFICATION_REQUIRED",
              `${path}.perspective_model.rectification_required`,
              "Raw perspective must declare rectification_required=true.",
            )),
        "rectified_perspective" === item.projection_type)
      ) {
        const r =
          item.perspective_model && item.perspective_model.rectification;
        (isObject(item.perspective_model) &&
          isObject(r) &&
          "rectified" === r.status) ||
          add(
            "VIEW_RECTIFIED_PERSPECTIVE_EVIDENCE_REQUIRED",
            `${path}.perspective_model`,
            "Rectified perspective view requires explicit rectification evidence.",
          );
      }
      "eligible" !== item.dimension_source ||
        isObject(item.calibration) ||
        add(
          "VIEW_DIMENSION_SOURCE_CALIBRATION_REQUIRED",
          `${path}.calibration`,
          "Eligible dimensional view requires explicit calibration.",
        );
      idList(item.component_ids, `${path}.component_ids`, 1, 256);
      if (Array.isArray(item.component_ids)) {
        item.component_ids.forEach((entry, index) =>
          ref(
            "component",
            entry,
            `${path}.component_ids[${index}]`,
            "COMPONENT_REFERENCE_UNRESOLVED",
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
  return validateView;
}
module.exports = {
  createValidator,
};
