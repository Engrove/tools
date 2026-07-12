# ADR-0001: ZIP-based Engrove Trace Project Package

- Status: Accepted for interchange contract v1
- Date: 2026-07-12
- Decision scope: Contract only; no exporter, importer, browser ZIP reader, production package handling, or 3D behavior

## Context

Manual Trace must transfer multiple orthographic traces of one physical object together with calibration, coordinate systems, semantic geometry, source assets, checksums, and provenance. A container alone is insufficient when inventories disagree, identities alias, stations depend on array order, bindings are contradictory, or the claimed engineering basis is geometrically invalid.

## Decision

Use a ZIP-based `.engrove-trace-project` container. The root contains `manifest.json` and `project.json`; traces and assets are separate entries. The manifest inventories every payload except itself with path, media type, semantic role, SHA-256, exact byte size, and role-specific identity. `manifest.json` never appears in `manifest.files[]` and is never processed as an ordinary payload entry.

The contract is exact and fail-closed:

- every trace path is exactly `traces/<traceId>.json` across the manifest, `project.traceFiles[]`, and package entry;
- trace inventory is bidirectional across manifest, project record, package entry, and trace document;
- source-image, source-SVG, and sidecar inventory is bidirectional across manifest, project asset, package entry, and trace associations;
- every project asset names at least one owning trace, and every named owner contains the matching reverse reference;
- an optional readme is a manifest-only informational payload, has no trace or asset identity, and is not a project asset;
- package-global and trace-local namespaces are explicit;
- references resolve to exactly one entity in their documented scope;
- view-frame origins resolve only to project engineering datums;
- station consistency is evaluated pairwise and independently of package order;
- section bindings use a strict method discriminator;
- the engineering basis is finite, orthonormal, non-degenerate, and right-handed when declared right-handed.

JSON Schema owns structural discrimination. The semantic validator owns uniqueness by property, reverse inventory joins, cross-file agreement, exact reference resolution, station consistency, and coordinate-frame arithmetic.

## Numerical decisions

Engineering-basis validation uses a fixed absolute tolerance of `1e-9` for norm, dot-product, determinant, and cross-product comparisons. This tolerance is independent of trace calibration.

For two occurrences of one station:

```text
pairToleranceMm = max(
  traceA.calibration.toleranceMm,
  traceB.calibration.toleranceMm,
  1e-9 mm
)
```

Every pair must agree. This prevents a non-transitive A-B-C chain from becoming valid through insertion order.

A station binding with `xMm` is checked against every station occurrence using the maximum of the binding tolerance, the occurrence's trace calibration tolerance, and `1e-9 mm`.

## Binding methods

Version 1 retains:

- `explicit_station`: requires `stationId`; optional `xMm` must agree with the complete station group.
- `explicit_x`: requires `xMm`; forbids `stationId`; no station lookup occurs.

`derived_station` is excluded from v1 because the existing model does not contain a dedicated derivation-provenance object. Keeping the enum without such provenance would leave ownership of the derived coordinate undefined.

## Consequences

Benefits:

- no manifest trace or asset can be ignored because the project omits it;
- no extra trace or asset package entry can be silently retained outside project inventory;
- no asset can survive as a detached project payload without a reciprocal trace association;
- readme behavior is explicit and identity-free;
- station verdicts are invariant under manifest, project, and station-array permutations;
- view placement cannot reference an unknown or trace-local origin datum;
- contradictory binding methods fail structurally and semantically;
- a project cannot claim a right-handed engineering frame while supplying a degenerate, non-orthogonal, non-unit, left-handed, or non-finite basis;
- the contract is deterministic enough to serve as the source specification for later exporter and importer work.

Costs and constraints:

- JSON Schema cannot express all reverse joins or numerical invariants, so semantic validation remains mandatory;
- all declarations must be retained until exact-one resolution is proven;
- producers must emit complete inventories and explicit binding ownership;
- a future `derived_station` design requires a contract revision and provenance schema;
- browser ZIP handling, decompression limits, SVG sanitization, runtime adapters, and 3D construction remain future work.

## Security boundaries for future implementation

Reject unsafe paths, duplicate normalized paths, undeclared entries, executable media, excessive archive sizes, orphaned inventory records, unresolved identities, ambiguous references, invalid coordinate frames, and contradictory bindings before any package data mutates product state. Integrity does not make SVG safe; sanitize it before DOM use. Do not fetch missing assets from network URLs.

## Rejected alternatives

### Forward-only inventory validation

Rejected because a project can omit a manifest or package entry and make valid data invisible to consumers. Both directions must be complete.

### Treat readme as an ordinary project asset

Rejected because readme content is informational, does not participate in trace geometry, and needs no package-global asset identity.

### First-occurrence or canonical-by-order station resolution

Rejected because the verdict changes when manifest, project, or station arrays are permuted. Pairwise consistency is order-independent.

### Transitive station tolerance

Rejected because A≈B and B≈C does not imply A≈C. Every pair must meet its own declared tolerance.

### Undefined `derived_station`

Rejected because an enum value without required derivation provenance permits contradictory ownership of `stationId` and `xMm`.

### Trust schema declarations of a right-handed frame

Rejected because constants such as `handedness: right` do not prove that supplied vectors are finite, unit, orthogonal, non-degenerate, or right-handed.

### First match or last write wins

Rejected because map overwrite, set deduplication, or array-order selection hides conflicting declarations.

### Infer view plane or identity from filenames

Rejected because paths are storage locators, not geometric or referential identity. Version 1 nevertheless derives each trace storage path deterministically from its declared `traceId`; it does not infer the identity from an arbitrary filename.

### Read Manual Trace editor state directly in Tonearm Profile Designer

Rejected because transient UI/history state couples products and risks geometry use of unintended fields.
