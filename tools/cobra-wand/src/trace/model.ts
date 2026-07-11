/**
 * Engrove Manual Trace — datamodell (port av v14, se docs/TRACE_TOOL_FUNKTIONSANALYS.md).
 * Ren modul: inga DOM-beroenden. Semantik 1:1 mot källan; avvikelser endast enligt
 * analysens §18 (Q2/Q3-städning, Q10 persistent zonfärgsindex).
 */

export type TraceTool =
  | "select" | "pan" | "origin" | "station" | "measure" | "line"
  | "pen" | "poly" | "zone" | "rect" | "circle" | "mask"
  /** v18: SVG-kandidatval */ | "tracepick"
  /** v18: infoga nod i poly/path */ | "nodeadd"
  /** v18: ta bort nod ur poly/path */ | "nodedelete";

export interface TracePoint { x: number; y: number }

export interface PathNode {
  x: number; y: number;
  in: TracePoint | null;
  out: TracePoint | null;
  auto: boolean;
  mode: "smooth" | "corner" | "manual";
}

export interface ShapeStyle {
  stroke?: string; fill?: string;
  fill_alpha?: number; stroke_alpha?: number; width?: number;
}

export interface TraceReference {
  relation: string; target: string; note: string;
  created_at: string; source: string;
}

export interface ShapeSemantic {
  standard_name?: string; display_name?: string;
  feature_kind?: string; ai_hint?: string;
}

interface ShapeBase {
  id: string; name?: string; role?: string; description?: string;
  semantic?: ShapeSemantic; references?: TraceReference[];
  style?: ShapeStyle; created_at?: string;
  svg_binding?: Record<string, unknown>;
  geometry_summary?: Record<string, unknown>;
  note?: string;
}

export interface LineShape extends ShapeBase { type: "line"; points: TracePoint[] }
export interface MeasureShape extends ShapeBase {
  type: "measure"; points: TracePoint[];
  length_px?: number; real_length?: number | null; computed_real_length?: number;
  unit?: string; is_scale_reference?: boolean; scale_reference_id?: string | null;
}
export interface PathShape extends ShapeBase {
  type: "path"; nodes: PathNode[]; closed: boolean; sampled_polyline_64?: TracePoint[];
}
export interface PolyShape extends ShapeBase { type: "poly"; points: TracePoint[]; closed: boolean }
export interface ZoneShape extends ShapeBase { type: "zone"; points: TracePoint[]; closed: boolean }
export interface MaskShape extends ShapeBase { type: "mask"; points: TracePoint[]; closed?: boolean }
export interface StationShape extends ShapeBase {
  type: "station"; orientation: "vertical" | "horizontal";
  station_index: number; origin_ref: TracePoint | null; spacing_px: number | null;
  x?: number; y?: number; x1?: number; x2?: number; y1?: number; y2?: number;
}
export interface RectShape extends ShapeBase { type: "rect"; x: number; y: number; w: number; h: number }
export interface CircleShape extends ShapeBase { type: "circle"; cx: number; cy: number; r: number }

export type TraceShape =
  | LineShape | MeasureShape | PathShape | PolyShape | ZoneShape
  | MaskShape | StationShape | RectShape | CircleShape;

export interface TraceScale {
  reference_measure_id: string | null; unit: string;
  px_per_unit: number | null; unit_per_px: number | null;
  source_length_px: number | null; source_real_length: number | null;
}

export interface TraceFrame {
  origin: TracePoint | null;
  origin_metadata: {
    id: "trace_frame.origin"; name: string; role: string; kind: string;
    location_role: string; description: string; references: TraceReference[];
  };
  axes: { x: string; y: string; z: string };
  station_spacing_px: number | null;
  scale: TraceScale;
}

export interface TraceImage {
  name: string; width: number; height: number; dataUrl: string;
}

// ---------------------------------------------------------------- v18: SVG auto-trace

