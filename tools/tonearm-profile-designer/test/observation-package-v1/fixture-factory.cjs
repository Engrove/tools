// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Build one valid observation package fixture and small reusable value helpers.
 * Inputs: Optional provenance identities and quantified values.
 * Outputs: Fresh mutable test fixtures; no assertions or test execution.
 * Safe edits: Contract-valid baseline data and domain-specific value builders.
 * Do not: Add assertions, duplicate complete packages, or share mutable fixture state.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const clone = (value) => JSON.parse(JSON.stringify(value));
const source = (
  entity = "entity.trace",
  activity = "activity.trace",
  agent = "agent.operator",
) => ({
  provenance_entity_id: entity,
  provenance_activity_id: activity,
  provenance_agent_id: agent,
  note: "Explicit test provenance.",
});
const quantified = (value, unit = "mm") => ({
  value,
  unit,
  knowledge_state: "measured",
  source: source(),
  uncertainty_id: null,
});
const calibration = () => ({
  length_unit: "mm",
  scale: quantified(0.1, "mm_per_px"),
  origin_px: { x: 20, y: 200 },
  knowledge_state: "measured",
  source: source(),
});
const unknownCamera = () => ({
  camera_model: "unknown",
  calibration_state: "not_calibrated",
  intrinsics: { fx_px: null, fy_px: null, cx_px: null, cy_px: null },
  distortion: {
    model: "unknown",
    k1: null,
    k2: null,
    p1: null,
    p2: null,
    k3: null,
  },
  object_to_camera: { rotation: null, translation_mm: null },
  rectification_required: true,
  rectification: {
    status: "not_rectified",
    transform: null,
    residual_px: null,
    dimensional_use: "forbidden",
    source_view_id: null,
    source_entity_id: null,
    activity_id: null,
  },
  notes: "Unknown camera facts remain explicit nulls.",
});

