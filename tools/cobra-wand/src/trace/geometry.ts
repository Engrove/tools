/**
 * Trace-geometri (port av v14 — avstånd, Bezier-sampling, autosmooth, hit-test,
 * kontaktpunkter, redigering). Alla trösklar och formler exakta mot källan:
 * hit-handtag 14/s, shape 12/s, hitNode 18/s, origo 20/s, handtagscap 0.48/0.42.
 */
import {
  clone, TRACE_COLORS as C, type CircleShape, type PathNode, type PathShape,
  type RectShape, type StationShape, type TracePoint, type TraceShape, type TraceState,
} from "./model.js";

export function dist(a: TracePoint, b: TracePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Punkt-till-segment-avstånd med t-klamp [0,1]. */
export function segDist(p: TracePoint, a: TracePoint, b: TracePoint): number {
  const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

export function imgW(S: TraceState): number { return S.img?.width || 1000; }
export function imgH(S: TraceState): number { return S.img?.height || 1000; }

export function pointCount(s: TraceShape | null): number {
  if (!s) return 0;
  if (s.type === "path") return s.nodes.length;
  if (s.type === "poly" || s.type === "mask" || s.type === "line") return s.points.length;
  if (s.type === "rect" || s.type === "circle") return 2;
  return 0;
}

export function lastPoint(s: TraceShape | null): TracePoint | null {
  if (!s) return null;
  if (s.type === "path" && s.nodes.length) {
    const n = s.nodes[s.nodes.length - 1];
    return { x: n.x, y: n.y };
  }
  if ((s.type === "poly" || s.type === "mask" || s.type === "line" || s.type === "zone" || s.type === "measure") &&
      "points" in s && s.points.length) {
    return clone(s.points[s.points.length - 1]);
  }
  if (s.type === "rect") return { x: s.x + s.w, y: s.y + s.h };
  if (s.type === "circle") return { x: s.cx + s.r, y: s.cy };
  return null;
}

/** Minimikrav för commit (spec §36, källverifierat). */
export function hasEnough(s: TraceShape | null): boolean {
  if (!s) return false;
  if (s.type === "path") return s.nodes.length >= 2;
  if (s.type === "zone") return s.points.length >= 3;
  if (s.type === "poly" || s.type === "mask") return s.points.length >= 2;
  if (s.type === "line" || s.type === "measure")
    return s.points.length >= 2 && dist(s.points[0], s.points[1]) > 0.5;
  if (s.type === "rect") return Math.abs(s.w) > 0.5 && Math.abs(s.h) > 0.5;
  if (s.type === "circle") return s.r > 0.5;
  return false;
}

/** created_at + stil-default + rect-normalisering (negativ w/h). */
export function clean(s: TraceShape): TraceShape {
  s.created_at = s.created_at || new Date().toISOString();
  s.style = s.style || { stroke: C[s.type] || C.path, width: s.type === "measure" ? 1.8 : 1.4 };
  if (s.type === "rect") {
    if (s.w < 0) { s.x += s.w; s.w = -s.w; }
    if (s.h < 0) { s.y += s.h; s.h = -s.h; }
  }
  return s;
}

export function corners(s: RectShape): TracePoint[] {
  return [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }];
}

/**
 * Auto-smooth (källexakt): kollineära in/ut-handtag för auto-noder; tangent =
 * next−prev; handtagslängd min(korda/3, 0.48·min-korda); ändnoder envägshandtag
 * med cap 0.42·kordlängd; noder med auto:false lämnas orörda.
 */
export function autoSmoothPath(s: PathShape, closed = s.closed): PathShape {
  const ns = s.nodes || [], n = ns.length;
  if (n < 2) return s;
  for (let i = 0; i < n; i++) {
    const P = ns[i];
    if (P.auto === false) continue;
    const prev = i > 0 ? ns[i - 1] : closed ? ns[n - 1] : null;
    const next = i < n - 1 ? ns[i + 1] : closed ? ns[0] : null;
    if (prev && next) {
      const vx = next.x - prev.x, vy = next.y - prev.y;
      const len = Math.hypot(vx, vy) || 1, ux = vx / len, uy = vy / len;
      const lp = dist(P, prev), ln = dist(P, next);
      const cap = Math.min(lp, ln) * 0.48;
      const hin = Math.min(lp / 3, cap), hout = Math.min(ln / 3, cap);
      P.in = { x: P.x - ux * hin, y: P.y - uy * hin };
      P.out = { x: P.x + ux * hout, y: P.y + uy * hout };
      P.mode = "smooth"; P.auto = true;
    } else if (next) {
      const vx = next.x - P.x, vy = next.y - P.y;
      const len = Math.hypot(vx, vy) || 1, ux = vx / len, uy = vy / len;
      const h = Math.min(len / 3, len * 0.42);
      P.in = { x: P.x, y: P.y };
      P.out = { x: P.x + ux * h, y: P.y + uy * h };
      P.mode = "smooth"; P.auto = true;
    } else if (prev) {
      const vx = P.x - prev.x, vy = P.y - prev.y;
      const len = Math.hypot(vx, vy) || 1, ux = vx / len, uy = vy / len;
      const h = Math.min(len / 3, len * 0.42);
      P.in = { x: P.x - ux * h, y: P.y - uy * h };
      P.out = { x: P.x, y: P.y };
      P.mode = "smooth"; P.auto = true;
    }
  }
  return s;
}

/** Kubisk Bezier-sampling: n per segment, sluten path tar extra varvsegment. */
export function samplePath(s: PathShape, n = 16): TracePoint[] {
  const pts: TracePoint[] = [];
  if (!s.nodes?.length) return pts;
  pts.push({ x: s.nodes[0].x, y: s.nodes[0].y });
  const N = s.nodes.length - 1 + (s.closed ? 1 : 0);
  for (let k = 0; k < N; k++) {
    const a = s.nodes[k], b = s.nodes[(k + 1) % s.nodes.length];
    const c1 = a.out || a, c2 = b.in || b;
    for (let i = 1; i <= n; i++) {
      const t = i / n, m = 1 - t;
      pts.push({
        x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x,
        y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y,
      });
    }
  }
  return pts;
}

export interface HandleHit {
  kind: string; index: number; point: TracePoint; dist: number;
}

export function hitHandles(S: TraceState, s: TraceShape, p: TracePoint): HandleHit | null {
  let best: HandleHit | null = null, bd = 1e9;
  const chk = (kind: string, index: number, q: TracePoint): void => {
    const dd = dist(p, q);
    if (dd < bd) { bd = dd; best = { kind, index, point: q, dist: dd }; }
  };
  if (s.type === "station") {
    const ori = s.orientation || "vertical";
    if (ori === "horizontal") {
      const y = s.y ?? s.y1 ?? 0;
      chk("station_start", 0, { x: s.x1 ?? 0, y });
      chk("station_mid", 1, { x: ((s.x1 ?? 0) + (s.x2 ?? imgW(S))) / 2, y });
      chk("station_end", 2, { x: s.x2 ?? imgW(S), y });
    } else {
      chk("station_top", 0, { x: s.x!, y: s.y1 ?? 0 });
      chk("station_mid", 1, { x: s.x!, y: ((s.y1 ?? 0) + (s.y2 ?? imgH(S))) / 2 });
      chk("station_bottom", 2, { x: s.x!, y: s.y2 ?? imgH(S) });
    }
  } else if (s.type === "line" || s.type === "measure") {
    s.points.forEach((q, i) => chk("point", i, q));
  } else if (s.type === "poly" || s.type === "mask" || s.type === "zone") {
    s.points.forEach((q, i) => chk("point", i, q));
  } else if (s.type === "rect") {
    corners(s).forEach((q, i) => chk("corner", i, q));
  } else if (s.type === "circle") {
    chk("center", 0, { x: s.cx, y: s.cy });
    chk("radius", 1, { x: s.cx + s.r, y: s.cy });
  } else if (s.type === "path") {
    s.nodes.forEach((n, i) => {
      chk("node", i, n);
      if (n.in) chk("in", i, n.in);
      if (n.out) chk("out", i, n.out);
    });
  }
  return best;
}

export function shapeDist(S: TraceState, s: TraceShape, p: TracePoint): number {
  if (s.type === "station") {
    const ori = s.orientation || "vertical";
    return ori === "horizontal"
      ? segDist(p, { x: s.x1 ?? 0, y: s.y ?? s.y1 ?? 0 }, { x: s.x2 ?? imgW(S), y: s.y ?? s.y1 ?? 0 })
      : segDist(p, { x: s.x!, y: s.y1 ?? 0 }, { x: s.x!, y: s.y2 ?? imgH(S) });
  }
  if (s.type === "line" || s.type === "measure") return segDist(p, s.points[0], s.points[1]);
  if (s.type === "rect") {
    const ps = corners(s);
    let m = 1e9;
    for (let i = 0; i < 4; i++) m = Math.min(m, segDist(p, ps[i], ps[(i + 1) % 4]));
    return m;
  }
  if (s.type === "circle") return Math.abs(dist(p, { x: s.cx, y: s.cy }) - Math.abs(s.r));
  if (s.type === "poly" || s.type === "mask" || s.type === "zone") {
    let m = 1e9;
    for (let i = 1; i < s.points.length; i++) m = Math.min(m, segDist(p, s.points[i - 1], s.points[i]));
    if ((s.closed || s.type === "zone") && s.points.length > 2)
      m = Math.min(m, segDist(p, s.points[s.points.length - 1], s.points[0]));
    return m;
  }
  if (s.type === "path") {
    const ps = samplePath(s, 12);
    let m = 1e9;
    for (let i = 1; i < ps.length; i++) m = Math.min(m, segDist(p, ps[i - 1], ps[i]));
    return m;
  }
  return 1e9;
}

export interface ShapeHit extends Partial<HandleHit> {
  shape: TraceShape; kind: string; dist: number; current?: boolean;
}

/** Select-hit: handtag (14/s) före shape-kant (12/s). */
export function hit(S: TraceState, p: TracePoint): ShapeHit | null {
  let best: ShapeHit | null = null, bd = 1e9;
  for (const s of S.shapes) {
    const h = hitHandles(S, s, p);
    if (h && h.dist < bd) { best = { shape: s, ...h }; bd = h.dist; }
  }
  if (best && bd < 14 / S.view.s) return best;
  for (const s of S.shapes) {
    const dd = shapeDist(S, s, p);
    if (dd < bd) { best = { shape: s, kind: "shape", dist: dd }; bd = dd; }
  }
  return bd < 12 / S.view.s ? best : null;
}

/** Nod-/handtagshit inkl. pågående objekt (18/s). */
export function hitNode(S: TraceState, p: TracePoint, includeCurrent = true): ShapeHit | null {
  let best: ShapeHit | null = null, bd = 1e9;
  const scan = (s: TraceShape | null, current = false): void => {
    if (!s) return;
    const h = hitHandles(S, s, p);
    if (h && h.dist < bd) { best = { shape: s, current, ...h }; bd = h.dist; }
  };
  if (includeCurrent) scan(S.cur, true);
  for (const s of S.shapes) scan(s, false);
  return best && bd < 18 / S.view.s ? best : null;
}

export function contactPoints(S: TraceState, s: TraceShape | null): TracePoint[] {
  const a: TracePoint[] = [];
  if (!s) return a;
  if (s.type === "station") {
    const ori = s.orientation || "vertical";
    if (ori === "horizontal") {
      const y = s.y ?? s.y1 ?? 0;
      a.push({ x: s.x1 ?? 0, y }, { x: s.x2 ?? imgW(S), y }, { x: ((s.x1 ?? 0) + (s.x2 ?? imgW(S))) / 2, y });
    } else {
      a.push({ x: s.x!, y: s.y1 ?? 0 }, { x: s.x!, y: s.y2 ?? imgH(S) },
        { x: s.x!, y: ((s.y1 ?? 0) + (s.y2 ?? imgH(S))) / 2 });
    }
  } else if (s.type === "line" || s.type === "measure") a.push(...s.points);
  else if (s.type === "poly" || s.type === "mask" || s.type === "zone") a.push(...s.points);
  else if (s.type === "rect") a.push(...corners(s));
  else if (s.type === "circle") a.push({ x: s.cx, y: s.cy }, { x: s.cx + s.r, y: s.cy });
  else if (s.type === "path") s.nodes.forEach((n) => a.push({ x: n.x, y: n.y }));
  return a;
}

export function moveWhole(S: TraceState, s: TraceShape, dx: number, dy: number, o: TraceShape): void {
  if (s.type === "station" && o.type === "station") {
    const ori = s.orientation || o.orientation || "vertical";
    if (ori === "horizontal") {
      s.orientation = ori;
      s.y = (o.y ?? o.y1 ?? 0) + dy;
      s.x1 = (o.x1 ?? 0) + dx;
      s.x2 = (o.x2 ?? imgW(S)) + dx;
    } else {
      s.orientation = ori;
      s.x = o.x! + dx;
      s.y1 = (o.y1 ?? 0) + dy;
      s.y2 = (o.y2 ?? imgH(S)) + dy;
    }
  } else if ((s.type === "line" || s.type === "measure") && "points" in o) {
    s.points = o.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  } else if ((s.type === "poly" || s.type === "mask" || s.type === "zone") && "points" in o) {
    s.points = (o.points as TracePoint[]).map((p) => ({ x: p.x + dx, y: p.y + dy }));
  } else if (s.type === "rect" && o.type === "rect") {
    s.x = o.x + dx; s.y = o.y + dy;
  } else if (s.type === "circle" && o.type === "circle") {
    s.cx = o.cx + dx; s.cy = o.cy + dy;
  } else if (s.type === "path" && o.type === "path") {
    s.nodes = o.nodes.map((n) => ({
      x: n.x + dx, y: n.y + dy,
      in: n.in ? { x: n.in.x + dx, y: n.in.y + dy } : null,
      out: n.out ? { x: n.out.x + dx, y: n.out.y + dy } : null,
      auto: n.auto, mode: n.mode,
    })) as PathNode[];
  }
}

export type SnapStationFn = (p: TracePoint, ori: "vertical" | "horizontal", excludeId: string | null) => number;
export type MeasureUpdateFn = () => void;

/**
 * Redigering av nod/handtag/hörn/radie (källexakt; Q3-städning: den döda
 * h.kind==="shape"-grenen inuti station-fallet är borttagen — moveWhole
 * hanterar hel-flytt och returnerar före).
 */
export function editShape(
  S: TraceState, h: ShapeHit, p: TracePoint, start: TracePoint, o: TraceShape,
  snapStation: SnapStationFn, measureSnap: (p: TracePoint) => TracePoint, onMeasure: MeasureUpdateFn,
): void {
  const s = h.current ? S.cur : S.shapes.find((x) => x.id === h.shape.id);
  const dx = p.x - start.x, dy = p.y - start.y;
  if (!s) return;
  if (h.kind === "shape") { moveWhole(S, s, dx, dy, o); return; }
  if (s.type === "station") {
    const ori = s.orientation || (o.type === "station" ? o.orientation : "vertical") || "vertical";
    const sc = snapStation(p, ori, s.id);
    s.orientation = ori;
    if (ori === "horizontal") {
      s.y = sc;
      if (h.kind === "station_start") s.x1 = p.x;
      else if (h.kind === "station_end") s.x2 = p.x;
    } else {
      s.x = sc;
      if (h.kind === "station_top") s.y1 = p.y;
      else if (h.kind === "station_bottom") s.y2 = p.y;
    }
  } else if (s.type === "line") {
    s.points[h.index!] = p;
  } else if (s.type === "measure") {
    s.points[h.index!] = S.measureSnap ? measureSnap(p) : p;
    onMeasure();
  } else if (s.type === "poly" || s.type === "mask" || s.type === "zone") {
    s.points[h.index!] = p;
  } else if (s.type === "rect" && o.type === "rect") {
    const op = corners(o)[(h.index! + 2) % 4];
    s.x = Math.min(p.x, op.x); s.y = Math.min(p.y, op.y);
    s.w = Math.abs(p.x - op.x); s.h = Math.abs(p.y - op.y);
  } else if (s.type === "circle" && o.type === "circle") {
    if (h.kind === "center") { s.cx = o.cx + dx; s.cy = o.cy + dy; }
    else s.r = dist(p, { x: s.cx, y: s.cy });
  } else if (s.type === "path" && o.type === "path") {
    const n = s.nodes[h.index!], on = o.nodes[h.index!];
    if (h.kind === "node") {
      const ndx = p.x - on.x, ndy = p.y - on.y;
      n.x = p.x; n.y = p.y;
      if (n.in && on.in) { n.in.x = on.in.x + ndx; n.in.y = on.in.y + ndy; }
      if (n.out && on.out) { n.out.x = on.out.x + ndx; n.out.y = on.out.y + ndy; }
    }
    if (h.kind === "in") { n.in = p; n.auto = false; n.mode = "manual"; }
    if (h.kind === "out") { n.out = p; n.auto = false; n.mode = "manual"; }
    if (h.kind === "node" && n.auto !== false) autoSmoothPath(s, s.closed);
  }
}

export function measureLen(s: TraceShape | null): number {
  return s && "points" in s && s.points && s.points.length >= 2 ? dist(s.points[0], s.points[1]) : 0;
}

/** Poly → smooth Bezier-path (Auto Smooth på vald polyline, källexakt namn/ersättning). */
export function polyToSmoothPath(S: TraceState, s: TraceShape, mkId: (p: string) => string): PathShape | null {
  if (s.type !== "poly") return null;
  const ns: PathNode[] = s.points.map((p) => ({
    x: p.x, y: p.y, in: { x: p.x, y: p.y }, out: { x: p.x, y: p.y }, auto: true, mode: "smooth",
  }));
  const repl: PathShape = {
    id: mkId("path"), type: "path", name: (s.name || "poly") + "_smooth_path",
    role: s.role || "trace", closed: !!s.closed, nodes: ns,
    style: { stroke: C.path, width: 1.4 },
  };
  autoSmoothPath(repl, repl.closed);
  return repl;
}

// ================================================================ v18: geometry additions

/** Kvadratiskt punkt–segment-avstånd (undviker sqrt; används av RDP). */
export function sqSegDist(p: TracePoint, a: TracePoint, b: TracePoint): number {
  let x = a.x, y = a.y, dx = b.x - x, dy = b.y - y;
  if (dx || dy) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b.x; y = b.y; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  const ex = p.x - x, ey = p.y - y;
  return ex * ex + ey * ey;
}

/** Ramer–Douglas–Peucker för öppen polylinje (källexakt mot v18). */
export function rdpOpen(points: TracePoint[], tol: number): TracePoint[] {
  if (!points || points.length <= 2 || tol <= 0) return (points || []).map(p => ({ ...p }));
  const sq = tol * tol, keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = sq, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const q = sqSegDist(points[i], points[a], points[b]);
      if (q > max) { idx = i; max = q; }
    }
    if (idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]).map(p => ({ ...p }));
}