export type SvgCandidateStatus = "include" | "ignore";
export type SvgOutputType = "poly" | "path";
export type SvgDetectMode = "filled" | "stroked" | "all";

export interface SvgTraceSettings {
  mode: SvgDetectMode;
  output: SvgOutputType;
  sampleStep: number;
  simplifyTol: number;
  minArea: number;
}

export interface SvgCandidate {
  id: string;
  sourceIndex: number | null;
  elementId: string | null;
  label: string;
  tag: string;
  status: SvgCandidateStatus;
  tracedShapeId: string | null;
  closed: boolean;
  area: number;
  length: number;
  bbox: { x: number; y: number; w: number; h: number };
  fill: string;
  stroke: string;
  /** Samplade bildpixelkoordinater (töms vid JSON-only-sessioner). */
  points: TracePoint[];
  /** true = sourceText saknas; kräver re-detect. */
  unavailable?: boolean;
}

export interface SvgTraceState {
  sourceName: string | null;
  /** Rå SVG-text (behålls för re-detect; exporteras ej i JSON). */
  sourceText: string | null;
  candidates: SvgCandidate[];
  activeId: string | null;
  show: boolean;
  settings: SvgTraceSettings;
}

/** Rev C-tillägg: dokumentnivåmetadata för flertrace-arbetsflödet. */
export type TracePerspective =
  | "top_view" | "side_view_left" | "side_view_right" | "front_view"
  | "rear_view" | "bottom_view" | "section" | "detail" | "other";
export type TraceFunction =
  | "outer_contour_master" | "profile_guide" | "dimension_reference"
  | "zone_map" | "detail_study" | "other";

export interface TraceMeta {
  trace_name: string;
  perspective: TracePerspective;
  trace_function: TraceFunction;
  description: string;
}

/** v15: sessionsnivåmetadata för `.engrove-trace`-paketet. */
export interface TraceProjectMeta {
  name: string;
  created_at: string | null;
  updated_at: string | null;
}

export const TRACE_SCHEMA_VERSION = "engrove_manual_trace_v14";
export const ORIGIN_SEL = "trace_frame.origin";

/** Färgtabell (spec §38, källverifierad). */
export const TRACE_COLORS: Record<string, string> = {
  line: "#00e5d4", path: "#b7ff00", poly: "#ffd84d", rect: "#ff8b3d",
  circle: "#a78bfa", mask: "#ff4d6d", zone: "#00a8ff", station: "#5d7cff",
  measure: "#ff66cc", sel: "#fff", h: "#ffea00", in: "#ff8fab", out: "#7df9ff",
};

const ZONE_PALETTE = ["#00a8ff", "#ff9f1c", "#a78bfa", "#2ec4b6", "#ff4d6d",
  "#b7ff00", "#ffd84d", "#e76f51", "#4cc9f0", "#c77dff"];

export function zonePalette(i: number): string {
  return ZONE_PALETTE[Math.abs(i || 0) % ZONE_PALETTE.length];
}

export interface TraceState {
  schema_version: string;
  img: (TraceImage & { _im?: unknown }) | null;
  shapes: TraceShape[];
  sel: string | null;
  tool: TraceTool;
  cur: TraceShape | null;
  view: { s: number; x: number; y: number };
  hist: string[];
  fut: string[];
  space: boolean;
  grid: boolean;
  pts: boolean;
  snap: boolean;
  measureSnap: boolean;
  snapPx: number;
  snapHit: { x: number; y: number; dist: number } | null;
  anchor: TracePoint | null;
  frame: TraceFrame;
  /** Q10: persistent zonfärgsindex (överlever delete). */
  zoneColorSeq: number;
  meta: TraceMeta;
  /** v15: sessionsnivåmetadata (`.engrove-trace`). */
  project_meta: TraceProjectMeta;
  /** v18: SVG auto-trace-subsystemets tillstånd. */
  svgTrace: SvgTraceState;
}

