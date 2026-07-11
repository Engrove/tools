/**
 * v15 sessions-/projektpaket (`.engrove-trace`).
 *
 * Port av v15-källans projektlager (safeFileBase, isProjectPackage,
 * projectPayload, applyProjectPackage, applyTraceObject). Paketet är en
 * SESSIONSförpackning kring EN trace-workspace: bild + shapes + pågående objekt
 * + selektion + verktyg + anchor + view + trace_frame + UI-settings + hela
 * undo/redo-historiken. Per-trace-geometrischemat är oförändrat
 * ("engrove_manual_trace_v14"); projektschemat är "engrove_trace_project_v1".
 *
 * Detta är trace-verktygets EGET sessionsformat och skiljer sig från
 * 3D-verktygets flertrace-projekt (engrove_trace3d_project_v1, se store.ts):
 * varje TraceDocument i storen kan brygga till/från exakt detta paket.
 */
import {
  clone, ensureAllMeta, type TraceProjectMeta, type TraceShape,
  type TraceState,
} from "./model.js";
import { updateMeasurements } from "./frame.js";

export const PROJECT_SCHEMA = "engrove_trace_project_v1";
export const PROJECT_PACKAGE_TYPE = "engrove_trace_project";
export const SOURCE_APP_VERSION = "15";

export interface ProjectPackage {
  package_type: typeof PROJECT_PACKAGE_TYPE;
  schema_version: typeof PROJECT_SCHEMA;
  source_app: { name: string; version: string; geometry_schema: string };
  project: TraceProjectMeta;
  saved_at: string;
  image: { name: string; width: number; height: number; dataUrl: string } | null;
  workspace: {
    shapes: TraceShape[];
    current_object: TraceShape | null;
    selected_id: string | null;
    tool: string;
    anchor: { x: number; y: number } | null;
    view: { s: number; x: number; y: number };
    trace_frame: TraceState["frame"];
    settings: { grid: boolean; points: boolean; snap: boolean; measure_snap: boolean; snap_px: number };
    history: string[];
    future: string[];
    /** v18: SVG auto-trace state. */
    svg_trace?: TraceState["svgTrace"] | null;
  };
}

/** Sanerar godtycklig sträng till säker filnamnsbas (NFKD, ordtecken, max 80). */
export function safeFileBase(s: string | null | undefined): string {
  return (
    String(s || "engrove_trace_project")
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "engrove_trace_project"
  );
}

export function isProjectPackage(o: unknown): o is ProjectPackage {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return r.package_type === PROJECT_PACKAGE_TYPE || r.schema_version === PROJECT_SCHEMA;
}

/** Bygger fullständigt sessionspaket ur aktuellt tillstånd. */
export function projectPayload(S: TraceState): ProjectPackage {
  ensureAllMeta(S);
  updateMeasurements(S);
  const now = new Date().toISOString();
  S.project_meta = S.project_meta || { name: "", created_at: null, updated_at: null };
  S.project_meta.created_at = S.project_meta.created_at || now;
  S.project_meta.updated_at = now;
  return {
    package_type: PROJECT_PACKAGE_TYPE,
    schema_version: PROJECT_SCHEMA,
    source_app: { name: "Engrove Manual Trace Tool", version: SOURCE_APP_VERSION, geometry_schema: S.schema_version },
    project: clone(S.project_meta),
    saved_at: now,
    image: S.img ? { name: S.img.name, width: S.img.width, height: S.img.height, dataUrl: S.img.dataUrl } : null,
    workspace: {
      shapes: clone(S.shapes),
      current_object: S.cur ? clone(S.cur) : null,
      selected_id: S.sel,
      tool: S.tool,
      anchor: S.anchor ? clone(S.anchor) : null,
      view: clone(S.view),
      trace_frame: clone(S.frame),
      settings: { grid: !!S.grid, points: !!S.pts, snap: !!S.snap, measure_snap: !!S.measureSnap, snap_px: S.snapPx },
      history: clone(S.hist),
      future: clone(S.fut),
      /** v18: SVG auto-trace state (sourceText bevaras för re-detect). */
      svg_trace: S.svgTrace ? {
        ...clone(S.svgTrace),
        // Behåll candidates men töm unavailable-märkning (points är fortfarande kvar)
      } : null,
    },
  };
}

