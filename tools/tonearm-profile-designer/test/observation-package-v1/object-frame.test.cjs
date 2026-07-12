// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify object-frame vector, orthogonality, handedness, and dimensional-authority rules.
 * Inputs: Fresh package fixtures and semantic assertions.
 * Outputs: Frame-domain regression assertions.
 * Safe edits: Object-frame positive and negative cases.
 * Do not: Own view camera or geometry topology tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions }) {
  assertions.expectValid("right-handed orthogonal frame");
  assertions.semanticCase(
    "zero frame axis",
    (value) => {
      value.object_frame.axes.x.direction = [0, 0, 0];
    },
    "OBJECT_FRAME_AXIS_ZERO",
  );
  assertions.semanticCase(
    "parallel frame axes",
    (value) => {
      value.object_frame.axes.y.direction = [2, 0, 0];
    },
    "OBJECT_FRAME_AXES_NOT_ORTHOGONAL",
  );
  assertions.semanticCase(
    "declared handedness mismatch",
    (value) => {
      value.object_frame.axes.z.direction = [0, 0, -1];
    },
    "OBJECT_FRAME_HANDEDNESS_INCONSISTENT",
  );
  assertions.semanticCase(
    "eligible dimensions block unknown frame",
    (value) => {
      value.object_frame.handedness = "unknown";
    },
    "OBJECT_FRAME_DIMENSION_AUTHORITY_BLOCKED",
  );
  assertions.semanticCase(
    "eligible dimensions block left-handed frame",
    (value) => {
      value.object_frame.handedness = "left_handed";
      value.object_frame.axes.z.direction = [0, 0, -1];
    },
    "OBJECT_FRAME_DIMENSION_AUTHORITY_BLOCKED",
  );
}

module.exports = { run };
