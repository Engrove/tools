/**
 * SVG Auto-Trace subsystem — Engrove Manual Trace Tool v18.
 *
 * Flöde: SVG → safeSvgText (sanering) → DOM-inject → detectSvgCandidates
 * (sampleSvgGeometry via getTotalLength/getPointAtLength) → kandidatlista →
 * traceSvgCandidates (RDP-simplifiering → poly/path-shape → commit).
 *
 * OBS: detectSvgCandidates kräver DOM och requestAnimationFrame och måste köras
 * i webbläsarmiljö. Modulen exporterar rena hjälpfunktioner (safeSvgText,
 * areaOfPoints, svgCoordinateFrame, importAutoTraceSummary, repairSvgTraceLinks)
 * som kan testas i node utan DOM.
 */
import {
  clone, ensureShapeMeta, ensureSvgTrace, newId, pushHist, TRACE_COLORS as C,
  type SvgCandidate, type SvgTraceState, type TraceState,
} from "./model.js";
import {
  autoSmoothPath, areaOfPoints, bboxOfPoints, dist, pointInPoly, polyDistance,
  simplifyPoints,
} from "./geometry.js";
import type { PathShape, PolyShape, TraceShape } from "./model.js";

// ---------------------------------------------------------------- SVG-sanering

export function svgNumber(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

/** Extraherar koordinatram (viewBox eller width/height) ur SVG-text. */
export function svgCoordinateFrame(txt: string): { width: number; height: number; viewBox: number[] } | null {
  const doc = new DOMParser().parseFromString(String(txt || ""), "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || !root || root.localName !== "svg") return null;
  const vb = String(root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    return { width: vb[2], height: vb[3], viewBox: vb };
  }
  const width = svgNumber(root.getAttribute("width"), NaN), height = svgNumber(root.getAttribute("height"), NaN);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height, viewBox: [0, 0, width, height] }
    : null;
}

/** Matchar url(...)-referenser i attributvärden (t.ex. fill, filter, mask, style). */
const URL_REF_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/** true om värdet innehåller minst en url()-referens som INTE är ett lokalt fragment (#id). */
function hasExternalUrlRef(value: string): boolean {
  URL_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_REF_RE.exec(value))) {
    if (!m[2].trim().startsWith("#")) return true;
  }
  return false;
}

/**
 * Sanerar SVG-text: tar bort script/foreignObject/use, event-attribut,
 * javascript:-href, samt attribut med externa url(...)-referenser (fill,
 * stroke, filter, mask, clip-path, markörer, style m.fl.) — endast lokala
 * fragmentreferenser (url(#id)) accepteras, eftersom saneringen matas rakt in
 * via host.innerHTML och en extern url() annars kan trigga nätverksanrop
 * (spårning/SSRF) eller — för filter/mask i vissa motorer — aktivt innehåll.
 * Returnerar ren XMLSerializer-sträng.
 */
export function safeSvgText(txt: string): string {
  const doc = new DOMParser().parseFromString(String(txt || ""), "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid SVG XML.");
  doc.querySelectorAll("script,foreignObject,iframe,object,embed,image,use,style").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((a) => {
      const n = a.name.toLowerCase(), raw = String(a.value || "").trim(), v = raw.toLowerCase();
      if (
        n.startsWith("on") ||
        n === "href" ||
        n.endsWith(":href") ||
        v.startsWith("javascript:") ||
        (v.includes("url(") && hasExternalUrlRef(raw))
      ) {
        el.removeAttribute(a.name);
      }
    });
  });
  const root = doc.documentElement;
  if (!root || root.localName !== "svg") throw new Error("File does not contain an SVG root.");
  return new XMLSerializer().serializeToString(root);
}

function svgVisiblePaint(el: Element): { fill: string; stroke: string; filled: boolean; stroked: boolean; opacity: number } {
  const cs = getComputedStyle(el);
  const op = svgNumber(cs.opacity, 1) * svgNumber(cs.fillOpacity, 1);
  const sop = svgNumber(cs.opacity, 1) * svgNumber(cs.strokeOpacity, 1);
  const fill = cs.fill || el.getAttribute("fill") || "black";
  const stroke = cs.stroke || el.getAttribute("stroke") || "none";
  return {
    fill, stroke,
    filled: fill !== "none" && fill !== "transparent" && op > 0.001,
    stroked: stroke !== "none" && stroke !== "transparent" && sop > 0.001,
    opacity: svgNumber(cs.opacity, 1),
  };
}

