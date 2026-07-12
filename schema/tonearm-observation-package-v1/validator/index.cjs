// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Orchestrate observation package v1 semantic validation in deterministic order.
 * Inputs: Arbitrary JavaScript values intended to match the package contract.
 * Outputs: A deterministic { valid, errors } result without mutation or defaults.
 * Safe edits: Validator ordering, domain registration, and explicit top-level integration.
 * Do not: Move domain logic into this orchestrator or implement JSON Schema evaluation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const constants = require("./constants.cjs");
const { createValidationContext } = require("./validation-context.cjs");
const { createPrimitiveChecks } = require("./primitive-checks.cjs");
const {
  createValidator: createObjectValidator,
} = require("./validate-object.cjs");
const {
  createValidator: createFrameValidator,
} = require("./validate-object-frame.cjs");
const {
  createValidator: createCameraValidator,
} = require("./validate-camera.cjs");
const { createValidator: createViewValidator } = require("./validate-view.cjs");
const {
  createValidator: createLandmarkValidator,
} = require("./validate-landmark.cjs");
const {
  createValidator: createStationValidator,
} = require("./validate-station.cjs");
const {
  createValidator: createGeometryValidator,
} = require("./validate-geometry.cjs");
const {
  createValidator: createObservationValidator,
} = require("./validate-observation.cjs");
const {
  createValidator: createFeatureValidator,
} = require("./validate-feature.cjs");
const {
  createValidator: createConstraintValidator,
} = require("./validate-constraint.cjs");
const {
  createValidator: createUncertaintyValidator,
} = require("./validate-uncertainty.cjs");
const {
  createValidator: createProvenanceValidator,
} = require("./validate-provenance.cjs");
const {
  createValidator: createDecisionValidator,
} = require("./validate-decision.cjs");
const { validateCrossReferences } = require("./validate-cross-references.cjs");

function validateObservationPackage(value) {
  const context = createValidationContext();
  const checks = createPrimitiveChecks(context);
  const dependencies = { context, checks, constants };
  const validateObject = createObjectValidator(dependencies);
  const validateFrame = createFrameValidator(dependencies);
  const validateCamera = createCameraValidator(dependencies);
  const validateView = createViewValidator({ ...dependencies, validateCamera });
  const validateLandmark = createLandmarkValidator(dependencies);
  const validateStation = createStationValidator(dependencies);
  const validateGeometry = createGeometryValidator(dependencies);
  const validateObservation = createObservationValidator({
    ...dependencies,
    validateGeometry,
  });
  const validateFeature = createFeatureValidator(dependencies);
  const validateConstraint = createConstraintValidator(dependencies);
  const validateUncertainty = createUncertaintyValidator(dependencies);
  const validateProvenance = createProvenanceValidator(dependencies);
  const validateDecision = createDecisionValidator(dependencies);

  try {
    if (
      !checks.shape(
        value,
        "$",
        constants.TOP_LEVEL_REQUIRED,
        constants.TOP_LEVEL_REQUIRED,
      )
    ) {
      return context.finish();
    }

    checks.constant(value.schema, "$.schema", constants.SCHEMA);
    checks.constant(value.version, "$.version", constants.VERSION);
    checks.id(value.package_id, "$.package_id");
    checks.id(value.capture_set_id, "$.capture_set_id");
    validateObject(value.object, "$.object");

    if (
      checks.shape(value.target_consumer, "$.target_consumer", [
        "application",
        "contract",
      ])
    ) {
      checks.constant(
        value.target_consumer.application,
        "$.target_consumer.application",
        "engrove_tonearm_profile_designer",
      );
      checks.constant(
        value.target_consumer.contract,
        "$.target_consumer.contract",
        "engrove_tonearm_observation_consumer_v1",
      );
    }

    validateFrame(value.object_frame, "$.object_frame");
    checks.list(value.views, "$.views", 1, 64, (item, path) =>
      validateView(item, path, value.capture_set_id),
    );
    checks.list(value.landmarks, "$.landmarks", 0, 4096, validateLandmark);
    checks.list(
      value.observations,
      "$.observations",
      1,
      4096,
      validateObservation,
    );
    checks.list(value.stations, "$.stations", 0, 1024, validateStation);
    checks.list(value.features, "$.features", 0, 2048, validateFeature);
    checks.list(
      value.constraints,
      "$.constraints",
      0,
      2048,
      validateConstraint,
    );
    validateUncertainty(value.uncertainty_model, "$.uncertainty_model");
    validateProvenance(value.provenance, "$.provenance");
    validateDecision(value.operator_acceptance, "$.operator_acceptance");

    registerDomains(value, context);
    context.resolveReferences();
    validateCrossReferences(value, context, checks);
  } catch {
    context.add(
      "VALIDATOR_INPUT_ACCESS_ERROR",
      "$",
      "Input could not be inspected safely as an observation package.",
    );
  }

  return context.finish();
}

function registerDomains(value, context) {
  context.register(
    value.object?.components,
    "component_id",
    "component",
    "$.object.components",
  );
  context.register(value.views, "view_id", "view", "$.views");
  context.register(value.landmarks, "landmark_id", "landmark", "$.landmarks");
  context.register(
    value.observations,
    "observation_id",
    "observation",
    "$.observations",
  );
  context.register(value.stations, "station_id", "station", "$.stations");
  context.register(value.features, "feature_id", "feature", "$.features");
  context.register(
    value.constraints,
    "constraint_id",
    "constraint",
    "$.constraints",
  );
  context.register(
    value.uncertainty_model?.entries,
    "uncertainty_id",
    "uncertainty",
    "$.uncertainty_model.entries",
  );
  context.register(
    value.provenance?.entities,
    "entity_id",
    "provenance_entity",
    "$.provenance.entities",
  );
  context.register(
    value.provenance?.activities,
    "activity_id",
    "provenance_activity",
    "$.provenance.activities",
  );
  context.register(
    value.provenance?.agents,
    "agent_id",
    "provenance_agent",
    "$.provenance.agents",
  );

  const measurements = [];
  value.observations?.forEach((observation) => {
    if (Array.isArray(observation?.measurements)) {
      measurements.push(...observation.measurements);
    }
  });
  context.register(
    measurements,
    "measurement_id",
    "measurement",
    "$.observations[*].measurements",
  );
}

module.exports = { validateObservationPackage };