const ORIGIN_DESC =
  "AI/CAD origin. Set location_role to stylus_tip, pivot, cartridge_proxy or another explicit datum.";

export function defaultFrame(axes?: TraceFrame["axes"]): TraceFrame {
  return {
    origin: null,
    origin_metadata: {
      id: "trace_frame.origin", name: "origin", role: "datum", kind: "origin",
      location_role: "unspecified", description: ORIGIN_DESC, references: [],
    },
    axes: axes ?? { x: "+image_x", y: "+image_y", z: "+out_of_screen" },
    station_spacing_px: null,
    scale: {
      reference_measure_id: null, unit: "mm", px_per_unit: null,
      unit_per_px: null, source_length_px: null, source_real_length: null,
    },
  };
}

export function defaultSvgTrace(): SvgTraceState {
  return {
    sourceName: null, sourceText: null, candidates: [], activeId: null, show: true,
    settings: { mode: "filled", output: "poly", sampleStep: 2.5, simplifyTol: 1.5, minArea: 4 },
  };
}

export function ensureSvgTrace(S: TraceState): SvgTraceState {
  S.svgTrace = S.svgTrace || defaultSvgTrace();
  S.svgTrace.candidates = Array.isArray(S.svgTrace.candidates) ? S.svgTrace.candidates : [];
  S.svgTrace.settings = { ...defaultSvgTrace().settings, ...(S.svgTrace.settings || {}) };
  if (S.svgTrace.show === undefined) S.svgTrace.show = true;
  return S.svgTrace;
}

export function createTraceState(meta?: Partial<TraceMeta>): TraceState {
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    img: null, shapes: [], sel: null, tool: "select", cur: null,
    view: { s: 1, x: 0, y: 0 },
    hist: [], fut: [], space: false,
    grid: true, pts: true, snap: true, measureSnap: true,
    snapPx: 14, snapHit: null, anchor: null,
    frame: defaultFrame(),
    zoneColorSeq: 0,
    meta: {
      trace_name: meta?.trace_name ?? "trace_001",
      perspective: meta?.perspective ?? "other",
      trace_function: meta?.trace_function ?? "other",
      description: meta?.description ?? "",
    },
    project_meta: { name: "", created_at: null, updated_at: null },
    svgTrace: defaultSvgTrace(),
  };
}

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export function newId(prefix: string): string {
  return (prefix || "s") + "_" + Math.random().toString(36).slice(2, 8) + "_" +
    Date.now().toString(36).slice(-4);
}

export function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export function typeBase(t: string): string {
  return ({ path: "bezier_path", poly: "polyline", line: "line", measure: "measure",
    station: "station", mask: "ignore_mask", rect: "rect", circle: "circle" } as
    Record<string, string>)[t] || t || "shape";
}