function svgShapeClosed(el: Element, pts: { x: number; y: number }[]): boolean {
  const tag = el.localName, dv = el.getAttribute("d") || "";
  return (
    ["polygon", "rect", "circle", "ellipse"].includes(tag) ||
    /[zZ]\s*$/.test(dv) ||
    (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 0.75)
  );
}

interface SvgSampleResult {
  points: { x: number; y: number }[];
  length: number;
}

function sampleSvgGeometry(el: SVGGeometryElement, step: number): SvgSampleResult {
  const pts: { x: number; y: number }[] = [];
  let len = 0;
  try { len = el.getTotalLength(); } catch (_) {}
  if (Number.isFinite(len) && len > 0 && typeof el.getPointAtLength === "function") {
    const n = Math.max(2, Math.min(12000, Math.ceil(len / Math.max(0.25, step))));
    const m = el.getCTM ? el.getCTM() : null;
    for (let i = 0; i <= n; i++) {
      const p = el.getPointAtLength(len * i / n);
      const q = m ? new DOMPoint(p.x, p.y).matrixTransform(m) : p;
      pts.push({ x: q.x, y: q.y });
    }
  } else if ((el as SVGPolygonElement).points?.numberOfItems) {
    const poly = el as SVGPolygonElement;
    const m = el.getCTM ? el.getCTM() : null;
    for (let i = 0; i < poly.points.numberOfItems; i++) {
      const p = poly.points.getItem(i);
      const q = m ? new DOMPoint(p.x, p.y).matrixTransform(m) : p;
      pts.push({ x: q.x, y: q.y });
    }
  }
  return { points: pts, length: len };
}

// ---------------------------------------------------------------- kandidatimport

export interface AutoTraceSummary {
  source_name?: string; sourceName?: string;
  settings?: Partial<SvgTraceState["settings"]>;
  candidates: Array<{
    id?: string; source_index?: number | null; element_id?: string | null; label?: string;
    tag?: string; status?: string; traced_shape_id?: string | null; tracedShapeId?: string | null;
    closed?: boolean; area_px2?: number; area?: number; length_px?: number; length?: number;
    bbox?: SvgCandidate["bbox"]; fill?: string; stroke?: string; points?: { x: number; y: number }[];
  }>;
}

export function importAutoTraceSummary(at: unknown): SvgTraceState {
  const st: SvgTraceState = {
    sourceName: null, sourceText: null, candidates: [], activeId: null, show: true,
    settings: { mode: "filled", output: "poly", sampleStep: 2.5, simplifyTol: 1.5, minArea: 4 },
  };
  if (!at || typeof at !== "object") return st;
  const a = at as AutoTraceSummary;
  st.sourceName = a.source_name || a.sourceName || null;
  st.settings = { ...st.settings, ...(a.settings || {}) };
  st.candidates = (Array.isArray(a.candidates) ? a.candidates : []).map((c) => ({
    id: c.id || newId("svgobj"),
    sourceIndex: c.source_index ?? null,
    elementId: c.element_id || null,
    label: c.label || c.element_id || "svg_object",
    tag: c.tag || "path",
    status: c.status === "ignore" ? "ignore" as const : "include" as const,
    tracedShapeId: c.traced_shape_id || c.tracedShapeId || null,
    closed: !!c.closed,
    area: Number(c.area_px2 ?? c.area) || 0,
    length: Number(c.length_px ?? c.length) || 0,
    bbox: c.bbox || { x: 0, y: 0, w: 0, h: 0 },
    fill: c.fill || "none",
    stroke: c.stroke || "none",
    points: Array.isArray(c.points) ? c.points : [],
    unavailable: !Array.isArray(c.points) || c.points.length < 2,
  }));
  st.activeId = st.candidates[0]?.id || null;
  return st;
}

export function repairSvgTraceLinks(S: TraceState): void {
  const st = ensureSvgTrace(S);
  const ids = new Set(S.shapes.map((s) => s.id));
  st.candidates.forEach((c) => {
    if (c.tracedShapeId && ids.has(c.tracedShapeId)) return;
    const matches = S.shapes.filter(
      (s) =>
        (s as { source_svg?: { candidate_id?: string } }).source_svg?.candidate_id === c.id ||
        (c.elementId && (s as { source_svg?: { element_id?: string } }).source_svg?.element_id === c.elementId) ||
        (c.label && (s.name === c.label || String(s.name || "").startsWith(c.label + "_") || s.semantic?.standard_name === c.label)),
    );
    c.tracedShapeId = matches.length === 1 ? matches[0].id : null;
  });
}