export interface ProjectRestore {
  imageDataUrl: string | null;
  imageName: string | null;
  /** Vyn som ska återställas EFTER bildladdning (annars skriver fit() över den). */
  savedView: { s: number; x: number; y: number };
}

/**
 * Återställer hela sessionen ur ett paket (allt utom bilden, som hosten laddar
 * via imageDataUrl och därefter återställer savedView). Nollställer drag/space/
 * snapHit. Muterar S direkt; returnerar bild-/vydata för hostens bildladdning.
 */
export function applyProjectPackage(
  S: TraceState, o: unknown, fileName = "project.engrove-trace",
): ProjectRestore {
  if (!isProjectPackage(o)) throw new Error("Not an Engrove project package.");
  const pkg = o as ProjectPackage;
  const w = pkg.workspace || ({} as ProjectPackage["workspace"]);
  const settings = w.settings || ({} as ProjectPackage["workspace"]["settings"]);
  const savedView = clone(w.view || { s: 1, x: 0, y: 0 });
  S.schema_version = pkg.source_app?.geometry_schema || S.schema_version;
  S.project_meta = clone(
    pkg.project || { name: safeFileBase(fileName), created_at: pkg.saved_at || null, updated_at: pkg.saved_at || null },
  );
  S.shapes = Array.isArray(w.shapes) ? clone(w.shapes) : [];
  S.cur = w.current_object && typeof w.current_object === "object" ? clone(w.current_object) : null;
  S.sel = w.selected_id ?? null;
  S.tool = (typeof w.tool === "string" ? w.tool : "select") as TraceState["tool"];
  S.anchor = w.anchor ? clone(w.anchor) : null;
  S.view = savedView;
  S.frame = clone(w.trace_frame || (w as { frame?: TraceState["frame"] }).frame || S.frame);
  S.grid = settings.grid !== undefined ? !!settings.grid : true;
  S.pts = settings.points !== undefined ? !!settings.points : true;
  S.snap = settings.snap !== undefined ? !!settings.snap : true;
  S.measureSnap = settings.measure_snap !== undefined ? !!settings.measure_snap : true;
  S.snapPx = Number.isFinite(settings.snap_px) ? settings.snap_px : 14;
  S.hist = Array.isArray(w.history) ? clone(w.history) : [];
  S.fut = Array.isArray(w.future) ? clone(w.future) : [];
  S.space = false;
  S.snapHit = null;
  // v18: återställ SVG auto-trace state (svg_trace sparat i workspace)
  const svgT = (w as { svg_trace?: unknown }).svg_trace;
  if (svgT && typeof svgT === "object") {
    S.svgTrace = clone(svgT) as TraceState["svgTrace"];
  }
  ensureAllMeta(S);
  return {
    imageDataUrl: pkg.image?.dataUrl || null,
    imageName: pkg.image?.name || fileName,
    savedView,
  };
}

export interface TraceObjectResult {
  isProject: boolean;
  imageDataUrl: string | null;
  imageName: string | null;
  savedView: { s: number; x: number; y: number } | null;
}

/**
 * Öppnar en godtycklig JSON: projektpaket ⇒ full sessionsåterställning; annars
 * en vanlig trace-export (som gamla loadJ) med projektnamn ur filnamnet.
 */
export function applyTraceObject(
  S: TraceState, o: unknown, fileName = "trace.json",
): TraceObjectResult {
  if (isProjectPackage(o)) {
    const r = applyProjectPackage(S, o, fileName);
    return { isProject: true, imageDataUrl: r.imageDataUrl, imageName: r.imageName, savedView: r.savedView };
  }
  const obj = o as Record<string, unknown>;
  S.project_meta = { name: safeFileBase(fileName), created_at: null, updated_at: null };
  S.shapes = Array.isArray(obj.shapes) ? (obj.shapes as TraceShape[]) : [];
  S.cur = null;
  S.frame = (obj.trace_frame as TraceState["frame"]) || (obj.frame as TraceState["frame"]) || S.frame;
  S.sel = (obj.selectedId as string) || null;
  S.anchor = null;
  if (obj.trace_meta && typeof obj.trace_meta === "object") {
    S.meta = { ...S.meta, ...(obj.trace_meta as Partial<TraceState["meta"]>) };
  }
  ensureAllMeta(S);
  const image = obj.image as { dataUrl?: string; name?: string } | undefined;
  return {
    isProject: false,
    imageDataUrl: image?.dataUrl || null,
    imageName: image?.name || fileName,
    savedView: null,
  };
}
