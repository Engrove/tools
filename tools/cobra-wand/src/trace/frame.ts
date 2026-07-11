/**
 * Trace-frame (port av v14): engineering axes med konfliktlösning, origo,
 * stationer relativa origo+spacing, mät-/skalsubsystemet, snap-varianterna.
 */
import {
  clone, ensureFrameMeta, ensureScale, newId, pushHist, type MeasureShape,
  type StationShape, type TracePoint, type TraceShape, type TraceState,
} from "./model.js";
import { contactPoints, dist, imgH, imgW, measureLen } from "./geometry.js";

export const AXIS_OPTIONS: [string, string][] = [
  ["+image_x", "→ image right"], ["-image_x", "← image left"],
  ["+image_y", "↓ image down"], ["-image_y", "↑ image up"],
  ["+out_of_screen", "⊙ screen out"], ["-into_screen", "⊗ screen in"],
];

export function axisBase(v: string): "image_x" | "image_y" | "screen_z" {
  const s = String(v || "");
  if (s.includes("image_x")) return "image_x";
  if (s.includes("image_y")) return "image_y";
  return "screen_z";
}

export function axisSign(v: string): 1 | -1 {
  return String(v || "").startsWith("-") ? -1 : 1;
}

export function axisVec2(v: string): TracePoint | null {
  const b = axisBase(v), sg = axisSign(v);
  if (b === "image_x") return { x: sg, y: 0 };
  if (b === "image_y") return { x: 0, y: sg };
  return null;
}

export function axisLabel(k: string, v: string): string {
  const lab = AXIS_OPTIONS.find((o) => o[0] === v)?.[1] || v;
  return k.toUpperCase() + " " + lab;
}

/** Konfliktlösning: ändrad axel vinner; kolliderande axel flyttas till ledig bas. */
export function enforceAxes(S: TraceState, changed?: "x" | "y" | "z"): void {
  S.frame.axes = S.frame.axes || { x: "+image_x", y: "+image_y", z: "+out_of_screen" };
  const keys: ("x" | "y" | "z")[] = ["x", "y", "z"];
  const defaults: Record<string, string> = {
    image_x: "+image_x", image_y: "+image_y", screen_z: "+out_of_screen",
  };
  const used: Record<string, string> = {};
  for (const k of keys) {
    let b = axisBase(S.frame.axes[k]);
    if (Object.values(used).includes(b) && k !== changed) {
      const free = ["image_x", "image_y", "screen_z"].find(
        (bb) => !Object.values(used).includes(bb) &&
          (!changed || bb !== axisBase(S.frame.axes[changed])),
      );
      S.frame.axes[k] = defaults[free || "screen_z"];
      b = axisBase(S.frame.axes[k]);
    }
    used[k] = b;
  }
  if (changed) {
    const cb = axisBase(S.frame.axes[changed]);
    for (const k of keys) {
      if (k !== changed && axisBase(S.frame.axes[k]) === cb) {
        const usedBases = keys.filter((q) => q !== k).map((q) => axisBase(S.frame.axes[q]));
        const free = ["image_x", "image_y", "screen_z"].find((bb) => !usedBases.includes(bb as never));
        S.frame.axes[k] = defaults[free || "screen_z"];
      }
    }
  }
}

export function stationOrientation(S: TraceState): "vertical" | "horizontal" {
  const v = axisVec2(S.frame.axes.x);
  if (v && Math.abs(v.y) > Math.abs(v.x)) return "horizontal";
  return "vertical";
}

export function stationCoordFromPoint(p: TracePoint, ori: "vertical" | "horizontal"): number {
  return ori === "horizontal" ? p.y : p.x;
}

export function stationOriginCoord(S: TraceState, ori: "vertical" | "horizontal"): number {
  const o = S.frame.origin || { x: 0, y: 0 };
  return ori === "horizontal" ? o.y : o.x;
}

export function stationLineEnds(
  S: TraceState, coord: number, ori: "vertical" | "horizontal",
): { x1?: number; y1?: number; x2?: number; y2?: number } {
  const w = imgW(S), h = imgH(S);
  return ori === "horizontal" ? { x1: 0, y1: coord, x2: w, y2: coord } : { x1: coord, y1: 0, x2: coord, y2: h };
}

export function updateStationPositionsFromOrigin(S: TraceState): void {
  const spacing = S.frame.station_spacing_px, o = S.frame.origin;
  if (!o || !spacing) return;
  for (const s of S.shapes) {
    if (s.type !== "station" || !Number.isFinite(s.station_index)) continue;
    const ori = s.orientation || stationOrientation(S);
    const coord = (ori === "horizontal" ? o.y : o.x) + s.station_index * spacing;
    s.orientation = ori;
    if (ori === "horizontal") { s.y = coord; s.x1 = 0; s.x2 = imgW(S); }
    else { s.x = coord; s.y1 = 0; s.y2 = imgH(S); }
    s.origin_ref = clone(o);
    s.spacing_px = spacing;
  }
}