export function applyAutoTraceSummary(S: TraceState, at: unknown): void {
  const imported = importAutoTraceSummary(at);
  const current = ensureSvgTrace(S);
  if (current.sourceText && current.sourceName === imported.sourceName) {
    imported.sourceText = current.sourceText;
    imported.candidates = imported.candidates.map((c) => {
      const live = current.candidates.find((x) => x.id === c.id);
      return live ? { ...live, status: c.status, tracedShapeId: c.tracedShapeId || live.tracedShapeId, unavailable: false } : c;
    });
  }
  S.svgTrace = imported;
  repairSvgTraceLinks(S);
}

// ---------------------------------------------------------------- SVG-kandidatladdning (browser-only)

export function svgCandidateAt(S: TraceState, p: { x: number; y: number }): SvgCandidate | null {
  const cs = ensureSvgTrace(S).candidates.filter((c) => c.status !== "ignore");
  const inside = cs.filter((c) => c.closed && pointInPoly(p, c.points));
  if (inside.length) return inside.sort((a, b) => a.area - b.area)[0];
  let best: SvgCandidate | null = null, bd = Infinity;
  cs.forEach((c) => {
    const q = polyDistance(p, c.points, c.closed);
    if (q < bd) { bd = q; best = c; }
  });
  return bd < 14 / S.view.s ? best : null;
}

export function setSvgCandidateStatus(S: TraceState, c: SvgCandidate, status: SvgCandidate["status"]): void {
  c.status = status;
  ensureSvgTrace(S).activeId = c.id;
}

export function activeSvgCandidate(S: TraceState): SvgCandidate | null {
  const st = ensureSvgTrace(S);
  return st.candidates.find((c) => c.id === st.activeId) || null;
}

/** Detekterar kandidater ur SVG-text. Kräver browser-DOM.
 *  Asynkron pga DOM-inject + requestAnimationFrame (layout-pass). */
export async function detectSvgCandidates(
  S: TraceState, svgText: string, name: string,
): Promise<SvgCandidate[]> {
  const st = ensureSvgTrace(S);
  const clean = safeSvgText(svgText);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  host.innerHTML = clean;
  document.body.appendChild(host);
  const root = host.querySelector("svg") as SVGSVGElement;
  const w = S.img?.width || svgNumber(root.getAttribute("width"), 1000);
  const h = S.img?.height || svgNumber(root.getAttribute("height"), 700);
  root.setAttribute("width", String(w));
  root.setAttribute("height", String(h));
  root.style.overflow = "visible";
  await new Promise((r) => requestAnimationFrame(r));
  const cfg = st.settings;
  const els = [...root.querySelectorAll("path,polygon,polyline,rect,circle,ellipse,line")] as SVGGeometryElement[];
  const cands: SvgCandidate[] = [];
  els.forEach((el, i) => {
    const paint = svgVisiblePaint(el);
    if (paint.opacity <= 0.001) return;
    if (cfg.mode === "filled" && !paint.filled) return;
    if (cfg.mode === "stroked" && !paint.stroked) return;
    if (cfg.mode === "all" && !paint.filled && !paint.stroked) return;
    const sm = sampleSvgGeometry(el, cfg.sampleStep);
    const pts = sm.points;
    if (pts.length < 2) return;
    const closed = svgShapeClosed(el, pts);
    if (closed && dist(pts[0], pts[pts.length - 1]) < 0.75) pts.pop();
    const area = Math.abs(areaOfPoints(pts));
    if (closed && area < cfg.minArea) return;
    const label = el.getAttribute("id") || el.getAttribute("aria-label") || `${el.localName}_${String(i + 1).padStart(3, "0")}`;
    cands.push({
      id: newId("svgobj"),
      sourceIndex: i,
      elementId: el.getAttribute("id") || null,
      label, tag: el.localName,
      points: pts, closed, area,
      length: sm.length,
      bbox: bboxOfPoints(pts),
      fill: paint.fill, stroke: paint.stroke,
      status: "include", tracedShapeId: null,
    });
  });
  host.remove();
  cands.sort((a, b) => (b.area || b.length) - (a.area || a.length));
  st.sourceName = name || st.sourceName || "source.svg";
  st.sourceText = String(svgText || "");
  st.candidates = cands;
  st.activeId = cands[0]?.id || null;
  return cands;
}

// ---------------------------------------------------------------- shape-skapande ur kandidat

