# ADR-0001: ZIP-based Engrove Trace Project Package

- Status: Accepted for interchange contract v1
- Date: 2026-07-12
- Decision scope: Contract only; no exporter, importer, browser ZIP reader, or 3D behavior

## Context

Manual Trace must group multiple orthographic traces of one physical object and transfer calibration, coordinate systems, semantic geometry, source assets, checksums, and provenance without silent loss. A portable container is insufficient when identities can repeat, paths can alias documents, or references resolve by array order.

## Decision

Use a ZIP-based `.engrove-trace-project` container. `manifest.json` and `project.json` are at the root; trace documents and assets remain separate entries. The manifest enumerates every other payload with path, media type, role, SHA-256, byte size, and role-specific identity. The manifest does not hash itself because a stable self-digest is recursive.

Identity resolution is exact and fail-closed:

- project, object, trace, asset, project-datum, and project-reference identities are package-global;
- contour, trace-datum, and relation identities are local to one trace;
- trace-local strings never imply cross-trace linkage;
- a station is a physical package-level identity that may occur in multiple views only with consistent engineering axis, engineering position, usage, and geometric disposition;
- each trace and asset follows a complete manifest-project-entry-document or association chain;
- every reference resolves to exactly one entity in its documented scope;
- duplicate, unknown, or ambiguous identities block;
- array order, first-match selection, `Map` overwrite, and silent `Set` deduplication have no contract meaning.

JSON Schema owns structural requirements, including role-specific manifest identities. The semantic validator owns uniqueness by property, cross-file agreement, reference resolution, and station consistency.

## Consequences

Benefits:

- views and assets remain portable in one file;
- each payload can be integrity-checked before geometry use;
- schemas and assets evolve under explicit versions;
- provenance remains separate from geometry-driving data;
- trace, asset, datum, station, and local geometry joins are deterministic;
- conflicting station descriptions cannot be silently selected.

Costs and constraints:

- a browser ZIP implementation and decompression limits remain future work;
- validators retain all declarations until uniqueness is proven;
- SVG remains untrusted after digest verification;
- deterministic generation requires stable JSON, entry ordering, timestamps, and ZIP metadata;
- unknown major versions fail closed.

## Security boundaries for future implementation

Reject unsafe paths, duplicate normalized paths, undeclared entries, executable media, excessive archive sizes, unresolved identities, and ambiguous references before geometry is consumed. Do not fetch missing assets from network URLs. Sanitize SVG before DOM use.

## Rejected alternatives

### One JSON document with base64 assets

Rejected because it inflates files, increases memory pressure, complicates selective integrity checks, and promotes transient editor state into the interchange contract.

### Multiple loose files

Rejected because browsers cannot reliably preserve grouping and operators can omit or mismatch files.

### Names or paths as identity

Rejected because names are mutable and paths are storage locators. Stable IDs and an exact manifest/project/document chain are required.

### First match or last write wins

Rejected because overwrite or array-order resolution hides conflicting declarations and makes interpretation producer-order dependent.

### Package-global namespace for every geometry feature

Rejected because contours, trace datums, and relations are owned by a trace. Their strings may repeat in another trace, but bare references remain local.

### Infer stations from position alone

Rejected because approximate position cannot establish semantic identity. Shared station IDs explicitly claim one physical station and must pass consistency checks.

### Infer view plane from file name

Rejected because file names are presentation metadata. `viewType`, projection, and `viewFrame` own geometry interpretation.

### Read editor session state directly in Tonearm Profile Designer

Rejected because transient UI/history state couples products, prevents independent versioning, and risks geometry use of unintended fields.