export function setOrigin(S: TraceState, p: TracePoint): void {
  pushHist(S);
  ensureFrameMeta(S);
  S.frame.origin = { x: p.x, y: p.y };
  S.frame.origin_metadata.id = "trace_frame.origin";
  S.frame.origin_metadata.name = S.frame.origin_metadata.name || "origin";
  S.frame.origin_metadata.role = "datum";
  S.sel = "trace_frame.origin";
}

export function moveOriginTo(S: TraceState, p: TracePoint, orig: TracePoint | null, start: TracePoint): void {
  if (!orig) return;
  S.frame.origin = { x: orig.x + (p.x - start.x), y: orig.y + (p.y - start.y) };
  updateStationPositionsFromOrigin(S);
}

export function originHit(S: TraceState, p: TracePoint): boolean {
  return !!S.frame.origin && dist(p, S.frame.origin) < 20 / S.view.s;
}

export function stationName(idx: number): string {
  return idx === 0 ? "station_0_origin" : `station_${idx > 0 ? "+" : ""}${idx}`;
}

export function addStationAt(
  S: TraceState, p: TracePoint,
  opt: { orientation?: "vertical" | "horizontal"; coord?: number; index?: number } = {},
): StationShape {
  const spacing = S.frame.station_spacing_px || null;
  const ori = opt.orientation || stationOrientation(S);
  const coord = Number.isFinite(opt.coord) ? (opt.coord as number) : stationCoordFromPoint(p, ori);
  // Q7 (bevarat källbeteende): utan spacing blir index sekventiellt.
  const idx = Number.isFinite(opt.index)
    ? (opt.index as number)
    : spacing
      ? Math.round((coord - stationOriginCoord(S, ori)) / spacing)
      : S.shapes.filter((s) => s.type === "station").length;
  const ends = stationLineEnds(S, coord, ori);
  const st: StationShape = {
    id: newId("station"), type: "station", name: stationName(idx), role: "station",
    station_index: idx, orientation: ori,
    origin_ref: S.frame.origin ? clone(S.frame.origin) : null, spacing_px: spacing,
    style: { stroke: "#5d7cff", width: 0.9 }, ...ends,
  };
  if (ori === "horizontal") st.y = coord; else st.x = coord;
  pushHist(S);
  S.shapes.push(st);
  S.sel = st.id;
  return st;
}

/** Bulk-stationer (Add stations): −count..+count, station 0 origin-röd. */
export function addStationGrid(
  S: TraceState, spacing: number, count: number, removeExisting: boolean,
): void {
  if (!S.img) return;
  if (!S.frame.origin) S.frame.origin = { x: S.img.width / 2, y: S.img.height / 2 };
  const o = S.frame.origin;
  pushHist(S);
  S.frame.station_spacing_px = spacing;
  const ori = stationOrientation(S);
  if (removeExisting) S.shapes = S.shapes.filter((s) => s.type !== "station" && s.role !== "station_grid");
  for (let i = -count; i <= count; i++) {
    const coord = stationOriginCoord(S, ori) + i * spacing;
    const ends = stationLineEnds(S, coord, ori);
    S.shapes.push({
      id: newId("station"), type: "station", name: stationName(i), role: "station",
      station_index: i, orientation: ori, origin_ref: clone(o), spacing_px: spacing,
      style: { stroke: i === 0 ? "#ff4d6d" : "#5d7cff", width: i === 0 ? 1.3 : 0.9 },
      ...ends, ...(ori === "horizontal" ? { y: coord } : { x: coord }),
    } as StationShape);
  }
}

// ---------------------------------------------------------------- mät/skala

/** Räknar om alla mått mot skalfreferensen (körs i varje export). */
export function updateMeasurements(S: TraceState): void {
  const sc = ensureScale(S);
  const ref = (S.shapes.find((s) => s.type === "measure" && (s as MeasureShape).is_scale_reference) ||
    (sc.reference_measure_id ? S.shapes.find((s) => s.id === sc.reference_measure_id) : null)) as
    MeasureShape | undefined | null;
  if (ref && ref.real_length && ref.real_length > 0) {
    const px = measureLen(ref);
    ref.length_px = px;
    ref.unit = ref.unit || sc.unit || "mm";
    sc.reference_measure_id = ref.id;
    sc.unit = ref.unit;
    sc.source_length_px = px;
    sc.source_real_length = ref.real_length;
    sc.px_per_unit = px / ref.real_length;
    sc.unit_per_px = ref.real_length / px;
  }
  for (const m of S.shapes) {
    if (m.type !== "measure") continue;
    const px = measureLen(m);
    m.length_px = px;
    if (sc.px_per_unit && sc.px_per_unit > 0) {
      if (!m.is_scale_reference) {
        m.unit = sc.unit || m.unit || "mm";
        m.computed_real_length = px / sc.px_per_unit;
        m.real_length = m.computed_real_length;
      }
      m.scale_reference_id = sc.reference_measure_id || null;
    }
  }
}

/**
 * Finalisering vid commit. `askScale` abstraherar prompt-dialogen (UI injicerar
 * riktiga prompts; tester injicerar deterministiska svar).
 */