export function candidateShape(
  S: TraceState, c: SvgCandidate, index: number,
): TraceShape {
  const st = ensureSvgTrace(S);
  const cfg = st.settings;
  const pts = simplifyPoints(c.points, cfg.simplifyTol, c.closed);
  const base = {
    id: c.tracedShapeId || newId("svgtrace"),
    name: (c.elementId || c.label || `svg_surface_${String(index + 1).padStart(3, "0")}`).replace(/[^\w.-]+/g, "_"),
    role: "trace",
    closed: !!c.closed,
    description: `Auto-traced from SVG object ${c.label}. Correct with Select/Edit, Add Node or Delete Node.`,
    semantic: {
      standard_name: c.elementId || c.label,
      display_name: c.label,
      feature_kind: c.closed ? "outer_contour" : "other",
      ai_hint: "Direct vector trace from an SVG geometry object; operator may refine nodes.",
    },
    references: [{ relation: "derived_from", target: "image", note: `SVG ${st.sourceName || "source"}`, created_at: new Date().toISOString(), source: "svg_auto_trace" }],
    style: { stroke: C.path, width: 1.4 },
    source_svg: {
      candidate_id: c.id, source_name: st.sourceName,
      element_id: c.elementId, tag: c.tag, fill: c.fill, stroke: c.stroke,
      closed: c.closed, area_px2: c.area, length_px: c.length,
      sample_step_px: cfg.sampleStep, simplify_tolerance_px: cfg.simplifyTol,
    },
  };
  if (cfg.output === "path") {
    const pShape: PathShape = {
      ...base, type: "path",
      nodes: pts.map((p) => ({ x: p.x, y: p.y, in: { x: p.x, y: p.y }, out: { x: p.x, y: p.y }, auto: true, mode: "smooth" as const })),
    };
    autoSmoothPath(pShape, pShape.closed);
    return ensureShapeMeta(S, pShape, S.shapes.length);
  }
  const pShape: PolyShape = { ...base, type: "poly", points: pts, style: { stroke: C.poly, width: 1.4 } };
  return ensureShapeMeta(S, pShape, S.shapes.length);
}

export function traceSvgCandidates(S: TraceState, cands: SvgCandidate[]): void {
  const list = (cands || []).filter((c) => c && Array.isArray(c.points) && c.points.length >= 2);
  if (!list.length) {
    throw new Error("Source geometry is not available in this JSON-only session. Open / detect the source SVG again.");
  }
  pushHist(S);
  const st = ensureSvgTrace(S);
  const cfg = st.settings;
  list.forEach((c, i) => {
    const made = candidateShape(S, c, i);
    const ix = c.tracedShapeId ? S.shapes.findIndex((s) => s.id === c.tracedShapeId) : -1;
    if (ix >= 0) {
      const old = S.shapes[ix];
      made.id = old.id;
      made.name = old.name || made.name;
      made.description = old.description || made.description;
      made.references = old.references?.length ? old.references : made.references;
      made.semantic = old.semantic || made.semantic;
      (made as { source_svg?: unknown }).source_svg = {
        ...((made as { source_svg?: unknown }).source_svg || {}),
        ...((old as { source_svg?: unknown }).source_svg || {}),
      };
      S.shapes[ix] = made;
    } else {
      S.shapes.push(made);
      c.tracedShapeId = made.id;
    }
    c.status = "include";
    S.sel = made.id;
  });
  repairSvgTraceLinks(S);
}

// ---------------------------------------------------------------- smart node-editering

import { type PathShape as _PS, type PolyShape as _PlS } from "./model.js";
import { projOnSeg, cubicPointAt, mixPoint, shapeDist } from "./geometry.js";

function editableShapeAt(S: TraceState, p: { x: number; y: number }): TraceShape | null {
  const s = S.shapes.find((x) => x.id === S.sel);
  if (s && ["poly", "path"].includes(s.type)) return s;
  let best: TraceShape | null = null, bd = Infinity;
  S.shapes.filter((x) => ["poly", "path"].includes(x.type)).forEach((x) => {
    const q = shapeDist(S, x, p);
    if (q < bd) { bd = q; best = x; }
  });
  return bd < 20 / S.view.s ? best : null;
}

