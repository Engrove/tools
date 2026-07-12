# Engrove Trace Project Package v1 contract

## Status and scope

This directory owns the interchange contract for the future `.engrove-trace-project` container. Version 1 is a single-object, multi-view contract. It does not implement Manual Trace export, Tonearm Profile Designer import, ZIP parsing, browser package handling, session persistence, or 3D construction.

Canonical files:

- `manifest.schema.json` — package inventory, integrity metadata, semantic roles, and role-specific identity requirements.
- `project.schema.json` — shared object, engineering frame, trace inventory, assets, provenance, and field disposition.
- `trace.schema.json` — one orthographic view, calibration, view mapping, geometry, stations, datums, relations, assets, and provenance.
- `field-matrix.json` — exact disposition for every schema property.
- `ADR-0001-container-format.md` — container and identity-resolution decisions.

## Container and manifest

The future file is a ZIP-based `.engrove-trace-project` container with `manifest.json`, `project.json`, `traces/`, `assets/`, and an optional readme. The extension is a container marker, not permission to accept arbitrary ZIP content.

`manifest.json` declares every payload entry except itself. Each entry has a normalized relative POSIX path, allow-listed media type, semantic role, lowercase SHA-256, and exact byte size. A `trace` entry requires `traceId`; a `source_image`, `source_svg`, or `sidecar` entry requires `assetId`. The manifest contains exactly one `project` entry matching `projectFile`. Unsafe paths, duplicate paths, undeclared or missing entries, digest/size mismatch, executable content, missing role identity, and identity disagreement are blocking.

## Identity namespaces and exact resolution

Validation retains every declaration for each key and resolves against all candidates. It never silently overwrites a declaration in a `Map`, deduplicates conflicts with a `Set`, selects the first match, or derives cross-trace identity from equal strings.

### Package-global identities

These are unique throughout one package:

- `projectId`;
- `objectId`;
- `traceId`;
- `assetId`;
- project engineering-frame `datumId`;
- project engineering-frame `referenceId`.

Repeated package-global identities, including collisions between entity kinds, are blocking.

### Trace-local identities

These are unique inside their owning trace:

- `contourId`;
- trace datum `datumId`;
- `relationId`.

A local string may be reused in another trace only because each occurrence remains in its own trace-local namespace. Bare references never search another trace. Allowed local targets are local contours, stations, trace datums, relations where the field permits them, and explicitly allowed project datums. Zero or multiple matches block with stable unknown or ambiguous diagnostics.

### Station identity

A station names a physical position on the common object. `stationId` is unique within one trace. The same ID may occur in multiple traces only when it represents the same physical station. Repeated occurrences must agree, within the maximum relevant calibration or binding tolerance, on engineering-axis identity, engineering position, station usage, and geometric disposition. Conflicts emit `STATION_ID_CONFLICT`.

A section binding containing only `stationId` therefore resolves to one non-conflicting canonical station identity. No occurrence is chosen by array order.

## Trace identity chain

Every trace must satisfy:

```text
manifest trace entry
    <-> project.traceFiles[] record
    <-> package entry path
    <-> trace document
```

The manifest role is `trace`; manifest and project paths agree; manifest `traceId`, project `traceId`, and document `traceId` agree; project and document `objectId` equal the shared object; project `geometricUse` equals the document view disposition; and each path and trace identity resolves exactly once. Alias paths are not supported in v1.

## Asset identity chain

Every project asset must satisfy:

```text
manifest asset entry
    <-> project.assets[] record
    <-> package entry
    <-> associated traceIds
```

`assetId` and asset path are unique. Manifest and project identity, role, path, media type, digest, and size agree. Every associated trace ID resolves exactly once. Trace-level source image, SVG, sidecar, and contour SVG-source asset IDs resolve to exactly one compatible project asset, and the asset must include the owning trace association. Unknown, contradictory, or ambiguous associations block.

Imported SVG remains hostile content. Integrity does not make SVG safe; a future implementation must reject or sanitize scripts, event handlers, external links, active content, non-fragment URLs, and unsafe XML/HTML constructs before rendering.

## Engineering frame and project references

`project.json` owns one object. Its engineering frame is right-handed and millimetre-based. The origin datum and both object-direction endpoints resolve to unique project datums; direction endpoints are distinct. Project reference IDs are unique identities, not implicit reference targets.

Project reference `sourceId` and `targetId` may target the package project, object, trace, asset, or project datum identities. Each target resolves exactly once. Unknown or ambiguous targets are blocking.

## Trace geometry and references

Each trace explicitly declares orthographic view type, geometry disposition, complete view frame, and optional section binding. A front or section trace used for geometry binds to `stationId`, `xMm`, or both. An unbound front/section view can only remain provenance and emits `UNPLACED_VIEW_PRESERVED`.

A geometrically used trace has exactly one primary closed outer contour, and `geometry.primaryContourId` resolves exactly once locally. Relations and `references[]` use the documented trace-local scope. Unknown or ambiguous values are not silently converted to provenance.

Calibration enforces:

```text
unitPerPx == sourceRealLength / sourcePixelLength
```

within declared tolerance or a strict numerical fallback.

## Provenance and field disposition

Editor state does not drive 3D geometry. Provenance preserves producer/version, original schema, source names, image dimensions, SVG binding, descriptions, semantic names, AI hints, references, timestamps, and digest.

Every known source field is classified exactly once as `used_for_geometry`, `preserved_as_provenance`, `intentionally_ignored`, `unsupported_warning`, or `unsupported_error`. The field matrix covers every schema property, and project `fieldDisposition[]` covers every declared source path.

## Versioning and compatibility

Version 1 readers accept package major version 1 only and fail closed on unknown majors. This contract is not the Manual Trace editor-session schema or a legacy `engrove_manual_trace_v16` document. Legacy adaptation, export, import, normalized multi-view construction, and 3D generation are later implementation slices.

## Tests

Fixtures are deterministic virtual package images. JSON bytes are canonical two-space UTF-8 JSON with a final newline; text uses literal UTF-8; binary fixtures use canonical base64 decoded before hashing. This tests schema, integrity, identity, reference, and placement rules without claiming ZIP runtime behavior.

Run:

```bash
node --test tools/manual-trace/test/trace-project-package/*.test.mjs
```

The suite retains positive and negative geometry cases, malformed-record guards, field-matrix exact parity, hidden Unicode scanning, and genuine accept/block paths. Identity tests add matched positive and negative cases for trace and asset chains, project datums and references, trace-local namespaces, station consistency, and the ten EIC regression probes.
