// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Own immutable observation package v1 identifiers, vocabularies, and numeric tolerances.
 * Inputs: None.
 * Outputs: Frozen constants consumed by schema parity tests and validator modules.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const SCHEMA = "engrove_tonearm_observation_package_v1";
const SCHEMA_ID = "engrove_tonearm_observation_package_v1.schema.json";
const VERSION = "1.0.0";
const FRAME_TOLERANCE = 1e-6;
const TOP_LEVEL_REQUIRED = Object.freeze([
  "schema",
  "version",
  "package_id",
  "capture_set_id",
  "object",
  "target_consumer",
  "object_frame",
  "views",
  "landmarks",
  "observations",
  "stations",
  "features",
  "constraints",
  "uncertainty_model",
  "provenance",
  "validation",
  "operator_acceptance",
]);
const ENVELOPE_ROLES = Object.freeze(["outer_silhouette", "section_loop"]);
const ENUMS = Object.freeze({
  KnowledgeState: Object.freeze([
    "observed",
    "measured",
    "calculated",
    "derived",
    "operator_defined",
    "design_default",
    "model_assumption",
    "ai_inferred",
    "unknown",
    "not_applicable",
    "rejected",
  ]),
  NegativeState: Object.freeze([
    "not_visible",
    "occluded",
    "unknown",
    "not_measured",
    "not_present",
    "outside_scope",
    "rejected_interpretation",
  ]),
  GeometryRole: Object.freeze([
    "outer_silhouette",
    "inner_void",
    "section_loop",
    "feature_boundary",
    "visible_edge",
    "occlusion_boundary",
    "datum_line",
    "centerline",
    "construction_geometry",
    "ignore_region",
    "separate_component_outline",
  ]),
  EnvelopeGeometryRole: Object.freeze(["outer_silhouette", "section_loop"]),
  MaterialSide: Object.freeze(["inside", "outside", "unknown"]),
  Visibility: Object.freeze(["visible", "occluded", "inferred", "unknown"]),
  ProjectionType: Object.freeze([
    "orthographic_drawing",
    "orthographic_render",
    "telecentric_capture",
    "rectified_perspective",
    "raw_perspective",
    "unknown_projection",
  ]),
  DimensionSource: Object.freeze(["eligible", "conditional", "forbidden"]),
  AssemblyState: Object.freeze([
    "as_captured",
    "assembled",
    "disassembled",
    "subassembly",
    "unknown",
  ]),
  GeometryType: Object.freeze([
    "polyline_2d",
    "polygon_2d",
    "line_2d",
    "point_2d",
    "section_loop_3d",
  ]),
  CoordinateSpace: Object.freeze([
    "image_pixels",
    "view_metric",
    "object_frame",
  ]),
  AgentType: Object.freeze([
    "operator",
    "software",
    "ai_system",
    "organization",
    "unknown",
  ]),
  AcceptanceStatus: Object.freeze(["accepted", "rejected"]),
  AcceptanceScope: Object.freeze(["package", "observation_subset"]),
  LandmarkKind: Object.freeze([
    "mechanical_datum",
    "visual_landmark",
    "reference_point",
    "reference_line",
    "reference_plane",
    "unknown",
  ]),
  CameraModel: Object.freeze(["unknown", "pinhole", "fisheye", "other"]),
  CameraCalibrationState: Object.freeze([
    "not_calibrated",
    "partially_calibrated",
    "calibrated",
  ]),
  DistortionModel: Object.freeze([
    "unknown",
    "none",
    "brown_conrady",
    "fisheye",
  ]),
  RectificationStatus: Object.freeze([
    "not_rectified",
    "rectification_candidate",
    "rectified",
  ]),
});
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

module.exports = Object.freeze({
  SCHEMA,
  SCHEMA_ID,
  VERSION,
  FRAME_TOLERANCE,
  TOP_LEVEL_REQUIRED,
  ENVELOPE_ROLES,
  ENUMS,
  ID_PATTERN,
  DATE_TIME_PATTERN,
});
