// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Enforce semantic invariants spanning multiple identity domains after record validation.
 * Inputs: A structurally inspected observation package and populated validation context.
 * Outputs: Deterministic cross-domain errors appended to the context.
 * Safe edits: Explicit relationship invariants between package records.
 * Do not: Revalidate local record shape, infer missing records, or mutate the package.
 * Verification: observation-package-contract.test.cjs references and determinism suites.
 */
"use strict";

function validateCrossReferences(value, context, checks) {
  const { add, records } = context;
  const { isObject } = checks;
  if (
    value.views?.some((view) => view?.dimension_source === "eligible") &&
    value.object_frame?.handedness !== "right_handed"
  ) {
    add(
      "OBJECT_FRAME_DIMENSION_AUTHORITY_BLOCKED",
      "$.object_frame.handedness",
      "Eligible dimensional views require a verified right-handed object frame.",
    );
  }
  value.observations?.forEach((observation, index) => {
    if (!isObject(observation)) return;
    const path = `$.observations[${index}]`;
    const view = records.view?.get(observation.view_id);
    const station = records.station?.get(observation.station_id);
    if (
      view &&
      observation.component_id !== null &&
      !view.component_ids?.includes(observation.component_id)
    ) {
      add(
        "OBSERVATION_COMPONENT_NOT_IN_VIEW",
        `${path}.component_id`,
        "Observation component must be declared by its referenced view.",
      );
    }
    if (station && observation.component_id !== station.component_id) {
      add(
        "OBSERVATION_STATION_COMPONENT_MISMATCH",
        `${path}.station_id`,
        "Observation and referenced station must identify the same component.",
      );
    }
    if (
      station &&
      !station.observation_ids?.includes(observation.observation_id)
    ) {
      add(
        "STATION_OBSERVATION_BACKREFERENCE_MISSING",
        `${path}.station_id`,
        "Referenced station must list the observation.",
      );
    }
    if (station && !station.view_ids?.includes(observation.view_id)) {
      add(
        "STATION_VIEW_COVERAGE_MISSING",
        `${path}.view_id`,
        "Station view_ids must include the observation view.",
      );
    }
    if (
      observation.contributes_to_envelope &&
      view &&
      (view.projection_type === "raw_perspective" ||
        view.dimension_source === "forbidden")
    ) {
      add(
        "OBSERVATION_ENVELOPE_VIEW_FORBIDDEN",
        `${path}.view_id`,
        "Envelope contribution cannot use a raw or forbidden dimensional view.",
      );
    }
  });
  value.stations?.forEach((station, stationIndex) => {
    station?.observation_ids?.forEach((observationId, observationIndex) => {
      const observation = records.observation?.get(observationId);
      if (observation && observation.station_id !== station.station_id) {
        add(
          "STATION_OBSERVATION_BACKREFERENCE_MISMATCH",
          `$.stations[${stationIndex}].observation_ids[${observationIndex}]`,
          "Listed observation must refer back to the same station.",
        );
      }
      if (observation && !station.view_ids?.includes(observation.view_id)) {
        add(
          "STATION_VIEW_COVERAGE_MISSING",
          `$.stations[${stationIndex}].view_ids`,
          "Station view_ids must cover listed observation views.",
        );
      }
    });
  });
  value.constraints?.forEach((constraint, constraintIndex) => {
    constraint?.references?.forEach((entry, referenceIndex) => {
      if (entry?.role !== "mechanical_datum") return;
      const landmark =
        entry.target_type === "landmark"
          ? records.landmark?.get(entry.target_id)
          : null;
      if (!landmark || landmark.kind !== "mechanical_datum") {
        add(
          "DATUM_LANDMARK_KIND_INVALID",
          `$.constraints[${constraintIndex}].references[${referenceIndex}]`,
          "Mechanical datum reference must resolve to a mechanical_datum landmark.",
        );
      }
    });
  });
  if (value.operator_acceptance) {
    const agent = records.provenance_agent?.get(
      value.operator_acceptance.decided_by_agent_id,
    );
    if (agent && agent.agent_type !== "operator") {
      add(
        "OPERATOR_DECISION_AGENT_TYPE_INVALID",
        "$.operator_acceptance.decided_by_agent_id",
        "Operator decision must be made by a provenance agent of type operator.",
      );
    }
  }
}
module.exports = {
  validateCrossReferences,
};
