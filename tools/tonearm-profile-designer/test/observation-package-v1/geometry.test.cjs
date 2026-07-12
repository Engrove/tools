// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Verify geometry type topology and authoritative envelope constraints.
 * Inputs: Fresh package fixtures and shared assertions.
 * Outputs: Geometry-domain structural and semantic assertions.
 * Safe edits: Point counts, closure, dimensionality, section-loop, and envelope cases.
 * Do not: Own camera calibration or provenance decision tests.
 * Verification: observation-package-contract.test.cjs.
 */
"use strict";

function run({ assertions }) {
  const cases = [
    [
      "point_2d count",
      geometry(
        "point_2d",
        false,
        [
          [0, 0],
          [1, 1],
        ],
        [],
      ),
    ],
    ["point_2d closed", geometry("point_2d", true, [[0, 0]], [])],
    ["line_2d count", geometry("line_2d", false, [[0, 0]], [])],
    [
      "line_2d closed",
      geometry(
        "line_2d",
        true,
        [
          [0, 0],
          [1, 1],
        ],
        [],
      ),
    ],
    ["polyline_2d count", geometry("polyline_2d", false, [[0, 0]], [])],
    [
      "polyline_2d closed",
      geometry(
        "polyline_2d",
        true,
        [
          [0, 0],
          [1, 1],
        ],
        [],
      ),
    ],
    [
      "polygon_2d count",
      geometry(
        "polygon_2d",
        true,
        [
          [0, 0],
          [1, 1],
        ],
        [],
      ),
    ],
    [
      "polygon_2d open",
      geometry(
        "polygon_2d",
        false,
        [
          [0, 0],
          [1, 1],
          [2, 0],
        ],
        [],
      ),
    ],
    [
      "section_loop_3d count",
      geometry(
        "section_loop_3d",
        true,
        [],
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ),
    ],
    [
      "section_loop_3d open",
      geometry(
        "section_loop_3d",
        false,
        [],
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      ),
    ],
  ];

  for (const [label, item] of cases) {
    assertions.structuralCase(
      label,
      (value) => {
        value.observations[0].contributes_to_envelope = false;
        value.observations[0].geometry_role =
          item.type === "section_loop_3d" ? "section_loop" : "visible_edge";
        value.observations[0].geometry = item;
      },
      item.type === "section_loop_3d"
        ? "OBSERVATION_SECTION_LOOP_INVALID"
        : "OBSERVATION_GEOMETRY_TOPOLOGY_INVALID",
    );
  }

  assertions.structuralCase(
    "section loop requires station",
    (value) => {
      value.observations[0].contributes_to_envelope = false;
      value.observations[0].geometry_role = "section_loop";
      value.observations[0].station_id = null;
      value.observations[0].geometry = geometry(
        "section_loop_3d",
        true,
        [],
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      );
    },
    "OBSERVATION_SECTION_LOOP_STATION_REQUIRED",
  );
  assertions.structuralCase(
    "outer envelope requires polygon",
    (value) => {
      value.observations[0].geometry = geometry(
        "polyline_2d",
        false,
        [
          [0, 0],
          [1, 1],
        ],
        [],
      );
    },
    "OBSERVATION_ENVELOPE_GEOMETRY_INVALID",
  );
  assertions.structuralCase(
    "occluded envelope forbidden",
    (value) => {
      value.observations[0].visibility = "occluded";
    },
    "OBSERVATION_ENVELOPE_NOT_AUTHORITATIVE",
  );
  assertions.structuralCase(
    "negative envelope forbidden",
    (value) => {
      value.observations[0].completeness = {
        state: "negative",
        negative_state: "not_visible",
      };
    },
    "OBSERVATION_ENVELOPE_NOT_AUTHORITATIVE",
  );
}

function geometry(type, closed, points2d, points3d) {
  return {
    type,
    closed,
    coordinate_space:
      type === "section_loop_3d" ? "object_frame" : "view_metric",
    points_2d: points2d.map(([x, y]) => ({ x, y })),
    points_3d: points3d.map(([x, y, z]) => ({ x, y, z })),
  };
}

module.exports = { run };
