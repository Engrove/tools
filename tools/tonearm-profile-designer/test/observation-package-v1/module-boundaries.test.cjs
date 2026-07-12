#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Enforce physical module boundaries for observation package v1 code, schemas, tests, and workflow policy.
 * Inputs: Explicit repository-relative module inventory.
 * Outputs: Blocking line, byte, long-line, and expected-module assertions.
 * Safe edits: Inventory updates for intentional modular files.
 * Do not: Exempt contract modules, hide monoliths, or infer files from generated output.
 * Verification: Run directly and through observation-package-contract.test.cjs.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MAX_LINES = 500;
const MAX_BYTES = 16000;
const MAX_LINE_LENGTH = 240;
const EXPECTED_FILES = Object.freeze([
  "schema/engrove_tonearm_observation_package_v1.schema.json",
  "schema/engrove_tonearm_observation_package_v1.validator.cjs",
  "schema/tonearm-observation-package-v1/shared.schema.json",
  "schema/tonearm-observation-package-v1/object.schema.json",
  "schema/tonearm-observation-package-v1/object-frame.schema.json",
  "schema/tonearm-observation-package-v1/camera.schema.json",
  "schema/tonearm-observation-package-v1/view.schema.json",
  "schema/tonearm-observation-package-v1/geometry.schema.json",
  "schema/tonearm-observation-package-v1/relations.schema.json",
  "schema/tonearm-observation-package-v1/observation.schema.json",
  "schema/tonearm-observation-package-v1/uncertainty.schema.json",
  "schema/tonearm-observation-package-v1/provenance.schema.json",
  "schema/tonearm-observation-package-v1/decision.schema.json",
  "schema/tonearm-observation-package-v1/package.schema.json",
  "schema/tonearm-observation-package-v1/validator/constants.cjs",
  "schema/tonearm-observation-package-v1/validator/validation-context.cjs",
  "schema/tonearm-observation-package-v1/validator/primitive-checks.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-object.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-object-frame.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-camera.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-view.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-landmark.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-station.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-geometry.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-observation.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-feature.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-constraint.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-uncertainty.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-validation-state.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-provenance.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-decision.cjs",
  "schema/tonearm-observation-package-v1/validator/validate-cross-references.cjs",
  "schema/tonearm-observation-package-v1/validator/index.cjs",
  "tools/tonearm-profile-designer/test/observation-package-contract.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/fixture-factory.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/assertions.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/schema-loader.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/schema-contract.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/vocabulary-parity.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/object-frame.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/camera-view.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/geometry.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/references.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/decision.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/validation-state.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/uncertainty.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/semantic-dispatch.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/determinism.test.cjs",
  "tools/tonearm-profile-designer/test/observation-package-v1/module-boundaries.test.cjs",
  "tools/tonearm-profile-designer/scripts/test.mjs",
  "AI_VIBE_ORCHESTRATED_WORKFLOW.md",
  "AGENTS.md",
  "AI_CODING_DOCTRINE.md",
  "EIC.md",
  "scripts/check-entry.mjs",
]);

function inspectBoundaries(repositoryRoot) {
  const results = EXPECTED_FILES.map((relativePath) => {
    const absolutePath = path.join(repositoryRoot, relativePath);
    assert.ok(
      fs.existsSync(absolutePath),
      `EXPECTED_MODULE_MISSING: ${relativePath}`,
    );
    const content = fs.readFileSync(absolutePath, "utf8");
    assert.ok(
      !content.includes("[... ELLIP" + "SIZATION ...]"),
      `TRUNCATION_MARKER_FOUND: ${relativePath}`,
    );
    const lines = content.endsWith("\n")
      ? content.slice(0, -1).split("\n")
      : content.split("\n");
    const bytes = Buffer.byteLength(content, "utf8");
    const longestLine = Math.max(...lines.map((line) => line.length));
    assert.ok(
      lines.length <= MAX_LINES,
      `MODULE_LINE_LIMIT: ${relativePath}: ${lines.length}`,
    );
    assert.ok(
      bytes <= MAX_BYTES,
      `MODULE_BYTE_LIMIT: ${relativePath}: ${bytes}`,
    );
    assert.ok(
      longestLine <= MAX_LINE_LENGTH,
      `MODULE_LONG_LINE: ${relativePath}: ${longestLine}`,
    );
    return { relativePath, lines: lines.length, bytes, longestLine };
  });
  return results;
}

function run({ repositoryRoot, assertions }) {
  const results = inspectBoundaries(repositoryRoot);
  assertions.assert.equal(results.length, EXPECTED_FILES.length);
  return results;
}

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, "../../../..");
  const results = inspectBoundaries(repositoryRoot);
  console.log(
    JSON.stringify(
      {
        status: "PASS_WITH_SCOPE",
        test: "observation-package-module-boundaries",
        files: results.length,
        largestLines: Math.max(...results.map((item) => item.lines)),
        largestBytes: Math.max(...results.map((item) => item.bytes)),
        longestLine: Math.max(...results.map((item) => item.longestLine)),
      },
      null,
      2,
    ),
  );
}

module.exports = { EXPECTED_FILES, inspectBoundaries, run };