/** RDP för öppen eller sluten polylinje (söker startpunkt längst från centroid för sluten). */
export function simplifyPoints(points: TracePoint[], tol: number, closed = false): TracePoint[] {
  const ps = (points || []).map(p => ({ ...p }));
  if (ps.length < 3 || tol <= 0) return ps;
  if (!closed) return rdpOpen(ps, tol);
  const c = { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
  let start = 0, far = -1;
  for (let i = 0; i < ps.length; i++) { const q = dist(ps[i], c); if (q > far) { far = q; start = i; } }
  const rot = ps.slice(start).concat(ps.slice(0, start));
  rot.push({ ...rot[0] });
  const out = rdpOpen(rot, tol);
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < 0.0001) out.pop();
  return out.length >= 3 ? out : (points || []).map(p => ({ ...p }));
}

/** Ray-casting point-in-polygon (för SVG-kandidatval). */
export function pointInPoly(p: TracePoint, ps: TracePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i], b = ps[j];
    const cross = ((a.y > p.y) !== (b.y > p.y)) && (p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x);
    if (cross) inside = !inside;
  }
  return inside;
}

/** Minimum avstånd punkt → polylinje/polygon. */
export function polyDistance(p: TracePoint, ps: TracePoint[], closed = false): number {
  let m = Infinity;
  for (let i = 1; i < ps.length; i++) m = Math.min(m, Math.sqrt(sqSegDist(p, ps[i - 1], ps[i])));
  if (closed && ps.length > 2) m = Math.min(m, Math.sqrt(sqSegDist(p, ps[ps.length - 1], ps[0])));
  return m;
}

