# Engrove Trace to Plug

Turns a calibrated Engrove Manual Trace package into a printable **casting pattern** — a "plug" — and checks
that the pattern will actually come out of the two-part mould you intend to take off it.

The workflow is five linear steps and nothing else:

1. **Import** a `.engrove-trace-project` package containing a calibrated top view and side view.
2. **Interpret** the two silhouettes as a solid, choosing the one thing they cannot tell you: section fullness.
3. **Compensate** by scaling every cross-section for shrinkage and finish, with the traced length untouched.
4. **Verify** that the pattern releases along a chosen pull axis, and split it if your printer is too short.
5. **Export** the STL you will print, plus a record sheet of every decision that shaped it.

## Relationship to Tonearm Profile Designer

This tool builds patterns from traced views only. It has no parametric tonearm architecture, no cartridge
picker, no solver and no session format — those belong to
[Tonearm Profile Designer](../tonearm-profile-designer/), which remains the tool for that work and is
unaffected by this one.

What the two share is the geometry kernel. Tonearm Profile Designer **owns** these modules; this tool's build
copies them verbatim into `dist/js/kernel/` and never forks them, so a correctness fix there cannot silently
diverge from what ships here:

```
math.js  freeform-centerline.js  freeform-rings.js  freeform-features.js  freeform-schema.js
freeform-loft-kernel.js  freeform-analysis-adapter.js  freeform-section-properties.js
freeform-resonance-analysis.js  freeform-geometry-audit.js  freeform-physical-analysis.js
freeform-plug-mould-audit.js  freeform-pattern-split.js  manual-trace-3d-adapter.js
trace-project-package-{reader,semantics,validator,adapter}.js
```

Editing any of those files means editing them in `tools/tonearm-profile-designer/js/` and running that tool's
test suite as well as this one.

## This tool's own modules

| Module | Responsibility |
| --- | --- |
| `js/pattern-state.js` | The workflow state and every operator decision, and the derived pattern geometry. |
| `js/pattern-mesh.js` | Renderer-independent mesh measurement, the export gate, and both STL writers. |
| `js/pattern-record.js` | The Markdown record sheet that ships beside an exported STL. |
| `js/pattern-ai.js` | The AI prompt and the fail-closed validator for a pasted response. |
| `js/pattern-viewer.js` | The Three.js preview, the pull arrow, the parting line and the undercut markers. |
| `js/pattern-workflow.js` | Binds the DOM to all of the above and invalidates what a changed decision affects. |

## The AI handoff

There is no API call and no key. The tool builds a prompt describing the current pattern, you run it wherever
you like, and you paste the answer back. The answer is validated against
`engrove-trace-to-plug-ai-response-v1` before it may change anything:

- Only the ten decision fields listed inside the prompt may be proposed.
- Each is range- and type-checked.
- Any violation refuses the **whole** response by name and applies nothing. A partially applied suggestion is
  how an operator ends up printing a shape they did not agree to.

The prompt carries the pattern's measurements and decisions, never the trace geometry, and nothing is
transmitted by the application.

## What this tool does not establish

- Two orthographic silhouettes fix each section's width and height, not its corner fullness. Section fullness
  is an operator assumption that changes the pattern volume, and it is recorded with every export.
- The release check is a ray-sampled geometric test on the exported mesh at the exported tessellation. It is
  not a mould-flow, tooling or process simulation.
- A closed mesh and a release verdict do not establish that the mould will produce an acceptable part.
- Dimensional truth is inherited from the trace calibration; this tool cannot detect a mis-scaled source.

## Development

```sh
npm run build   # writes dist/, including the kernel, vendor and contract schemas
npm test        # pattern pipeline, mesh and record regressions, then the Chromium workflow smoke
```

The browser smoke drives the built `dist/` runtime through the same entry points the controls call, so a
control wired to nothing fails the suite rather than passing it silently.
