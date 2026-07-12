// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify uncertainty model fields, entries, identities, and typed targets.
 * Inputs: Fresh package fixtures and shared schema/semantic assertions.
 * Outputs: Uncertainty contract regression assertions.
 * Safe edits: Uncertainty model, entry, range, source, and target-reference cases only.
 * Do not: Add interval ordering rules or own unrelated cross-domain semantics.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

const TARGET_CASES = Object.freeze([
  ["view", "view.missing"],
  ["landmark", "landmark.missing"],
  ["observation", "observation.missing"],
  ["station", "station.missing"],
  ["feature", "feature.missing"],
  ["constraint", "constraint.missing"],
  ["measurement", "measurement.missing"],
]);

function run({ assertions, fixture }) {
  assertions.expectValid("baseline uncertainty model");
  assertions.expectValid("empty uncertainty entries", (value) => {
    value.uncertainty_model.entries = [];
    value.landmarks[0].uncertainty_id = null;
  });
  assertions.expectValid("observation uncertainty target", (value) => {
    setTarget(value, "observation", "observation.top-envelope");
  });
  assertions.expectValid("measurement uncertainty target", (value) => {
    setTarget(value, "measurement", "measurement.top-width");
  });
  assertions.expectValid("nullable uncertainty values", (value) => {
    const entry = value.uncertainty_model.entries[0];
    entry.value = null;
    entry.lower = null;
    entry.upper = null;
  });

  assertions.structuralCase(
    "uncertainty method vocabulary",
    (value) => {
      value.uncertainty_model.method = "estimated";
    },
    "VALUE_ENUM_INVALID",
  );
  assertions.structuralCase(
    "default uncertainty length minimum",
    (value) => {
      value.uncertainty_model.default_length_mm = -1;
    },
    "NUMBER_MINIMUM_VIOLATION",
  );
  assertions.structuralCase(
    "confidence level exclusive minimum",
    (value) => {
      value.uncertainty_model.confidence_level = 0;
    },
    "NUMBER_RANGE_VIOLATION",
  );
  assertions.structuralCase(
    "confidence level maximum",
    (value) => {
      value.uncertainty_model.confidence_level = 1.1;
    },
    "NUMBER_RANGE_VIOLATION",
  );
  assertions.structuralCase(
    "uncertainty entry identity required",
    (value) => {
      delete value.uncertainty_model.entries[0].uncertainty_id;
    },
    "PROPERTY_REQUIRED",
  );
  assertions.structuralCase(
    "uncertainty target vocabulary",
    (value) => {
      value.uncertainty_model.entries[0].target_type = "surface";
    },
    "VALUE_ENUM_INVALID",
  );
  assertions.structuralCase(
    "uncertainty kind vocabulary",
    (value) => {
      value.uncertainty_model.entries[0].kind = "spread";
    },
    "VALUE_ENUM_INVALID",
  );
  assertions.structuralCase(
    "uncertainty value must be finite",
    (value) => {
      value.uncertainty_model.entries[0].value = Number.NaN;
    },
    "FINITE_NUMBER_REQUIRED",
  );
  assertions.structuralCase(
    "uncertainty lower bound must be finite",
    (value) => {
      value.uncertainty_model.entries[0].lower = Number.NEGATIVE_INFINITY;
    },
    "FINITE_NUMBER_REQUIRED",
  );
  assertions.structuralCase(
    "uncertainty upper bound must be finite",
    (value) => {
      value.uncertainty_model.entries[0].upper = Number.POSITIVE_INFINITY;
    },
    "FINITE_NUMBER_REQUIRED",
  );
  assertions.structuralCase(
    "uncertainty unit must not be empty",
    (value) => {
      value.uncertainty_model.entries[0].unit = "";
    },
    "STRING_TOO_SHORT",
  );
  assertions.structuralCase(
    "uncertainty knowledge state required",
    (value) => {
      delete value.uncertainty_model.entries[0].knowledge_state;
    },
    "PROPERTY_REQUIRED",
  );
  assertions.structuralCase(
    "uncertainty source required",
    (value) => {
      delete value.uncertainty_model.entries[0].source;
    },
    "PROPERTY_REQUIRED",
  );
  assertions.structuralCase(
    "uncertainty entry rejects unknown property",
    (value) => {
      value.uncertainty_model.entries[0].extra = true;
    },
    "PROPERTY_UNKNOWN",
  );

  for (const [targetType, targetId] of TARGET_CASES) {
    assertions.semanticCase(
      `unresolved uncertainty ${targetType} target`,
      (value) => {
        setTarget(value, targetType, targetId);
      },
      "UNCERTAINTY_TARGET_UNRESOLVED",
    );
  }

  assertions.semanticCase(
    "duplicate uncertainty identity",
    (value) => {
      value.uncertainty_model.entries.push(
        fixture.clone(value.uncertainty_model.entries[0]),
      );
    },
    "UNCERTAINTY_ID_DUPLICATE",
  );
  assertions.semanticCase(
    "uncertainty source entity resolves",
    (value) => {
      value.uncertainty_model.entries[0].source.provenance_entity_id =
        "entity.missing";
    },
    "SOURCE_PROVENANCE_ENTITY_UNRESOLVED",
  );
  assertions.semanticCase(
    "uncertainty source activity resolves",
    (value) => {
      value.uncertainty_model.entries[0].source.provenance_activity_id =
        "activity.missing";
    },
    "SOURCE_PROVENANCE_ACTIVITY_UNRESOLVED",
  );
  assertions.semanticCase(
    "uncertainty source agent resolves",
    (value) => {
      value.uncertainty_model.entries[0].source.provenance_agent_id =
        "agent.missing";
    },
    "SOURCE_PROVENANCE_AGENT_UNRESOLVED",
  );
}

function setTarget(value, targetType, targetId) {
  const entry = value.uncertainty_model.entries[0];
  entry.target_type = targetType;
  entry.target_id = targetId;
  value.landmarks[0].uncertainty_id = null;
}

module.exports = { run };
