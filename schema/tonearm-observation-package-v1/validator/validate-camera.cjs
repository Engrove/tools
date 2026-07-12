// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate camera intrinsics, distortion, transforms, and rectification evidence.
 * Inputs: Perspective model and JSON-style path.
 * Outputs: A camera-domain validator and deferred provenance references.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const {
    shape,
    text,
    finite,
    bool,
    controlled,
    point3,
    vector,
    nullableId,
  } = checks;
  const add = context.add;
  const ref = context.reference;
  const nullableRef = (domain, item, path, code) => {
    if (nullableId(item, path) && item !== null) {
      ref(domain, item, path, code);
    }
  };
  function validateCamera(item, path) {
    if (
      !shape(item, path, [
        "camera_model",
        "calibration_state",
        "intrinsics",
        "distortion",
        "object_to_camera",
        "rectification_required",
        "rectification",
        "notes",
      ])
    )
      return;
    if (
      (controlled(item.camera_model, `${path}.camera_model`, ENUMS.CameraModel),
      controlled(
        item.calibration_state,
        `${path}.calibration_state`,
        ENUMS.CameraCalibrationState,
      ),
      bool(item.rectification_required, `${path}.rectification_required`),
      text(item.notes, `${path}.notes`),
      shape(item.intrinsics, `${path}.intrinsics`, [
        "fx_px",
        "fy_px",
        "cx_px",
        "cy_px",
      ]))
    )
      for (const key of ["fx_px", "fy_px", "cx_px", "cy_px"]) {
        if (null !== item.intrinsics[key]) {
          finite(item.intrinsics[key], `${path}.intrinsics.${key}`);
        }
      }
    if (
      shape(item.distortion, `${path}.distortion`, [
        "model",
        "k1",
        "k2",
        "p1",
        "p2",
        "k3",
      ])
    ) {
      controlled(
        item.distortion.model,
        `${path}.distortion.model`,
        ENUMS.DistortionModel,
      );
      for (const key of ["k1", "k2", "p1", "p2", "k3"]) {
        if (null !== item.distortion[key]) {
          finite(item.distortion[key], `${path}.distortion.${key}`);
        }
      }
    }
    if (
      shape(item.object_to_camera, `${path}.object_to_camera`, [
        "rotation",
        "translation_mm",
      ])
    ) {
      if (null !== item.object_to_camera.rotation) {
        vector(
          item.object_to_camera.rotation,
          `${path}.object_to_camera.rotation`,
          9,
        );
      }
      if (null !== item.object_to_camera.translation_mm) {
        point3(
          item.object_to_camera.translation_mm,
          `${path}.object_to_camera.translation_mm`,
        );
      }
    }
    const r = item.rectification,
      rPath = `${path}.rectification`;
    if (
      shape(r, rPath, [
        "status",
        "transform",
        "residual_px",
        "dimensional_use",
        "source_view_id",
        "source_entity_id",
        "activity_id",
      ])
    ) {
      controlled(r.status, `${rPath}.status`, ENUMS.RectificationStatus);
      if (null !== r.transform) {
        vector(r.transform, `${rPath}.transform`, 9);
      }
      if (null !== r.residual_px) {
        finite(r.residual_px, `${rPath}.residual_px`);
        if (r.residual_px < 0) {
          add(
            "NUMBER_RANGE_INVALID",
            `${rPath}.residual_px`,
            "Number is outside the permitted range.",
          );
        }
      }
      controlled(
        r.dimensional_use,
        `${rPath}.dimensional_use`,
        ENUMS.DimensionSource,
      );
      nullableRef(
        "view",
        r.source_view_id,
        `${rPath}.source_view_id`,
        "RECTIFICATION_SOURCE_VIEW_UNRESOLVED",
      );
      nullableRef(
        "provenance_entity",
        r.source_entity_id,
        `${rPath}.source_entity_id`,
        "RECTIFICATION_SOURCE_ENTITY_UNRESOLVED",
      );
      nullableRef(
        "provenance_activity",
        r.activity_id,
        `${rPath}.activity_id`,
        "RECTIFICATION_ACTIVITY_UNRESOLVED",
      );
      "rectified" !== r.status ||
        (null !== r.transform &&
          null !== r.source_view_id &&
          null !== r.source_entity_id &&
          null !== r.activity_id) ||
        add(
          "RECTIFICATION_EVIDENCE_REQUIRED",
          rPath,
          "Rectified view requires transform and explicit source/provenance references.",
        );
      if ("rectified" !== r.status && "forbidden" !== r.dimensional_use) {
        add(
          "RECTIFICATION_DIMENSION_SOURCE_FORBIDDEN",
          `${rPath}.dimensional_use`,
          "Non-rectified perspective data cannot be a dimensional source.",
        );
      }
    }
  }
  return validateCamera;
}
module.exports = {
  createValidator,
};
