# Engrove Trace Project Package v1 contract

## Status and scope

This directory owns the interchange contract for the future `.engrove-trace-project` container. Version 1 is a single-object, multi-view contract. It does not implement Manual Trace export, Tonearm Profile Designer import, ZIP parsing, or 3D construction.

The canonical files are:

- `manifest.schema.json` — package inventory, integrity metadata, media types, and semantic roles.
- `project.schema.json` — shared object, engineering frame, trace inventory, assets, provenance, and field disposition.
- `trace.schema.json` — one orthographic view, calibration, view-to-engineering mapping, geometry, stations, datums, relations, assets, and provenance.
- `field-matrix.json` — exact machine-readable disposition for every property declared by the three schemas.
- `ADR-0001-container-format.md` — container decision and rejected alternatives.

## Container layout

```text
<project>.engrove-trace-project
├── manifest.json
├── project.json
├── traces/
│   └── <trace-id>.json
├── assets/
│   ├── images/
│   ├── svg/
│   └── sidecars/
└── README.txt                 optional
```

The extension is a ZIP container marker, not a MIME-level promise that arbitrary ZIP content is accepted. A future reader must reject unsafe or undeclared entries before parsing geometry.

## Manifest rules

`manifest.json` is the package trust boundary. It declares every payload file except itself. Self-hashing the manifest would create a recursive digest and is therefore intentionally excluded. Every declared payload entry has:

- a normalized relative POSIX path;
- a media type from the v1 allow-list;
- a semantic role;
- a lowercase SHA-256 digest;
- an exact byte size;
- optional trace or asset identity.

The manifest must contain exactly one `project` entry whose path equals `projectFile`. Duplicate paths, absolute paths, backslashes, `..`, URL paths, undeclared payload entries, missing entries, digest mismatch, size mismatch, and executable content are blocking errors.

## Shared object and engineering frame

`project.json` owns one `object.objectId`. Every `traceFiles[]` record and every trace document must use that exact identifier. Multi-object projects are not supported by package version 1.

The engineering frame is right-handed and millimetre-based. It declares:

- a 3D origin tied to a stable datum;
- X, Y, and Z meanings and unit vectors;
- positive object direction;
- object-level datums and semantic references.

For the tonearm use case the intended convention is X along the arm length, Y lateral, and Z vertical. A trace view is never inferred from a file name.

## Trace view and placement

Each trace declares `viewType`, orthographic projection, geometry disposition, a complete `viewFrame`, and an optional `sectionBinding`. `viewFrame` maps image-plane U and V plus the plane normal to three distinct engineering axes.

A `front` or `section` trace marked `used_for_geometry` must bind to `stationId`, `xMm`, or both. An unbound front/section trace remains valid only as `preserved_as_provenance`; validation emits `UNPLACED_VIEW_PRESERVED` and no geometric placement claim is allowed.

## Geometry

Contours have stable identity, operator-facing metadata, explicit geometry, open/closed state, semantic role, feature kind, references, optional SVG source binding, and primary/secondary status. A geometrically used trace must have exactly one primary closed `outer_contour`, and `geometry.primaryContourId` must select it.

Stations distinguish longitudinal loft stations, transverse helpers, section bindings, datums, and annotations. Their image-plane definition and engineering orientation must be mappable through the trace view frame.

## Calibration

Calibration preserves the canonical `unitPerPx`, the source pixel and real lengths, reference measurement identity, method, provenance, and optional tolerance/uncertainty. The contract validator enforces:

```text
unitPerPx == sourceRealLength / sourcePixelLength
```

within the declared tolerance or a strict numerical fallback. Contradictory values are blocking even though JSON Schema cannot express cross-field arithmetic by itself; `trace.schema.json` carries the normative `x-consistencyRule` annotation.

## Assets and untrusted content

Canonical package storage uses separate files, never raw `dataUrl` values. Project assets repeat path, media type, digest, size, role, trace association, and optional original file name. Every asset must have a matching manifest entry and every trace asset ID must resolve through the project asset inventory.

A future implementation must treat imported SVG as hostile input. Scripts, event handlers, external links, embedded active content, non-fragment `url(...)`, and unsafe XML/HTML constructs must be rejected or sanitized before rendering. Network URLs are not valid mandatory package assets.

## Provenance and field disposition

Editor state does not drive 3D geometry. Provenance preserves producer/version, original schema, source file names, image dimensions, SVG view box and binding, descriptions, semantic names, AI hints, references, timestamps, and source digest.

Every known source field is classified as exactly one of:

- `used_for_geometry`
- `preserved_as_provenance`
- `intentionally_ignored`
- `unsupported_warning`
- `unsupported_error`

The committed field matrix gives every schema property a default contract disposition. Each project also carries runtime `fieldDisposition[]` records that cover every source path declared by project and trace provenance. Warning dispositions emit diagnostics without invalidating the package; error dispositions block it.

## Versioning and compatibility

`packageVersion` and both model `schemaVersion` values use semantic versioning. Version 1 readers accept major version 1 only and fail closed on unknown majors. Minor/patch evolution must remain backward compatible or be handled by an explicit adapter.

The new contract is not `engrove_manual_trace_v16`, `engrove_trace_project_v2`, or the Manual Trace editor session schema. Legacy documents remain separate inputs:

```text
engrove_manual_trace_v16 JSON
    -> legacy adapter
    -> current 3D profile construction
```

The future package path is:

```text
Manual Trace internal project
    -> Trace Project Package v1
    -> package and semantic validation
    -> normalized multi-view object
    -> 3D profile construction
```

## Golden fixtures and tests

Fixtures are deterministic virtual package images in `positive-fixtures.json` and `negative-fixtures.json` under `tools/manual-trace/test/trace-project-package/`. Each positive fixture contains a manifest and a map of exact package entries. JSON entry bytes are canonical two-space UTF-8 JSON with a final newline; text assets use their literal UTF-8 bytes; binary assets use canonical base64 fixture entries decoded before hashing. This representation tests integrity and reference rules without committing ZIP binaries.

Run:

```bash
node --test tools/manual-trace/test/trace-project-package/trace-project-package-contract.test.mjs
```

Negative fixtures are deterministic JSON Patch descriptors over named positive baselines. The suite accepts positive fixtures, rejects negative fixtures by error class, verifies digest/size integrity, exercises warning emission, checks schema-to-field-matrix exact parity, and contains both allow and block cases so an always-accepting or always-blocking validator cannot pass.
