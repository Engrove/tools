// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify neutral operator decision shape, scope, provenance type, and references.
 * Inputs: Fresh package fixtures and shared assertions.
 * Outputs: Decision-domain regression assertions.
 * Safe edits: Package and observation-subset decision cases.
 * Do not: Interpret decisions as CAD, reconstruction, or manufacturing acceptance.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions }) {
  assertions.expectValid("accepted package decision", (value) => {
    value.operator_acceptance = packageDecision(
      "accepted",
      "Package accepted.",
    );
  });
  assertions.expectValid("rejected package decision", (value) => {
    value.operator_acceptance = packageDecision(
      "rejected",
      "Package rejected.",
    );
  });
  assertions.structuralCase(
    "reconstruction candidate scope removed",
    (value) => {
      value.operator_acceptance = {
        ...packageDecision("accepted", ""),
        scope: "reconstruction_candidate",
      };
    },
    "VALUE_ENUM_INVALID",
  );
  assertions.structuralCase(
    "subset requires observations",
    (value) => {
      value.operator_acceptance = {
        ...packageDecision("accepted", ""),
        scope: "observation_subset",
      };
    },
    "OPERATOR_DECISION_SCOPE_EMPTY",
  );
  assertions.structuralCase(
    "package decision forbids observation ids",
    (value) => {
      value.operator_acceptance = {
        ...packageDecision("rejected", "Rejected package."),
        observation_ids: ["observation.top-envelope"],
      };
    },
    "OPERATOR_DECISION_PACKAGE_IDS_FORBIDDEN",
  );
  assertions.semanticCase(
    "AI agent cannot decide as operator",
    (value) => {
      value.provenance.agents[0].agent_type = "ai_system";
      value.operator_acceptance = packageDecision("accepted", "");
    },
    "OPERATOR_DECISION_AGENT_TYPE_INVALID",
  );
  assertions.semanticCase(
    "decision observation resolves",
    (value) => {
      value.operator_acceptance = {
        decision_id: "decision.subset.001",
        status: "accepted",
        scope: "observation_subset",
        decided_by_agent_id: "agent.operator",
        decided_at: "2026-07-12T12:00:00Z",
        notes: "",
        observation_ids: ["observation.missing"],
      };
    },
    "OPERATOR_DECISION_OBSERVATION_UNRESOLVED",
  );
}

function packageDecision(status, notes) {
  return {
    decision_id: "decision.package.001",
    status,
    scope: "package",
    decided_by_agent_id: "agent.operator",
    decided_at: "2026-07-12T12:00:00Z",
    notes,
    observation_ids: [],
  };
}

module.exports = { run };
