# Engrove Manual Trace v18

Desktop-focused browser application for converting reference images and supported SVG geometry into structured, editable engineering traces.

## Public routes

- Canonical information page: `https://tools.engroveaudio.com/tools/manual-trace/`
- Interactive application: `https://tools.engroveaudio.com/tools/manual-trace/app/`

The canonical page, hub card, sitemap entries, JSON-LD, AI-discovery files and tool documentation are generated from `tool.json`. Generated `dist/` files must not be edited or committed.

## Platform and processing model

- Supported product target: desktop-class PC browser with mouse or trackpad and a large canvas.
- Mobile-first and touch-only use are outside the supported target.
- The application is static and client-side.
- Images, SVG geometry, JSON and project packages are processed in the browser.
- Project persistence is explicit file download/open; there is no application backend or cloud project store.
- Production-host analytics are injected by the repository build and remain separate from application project data.

## Functional scope

### Import

- Raster images through file selection, drag-and-drop or clipboard paste.
- SVG files through the Auto Trace workflow.
- Existing trace JSON.
- Complete `.engrove-trace` project packages.

### SVG Auto Trace

The detector supports `path`, `polygon`, `polyline`, `rect`, `circle`, `ellipse` and `line` elements after sanitization. Candidates can be included, ignored, focused, traced individually or traced as a set. Output can be an editable polyline or a smoothed cubic Bezier path.

Imported SVG removes scripts, active foreign content, embedded images, `use`, external links, event attributes and every non-fragment `url(...)` reference. Local fragment references such as `url(#gradient)` may remain.

### Geometry and editing

- Bezier paths
- Polylines
- Straight lines
- Measurements and scale calibration
- Engineering origin and axes
- Horizontal or vertical stations
- Rectangles and circles
- Semantic zones
- Ignore masks
- Point, node and handle editing
- Add/delete node
- Smooth, simplify and reverse
- Undo and redo

### Semantic metadata

Every object receives a stable ID and default name. The operator can set name, role, feature kind, description and explicit relations such as `parallel_to`, `perpendicular_to`, `center_of`, `tangent_to`, `aligned_with`, `offset_from`, `origin_at` and `proxy_for`.

### Project persistence and export

- Resumable `.engrove-trace` project package
- Structured JSON export
- Paired SVG overlay export
- Clipboard JSON

JSON is the editable coordinate source. SVG is the visual rendering. The stable join contract is `shape.id` to the SVG group `id` and `data-json-id`.

## v18 integrity behavior

- Smooth preserves the original shape ID.
- Smooth preserves provenance, metadata, semantics and candidate association.
- Stale SVG candidate links are repaired only when a unique match exists.
- Station canonical coordinates and endpoints remain synchronized.
- `sampled_polyline_64` contains exactly 64 points.
- SVG `viewBox` is used as the source coordinate frame when present.
- Exports and project packages identify producer version 18.
- Auto Trace summaries survive JSON import; unavailable candidate geometry requires source-SVG redetection.
- Station export distinguishes horizontal and vertical orientation.

## Visual integration

The application loads the repository-wide `/styles.css` and maps the editor shell to the Engrove Tools palette while retaining a high-contrast engineering canvas. Tool and inspector widths are resizable, keyboard accessible and persisted in browser `localStorage`.

## Accuracy boundaries

The application records geometric intent and operator interpretation. Output is not automatically:

- CAD truth
- metrological truth
- manufacturing-toleranced geometry
- mechanically verified design data

Dimensionally meaningful use requires a controlled source, verified scale, explicit datum, reviewed station structure and operator-reviewed trace geometry. Smoothing and simplification are approximations.

## Validation contract

Before publishing changes:

```bash
npm run clean
npm run build
npm run check:seo
npm run check:determinism
npm run check:sanitation
```

Runtime changes also require a desktop Chromium smoke test through the built hub route. The smoke workflow must cover SVG import/detection, trace creation, stable-ID smoothing, provenance, exact 64-point export, origin, station, scale calibration, undo/redo, project save/open, panel persistence and rejected external SVG resource loading.

Repository-level `AGENTS.md`, `EIC.md`, `AI_CODING_DOCTRINE.md`, schemas and executable checks remain authoritative.
