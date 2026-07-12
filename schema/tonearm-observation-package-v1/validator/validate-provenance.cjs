// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate provenance entities, activities, agents, and identity links.
 * Inputs: Provenance record and JSON-style path.
 * Outputs: A provenance-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, text, id, controlled, list, idList, dateTime } = checks;
  const add = context.add;
  const ref = context.reference;
  function validateProvenance(item, path) {
    if (shape(item, path, ["entities", "activities", "agents"])) {
      list(item.entities, `${path}.entities`, 1, 4096, (entry, ePath) => {
        if (
          shape(entry, ePath, [
            "entity_id",
            "entity_type",
            "label",
            "uri",
            "sha256",
            "created_at",
          ])
        ) {
          id(entry.entity_id, `${ePath}.entity_id`);
          controlled(entry.entity_type, `${ePath}.entity_type`, [
            "image",
            "svg",
            "json",
            "operator_note",
            "calibration_reference",
            "software_output",
            "other",
          ]);
          text(entry.label, `${ePath}.label`, 1, 160);
          if (null !== entry.uri) {
            text(entry.uri, `${ePath}.uri`, 1, 2048);
          }
          null === entry.sha256 ||
            (text(entry.sha256, `${ePath}.sha256`, 64, 64) &&
              /^[a-f0-9]{64}$/.test(entry.sha256)) ||
            add(
              "STRING_PATTERN_INVALID",
              `${ePath}.sha256`,
              "String does not match the required checksum pattern.",
            );
          if (null !== entry.created_at) {
            dateTime(entry.created_at, `${ePath}.created_at`);
          }
        }
      });
      list(item.agents, `${path}.agents`, 1, 256, (entry, ePath) => {
        if (
          shape(entry, ePath, ["agent_id", "agent_type", "name", "version"])
        ) {
          id(entry.agent_id, `${ePath}.agent_id`);
          controlled(entry.agent_type, `${ePath}.agent_type`, ENUMS.AgentType);
          text(entry.name, `${ePath}.name`, 1, 160);
          if (null !== entry.version) {
            text(entry.version, `${ePath}.version`, 1, 128);
          }
        }
      });
      list(item.activities, `${path}.activities`, 0, 4096, (entry, ePath) => {
        if (
          shape(entry, ePath, [
            "activity_id",
            "activity_type",
            "started_at",
            "ended_at",
            "agent_ids",
            "used_entity_ids",
            "generated_entity_ids",
          ])
        ) {
          id(entry.activity_id, `${ePath}.activity_id`);
          controlled(entry.activity_type, `${ePath}.activity_type`, [
            "capture",
            "rectification",
            "tracing",
            "measurement",
            "calculation",
            "annotation",
            "validation",
            "other",
          ]);
          if (null !== entry.started_at) {
            dateTime(entry.started_at, `${ePath}.started_at`);
          }
          if (null !== entry.ended_at) {
            dateTime(entry.ended_at, `${ePath}.ended_at`);
          }
          idList(entry.agent_ids, `${ePath}.agent_ids`, 1, 64);
          entry.agent_ids?.forEach((x, i) =>
            ref(
              "provenance_agent",
              x,
              `${ePath}.agent_ids[${i}]`,
              "PROVENANCE_AGENT_REFERENCE_UNRESOLVED",
            ),
          );
          idList(entry.used_entity_ids, `${ePath}.used_entity_ids`);
          entry.used_entity_ids?.forEach((x, i) =>
            ref(
              "provenance_entity",
              x,
              `${ePath}.used_entity_ids[${i}]`,
              "PROVENANCE_ENTITY_REFERENCE_UNRESOLVED",
            ),
          );
          idList(entry.generated_entity_ids, `${ePath}.generated_entity_ids`);
          entry.generated_entity_ids?.forEach((x, i) =>
            ref(
              "provenance_entity",
              x,
              `${ePath}.generated_entity_ids[${i}]`,
              "PROVENANCE_ENTITY_REFERENCE_UNRESOLVED",
            ),
          );
        }
      });
    }
  }
  return validateProvenance;
}
module.exports = {
  createValidator,
};
