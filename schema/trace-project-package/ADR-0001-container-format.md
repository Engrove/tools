# ADR-0001: ZIP-based Engrove Trace Project Package

- Status: Accepted for interchange contract v1
- Date: 2026-07-12
- Decision scope: Contract only; no exporter, importer, browser ZIP reader, or 3D behavior

## Context

Manual Trace must group multiple orthographic traces of one physical object and transfer them, together with calibration, coordinate systems, semantic geometry, source images, SVG, checksums, and provenance, to Tonearm Profile Designer without silent field or file loss.

## Decision

Use a ZIP-based container with the extension `.engrove-trace-project`. The root contains `manifest.json` and `project.json`; trace documents and assets are separate entries. `manifest.json` enumerates every other payload entry with path, media type, role, SHA-256, and byte size. The manifest intentionally does not hash itself because a stable self-digest is recursive.

Readers must validate container paths and inventory before applying JSON or rendering SVG. The v1 contract is single-object. Every trace references the shared object ID and explicitly maps its image plane to the project engineering frame.

## Consequences

Positive:

- one portable user-facing file keeps all views together;
- raster, SVG, JSON, and future text sidecars remain separate and deduplicable;
- each payload file can be integrity-checked before geometry use;
- browser implementations can read the format offline with a ZIP library;
- schemas and assets can evolve under explicit semantic versions;
- Tonearm Profile Designer can reject malformed or unsupported packages before 3D construction;
- provenance can be preserved independently from geometry-driving fields.

Costs and constraints:

- a browser ZIP implementation and strict decompression limits are required in a later slice;
- manifest and project reference integrity must be checked in addition to JSON Schema;
- SVG remains untrusted even after digest verification;
- deterministic generation requires canonical entry ordering, stable JSON serialization, stable timestamps supplied by the producer, and deterministic ZIP metadata;
- unknown major versions fail closed and require an explicit adapter.

## Security boundaries for future implementation

- reject absolute paths, backslashes, URL paths, empty segments, `.` and `..` segments, duplicate normalized paths, undeclared entries, and executable media;
- enforce compressed and uncompressed size/count limits before extraction;
- do not write package entries to arbitrary filesystem paths in browser or server contexts;
- sanitize SVG before DOM use; integrity does not imply safety;
- do not fetch missing assets from network URLs;
- validate all JSON before applying it to editor or 3D state.

## Rejected alternatives

### One large JSON document with base64 assets

Rejected because it inflates files, duplicates large payloads, makes selective integrity checking difficult, increases memory pressure, and encourages raw `dataUrl` editor state to become the interchange contract.

### Multiple loose files selected together

Rejected because browsers cannot reliably preserve user selection grouping, files can be omitted or mismatched, and portability becomes an operator responsibility.

### Project name as the view join key

Rejected because names are mutable, non-unique, and unsuitable as referential identity. Stable `projectId`, `objectId`, `traceId`, and asset IDs are required.

### Infer view plane from file name

Rejected because file names are presentation metadata. `viewType`, projection, and `viewFrame` own geometry interpretation.

### Read Manual Trace editor state directly in Tonearm Profile Designer

Rejected because editor session state includes transient UI/history fields, couples two products tightly, prevents independent versioning, and risks silent use of fields not intended for geometry.