export function nextName(S: TraceState, t: string): string {
  const b = typeBase(t);
  let n = 1;
  for (const s of S.shapes) {
    const m = String(s.name || "").match(new RegExp("^" + b + "_(\\d+)$"));
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return b + "_" + pad3(n);
}

export function defaultKind(t: string): string {
  return ({ path: "outer_contour", poly: "outer_contour", line: "datum",
    measure: "measurement", station: "station", mask: "ignore_zone",
    zone: "semantic_zone", rect: "zone", circle: "zone" } as
    Record<string, string>)[t] || "unspecified";
}

export function defaultShapeDescription(s: TraceShape, i: number): string {
  const role = s.role || "trace";
  switch (s.type) {
    case "path": return `Manual Bezier/Pen trace object ${i}; editable JSON source for one smooth cubic Bezier contour. SVG renders it as a <path> in the overlay.`;
    case "poly": return `Manual polyline trace object ${i}; editable JSON points[] source. SVG renders it as a <polyline> or <polygon>.`;
    case "line": return `Manual straight line object ${i}; editable JSON points[0..1] source. SVG renders it as a path with M/L commands.`;
    case "measure": return `Measurement line ${i}; may define or use the scale reference. SVG renders it as a line with length metadata.`;
    case "station": return `Station line ${i}; defines a vertical station tied to trace_frame.origin and spacing. SVG renders it as a line.`;
    case "zone": return `Named semantic zone ${i}; closed translucent polygon with at least 3 points. It marks an area for downstream AI context and may overlap other zones. SVG renders it as a permanent transparent polygon overlay.`;
    case "mask": return `Ignore/mask polygon ${i}; marks non-target or occlusion regions. SVG renders it as a polyline/polygon.`;
    case "rect": return `Rectangle object ${i}; editable JSON x/y/w/h source. SVG renders it as a rect.`;
    case "circle": return `Circle object ${i}; editable JSON cx/cy/r source. SVG renders it as a circle.`;
    default: return `Manual ${role} object ${i}; SVG group id equals JSON shape id.`;
  }
}

export function ensureZoneStyle(S: TraceState, s: TraceShape, i = 0): TraceShape {
  if (!s || s.type !== "zone") return s;
  s.closed = true;
  s.role = s.role || "zone";
  s.style = s.style || {};
  if (!s.style.stroke) {
    // Q10: persistent färgsekvens i stället för shapes-index.
    s.style.stroke = zonePalette(S ? S.zoneColorSeq++ : i);
  }
  if (!s.style.fill) s.style.fill = s.style.stroke;
  if (s.style.fill_alpha === undefined) s.style.fill_alpha = 0.18;
  if (s.style.stroke_alpha === undefined) s.style.stroke_alpha = 0.95;
  if (!s.style.width) s.style.width = 1.4;
  return s;
}

const RAW_TYPE_NAMES = ["line", "measure", "bezier_path", "polyline", "station",
  "ignore_mask", "zone", "rect", "circle", "path", "poly", "mask"];

export function ensureShapeMeta(S: TraceState, s: TraceShape, i = 0): TraceShape {
  if (!s) return s;
  if (!s.name || RAW_TYPE_NAMES.includes(String(s.name))) s.name = nextName(S, s.type);
  if (!s.role) {
    s.role = s.type === "measure" ? "measurement"
      : s.type === "station" ? "station"
      : s.type === "mask" ? "ignore" : "trace";
  }
  if (!s.description) s.description = defaultShapeDescription(s, i);
  s.semantic = s.semantic || {};
  s.semantic.standard_name = s.semantic.standard_name || s.name;
  s.semantic.display_name = s.semantic.display_name || s.name;
  s.semantic.feature_kind = s.semantic.feature_kind || defaultKind(s.type);
  s.semantic.ai_hint = s.semantic.ai_hint ||
    "Use JSON coordinates as editable geometry source and SVG as visual overlay binding.";
  s.references = s.references || [];
  ensureZoneStyle(S, s, i);
  return s;
}

export function ensureFrameMeta(S: TraceState): void {
  S.frame = S.frame || defaultFrame();
  S.frame.origin_metadata = S.frame.origin_metadata || defaultFrame().origin_metadata;
  S.frame.origin_metadata.references = S.frame.origin_metadata.references || [];
}

export function ensureAllMeta(S: TraceState): void {
  ensureFrameMeta(S);
  S.shapes.forEach((s, i) => ensureShapeMeta(S, s, i));
}

export function ensureScale(S: TraceState): TraceScale {
  S.frame.scale = S.frame.scale || defaultFrame().scale;
  return S.frame.scale;
}

export function parseNum(v: unknown): number | null {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Historik: snapshot FÖRE mutation (max 80), rensar redo-stacken. */
export function pushHist(S: TraceState): void {
  S.hist.push(JSON.stringify({ shapes: S.shapes, sel: S.sel, anchor: S.anchor || null, frame: S.frame }));
  if (S.hist.length > 80) S.hist.shift();
  S.fut = [];
}

export function selectedShape(S: TraceState): TraceShape | undefined {
  return S.shapes.find((x) => x.id === S.sel);
}
