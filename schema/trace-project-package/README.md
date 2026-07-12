# Engrove Trace Project Package v1 contract

## Status and scope

This directory owns the interchange contract for the future `.engrove-trace-project` container. Version 1 is a single-object, multi-view contract. It does not implement Manual Trace export, Tonearm Profile Designer import, ZIP parsing, production package handling, session persistence, or 3D construction.

Canonical files:

- `manifest.schema.json` — package inventory, integrity metadata, semantic roles, and role-specific identities.
- `project.schema.json` — shared object, engineering frame, trace inventory, assets, provenance, and field disposition.
- `trace.schema.json` — one orthographic view, calibration, view mapping, geometry, stations, datums, relations, assets, and provenance.
- `field-matrix.json` — exact disposition for every schema property.
- `ADR-0001-container-format.md` — container, identity, inventory, station, binding, and coordinate-frame decisions.

## Container layout

```text
<project>.engrove-trace-project
├── manifest.json
├── project.json
├── traces/<trace-id>.json
├── assets/images/*
├── assets/svg/*
├── assets/sidecars/*
└── README.txt                 optional
```

The extension is a ZIP container marker, not permission to accept arbitrary ZIP content. A future reader must reject unsafe, undeclared, unresolved, or contradictory entries before consuming geometry.

## Manifest and complete inventory

`manifest.json` declares every payload entry except itself. Each entry has a normalized relative POSIX path, allow-listed media type, semantic role, lowercase SHA-256 digest, exact byte size, and the identity required by its role.

Role rules:

- `project`: exactly one entry matching `projectFile`; no `traceId` or `assetId`.
- `trace`: requires `traceId`; participates in exactly one trace chain.
- `source_image`, `source_svg`, `sidecar`: require `assetId`; participate in exactly one asset chain.
- `readme`: manifest-only informational payload; it must not carry `traceId` or `assetId` and must not appear in `project.assets[]`.

Duplicate or unsafe paths, undeclared entries, missing entries, digest/size mismatch, executable content, missing role identity, forbidden readme identity, and inventory disagreement are blocking.

## Identity namespaces and exact resolution

Validation retains every declaration for each key and resolves against all candidates. It never silently overwrites declarations, deduplicates conflicts, selects the first or last match, or infers cross-trace identity from equal strings.

### Package-global identities

The following are unique throughout one package:

- `projectId`;
- `objectId`;
- `traceId`;
- `assetId`;
- project engineering-frame `datumId`;
- project engineering-frame `referenceId`.

A repeated package-global identity, including a collision between entity kinds, is blocking.

### Trace-local identities

The following are unique inside one owning trace:

- `contourId`;
- trace datum `datumId`;
- `relationId`.

A string may be reused in another trace only because the namespaces remain separate. Bare references never search another trace. Allowed local targets are local contours, stations, trace datums, relations where the field permits them, and explicitly allowed project datums. Zero or multiple matches block.

## Bidirectional trace inventory

Every trace participates in exactly one complete chain:

```text
manifest trace entry
    <-> project.traceFiles[] record
    <-> package entry path
    <-> trace document
```

Validation is bidirectional:

- every project trace record resolves to one matching manifest trace entry and one JSON package entry;
- every manifest trace entry resolves to one project trace record;
- every package JSON entry under `traces/` resolves through both inventories;
- no extra trace document is ignored because nothing references it.

Manifest role and path, manifest/project/document `traceId`, shared `objectId`, and project/document geometric-use declarations must agree. Each trace ID and each trace path resolves exactly once. Alias paths are not supported in v1.

## Bidirectional asset inventory

Every project asset participates in exactly one complete chain:

```text
manifest asset entry
    <-> project.assets[] record
    <-> package entry path
    <-> associated traceIds
```

Validation is bidirectional:

- every project asset resolves to one compatible manifest asset entry and one package entry;
- every manifest source-image, source-SVG, or sidecar entry resolves to one project asset;
- every package entry under `assets/` resolves through both inventories;
- multiple project assets cannot claim one manifest entry;
- orphaned asset identities and entries block.

Manifest and project path, `assetId`, role, media type, digest, size, and declared trace association must agree. Trace-level image, SVG, sidecar, and contour SVG-source references resolve to exactly one compatible project asset whose `traceIds[]` includes the owning trace.

Imported SVG remains hostile input. Digest agreement does not make it safe; a future implementation must sanitize or reject scripts, event handlers, external links, active content, non-fragment URLs, and unsafe XML/HTML constructs.

## Engineering coordinate frame

`project.json` owns one object and one right-handed millimetre engineering frame.

The fixed basis-validation tolerance is `1e-9`. It is independent of trace calibration and station tolerances. The semantic validator requires:

