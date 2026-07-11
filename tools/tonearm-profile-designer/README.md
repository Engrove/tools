# Engrove Tonearm Profile Designer 29.0.0

Desktop-only browser application for converting calibrated Engrove Manual Trace artifacts into an editable 3D tonearm loft while preserving the TD053F design, analysis and export surface.

## Runtime contract

- A new browser session is empty. No standard 3D object is active or rendered.
- Geometry becomes active only after the operator imports Manual Trace files, opens a saved session, creates a parametric design, or explicitly applies a Freeform preset/response.
- The application is static and browser-local. Imported files are not uploaded to an application backend.
- Reviewed Three.js 0.128.0 runtime sources are committed under `vendor/` with the upstream MIT license; the deployed app does not execute CDN scripts and deterministic parallel builds do not mutate shared dependency state.
- The application is designed for a desktop browser and deliberately has no mobile layout contract.

## Manual Trace input

Accepted input:

- `engrove_manual_trace.json`;
- `.engrove-trace` and `.engrove-project` project packages;
- paired `engrove_manual_trace.svg` exports containing `engrove_trace_json_binding` metadata.

The importer validates file size, schema identity, finite coordinates, scale, origin, unique engineering axes, supported geometry and point-count limits. JSON coordinates remain authoritative. SVG input is parsed as inert XML and only the Manual Trace metadata and supported geometry elements are read.

To create a loft, the import set must contain at least:

- one top plane (`X–Y`, engineering Z out of screen);
- one side plane (`X–Z`, engineering Y out of screen);
- a finite positive millimetre scale and an engineering origin in each view;
- at least one usable trace contour in each view.

Plane classification is derived from `trace_frame.axes`. The operator can override the classification in the import list when an older trace retained default axes. Manual Trace stations are reused when available; otherwise the converter samples a deterministic station grid over the common longitudinal extent.

At every station, the top trace supplies lateral center and width while the side trace supplies vertical center and height. The generated Freeform state uses those measured bounds, a superellipse section assumption, the existing centerline/ring loft kernel, and explicit import provenance. If dimensions exceed kernel limits, conversion is blocked rather than silently clamped.

## Preserved TD053F functionality

The port retains the original runtime modules for:

- Parametric Cobra/classic geometry and mechanical assemblies;
- Freeform Centerline/Ring Loft and accepted-active versus preview/quarantine state;
- 3D WebGL, 2D side/top views and camera controls;
- cartridge picker and cartridge/compliance models;
- mass, COM, inertia, effective mass, resonance and stiffness proxies;
- solver/optimization and preview workflow;
- AI Vibe 3D prompt/response handling and validation;
- LT mechanism prototype preview;
- sessions, technical Markdown reports, STL, Onshape JSON, AI Vibe JSON and 3D PNG exports.

The imported Manual Trace loft enters the same accepted-active Freeform state used by rendering, session persistence, reports and export. Silent fallback to parametric geometry remains blocked.

## Build and verification

From this directory:

```bash
npm ci --no-audit --no-fund
npm test
npm run build
```

From the repository root, the mandatory release gates are:

```bash
npm run clean
npm run build
npm run check:seo
npm run check:determinism
npm run check:sanitation
```

The upstream ZIP contains 70 Node acceptance harnesses. Three are classified `NOT_AVAILABLE` in this environment: two require the external Python `jsonschema` package and one references a session fixture omitted from the ZIP. They are retained in `tools/` for provenance. All remaining portable upstream harnesses plus port-specific empty-session and Manual Trace conversion regressions are run by `npm test`.

`npm ci` is intentionally dependency-free. The local Three.js vendor files are byte-verified against the reviewed `three@0.128.0` package during the port and are covered by the repository sanitation and asset-size gates.

## Claim boundary

Trace-derived geometry is deterministic from the accepted inputs, but it is not automatically metrology truth. Orthographic top and side silhouettes constrain width, height and centerline; the unmeasured cross-section surface between those constraints remains a modelling assumption. Analytical physics are proxies, STL is a mesh reference, and final manufacturing still requires calibrated source verification, CAD cleanup, tolerancing and independent engineering validation.

`UPSTREAM_TD053F_README.md` preserves the supplied full TD053F functional description. Large upstream modules are intentionally retained without mechanical splitting because the primary porting invariant is behavior preservation; their cohesion and size are documented legacy exceptions, not a template for new modules.
