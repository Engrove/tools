// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify identity domains, bidirectional references, component membership, and datum integrity.
 * Inputs: Fresh package fixtures and shared assertions.
 * Outputs: Cross-reference regression assertions.
 * Safe edits: Typed identity and relationship cases.
 * Do not: Own local shape or operator decision status tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions, fixture }) {
  assertions.semanticCase(
    "observation component declared by view",
    (value) => {
      addOtherComponent(value);
      value.observations[0].component_id = "component.other";
    },
    "OBSERVATION_COMPONENT_NOT_IN_VIEW",
  );
  assertions.semanticCase(
    "station component consistency",
    (value) => {
      addOtherComponent(value);
      value.stations[0].component_id = "component.other";
    },
    "OBSERVATION_STATION_COMPONENT_MISMATCH",
  );
  assertions.semanticCase(
    "station observation backreference",
    (value) => {
      value.stations[0].observation_ids = ["observation.side-envelope"];
    },
    "STATION_OBSERVATION_BACKREFERENCE_MISSING",
  );
  assertions.semanticCase(
    "station view coverage",
    (value) => {
      value.stations[0].view_ids = ["view.side"];
    },
    "STATION_VIEW_COVERAGE_MISSING",
  );
  assertions.semanticCase(
    "station listed observation refers back",
    (value) => {
      value.stations.push({
        station_id: "station.other",
        name: "Other",
        component_id: "component.main-body",
        longitudinal_position: fixture.quantified(60),
        view_ids: ["view.top"],
        observation_ids: ["observation.top-envelope"],
        knowledge_state: "operator_defined",
        source: fixture.source(),
      });
    },
    "STATION_OBSERVATION_BACKREFERENCE_MISMATCH",
  );
  assertions.semanticCase(
    "mechanical datum kind",
    (value) => {
      value.landmarks[0].kind = "visual_landmark";
    },
    "DATUM_LANDMARK_KIND_INVALID",
  );
  assertions.semanticCase(
    "envelope cannot use raw view",
    (value) => {
      value.views[0].projection_type = "raw_perspective";
      value.views[0].dimension_source = "forbidden";
      value.views[0].calibration = null;
      value.views[0].perspective_model = fixture.unknownCamera();
    },
    "OBSERVATION_ENVELOPE_VIEW_FORBIDDEN",
  );
  assertions.semanticCase(
    "unresolved view",
    (value) => {
      value.observations[0].view_id = "view.missing";
    },
    "VIEW_REFERENCE_UNRESOLVED",
  );
  assertions.semanticCase(
    "unresolved station",
    (value) => {
      value.observations[0].station_id = "station.missing";
    },
    "STATION_REFERENCE_UNRESOLVED",
  );
  assertions.semanticCase(
    "unresolved mechanical datum",
    (value) => {
      value.constraints[0].references[0].target_id = "landmark.missing";
    },
    "DATUM_REFERENCE_UNRESOLVED",
  );
  assertions.semanticCase(
    "duplicate view identity",
    (value) => {
      value.views.push(fixture.clone(value.views[0]));
    },
    "VIEW_ID_DUPLICATE",
  );
}

function addOtherComponent(value) {
  value.object.components.push({
    component_id: "component.other",
    name: "Other",
    role: "separate_component",
    parent_component_id: null,
    knowledge_state: "observed",
    description: "",
  });
}

module.exports = { run };
