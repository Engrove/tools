# Engrove tonearm observation package v1

## Ownership and scope

`schema/engrove_tonearm_observation_package_v1.schema.json` is the canonical public Draft 2020-12 entry point. It is a thin repository-local aggregator that references the modular schemas under `schema/tonearm-observation-package-v1/`.

`schema/engrove_tonearm_observation_package_v1.validator.cjs` is the stable CommonJS facade for semantic validation. Domain logic is split under `schema/tonearm-observation-package-v1/validator/` and the facade preserves the public API:

```javascript
{
  schema,
  schemaId,
  version,
  enums,
  envelopeRoles,
  validateObservationPackage
}
```

The package is not the editable Engrove Manual Trace project format.

It does not replace `engrove_manual_trace_v16`, `.engrove-trace` persistence, tool working state, accepted manufacturing geometry, a valid loft, or an active Tonearm Profile Designer design.

## Schema modules

- `shared.schema.json` owns identifiers, controlled vocabularies, points, vectors, source references, and quantified primitives.
- `object.schema.json` owns object identity, configuration identity, assembly state, units, and components.
- `object-frame.schema.json` owns structural frame, origin, axes, and units.
- `camera.schema.json` owns intrinsics, distortion, camera transform, and rectification evidence.
- `view.schema.json` owns capture views, projection, calibration, dimension source, and component membership.
- `geometry.schema.json` owns geometry payloads, closure rules, point counts, completeness, and measurements.
- `relations.schema.json` owns landmarks, stations, features, constraints, and typed references.
- `observation.schema.json` owns observation records and envelope-related structural rules.
- `uncertainty.schema.json`, `provenance.schema.json`, and `decision.schema.json` own their named domains.
- `package.schema.json` owns only package composition and validation-state records.

All schema IDs and references are repository-local.

The test schema loader explicitly inventories and registers every file in Ajv 8 before compiling the root aggregator. Missing schemas, duplicate IDs, unresolved references, and unused schema modules are blocking test failures.

## Semantic validator modules

The validator facade delegates to a thin orchestrator.

Immutable vocabularies, validation context, primitive checks, object/frame/view/camera/geometry/observation/relations/provenance/decision validators, and cross-reference rules are separate modules.

The semantic validator:

- never mutates, defaults, repairs, or fabricates input;
- reports deterministic path-, code-, and message-sorted errors;
- validates finite, nonzero, separable, orthogonal, handedness-compatible object-frame axes;
- blocks eligible dimensional data when the frame is not verified right-handed;
- preserves explicit camera intrinsics, distortion, object-to-camera transform, and rectification evidence;
- forbids raw perspective as a direct dimensional source;
- enforces geometry point counts, dimensionality, and closure by geometry type;
- requires a physical station for section loops;
- enforces authoritative envelope role, component, view, visibility, and completeness rules;
- verifies identity domains, typed references, station backreferences, station view coverage, datum kinds, provenance links, and operator-agent type;
- treats operator decisions as package or observation-subset decisions only, not reconstruction or CAD acceptance.

## Test architecture

`tools/tonearm-profile-designer/test/observation-package-contract.test.cjs` is a thin deterministic runner.

Fixtures, assertions, schema loading, parity, frame, camera/view, geometry, references, decisions, determinism, and module-boundary tests are separate modules.

The module-boundary test blocks any contract module over 500 physical lines, over 16 000 UTF-8 bytes, or containing an artificial line over 240 characters. The generated dependency lockfile is outside this source-module rule.

## Non-goals

This contract infrastructure does not add Manual Trace export, Tonearm Profile Designer import UI, design-session activation, reconstruction, or loft generation.

It also does not add datum inference, station synthesis, centerline generation, rings, wall thickness, or manufacturing acceptance.
