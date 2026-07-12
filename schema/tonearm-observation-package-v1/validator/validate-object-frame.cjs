// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate object-frame structure, finite axes, orthogonality, and handedness.
 * Inputs: Object frame and JSON-style path.
 * Outputs: A domain validator with deterministic frame errors.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS, FRAME_TOLERANCE } = constants;
  const {
    shape,
    id,
    finite,
    controlled,
    constant,
    point3,
    vector,
    source,
    nullableId,
  } = checks;
  const add = context.add;
  const ref = context.reference;
  const nullableRef = (domain, item, path, code) => {
    if (nullableId(item, path) && item !== null) {
      ref(domain, item, path, code);
    }
  };
  function validateFrame(item, path) {
    if (
      !shape(item, path, ["frame_id", "handedness", "units", "origin", "axes"])
    )
      return;
    if (
      (id(item.frame_id, `${path}.frame_id`),
      controlled(item.handedness, `${path}.handedness`, [
        "right_handed",
        "left_handed",
        "unknown",
      ]),
      constant(item.units, `${path}.units`, "mm"),
      shape(item.origin, `${path}.origin`, [
        "coordinates",
        "landmark_id",
        "knowledge_state",
        "source",
      ]) &&
        (null !== item.origin.coordinates &&
          point3(item.origin.coordinates, `${path}.origin.coordinates`),
        nullableRef(
          "landmark",
          item.origin.landmark_id,
          `${path}.origin.landmark_id`,
          "LANDMARK_REFERENCE_UNRESOLVED",
        ),
        controlled(
          item.origin.knowledge_state,
          `${path}.origin.knowledge_state`,
          ENUMS.KnowledgeState,
        ),
        source(item.origin.source, `${path}.origin.source`, true)),
      !shape(item.axes, `${path}.axes`, ["x", "y", "z"]))
    )
      return;
    const labels = {
      x: "longitudinal",
      y: "lateral",
      z: "vertical",
    };
    for (const axisName of ["x", "y", "z"]) {
      const axis = item.axes[axisName],
        axisPath = `${path}.axes.${axisName}`;
      if (
        shape(axis, axisPath, [
          "label",
          "direction",
          "knowledge_state",
          "source",
        ])
      ) {
        constant(axis.label, `${axisPath}.label`, labels[axisName]);
        vector(axis.direction, `${axisPath}.direction`);
        controlled(
          axis.knowledge_state,
          `${axisPath}.knowledge_state`,
          ENUMS.KnowledgeState,
        );
        source(axis.source, `${axisPath}.source`, true);
      }
    }
    const raw = ["x", "y", "z"].map(
      (name) => item.axes[name] && item.axes[name].direction,
    );
    if (
      !raw.every(
        (v) => Array.isArray(v) && 3 === v.length && v.every(Number.isFinite),
      )
    )
      return;
    const norm = (v) => Math.hypot(...v),
      unit = (v) => {
        const n = norm(v);
        return n > 0 ? v.map((x) => x / n) : null;
      },
      axes = raw.map(unit);
    if (
      (raw.forEach((v, index) => {
        norm(v) > FRAME_TOLERANCE ||
          add(
            "OBJECT_FRAME_AXIS_ZERO",
            `${path}.axes.${["x", "y", "z"][index]}.direction`,
            "Object-frame axis must be a non-zero finite vector.",
          );
      }),
      !axes.every(Boolean))
    )
      return;
    const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0),
      cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(dot(axes[a], axes[b])) > FRAME_TOLERANCE) {
        add(
          "OBJECT_FRAME_AXES_NOT_ORTHOGONAL",
          path + ".axes",
          "Object-frame axes must be distinct and mutually orthogonal within tolerance.",
        );
      }
    }
    if ("unknown" !== item.handedness) {
      const orientation = dot(cross(axes[0], axes[1]), axes[2]),
        expected = "right_handed" === item.handedness ? 1 : -1;
      if (Math.abs(orientation - expected) > FRAME_TOLERANCE) {
        add(
          "OBJECT_FRAME_HANDEDNESS_INCONSISTENT",
          `${path}.handedness`,
          "Declared handedness is inconsistent with the normalized axis directions.",
        );
      }
    }
  }
  return validateFrame;
}
module.exports = {
  createValidator,
};