- finite origin coordinates and finite project-datum positions;
- finite X, Y, and Z vector components;
- unit-length axes within `1e-9`;
- pairwise orthogonality within `1e-9`;
- a non-degenerate basis;
- `cross(X, Y)` equal to Z within `1e-9` when `handedness` is `right`;
- object-direction axis equal to one declared engineering axis;
- origin and object-direction datum references resolving exactly once to project datums;
- distinct object-direction endpoints.

Project reference IDs are package-global. Project reference source and target values may resolve to the project, object, trace, asset, or project datum registries and must resolve exactly once.

## View-frame datum resolution

For every trace, `view.viewFrame.engineeringOriginDatumId` resolves exactly once to a project engineering-frame datum. A trace-local datum is not an allowed substitute. Several traces may deliberately use the same valid project datum.

Unknown and ambiguous project-datum resolution is blocking.

## Station identity and order-independent consistency

A `stationId` identifies one physical position on the common object. It is unique within one trace. Repeated occurrences in several traces are valid only when every pair agrees on:

- orientation engineering axis;
- finite engineering position `xMm`;
- station usage;
- geometric disposition.

For a pair of occurrences, position agreement uses:

```text
pairToleranceMm = max(
  occurrenceA.trace.calibration.toleranceMm,
  occurrenceB.trace.calibration.toleranceMm,
  1e-9 mm
)
```

Every pair must satisfy its pair tolerance. Agreement is not transitive: A close to B and B close to C does not make the group valid when A is not close to C. The verdict is independent of manifest order, project trace order, and station-array order.

A section binding that names a station is compared with every occurrence in the consistent group. For each occurrence:

```text
bindingToleranceMm = max(
  binding.toleranceMm,
  occurrence.trace.calibration.toleranceMm,
  1e-9 mm
)
```

Diagnostics are sorted deterministically after semantic resolution; sorting does not select a canonical occurrence.

## Section-binding methods

`sectionBinding` is a strict v1 discriminated union.

### `explicit_station`

- requires `stationId`;
- may include `xMm`;
- if `xMm` is present, it must agree with every occurrence of the resolved station group under the binding tolerance rule.

### `explicit_x`

- requires `xMm`;
- forbids `stationId`;
- does not depend on station resolution.

`derived_station` is not part of v1. The current data model lacks a dedicated derivation provenance object sufficient to define it without ambiguity. A later contract version may add it together with explicit provenance and migration rules.

A front or section trace marked `used_for_geometry` must have a valid binding. An unbound front/section trace remains valid only as `preserved_as_provenance`, with `UNPLACED_VIEW_PRESERVED`.

## Geometry and trace-local references

A geometrically used trace has exactly one primary closed outer contour, and `geometry.primaryContourId` resolves exactly once locally. Contour, station, trace-datum, relation, and project-datum references follow their documented scope. Unknown or ambiguous references block rather than silently becoming provenance.

## Calibration

Calibration enforces:

```text
unitPerPx == sourceRealLength / sourcePixelLength
```

within the declared tolerance or the validator's strict numerical fallback. This arithmetic tolerance does not alter the engineering-basis tolerance.

## Provenance and field disposition

Editor state does not drive 3D geometry. Provenance preserves producer/version, original schema, source file names, image dimensions, SVG view box and binding, descriptions, semantic names, AI hints, references, timestamps, and source digest.

Every known source field is classified as exactly one of:

- `used_for_geometry`
- `preserved_as_provenance`
- `intentionally_ignored`
- `unsupported_warning`
- `unsupported_error`

The committed field matrix gives every schema property a default disposition. Runtime `fieldDisposition[]` records cover every source path declared by project and trace provenance.

## Versioning and compatibility

Package and model versions use semantic versioning. Version 1 readers accept major version 1 only and fail closed on unknown majors. The contract is distinct from `engrove_manual_trace_v16`, `engrove_trace_project_v2`, and Manual Trace editor session state. Legacy documents require explicit adapters.

## Golden fixtures and tests

Fixtures are deterministic virtual package images. JSON entry bytes use canonical two-space UTF-8 JSON with a final newline; text assets use literal UTF-8 bytes; binary assets use canonical base64 fixture entries decoded before hashing.

Run the complete contract suite:

```bash
node --test tools/manual-trace/test/trace-project-package/*.test.mjs
```

The suite includes positive and negative fixtures, malformed-record no-throw coverage, strict geometry payloads, identity/reference integrity, bidirectional inventory, readme policy, station permutations and non-transitive tolerances, view-origin resolution, binding-method twins, engineering-frame validation, field-matrix exact parity, always-accept/always-block falsification, and hidden/bidirectional Unicode scanning.

The validators are test-only contract oracles. They are not production ZIP readers, exporters, importers, sanitizers, session handlers, or 3D construction APIs.