export function finalizeMeasure(
  S: TraceState, m: MeasureShape,
  askScale: () => { real: number | null; unit: string },
): MeasureShape {
  const sc = ensureScale(S);
  const px = measureLen(m);
  m.length_px = px;
  m.role = "measurement";
  if (!sc.px_per_unit) {
    const ans = askScale();
    if (ans.real && ans.real > 0) {
      m.real_length = ans.real;
      m.unit = ans.unit || "mm";
      m.is_scale_reference = true;
      sc.reference_measure_id = m.id;
      sc.unit = m.unit;
      sc.source_length_px = px;
      sc.source_real_length = ans.real;
      sc.px_per_unit = px / ans.real;
      sc.unit_per_px = ans.real / px;
    } else {
      m.unit = sc.unit || "mm";
      m.real_length = null;
      m.is_scale_reference = false;
      m.note = "No scale reference entered; edit JSON or add a new reference measure.";
    }
  } else {
    m.unit = sc.unit || "mm";
    m.is_scale_reference = false;
    m.scale_reference_id = sc.reference_measure_id || null;
    m.real_length = px / sc.px_per_unit;
    m.computed_real_length = m.real_length;
  }
  updateMeasurements(S);
  return m;
}

// ---------------------------------------------------------------- snap

export function snapPoint(
  S: TraceState, p: TracePoint, opt: { off?: boolean; includeCurrent?: boolean } = {},
): TracePoint {
  S.snapHit = null;
  if (!S.snap || opt.off) return p;
  let best: TracePoint | null = null, bd = 1e9;
  const thr = (S.snapPx || 14) / S.view.s;
  const scan = (s: TraceShape | null): void => {
    for (const q of contactPoints(S, s)) {
      const dd = dist(p, q);
      if (dd < bd) { bd = dd; best = q; }
    }
  };
  if (S.frame.origin) {
    const dd = dist(p, S.frame.origin);
    if (dd < bd) { bd = dd; best = S.frame.origin; }
  }
  S.shapes.forEach(scan);
  if (opt.includeCurrent && S.cur) scan(S.cur);
  if (best && bd <= thr) {
    S.snapHit = { x: (best as TracePoint).x, y: (best as TracePoint).y, dist: bd };
    return { x: (best as TracePoint).x, y: (best as TracePoint).y };
  }
  return p;
}

/** Måttsnap: separat toggle; ignorerar measure-objekt. */
export function measureSnapPoint(S: TraceState, p: TracePoint, altKey = false): TracePoint {
  S.snapHit = null;
  if (altKey) return p;
  if (!S.measureSnap) return p;
  let best: TracePoint | null = null, bd = 1e9;
  const thr = (S.snapPx || 14) / S.view.s;
  const scan = (s: TraceShape | null): void => {
    if (!s || s.type === "measure") return;
    for (const q of contactPoints(S, s)) {
      const dd = dist(p, q);
      if (dd < bd) { bd = dd; best = q; }
    }
  };
  if (S.frame.origin) {
    const dd = dist(p, S.frame.origin);
    if (dd < bd) { bd = dd; best = S.frame.origin; }
  }
  S.shapes.forEach(scan);
  if (S.cur) scan(S.cur);
  if (best && bd <= thr) {
    S.snapHit = { x: (best as TracePoint).x, y: (best as TracePoint).y, dist: bd };
    return { x: (best as TracePoint).x, y: (best as TracePoint).y };
  }
  return p;
}

/** 1D-snap längs stationens led mot origo/stationer/kontaktpunkter. */
export function snapStationCoord(
  S: TraceState, p: TracePoint, ori: "vertical" | "horizontal", excludeId: string | null = null,
): number {
  if (!S.snap) return stationCoordFromPoint(p, ori);
  const raw = stationCoordFromPoint(p, ori);
  let best: number | null = null, bd = 1e9;
  const thr = (S.snapPx || 14) / S.view.s;
  if (S.frame.origin) {
    const oc = ori === "horizontal" ? S.frame.origin.y : S.frame.origin.x;
    const dd = Math.abs(raw - oc);
    if (dd < bd) { bd = dd; best = oc; }
  }
  for (const s of S.shapes) {
    if (s.id === excludeId) continue;
    if (s.type === "station") {
      const sc = (s.orientation || "vertical") === "horizontal" ? (s.y ?? s.y1 ?? 0) : (s.x ?? 0);
      const dd = Math.abs(raw - sc);
      if (dd < bd) { bd = dd; best = sc; }
    }
    for (const q of contactPoints(S, s)) {
      const qc = ori === "horizontal" ? q.y : q.x;
      const dd = Math.abs(raw - qc);
      if (dd < bd) { bd = dd; best = qc; }
    }
  }
  if (best !== null && bd <= thr) {
    S.snapHit = ori === "horizontal" ? { x: p.x, y: best, dist: bd } : { x: best, y: p.y, dist: bd };
    return best;
  }
  return raw;
}