function makePackage() {
  return {
    schema: "engrove_tonearm_observation_package_v1",
    version: "1.0.0",
    package_id: "package.trace.v1",
    capture_set_id: "capture.top-side.v1",
    object: {
      id: "object.tonearm.v1",
      revision: "rev-a",
      configuration: {
        id: "complete_wand_without_cartridge",
        assembly_state: "as_captured",
        description: "Complete wand assembly captured without cartridge.",
      },
      units: { length: "mm", angle: "deg", mass: "g" },
      components: [
        {
          component_id: "component.main-body",
          name: "Main arm body",
          role: "main_body",
          parent_component_id: null,
          knowledge_state: "operator_defined",
          description: "Explicit component identity for envelope observations.",
        },
      ],
    },
    target_consumer: {
      application: "engrove_tonearm_profile_designer",
      contract: "engrove_tonearm_observation_consumer_v1",
    },
    object_frame: {
      frame_id: "frame.object.v1",
      handedness: "right_handed",
      units: "mm",
      origin: {
        coordinates: { x: 0, y: 0, z: 0 },
        landmark_id: "landmark.origin",
        knowledge_state: "operator_defined",
        source: source(),
      },
      axes: {
        x: {
          label: "longitudinal",
          direction: [1, 0, 0],
          knowledge_state: "operator_defined",
          source: source(),
        },
        y: {
          label: "lateral",
          direction: [0, 1, 0],
          knowledge_state: "operator_defined",
          source: source(),
        },
        z: {
          label: "vertical",
          direction: [0, 0, 1],
          knowledge_state: "operator_defined",
          source: source(),
        },
      },
    },
    views: [
      {
        view_id: "view.top",
        capture_set_id: "capture.top-side.v1",
        name: "Top view",
        view_role: "top",
        projection_type: "orthographic_drawing",
        dimension_source: "eligible",
        image_size: { width_px: 1000, height_px: 400 },
        object_to_view: {
          horizontal_axis: "+x",
          vertical_axis: "+y",
          depth_axis: "+z",
        },
        calibration: calibration(),
        perspective_model: null,
        component_ids: ["component.main-body"],
        knowledge_state: "observed",
        source: source("entity.top"),
      },
      {
        view_id: "view.side",
        capture_set_id: "capture.top-side.v1",
        name: "Side view",
        view_role: "side",
        projection_type: "orthographic_drawing",
        dimension_source: "eligible",
        image_size: { width_px: 1000, height_px: 400 },
        object_to_view: {
          horizontal_axis: "+x",
          vertical_axis: "+z",
          depth_axis: "-y",
        },
        calibration: calibration(),
        perspective_model: null,
        component_ids: ["component.main-body"],
        knowledge_state: "observed",
        source: source("entity.side"),
      },
    ],
    landmarks: [
      {
        landmark_id: "landmark.origin",
        name: "Operator-defined object origin",
        kind: "mechanical_datum",
        component_id: "component.main-body",
        view_id: null,
        station_id: null,
        position_2d: null,
        position_3d: { x: 0, y: 0, z: 0 },
        knowledge_state: "operator_defined",
        source: source(),
        uncertainty_id: "uncertainty.origin",
      },
    ],
    observations: [
      {
        observation_id: "observation.top-envelope",
        view_id: "view.top",
        component_id: "component.main-body",
        station_id: "station.mid",
        landmark_ids: ["landmark.origin"],
        geometry_role: "outer_silhouette",
        material_side: "outside",
        visibility: "visible",
        knowledge_state: "observed",
        completeness: { state: "complete", negative_state: null },
        contributes_to_envelope: true,
        geometry: {
          type: "polygon_2d",
          closed: true,
          coordinate_space: "view_metric",
          points_2d: [
            { x: 0, y: -5 },
            { x: 100, y: -5 },
            { x: 100, y: 5 },
            { x: 0, y: 5 },
          ],
          points_3d: [],
        },
        measurements: [
          {
            measurement_id: "measurement.top-width",
            quantity: "width",
            value: 10,
            unit: "mm",
            knowledge_state: "measured",
            source: source("entity.top"),
            uncertainty_id: null,
          },
        ],
        uncertainty_id: null,
        source: source("entity.top"),
      },
      {
        observation_id: "observation.side-envelope",
        view_id: "view.side",
        component_id: "component.main-body",
        station_id: "station.mid",
        landmark_ids: [],
        geometry_role: "outer_silhouette",
        material_side: "outside",
        visibility: "visible",
        knowledge_state: "observed",
        completeness: { state: "complete", negative_state: null },
        contributes_to_envelope: true,
        geometry: {
          type: "polygon_2d",
          closed: true,
          coordinate_space: "view_metric",
          points_2d: [
            { x: 0, y: -3 },
            { x: 100, y: -3 },
            { x: 100, y: 3 },
            { x: 0, y: 3 },
          ],
          points_3d: [],
        },
        measurements: [],
        uncertainty_id: null,
        source: source("entity.side"),
      },
    ],
    stations: [
      {
        station_id: "station.mid",
        name: "Mid station",
        component_id: "component.main-body",
        longitudinal_position: quantified(50),
        view_ids: ["view.top", "view.side"],
        observation_ids: [
          "observation.top-envelope",
          "observation.side-envelope",
        ],
        knowledge_state: "operator_defined",
        source: source(),
      },
    ],
    features: [],
    constraints: [
      {
        constraint_id: "constraint.origin-datum",
        name: "Object origin datum",
        constraint_type: "datum",
        knowledge_state: "operator_defined",
        references: [
          {
            target_type: "landmark",
            target_id: "landmark.origin",
            role: "mechanical_datum",
          },
        ],
        expression: null,
        source: source(),
        uncertainty_id: null,
      },
    ],
    uncertainty_model: {
      model_id: "uncertainty.model.v1",
      method: "explicit_per_item",
      default_length_mm: null,
      confidence_level: 0.95,
      entries: [
        {
          uncertainty_id: "uncertainty.origin",
          target_type: "landmark",
          target_id: "landmark.origin",
          kind: "absolute",
          value: 0.1,
          unit: "mm",
          lower: null,
          upper: null,
          knowledge_state: "measured",
          source: source(),
        },
      ],
    },
    provenance: {
      entities: [
        {
          entity_id: "entity.trace",
          entity_type: "json",
          label: "Trace package source",
          uri: null,
          sha256: null,
          created_at: null,
        },
        {
          entity_id: "entity.top",
          entity_type: "image",
          label: "Top source",
          uri: null,
          sha256: null,
          created_at: null,
        },
        {
          entity_id: "entity.side",
          entity_type: "image",
          label: "Side source",
          uri: null,
          sha256: null,
          created_at: null,
        },
      ],
      activities: [
        {
          activity_id: "activity.trace",
          activity_type: "tracing",
          started_at: null,
          ended_at: null,
          agent_ids: ["agent.operator"],
          used_entity_ids: ["entity.top", "entity.side"],
          generated_entity_ids: ["entity.trace"],
        },
      ],
      agents: [
        {
          agent_id: "agent.operator",
          agent_type: "operator",
          name: "Test operator",
          version: null,
        },
      ],
    },
    validation: {
      status: "not_validated",
      schema_id: "engrove_tonearm_observation_package_v1",
      validator_name: null,
      validator_version: null,
      validated_at: null,
      errors: [],
    },
    operator_acceptance: null,
  };
}

module.exports = {
  clone,
  source,
  quantified,
  calibration,
  unknownCamera,
  makePackage,
};
