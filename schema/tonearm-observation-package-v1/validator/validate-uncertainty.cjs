// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate uncertainty model identity and entry collection shape.
 * Inputs: Uncertainty model and path.
 * Outputs: An uncertainty-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ checks }) {
  const { shape, id, list } = checks;
  return function validateUncertainty(item, path) {
    if (
      !shape(item, path, [
        "model_id",
        "method",
        "default_length_mm",
        "confidence_level",
        "entries",
      ])
    )
      return;
    id(item.model_id, `${path}.model_id`);
    list(item.entries, `${path}.entries`, 0, 4096, () => {});
  };
}
module.exports = {
  createValidator,
};
