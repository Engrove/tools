// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate object identity, configuration, units, and component records.
 * Inputs: Object record and JSON-style path.
 * Outputs: A domain validator that appends structural/reference errors.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, text, id, controlled, constant, list, nullableId } = checks;
  const ref = context.reference;
  const nullableRef = (domain, item, path, code) => {
    if (nullableId(item, path) && item !== null) {
      ref(domain, item, path, code);
    }
  };
  function validateObject(item, path) {
    if (
      shape(item, path, [
        "id",
        "revision",
        "configuration",
        "units",
        "components",
      ])
    ) {
      id(item.id, `${path}.id`);
      text(item.revision, `${path}.revision`, 1, 128);
      if (
        shape(item.configuration, `${path}.configuration`, [
          "id",
          "assembly_state",
          "description",
        ])
      ) {
        id(item.configuration.id, `${path}.configuration.id`);
        controlled(
          item.configuration.assembly_state,
          `${path}.configuration.assembly_state`,
          ENUMS.AssemblyState,
        );
        text(
          item.configuration.description,
          `${path}.configuration.description`,
        );
      }
      if (shape(item.units, `${path}.units`, ["length", "angle", "mass"])) {
        constant(item.units.length, `${path}.units.length`, "mm");
        constant(item.units.angle, `${path}.units.angle`, "deg");
        constant(item.units.mass, `${path}.units.mass`, "g");
      }
      list(
        item.components,
        `${path}.components`,
        1,
        256,
        (component, componentPath) => {
          if (
            shape(component, componentPath, [
              "component_id",
              "name",
              "role",
              "parent_component_id",
              "knowledge_state",
              "description",
            ])
          ) {
            id(component.component_id, `${componentPath}.component_id`);
            text(component.name, `${componentPath}.name`, 1, 160);
            controlled(component.role, `${componentPath}.role`, [
              "main_body",
              "separate_component",
              "reference_fixture",
              "unknown",
            ]);
            nullableRef(
              "component",
              component.parent_component_id,
              `${componentPath}.parent_component_id`,
              "COMPONENT_REFERENCE_UNRESOLVED",
            );
            controlled(
              component.knowledge_state,
              `${componentPath}.knowledge_state`,
              ENUMS.KnowledgeState,
            );
            text(component.description, `${componentPath}.description`);
          }
        },
      );
    }
  }
  return validateObject;
}
module.exports = {
  createValidator,
};
