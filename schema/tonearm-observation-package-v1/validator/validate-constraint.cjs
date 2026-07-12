// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate typed constraint references and datum roles.
 * Inputs: Constraint record and JSON-style path.
 * Outputs: A constraint-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, text, id, controlled, list, source, nullableId } = checks;
  const ref = context.reference;
  const nullableRef = (domain, item, path, code) => {
    if (nullableId(item, path) && item !== null) {
      ref(domain, item, path, code);
    }
  };
  function validateConstraint(item, path) {
    if (
      shape(item, path, [
        "constraint_id",
        "name",
        "constraint_type",
        "knowledge_state",
        "references",
        "expression",
        "source",
        "uncertainty_id",
      ])
    ) {
      id(item.constraint_id, `${path}.constraint_id`);
      text(item.name, `${path}.name`, 1, 160);
      controlled(item.constraint_type, `${path}.constraint_type`, [
        "relation",
        "dimension",
        "datum",
        "alignment",
        "parallelism",
        "perpendicularity",
        "tangency",
        "center",
        "offset",
        "other",
      ]);
      controlled(
        item.knowledge_state,
        `${path}.knowledge_state`,
        ENUMS.KnowledgeState,
      );
      list(item.references, `${path}.references`, 1, 32, (entry, ePath) => {
        if (!shape(entry, ePath, ["target_type", "target_id", "role"])) return;
        const types = [
          "component",
          "station",
          "landmark",
          "observation",
          "feature",
          "view",
        ];
        controlled(entry.target_type, `${ePath}.target_type`, types);
        id(entry.target_id, `${ePath}.target_id`);
        controlled(entry.role, `${ePath}.role`, [
          "subject",
          "reference",
          "mechanical_datum",
          "parallel_to",
          "perpendicular_to",
          "center_of",
          "tangent_to",
          "aligned_with",
          "offset_from",
          "origin_at",
          "proxy_for",
        ]);
        if (types.includes(entry.target_type)) {
          ref(
            entry.target_type,
            entry.target_id,
            `${ePath}.target_id`,
            "mechanical_datum" === entry.role
              ? "DATUM_REFERENCE_UNRESOLVED"
              : `${entry.target_type.toUpperCase()}_REFERENCE_UNRESOLVED`,
          );
        }
      });
      if (null !== item.expression) {
        text(item.expression, `${path}.expression`, 1, 512);
      }
      source(item.source, `${path}.source`);
      nullableRef(
        "uncertainty",
        item.uncertainty_id,
        `${path}.uncertainty_id`,
        "UNCERTAINTY_REFERENCE_UNRESOLVED",
      );
    }
  }
  return validateConstraint;
}
module.exports = {
  createValidator,
};