export function smartInsertNode(S: TraceState, p: { x: number; y: number }): void {
  const s = editableShapeAt(S, p);
  if (!s) return;
  pushHist(S);
  S.sel = s.id;
  if (s.type === "poly") {
    const ps = s.points, n = ps.length, lim = n - 1 + (s.closed ? 1 : 0);
    let best = { d: Infinity, i: 1, p: { x: 0, y: 0 } };
    for (let k = 0; k < lim; k++) {
      const j = (k + 1) % n, q = projOnSeg(p, ps[k], ps[j]);
      if (q.dist < best.d) best = { d: q.dist, i: j === 0 ? n : j, p: { x: q.x, y: q.y } };
    }
    ps.splice(best.i, 0, best.p);
  } else if (s.type === "path") {
    const ns = s.nodes, n = ns.length, lim = n - 1 + (s.closed ? 1 : 0);
    let best = { d: Infinity, seg: 0, t: 0.5 };
    for (let k = 0; k < lim; k++) {
      const a = ns[k], b = ns[(k + 1) % n], c1 = a.out || a, c2 = b.in || b;
      for (let q = 1; q <= 30; q++) {
        const t = q / 30, z = cubicPointAt(a, c1, c2, b, t);
        const dd = Math.hypot(p.x - z.x, p.y - z.y);
        if (dd < best.d) best = { d: dd, seg: k, t };
      }
    }
    const i = best.seg, j = (i + 1) % n;
    const a = ns[i], b = ns[j], p0 = { x: a.x, y: a.y };
    const p1 = a.out || p0, p2 = b.in || { x: b.x, y: b.y }, p3 = { x: b.x, y: b.y };
    const t = best.t;
    const A = mixPoint(p0, p1, t), B = mixPoint(p1, p2, t), Cn = mixPoint(p2, p3, t);
    const D = mixPoint(A, B, t), E = mixPoint(B, Cn, t), F = mixPoint(D, E, t);
    a.out = A; b.in = Cn;
    const nn = { x: F.x, y: F.y, in: D, out: E, auto: false, mode: "smooth" as const };
    if (j === 0) ns.push(nn); else ns.splice(j, 0, nn);
  }
}

export function smartDeleteNode(S: TraceState, p: { x: number; y: number }): void {
  const s = editableShapeAt(S, p);
  if (!s) return;
  const arr = s.type === "poly" ? s.points : s.type === "path" ? s.nodes : null;
  if (!arr) return;
  const min = ("closed" in s && s.closed) ? 3 : 2;
  if (arr.length <= min) return;
  let bi = -1, bd = Infinity;
  arr.forEach((n, i) => {
    const q = Math.hypot(p.x - n.x, p.y - n.y);
    if (q < bd) { bd = q; bi = i; }
  });
  if (bi < 0 || bd > 22 / S.view.s) return;
  pushHist(S);
  (arr as { x: number; y: number }[]).splice(bi, 1);
  S.sel = s.id;
  if (s.type === "path" && s.nodes.some((n) => n.auto !== false)) autoSmoothPath(s, s.closed);
}

export function reverseSelectedShape(S: TraceState): void {
  const s = S.shapes.find((x) => x.id === S.sel);
  if (!s || !["poly", "path"].includes(s.type)) return;
  pushHist(S);
  if (s.type === "poly") s.points.reverse();
  else if (s.type === "path") {
    s.nodes.reverse();
    s.nodes.forEach((n) => { const q = n.in; n.in = n.out; n.out = q; });
  }
}

export function smartSimplifySelected(S: TraceState, simplifyTol: number): void {
  const s = S.shapes.find((x) => x.id === S.sel);
  if (!s || !["poly", "path"].includes(s.type)) return;
  pushHist(S);
  if (s.type === "poly") {
    s.points = simplifyPoints(s.points, simplifyTol, !!s.closed);
  } else if (s.type === "path") {
    const pts = s.nodes.map((n) => ({ x: n.x, y: n.y }));
    const simple = simplifyPoints(pts, simplifyTol, s.closed);
    s.nodes = simple.map((p) => ({ x: p.x, y: p.y, in: { x: p.x, y: p.y }, out: { x: p.x, y: p.y }, auto: true, mode: "smooth" as const }));
    autoSmoothPath(s, s.closed);
  }
}

// ---------------------------------------------------------------- focusActiveSvg (browser-only helper)

export function focusActiveSvgCandidate(S: TraceState, stageEl: HTMLElement): void {
  const c = activeSvgCandidate(S);
  if (!c) return;
  const r = stageEl.getBoundingClientRect(), pad = 40;
  const sw = Math.max(1, c.bbox.w), sh = Math.max(1, c.bbox.h);
  const z = Math.min((r.width - pad * 2) / sw, (r.height - pad * 2) / sh);
  S.view.s = Math.max(0.01, Math.min(64, z));
  S.view.x = (r.width - (c.bbox.x * 2 + c.bbox.w) * S.view.s) / 2;
  S.view.y = (r.height - (c.bbox.y * 2 + c.bbox.h) * S.view.s) / 2;
}

export function clearSvgCandidates(S: TraceState): void {
  const st = ensureSvgTrace(S);
  st.candidates = []; st.activeId = null; st.sourceText = null; st.sourceName = null;
}
export function traceIncludedSvg(S: import('./model.js').TraceState): void {
  traceSvgCandidates(S, ensureSvgTrace(S).candidates.filter((c) => c.status === 'include'));
}
// readFileText + readFileDataUrl (browser-only)
