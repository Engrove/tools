// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify camera metadata, rectification evidence, projection, and view dimensional-use rules.
 * Inputs: Fresh package fixtures and camera builders.
 * Outputs: Camera and view regression assertions.
 * Safe edits: Camera, perspective, rectification, and view cases.
 * Do not: Own station cross-reference or geometry topology tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions, fixture }) {
  assertions.expectValid(
    "raw perspective explicit unknown metadata",
    (value) => {
      value.views[0].projection_type = "raw_perspective";
      value.views[0].dimension_source = "forbidden";
      value.views[0].calibration = null;
      value.views[0].perspective_model = fixture.unknownCamera();
      value.observations[0].contributes_to_envelope = false;
    },
  );

  assertions.structuralCase(
    "raw perspective cannot be eligible",
    (value) => {
      value.views[0].projection_type = "raw_perspective";
      value.views[0].dimension_source = "eligible";
      value.views[0].perspective_model = fixture.unknownCamera();
    },
    "VIEW_RAW_PERSPECTIVE_DIMENSION_SOURCE_FORBIDDEN",
  );
  assertions.structuralCase(
    "intrinsics shape",
    (value) => {
      prepareRaw(value, fixture);
      delete value.views[0].perspective_model.intrinsics.fx_px;
    },
    "PROPERTY_REQUIRED",
  );
  assertions.structuralCase(
    "distortion coefficient is finite or null",
    (value) => {
      prepareRaw(value, fixture);
      value.views[0].perspective_model.distortion.k1 = "unknown";
    },
    "FINITE_NUMBER_REQUIRED",
  );
  assertions.structuralCase(
    "rectified view requires evidence",
    (value) => {
      value.views[0].projection_type = "rectified_perspective";
      value.views[0].perspective_model = fixture.unknownCamera();
      value.views[0].perspective_model.rectification_required = false;
    },
    "VIEW_RECTIFIED_PERSPECTIVE_EVIDENCE_REQUIRED",
  );
  assertions.semanticCase(
    "rectified source view resolves",
    (value) => {
      value.views[0].projection_type = "rectified_perspective";
      value.views[0].perspective_model = fixture.unknownCamera();
      value.views[0].perspective_model.rectification_required = false;
      value.views[0].perspective_model.rectification = {
        status: "rectified",
        transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        residual_px: 0.2,
        dimensional_use: "eligible",
        source_view_id: "view.raw-missing",
        source_entity_id: "entity.top",
        activity_id: "activity.trace",
      };
    },
    "RECTIFICATION_SOURCE_VIEW_UNRESOLVED",
  );
}

function prepareRaw(value, fixture) {
  value.views[0].projection_type = "raw_perspective";
  value.views[0].dimension_source = "forbidden";
  value.views[0].calibration = null;
  value.views[0].perspective_model = fixture.unknownCamera();
}

module.exports = { run };
