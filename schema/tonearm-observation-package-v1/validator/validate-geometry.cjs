// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate geometry dimensionality, point counts, and closure topology.
 * Inputs: Geometry record and JSON-style path.
 * Outputs: A geometry-domain validator.
 * Safe edits: Changes within this module's named contract responsibility.
 * Do not: Add unrelated domains, defaults, mutation, fabrication, or runtime activation.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function createValidator({ context, checks, constants }) {
  const { ENUMS } = constants;
  const { shape, bool, controlled, list, point2, point3 } = checks;
  const add = context.add;
  function validateGeometry(item, path) {
    if (
      !shape(item, path, [
        "type",
        "closed",
        "coordinate_space",
        "points_2d",
        "points_3d",
      ])
    )
      return;
    controlled(item.type, `${path}.type`, ENUMS.GeometryType);
    bool(item.closed, `${path}.closed`);
    controlled(
      item.coordinate_space,
      `${path}.coordinate_space`,
      ENUMS.CoordinateSpace,
    );
    list(item.points_2d, `${path}.points_2d`, 0, 1e4, point2);
    list(item.points_3d, `${path}.points_3d`, 0, 1e4, point3);
    const rules = {
      point_2d: [1, false],
      line_2d: [2, false],
      polyline_2d: [2, false],
      polygon_2d: [3, true],
    };
    if (rules[item.type]) {
      const [min, closed] = rules[item.type],
        count = Array.isArray(item.points_2d) ? item.points_2d.length : -1;
      if (
        count < min ||
        ("polyline_2d" !== item.type &&
          "polygon_2d" !== item.type &&
          count !== min) ||
        item.closed !== closed ||
        (Array.isArray(item.points_3d) && item.points_3d.length)
      ) {
        add(
          "OBSERVATION_GEOMETRY_TOPOLOGY_INVALID",
          path,
          "Geometry point count, dimensionality, and closed state must match its declared type.",
        );
      }
    }
    if (
      "section_loop_3d" === item.type &&
      (!Array.isArray(item.points_3d) ||
        item.points_3d.length < 3 ||
        true !== item.closed ||
        "object_frame" !== item.coordinate_space ||
        (Array.isArray(item.points_2d) && item.points_2d.length))
    ) {
      add(
        "OBSERVATION_SECTION_LOOP_INVALID",
        path,
        "Section loop requires at least three object-frame points and closed=true.",
      );
    }
  }
  return validateGeometry;
}
module.exports = {
  createValidator,
};