export function areaOfPoints(ps: TracePoint[]): number {
  let a = 0;
  if (!ps || ps.length < 3) return 0;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) a += (ps[j].x * ps[i].y - ps[i].x * ps[j].y);
  return a / 2;
}

export function bboxOfPoints(ps: TracePoint[]): { x: number; y: number; w: number; h: number } {
  if (!ps?.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Projektion av p på segment ab med t-parameter och avstånd. */
export function projOnSeg(p: TracePoint, a: TracePoint, b: TracePoint): { x: number; y: number; t: number; dist: number } {
  const vx = b.x - a.x, vy = b.y - a.y;
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / ((vx * vx + vy * vy) || 1);
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + vx * t, y: a.y + vy * t, t, dist: Math.sqrt(sqSegDist(p, a, b)) };
}

/** Punkt på kubisk Bezier-kurva vid parametern t. */
export function cubicPointAt(
  a: TracePoint, c1: TracePoint, c2: TracePoint, b: TracePoint, t: number,
): TracePoint {
  const m = 1 - t;
  return {
    x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x,
    y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y,
  };
}

/** Linjär interpolering mellan två punkter. */
export function mixPoint(a: TracePoint, b: TracePoint, t: number): TracePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 64-punkts sampling av path (standard-antalet i v18 samplePathCount). */
export function samplePathCount(s: PathShape, count = 64): TracePoint[] {
  if (!s.nodes?.length) return [];
  const n = s.nodes.length - 1 + (s.closed ? 1 : 0);
  const pts: TracePoint[] = [{ x: s.nodes[0].x, y: s.nodes[0].y }];
  const perSeg = Math.max(1, Math.round(count / Math.max(1, n)));
  for (let k = 0; k < n; k++) {
    const a = s.nodes[k], b = s.nodes[(k + 1) % s.nodes.length];
    const c1 = a.out || a, c2 = b.in || b;
    for (let i = 1; i <= perSeg; i++) {
      const t = i / perSeg, m = 1 - t;
      pts.push({
        x: m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x,
        y: m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y,
      });
    }
  }
  return pts;
}
