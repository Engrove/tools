/**
 * TraceEditor (port av v14 — DOM-/canvas-skiktet).
 * Semantik 1:1 mot källan enligt docs/TRACE_TOOL_FUNKTIONSANALYS.md §5–§7, §13:
 *   – mousedown-beslutskedjan i bindande ordning (zoom→pan→origin→place2→
 *     nodeClickOrEdit→select/pending), 3 px-eskalering, drag-release-stöd.
 *   – exakta trösklar: handtag 14/s, shape 12/s, hitNode 18/s, origo 20/s.
 *   – zoomformler: hjul exp(−ΔY·0.0012); högerdrag exp(dy·0.010+dx·0.003), klamp 0.01–64.
 * Avvikelser (dokumenterade, spec-sanktionerade): Q1 zone avslutas även med
 * dubbelklick; Q9 trailing-punktdedupe (<0.5 px) vid dubbelklicksavslut.
 * Dialoger (prompt/confirm) injiceras — testbart och Electron-vänligt.
 */
import {
  clone, createTraceState, ensureAllMeta, ensureScale, ensureShapeMeta,
  ensureZoneStyle, newId, ORIGIN_SEL, pushHist, selectedShape, TRACE_COLORS as C,
  type MeasureShape, type PathShape, type TracePoint, type TraceShape,
  type TraceState, type TraceTool,
} from "./model.js";
import {
  autoSmoothPath, clean, contactPoints, corners, dist, editShape, hasEnough,
  hit, hitNode, imgH, imgW, lastPoint, measureLen, polyToSmoothPath, samplePath,
  type ShapeHit,
} from "./geometry.js";
import {
  addStationAt, addStationGrid, enforceAxes, finalizeMeasure, measureSnapPoint,
  moveOriginTo, originHit, setOrigin, snapPoint, snapStationCoord,
  stationOrientation, updateMeasurements, updateStationPositionsFromOrigin,
  axisVec2, axisSign,
} from "./frame.js";
import { applyImportedTrace } from "./export.js";
import {
  applyProjectPackage, applyTraceObject, projectPayload, type ProjectPackage,
} from "./project.js";

export interface EditorDialogs {
  prompt(message: string, def: string): string | null;
  confirm(message: string): boolean;
  alert(message: string): void;
}

export interface EditorCallbacks {
  /** Host-UI-uppdatering (JSON-textarea, objektlista, metadata-panel, statusbar). */
  onSync(refreshJson: boolean): void;
  /** Muskoordinat till statusbar. */
  onCursor(x: number, y: number): void;
  /** true om textinmatning har fokus (blockerar Delete/paste-genvägar). */
  isTextInputActive(): boolean;
}

type DragState =
  | { mode: "zoom"; sp: TracePoint; anchorSp: TracePoint; anchorImg: TracePoint; startS: number }
  | { mode: "pan"; sp: TracePoint; view: { s: number; x: number; y: number } }
  | { mode: "pending"; sp: TracePoint; raw: TracePoint; view: { s: number; x: number; y: number }; moved: boolean }
  | { mode: "place2"; sp: TracePoint; raw: TracePoint; moved: boolean }
  | { mode: "edit"; hit: ShapeHit; start: TracePoint; orig: TraceShape }
  | { mode: "nodeClickOrEdit"; hit: ShapeHit; start: TracePoint; sp: TracePoint; orig: TraceShape; moved: boolean; histDone: boolean }
  | { mode: "origin"; start: TracePoint; orig: TracePoint | null };

export class TraceEditor {
  S: TraceState;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private stage: HTMLElement;
  private dropEl: HTMLElement | null;
  private drag: DragState | null = null;
  private dialogs: EditorDialogs;
  private cb: EditorCallbacks;
  private ro: ResizeObserver;
  private disposed = false;

  constructor(
    stage: HTMLElement, canvas: HTMLCanvasElement, dropOverlay: HTMLElement | null,
    dialogs: EditorDialogs, callbacks: EditorCallbacks, initial?: TraceState,
  ) {
    this.stage = stage;
    this.cv = canvas;
    this.dropEl = dropOverlay;
    this.dialogs = dialogs;
    this.cb = callbacks;
    this.S = initial ?? createTraceState();
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D-kontext saknas");
    this.cx = ctx;
    this.bindEvents();
    this.ro = new ResizeObserver(() => this.size());
    this.ro.observe(stage);
    this.size();
  }

  // ------------------------------------------------------------- livscykel

  /** Byter aktivt dokument (multi-trace). Pågående objekt committas först. */
  setState(next: TraceState): void {
    if (this.S.cur) this.commitCurrentKeepAnchor();
    this.S = next;
    this.sync();
  }

  destroy(): void {
    this.disposed = true;
    this.ro.disconnect();
    window.removeEventListener("mouseup", this.onWindowMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("paste", this.onPaste);
  }

  // ------------------------------------------------------------- transforms

  size(): void {
    const r = this.stage.getBoundingClientRect();
    const d = devicePixelRatio || 1;
    this.cv.width = Math.max(1, Math.round(r.width * d));
    this.cv.height = Math.max(1, Math.round(r.height * d));
    this.cv.style.width = r.width + "px";
    this.cv.style.height = r.height + "px";
    this.cx.setTransform(d, 0, 0, d, 0, 0);
    this.draw();
  }

  private scr(e: MouseEvent): TracePoint {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  toImg(p: TracePoint): TracePoint {
    return { x: (p.x - this.S.view.x) / this.S.view.s, y: (p.y - this.S.view.y) / this.S.view.s };
  }
  toScr(p: TracePoint): TracePoint {
    return { x: p.x * this.S.view.s + this.S.view.x, y: p.y * this.S.view.s + this.S.view.y };
  }

  fit(): void {
    if (!this.S.img) return;
    const r = this.stage.getBoundingClientRect();
    const s = Math.min(r.width / this.S.img.width, r.height / this.S.img.height) * 0.92;
    this.S.view.s = s;
    this.S.view.x = (r.width - this.S.img.width * s) / 2;
    this.S.view.y = (r.height - this.S.img.height * s) / 2;
    this.draw();
  }

  one(): void {
    this.S.view = { s: 1, x: 40, y: 40 };
    this.draw();
  }

  // ------------------------------------------------------------- bild/data

  loadImageFile(f: File | null): void {
    if (!f) return;
    const r = new FileReader();
    r.onload = (e) => this.loadImageData(String(e.target?.result), f.name);
    r.readAsDataURL(f);
  }

  loadImageData(dataUrl: string, name: string, done?: (() => void) | null, fitView = true): void {
    const im = new Image();
    im.onload = () => {
      if (this.disposed) return;
      this.S.img = { name, width: im.naturalWidth, height: im.naturalHeight, dataUrl, _im: im };
      if (fitView) this.fit();
      if (done) done();
      this.sync();
    };
    im.onerror = () => this.dialogs.alert("Could not load embedded project image.");
    im.src = dataUrl;
  }

  /** Öppnar godtycklig trace-JSON (auto-detekterar v15-projektpaket). */
  openTraceObject(o: unknown, fileName = "trace.json"): void {
    pushHist(this.S);
    const r = applyTraceObject(this.S, o, fileName);
    if (r.isProject && r.imageDataUrl) {
      const view = r.savedView;
      this.loadImageData(r.imageDataUrl, r.imageName || fileName, () => { if (view) this.S.view = view; }, false);
    } else if (r.imageDataUrl) {
      this.loadImageData(r.imageDataUrl, r.imageName || fileName);
    } else {
      this.sync();
    }
  }

  /** Öppnar ett v15-sessionspaket och återställer hela arbetsläget inkl. vy. */
  openProjectPackage(o: unknown, fileName = "project.engrove-trace"): void {
    const r = applyProjectPackage(this.S, o, fileName);
    const view = r.savedView;
    if (r.imageDataUrl) {
      this.loadImageData(r.imageDataUrl, r.imageName || fileName, () => { this.S.view = view; }, false);
    } else {
      this.S.img = null;
      this.S.view = view;
      this.sync();
    }
  }

  /** Bygger v15-sessionspaketet (host laddar ned det). */
  buildProjectPackage(): ProjectPackage {
    return projectPayload(this.S);
  }

  /** Återhydrerar _im ur dataUrl (efter store-laddning/dokumentbyte). */
  rehydrateImage(): void {
    if (this.S.img && !this.S.img._im && this.S.img.dataUrl) {
      const im = new Image();
      im.onload = () => {
        if (this.S.img) this.S.img._im = im;
        this.draw();
      };
      im.src = this.S.img.dataUrl;
    }
  }

  applyJson(text: string): void {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      pushHist(this.S);
      const res = applyImportedTrace(this.S, o);
      if (res.brokenRefs.length) {
        this.dialogs.alert("Varning — trasiga referensmål vid import:\n" + res.brokenRefs.join("\n"));
      }
      if (res.imageDataUrl) this.loadImageData(res.imageDataUrl, res.imageName || "json-image");
      this.sync();
    } catch (e) {
      this.dialogs.alert("JSON parse error: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  clearTrace(): void {
    if (!this.dialogs.confirm("Rensa alla trace-objekt, punkter, stationer, mått, origo och skala? Bilden behålls.")) return;
    pushHist(this.S);
    const axes = this.S.frame.axes;
    const fresh = createTraceState(this.S.meta);
    this.S.shapes = [];
    this.S.cur = null;
    this.S.sel = null;
    this.S.anchor = null;
    this.S.frame = fresh.frame;
    this.S.frame.axes = axes || fresh.frame.axes;
    this.sync();
  }

  // ------------------------------------------------------------- verktyg

  setTool(t: TraceTool): void {
    if (this.S.cur) this.commitCurrentKeepAnchor();
    this.S.tool = t;
    this.sync(false);
  }

  setAxis(k: "x" | "y" | "z", v: string): void {
    this.S.frame.axes[k] = v;
    enforceAxes(this.S, k);
    this.sync();
  }

  private setAnchor(p: TracePoint | null): void {
    this.S.anchor = p ? { x: p.x, y: p.y } : null;
  }

  private askScaleDialog = (): { real: number | null; unit: string } => {
    const realRaw = this.dialogs.prompt("First measure line: enter real length for scale reference", "");
    const real = realRaw === null ? null : parseFloat(String(realRaw).replace(",", "."));
    if (real !== null && Number.isFinite(real) && real > 0) {
      const unit = this.dialogs.prompt("Unit for scale reference", ensureScale(this.S).unit || "mm") || "mm";
      return { real, unit };
    }
    return { real: null, unit: ensureScale(this.S).unit || "mm" };
  };

  commitCurrentKeepAnchor(opts: { closed?: boolean } = {}): boolean {
    const S = this.S;
    if (!S.cur) return false;
    const lp = lastPoint(S.cur);
    if (S.cur.type === "path") autoSmoothPath(S.cur, S.cur.closed);
    if (S.cur.type === "zone") S.cur.closed = true;
    if (hasEnough(S.cur)) {
      pushHist(S);
      const s = clean(S.cur);
      if (s.type === "measure") finalizeMeasure(S, s, this.askScaleDialog);
      ensureShapeMeta(S, s, S.shapes.length);
      S.shapes.push(s);
      S.sel = s.id;
      this.setAnchor(opts.closed ? null : lp || lastPoint(s));
      S.cur = null;
      this.sync();
      return true;
    }
    this.setAnchor(lp);
    S.cur = null;
    this.sync();
    return false;
  }

  finish(closePath = false): void {
    if (!this.S.cur) return;
    if (closePath && "closed" in this.S.cur) (this.S.cur as { closed: boolean }).closed = true;
    this.commitCurrentKeepAnchor({ closed: closePath });
  }

  /** Q9: dedupe av släpande dubbelpunkt (<0.5 px) före dubbelklicksavslut. */
  private finishFromDblClick(): void {
    const c = this.S.cur;
    if (c && "points" in c && Array.isArray(c.points) && c.points.length >= 2) {
      const a = c.points[c.points.length - 2], b = c.points[c.points.length - 1];
      if (dist(a, b) < 0.5) c.points.pop();
    }
    if (c && c.type === "path" && c.nodes.length >= 2) {
      const a = c.nodes[c.nodes.length - 2], b = c.nodes[c.nodes.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) c.nodes.pop();
    }
    this.finish(false);
  }

  undoActivePoint(): boolean {
    const S = this.S;
    if (!S.cur) return false;
    if (S.cur.type === "path") {
      if (S.cur.nodes.length) {
        S.cur.nodes.pop();
        if (S.cur.nodes.length >= 2) autoSmoothPath(S.cur, S.cur.closed);
      }
      if (!S.cur.nodes.length) S.cur = null;
      else this.setAnchor(lastPoint(S.cur));
      this.sync();
      return true;
    }
    if (S.cur.type === "poly" || S.cur.type === "mask" || S.cur.type === "zone") {
      if (S.cur.points.length) S.cur.points.pop();
      if (!S.cur.points.length) S.cur = null;
      else this.setAnchor(lastPoint(S.cur));
      this.sync();
      return true;
    }
    if (["line", "measure", "rect", "circle"].includes(S.cur.type)) {
      this.setAnchor(lastPoint(S.cur));
      S.cur = null;
      this.sync();
      return true;
    }
    return false;
  }

  undo(): void {
    const S = this.S;
    if (this.undoActivePoint()) return;
    if (!S.hist.length) return;
    S.fut.push(JSON.stringify({ shapes: S.shapes, sel: S.sel, anchor: S.anchor || null, frame: S.frame }));
    const o = JSON.parse(S.hist.pop()!) as { shapes: TraceShape[]; sel: string | null; anchor: TracePoint | null; frame: TraceState["frame"] };
    S.shapes = o.shapes;
    S.sel = o.sel;
    S.anchor = o.anchor || null;
    S.frame = o.frame || S.frame;
    this.sync();
  }

  redo(): void {
    const S = this.S;
    if (!S.fut.length) return;
    S.hist.push(JSON.stringify({ shapes: S.shapes, sel: S.sel, anchor: S.anchor || null, frame: S.frame }));
    const o = JSON.parse(S.fut.pop()!) as { shapes: TraceShape[]; sel: string | null; anchor: TracePoint | null; frame: TraceState["frame"] };
    S.shapes = o.shapes;
    S.sel = o.sel;
    S.anchor = o.anchor || null;
    S.frame = o.frame || S.frame;
    this.sync();
  }

  del(): void {
    const S = this.S;
    if (!S.sel) return;
    if (S.sel === ORIGIN_SEL) {
      pushHist(S);
      S.frame.origin = null;
      S.sel = null;
      this.sync();
      return;
    }
    pushHist(S);
    S.shapes = S.shapes.filter((s) => s.id !== S.sel);
    S.sel = null;
    this.sync();
  }

  smoothSelected(): void {
    const S = this.S;
    const s = selectedShape(S);
    if (!s) return;
    pushHist(S);
    if (s.type === "path") {
      s.nodes.forEach((n) => { n.auto = true; n.mode = "smooth"; });
      autoSmoothPath(s, s.closed);
    } else if (s.type === "poly") {
      const repl = polyToSmoothPath(S, s, newId);
      if (!repl) return;
      const ix = S.shapes.findIndex((x) => x.id === s.id);
      S.shapes[ix] = repl;
      S.sel = repl.id;
    } else {
      return;
    }
    this.sync();
  }

  stationsDialog(): void {
    const S = this.S;
    if (!S.img) return;
    const spacingRaw = this.dialogs.prompt(
      "Station spacing in image pixels",
      String(S.frame.station_spacing_px || Math.round(S.img.width / 10)),
    );
    const spacing = parseFloat(String(spacingRaw));
    if (!Number.isFinite(spacing) || spacing <= 0) return;
    const countRaw = this.dialogs.prompt("Number of stations each side of origin", "10");
    const count = parseInt(String(countRaw), 10);
    if (!Number.isFinite(count) || count < 0) return;
    const remove = this.dialogs.confirm("Remove existing station objects before creating new grid?");
    addStationGrid(S, spacing, count, remove);
    this.sync();
  }

  // ------------------------------------------------------------- klicklogik

  private clickToolAt(raw: TracePoint, e: MouseEvent | null): void {
    const S = this.S;
    const p = snapPoint(S, raw, { off: !!(e && e.altKey) });
    if (S.tool === "select") {
      const h = hit(S, p);
      if (h) {
        S.sel = h.shape.id;
        pushHist(S);
        this.drag = { mode: "edit", hit: h, start: p, orig: clone(h.shape) };
      } else S.sel = null;
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "origin") { setOrigin(S, p); this.sync(); return; }
    if (S.tool === "station") { addStationAt(S, p); this.sync(); return; }
    if (S.tool === "measure") {
      const p2 = measureSnapPoint(S, raw, !!(e && e.altKey));
      if (S.cur && S.cur.type === "measure") {
        S.cur.points[1] = p2;
        this.commitCurrentKeepAnchor();
        return;
      }
      if (S.anchor) {
        const a = clone(S.anchor);
        S.anchor = null;
        S.cur = { id: newId("measure"), type: "measure", name: "measure", role: "measurement",
          points: [a, p2], unit: ensureScale(S).unit || "mm", is_scale_reference: false } as MeasureShape;
        this.commitCurrentKeepAnchor();
        return;
      }
      S.cur = { id: newId("measure"), type: "measure", name: "measure", role: "measurement",
        points: [p2, { ...p2 }], unit: ensureScale(S).unit || "mm", is_scale_reference: false } as MeasureShape;
      this.setAnchor(p2);
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "line") {
      if (S.cur && S.cur.type === "line") { S.cur.points[1] = p; this.commitCurrentKeepAnchor(); return; }
      if (S.anchor) {
        const a = clone(S.anchor);
        S.anchor = null;
        S.cur = { id: newId("line"), type: "line", name: "line", role: "trace", points: [a, p] };
        this.commitCurrentKeepAnchor();
        return;
      }
      S.cur = { id: newId("line"), type: "line", name: "line", role: "trace", points: [p, { ...p }] };
      this.setAnchor(p);
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "rect") {
      if (S.cur && S.cur.type === "rect") { S.cur.w = p.x - S.cur.x; S.cur.h = p.y - S.cur.y; this.commitCurrentKeepAnchor(); return; }
      if (S.anchor) {
        const a = clone(S.anchor);
        S.anchor = null;
        S.cur = { id: newId("rect"), type: "rect", name: "rect", role: "trace", x: a.x, y: a.y, w: p.x - a.x, h: p.y - a.y };
        this.commitCurrentKeepAnchor();
        return;
      }
      S.cur = { id: newId("rect"), type: "rect", name: "rect", role: "trace", x: p.x, y: p.y, w: 0, h: 0 };
      this.setAnchor(p);
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "circle") {
      if (S.cur && S.cur.type === "circle") { S.cur.r = dist(p, { x: S.cur.cx, y: S.cur.cy }); this.commitCurrentKeepAnchor(); return; }
      if (S.anchor) {
        const a = clone(S.anchor);
        S.anchor = null;
        S.cur = { id: newId("circle"), type: "circle", name: "circle", role: "trace", cx: a.x, cy: a.y, r: dist(a, p) };
        this.commitCurrentKeepAnchor();
        return;
      }
      S.cur = { id: newId("circle"), type: "circle", name: "circle", role: "trace", cx: p.x, cy: p.y, r: 0 };
      this.setAnchor(p);
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "poly" || S.tool === "mask" || S.tool === "zone") {
      if (!S.cur) {
        const pts = S.anchor ? [clone(S.anchor), p] : [p];
        S.anchor = null;
        const typ = S.tool === "mask" ? "mask" : S.tool === "zone" ? "zone" : "poly";
        S.cur = {
          id: newId(typ), type: typ, name: typ,
          role: typ === "mask" ? "ignore_mask" : typ === "zone" ? "zone" : "trace",
          points: pts, closed: typ === "zone",
        } as TraceShape;
        if (typ === "zone") ensureZoneStyle(S, S.cur, S.shapes.length);
      } else if ("points" in S.cur) {
        S.cur.points.push(p);
        if (S.cur.type === "zone") S.cur.closed = true;
      }
      this.setAnchor(lastPoint(S.cur));
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "pen") {
      this.addPen(p, e);
      this.setAnchor(lastPoint(S.cur));
      this.sync(false);
      this.draw();
    }
  }

  private addPen(p: TracePoint, e: MouseEvent | null): void {
    const S = this.S;
    const corner = !!(e && e.shiftKey);
    const node = (q: TracePoint) => ({
      x: q.x, y: q.y, in: { x: q.x, y: q.y }, out: { x: q.x, y: q.y },
      auto: !corner, mode: (corner ? "corner" : "smooth") as "corner" | "smooth",
    });
    if (!S.cur) {
      if (S.anchor) {
        const a = clone(S.anchor);
        S.anchor = null;
        S.cur = { id: newId("path"), type: "path", name: "bezier_path", role: "trace", closed: false, nodes: [node(a), node(p)] } as PathShape;
        autoSmoothPath(S.cur as PathShape);
        return;
      }
      S.cur = { id: newId("path"), type: "path", name: "bezier_path", role: "trace", closed: false, nodes: [node(p)] } as PathShape;
      return;
    }
    (S.cur as PathShape).nodes.push(node(p));
    autoSmoothPath(S.cur as PathShape);
  }

  private previewCurrentAt(raw: TracePoint, e: MouseEvent | null): boolean {
    const S = this.S;
    if (!S.cur) return false;
    const p = snapPoint(S, raw, { off: !!(e && e.altKey), includeCurrent: false });
    if (S.cur.type === "measure") { S.cur.points[1] = measureSnapPoint(S, raw, !!(e && e.altKey)); this.draw(); return true; }
    if (S.cur.type === "line") { S.cur.points[1] = p; this.draw(); return true; }
    if (S.cur.type === "rect") { S.cur.w = p.x - S.cur.x; S.cur.h = p.y - S.cur.y; this.draw(); return true; }
    if (S.cur.type === "circle") { S.cur.r = dist(p, { x: S.cur.cx, y: S.cur.cy }); this.draw(); return true; }
    return false;
  }

  // ------------------------------------------------------------- händelser

  private bindEvents(): void {
    this.cv.oncontextmenu = (e) => { e.preventDefault(); return false; };
    this.cv.onmousedown = (e) => this.onMouseDown(e);
    this.cv.onmousemove = (e) => this.onMouseMove(e);
    this.cv.ondblclick = () => {
      // Q1-fix: zone ingår i dubbelklicksavslut (spec §44.2.1).
      if (["poly", "mask", "pen", "zone"].includes(this.S.tool)) this.finishFromDblClick();
    };
    this.cv.onwheel = (e) => {
      e.preventDefault();
      const sp = this.scr(e);
      const b = this.toImg(sp);
      const f = Math.exp(-e.deltaY * 0.0012);
      this.S.view.s = Math.max(0.01, Math.min(64, this.S.view.s * f));
      this.S.view.x = sp.x - b.x * this.S.view.s;
      this.S.view.y = sp.y - b.y * this.S.view.s;
      this.draw();
    };
    window.addEventListener("mouseup", this.onWindowMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("paste", this.onPaste);
    if (this.dropEl) {
      for (const ev of ["dragenter", "dragover"]) {
        this.stage.addEventListener(ev, (e) => { e.preventDefault(); this.dropEl!.style.display = "flex"; });
      }
      for (const ev of ["dragleave", "drop"]) {
        this.stage.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "dragleave") this.dropEl!.style.display = "none"; });
      }
      this.stage.addEventListener("drop", (e) => {
        this.dropEl!.style.display = "none";
        const f = (e as DragEvent).dataTransfer?.files[0];
        if (!f) return;
        const n = f.name.toLowerCase();
        if (f.type.startsWith("image/")) this.loadImageFile(f);
        else if (n.endsWith(".engrove-trace") || n.endsWith(".engrove-project")) {
          const r = new FileReader();
          r.onload = (ev) => {
            try { this.openProjectPackage(JSON.parse(String(ev.target?.result)), f.name); }
            catch (err) { this.dialogs.alert("Project open error: " + (err instanceof Error ? err.message : String(err))); }
          };
          r.readAsText(f);
        } else if (n.endsWith(".json")) {
          const r = new FileReader();
          r.onload = (ev) => {
            try { this.openTraceObject(JSON.parse(String(ev.target?.result)), f.name); }
            catch (err) { this.dialogs.alert("Open error: " + (err instanceof Error ? err.message : String(err))); }
          };
          r.readAsText(f);
        }
      });
    }
  }

  private onMouseDown(e: MouseEvent): void {
    const S = this.S;
    const sp = this.scr(e);
    const raw = this.toImg(sp);
    if (e.button === 2) {
      e.preventDefault();
      this.drag = { mode: "zoom", sp, anchorSp: sp, anchorImg: raw, startS: S.view.s };
      S.snapHit = null;
      return;
    }
    if (e.button === 1 || S.space || S.tool === "pan") {
      e.preventDefault();
      this.drag = { mode: "pan", sp, view: { ...S.view } };
      S.snapHit = null;
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();

    if (originHit(S, raw)) {
      pushHist(S);
      S.sel = ORIGIN_SEL;
      this.drag = { mode: "origin", start: raw, orig: clone(S.frame.origin) };
      S.snapHit = null;
      this.sync(false);
      this.draw();
      return;
    }
    const twoPointActive = S.cur && ["measure", "line", "rect", "circle"].includes(S.cur.type);
    if (twoPointActive) {
      this.drag = { mode: "place2", sp, raw, moved: false };
      this.previewCurrentAt(raw, e);
      return;
    }
    const hn = hitNode(S, raw, true);
    if (hn) {
      if (S.tool === "select") {
        if (!hn.current) { S.sel = hn.shape.id; pushHist(S); }
        else S.sel = null;
        this.drag = { mode: "edit", hit: hn, start: raw, orig: clone(hn.shape) };
        S.snapHit = null;
        this.sync(false);
        this.draw();
        return;
      }
      this.drag = { mode: "nodeClickOrEdit", hit: hn, start: raw, sp, orig: clone(hn.shape), moved: false, histDone: false };
      S.snapHit = null;
      this.sync(false);
      this.draw();
      return;
    }
    if (S.tool === "select") {
      const h = hit(S, raw);
      if (h) {
        S.sel = h.shape.id;
        pushHist(S);
        this.drag = { mode: "edit", hit: h, start: raw, orig: clone(h.shape) };
      } else {
        S.sel = null;
        this.drag = { mode: "pending", sp, raw, view: { ...S.view }, moved: false };
      }
      this.sync(false);
      this.draw();
      return;
    }
    this.drag = { mode: "pending", sp, raw, view: { ...S.view }, moved: false };
    S.snapHit = null;
  }

  private onMouseMove(e: MouseEvent): void {
    const S = this.S;
    const sp = this.scr(e);
    const raw = this.toImg(sp);
    const p = snapPoint(S, raw, { off: e.altKey, includeCurrent: false });
    this.cb.onCursor(p.x, p.y);
    const drag = this.drag;
    if (drag) {
      if (drag.mode === "origin") {
        moveOriginTo(S, raw, drag.orig, drag.start);
        S.snapHit = null;
        this.sync(false);
        this.draw();
        return;
      }
      if (drag.mode === "place2") {
        drag.moved = true;
        this.previewCurrentAt(raw, e);
        return;
      }
      if (drag.mode === "nodeClickOrEdit") {
        const md = Math.hypot(sp.x - drag.sp.x, sp.y - drag.sp.y);
        if (md > 3) {
          if (!drag.hit.current && !drag.histDone) { pushHist(S); drag.histDone = true; }
          drag.moved = true;
          const editDrag: DragState = { mode: "edit", hit: drag.hit, start: drag.start, orig: drag.orig };
          this.drag = editDrag;
          this.runEdit(editDrag.hit, raw, editDrag.start, editDrag.orig);
          S.snapHit = null;
          this.sync(false);
          this.draw();
          return;
        }
        this.draw();
        return;
      }
      if (drag.mode === "pending") {
        const md = Math.hypot(sp.x - drag.sp.x, sp.y - drag.sp.y);
        if (md > 3) {
          const panDrag: DragState = { mode: "pan", sp: drag.sp, view: drag.view };
          (panDrag as { moved?: boolean }).moved = true;
          this.drag = panDrag;
          S.view.x = drag.view.x + sp.x - drag.sp.x;
          S.view.y = drag.view.y + sp.y - drag.sp.y;
          S.snapHit = null;
          this.draw();
          return;
        }
        this.draw();
        return;
      }
      if (drag.mode === "zoom") {
        const dy = drag.sp.y - sp.y, dx = sp.x - drag.sp.x;
        const f = Math.exp(dy * 0.010 + dx * 0.003);
        S.view.s = Math.max(0.01, Math.min(64, drag.startS * f));
        S.view.x = drag.anchorSp.x - drag.anchorImg.x * S.view.s;
        S.view.y = drag.anchorSp.y - drag.anchorImg.y * S.view.s;
        this.draw();
        return;
      }
      if (drag.mode === "pan") {
        S.view.x = drag.view.x + sp.x - drag.sp.x;
        S.view.y = drag.view.y + sp.y - drag.sp.y;
        S.snapHit = null;
        this.draw();
        return;
      }
      if (drag.mode === "edit") {
        this.runEdit(drag.hit, raw, drag.start, drag.orig);
        S.snapHit = null;
        this.sync(false);
        this.draw();
        return;
      }
    }
    if (this.previewCurrentAt(raw, e)) return;
    this.draw();
  }

  private runEdit(h: ShapeHit, p: TracePoint, start: TracePoint, orig: TraceShape): void {
    editShape(
      this.S, h, p, start, orig,
      (q, ori, ex) => snapStationCoord(this.S, q, ori, ex),
      (q) => measureSnapPoint(this.S, q, false),
      () => updateMeasurements(this.S),
    );
  }

  private onWindowMouseUp = (e: MouseEvent): void => {
    const drag = this.drag;
    if (drag && drag.mode === "place2") {
      this.clickToolAt(this.toImg(this.scr(e)), e);
      this.drag = null;
      this.S.snapHit = null;
      this.draw();
      return;
    }
    if (drag && drag.mode === "nodeClickOrEdit") {
      if (!drag.moved) this.clickToolAt(drag.start, e);
      this.drag = null;
      this.S.snapHit = null;
      this.draw();
      return;
    }
    if (drag && drag.mode === "pending" && !drag.moved) {
      this.clickToolAt(drag.raw, e);
    }
    this.drag = null;
    this.S.snapHit = null;
    this.draw();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      if (!this.cb.isTextInputActive()) { this.S.space = true; e.preventDefault(); }
    }
    if (e.key === "Escape") { this.S.cur = null; this.drag = null; this.draw(); }
    if ((e.key === "Delete" || e.key === "Backspace") && !this.cb.isTextInputActive()) this.del();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !this.cb.isTextInputActive()) { e.preventDefault(); this.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !this.cb.isTextInputActive()) { e.preventDefault(); this.redo(); }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.S.space = false;
  };

  private onPaste = (e: ClipboardEvent): void => {
    if (this.cb.isTextInputActive()) return;
    if (!e.clipboardData) return;
    for (const it of e.clipboardData.items) {
      if (it.type.startsWith("image/")) {
        this.loadImageFile(it.getAsFile());
        e.preventDefault();
        break;
      }
    }
  };

  // ------------------------------------------------------------- rendering

  private sync(refreshJson = true): void {
    ensureAllMeta(this.S);
    enforceAxes(this.S);
    this.cb.onSync(refreshJson);
    this.draw();
  }

  /** Publikt: host anropar efter externa mutationer (metadata-panel etc.). */
  refresh(refreshJson = true): void {
    this.sync(refreshJson);
  }

  draw(): void {
    const S = this.S;
    const cx = this.cx;
    const r = this.stage.getBoundingClientRect();
    cx.clearRect(0, 0, r.width, r.height);
    this.drawGrid(r.width, r.height);
    cx.save();
    cx.translate(S.view.x, S.view.y);
    cx.scale(S.view.s, S.view.s);
    if (S.img && S.img._im) cx.drawImage(S.img._im as CanvasImageSource, 0, 0);
    else { cx.fillStyle = "#0c121d"; cx.fillRect(0, 0, 1000, 700); }
    this.drawFrame();
    S.shapes.forEach((s) => this.drawShape(s, s.id === S.sel));
    if (S.cur) this.drawShape(S.cur, true, true);
    this.drawSnap();
    cx.restore();
  }

  private drawGrid(w: number, h: number): void {
    const S = this.S;
    if (!S.grid) return;
    const st = 64 * S.view.s;
    if (st < 8) return;
    const cx = this.cx;
    cx.save();
    cx.strokeStyle = "rgba(183,255,0,.08)";
    cx.lineWidth = 1;
    for (let x = S.view.x % st; x < w; x += st) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, h); cx.stroke(); }
    for (let y = S.view.y % st; y < h; y += st) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(w, y); cx.stroke(); }
    cx.restore();
  }

  private drawFrame(): void {
    const S = this.S;
    const cx = this.cx;
    const o = S.frame.origin;
    if (!o) return;
    cx.save();
    cx.lineWidth = 1.4 / S.view.s;
    cx.strokeStyle = "#ff4d6d";
    cx.fillStyle = "#ff4d6d";
    cx.beginPath(); cx.arc(o.x, o.y, 7 / S.view.s, 0, Math.PI * 2); cx.stroke();
    cx.beginPath();
    cx.moveTo(o.x - 12 / S.view.s, o.y); cx.lineTo(o.x + 12 / S.view.s, o.y);
    cx.moveTo(o.x, o.y - 12 / S.view.s); cx.lineTo(o.x, o.y + 12 / S.view.s);
    cx.stroke();
    cx.font = `${11 / S.view.s}px Segoe UI`;
    cx.fillText("origin", o.x + 10 / S.view.s, o.y - 8 / S.view.s);
    const colors: Record<string, string> = { x: "#b7ff00", y: "#00e5d4", z: "#ff66cc" };
    for (const k of ["x", "y", "z"] as const) {
      const v = S.frame.axes[k];
      const vec = axisVec2(v);
      cx.strokeStyle = colors[k];
      cx.fillStyle = colors[k];
      cx.lineWidth = 1.6 / S.view.s;
      if (vec) {
        cx.beginPath();
        cx.moveTo(o.x, o.y);
        cx.lineTo(o.x + (55 * vec.x) / S.view.s, o.y + (55 * vec.y) / S.view.s);
        cx.stroke();
        cx.fillText(k.toUpperCase(), o.x + (62 * vec.x + 3) / S.view.s, o.y + (62 * vec.y + 3) / S.view.s);
      } else {
        const rr = 8 / S.view.s;
        cx.beginPath(); cx.arc(o.x, o.y, rr, 0, Math.PI * 2); cx.stroke();
        if (axisSign(v) > 0) { cx.beginPath(); cx.arc(o.x, o.y, 2.4 / S.view.s, 0, Math.PI * 2); cx.fill(); }
        else {
          cx.beginPath();
          cx.moveTo(o.x - rr * 0.7, o.y - rr * 0.7); cx.lineTo(o.x + rr * 0.7, o.y + rr * 0.7);
          cx.moveTo(o.x + rr * 0.7, o.y - rr * 0.7); cx.lineTo(o.x - rr * 0.7, o.y + rr * 0.7);
          cx.stroke();
        }
        cx.fillText(k.toUpperCase(), o.x + 12 / S.view.s, o.y + 12 / S.view.s);
      }
    }
    cx.restore();
  }

  private strokeStyleFor(s: TraceShape, selected: boolean, temp: boolean): void {
    const cx = this.cx;
    const S = this.S;
    cx.lineWidth = (selected ? 2.2 : s.style?.width || 1.4) / S.view.s;
    cx.strokeStyle = temp ? "#fff" : selected ? C.sel : s.style?.stroke || C[s.type] || C.path;
    cx.fillStyle = s.style?.fill || C[s.type] || C.path;
    cx.setLineDash(s.role === "ignore_mask" ? [8 / S.view.s, 5 / S.view.s] : []);
  }

  private pt(p: TracePoint, col: string, r = 4): void {
    const cx = this.cx;
    cx.save();
    cx.fillStyle = col;
    cx.strokeStyle = "#111";
    cx.lineWidth = 1 / this.S.view.s;
    cx.beginPath();
    cx.arc(p.x, p.y, r / this.S.view.s, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();
    cx.restore();
  }

  private drawShape(s: TraceShape, selected = false, temp = false): void {
    const cx = this.cx;
    const S = this.S;
    cx.save();
    this.strokeStyleFor(s, selected, temp);
    cx.beginPath();
    if (s.type === "station") {
      const ori = s.orientation || "vertical";
      cx.font = `${11 / S.view.s}px Segoe UI`;
      if (ori === "horizontal") {
        const y = s.y ?? s.y1 ?? 0;
        cx.moveTo(s.x1 ?? 0, y);
        cx.lineTo(s.x2 ?? imgW(S), y);
        cx.stroke();
        cx.save();
        cx.fillStyle = s.style?.stroke || "#5d7cff";
        cx.fillText(s.name || "station", (s.x1 ?? 0) + 4 / S.view.s, y - 4 / S.view.s);
        cx.restore();
      } else {
        cx.moveTo(s.x!, s.y1 ?? 0);
        cx.lineTo(s.x!, s.y2 ?? imgH(S));
        cx.stroke();
        cx.save();
        cx.fillStyle = s.style?.stroke || "#5d7cff";
        cx.fillText(s.name || "station", s.x! + 4 / S.view.s, (s.y1 ?? 0) + 16 / S.view.s);
        cx.restore();
      }
    } else if (s.type === "line") {
      cx.moveTo(s.points[0].x, s.points[0].y);
      cx.lineTo(s.points[1].x, s.points[1].y);
      cx.stroke();
    } else if (s.type === "measure") {
      const a = s.points[0], b = s.points[1];
      cx.moveTo(a.x, a.y);
      cx.lineTo(b.x, b.y);
      cx.stroke();
      const px = measureLen(s);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cx.save();
      cx.fillStyle = s.is_scale_reference ? "#ff66cc" : "#ffd84d";
      cx.font = `${12 / S.view.s}px Segoe UI`;
      let lbl = (s.is_scale_reference ? "REF " : "") + px.toFixed(1) + " px";
      if (s.real_length) lbl += " = " + Number(s.real_length).toFixed(3) + " " + (s.unit || "mm");
      cx.fillText(lbl, mid.x + 6 / S.view.s, mid.y - 6 / S.view.s);
      cx.restore();
    } else if (s.type === "rect") {
      cx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === "circle") {
      cx.arc(s.cx, s.cy, Math.abs(s.r), 0, Math.PI * 2);
      cx.stroke();
    } else if (s.type === "poly" || s.type === "mask" || s.type === "zone") {
      if (s.points.length) {
        cx.moveTo(s.points[0].x, s.points[0].y);
        s.points.slice(1).forEach((p) => cx.lineTo(p.x, p.y));
        if (s.closed || s.type === "zone") cx.closePath();
        if (s.type === "zone") {
          cx.save();
          cx.globalAlpha = s.style?.fill_alpha ?? 0.18;
          cx.fillStyle = s.style?.fill || C.zone;
          cx.fill();
          cx.restore();
          cx.stroke();
        } else {
          cx.stroke();
          if (s.type === "mask") { cx.globalAlpha = 0.09; cx.fill(); cx.globalAlpha = 1; }
        }
      }
    } else if (s.type === "path") {
      this.pathDraw(s);
    }
    cx.setLineDash([]);
    if ((selected || temp) && S.pts) this.drawHandles(s);
    cx.restore();
  }

  private pathDraw(s: PathShape): void {
    const cx = this.cx;
    if (!s.nodes?.length) return;
    cx.beginPath();
    cx.moveTo(s.nodes[0].x, s.nodes[0].y);
    for (let i = 1; i < s.nodes.length; i++) {
      const a = s.nodes[i - 1], b = s.nodes[i], c1 = a.out || a, c2 = b.in || b;
      cx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    }
    if (s.closed && s.nodes.length > 2) {
      const a = s.nodes[s.nodes.length - 1], b = s.nodes[0], c1 = a.out || a, c2 = b.in || b;
      cx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      cx.closePath();
    }
    cx.stroke();
  }

  private drawHandles(s: TraceShape): void {
    const S = this.S;
    const cx = this.cx;
    if (s.type === "station") {
      const ori = s.orientation || "vertical";
      if (ori === "horizontal") {
        const y = s.y ?? s.y1 ?? 0;
        this.pt({ x: s.x1 ?? 0, y }, C.h);
        this.pt({ x: s.x2 ?? imgW(S), y }, C.h);
        this.pt({ x: ((s.x1 ?? 0) + (s.x2 ?? imgW(S))) / 2, y }, C.out, 3.5);
      } else {
        this.pt({ x: s.x!, y: s.y1 ?? 0 }, C.h);
        this.pt({ x: s.x!, y: s.y2 ?? imgH(S) }, C.h);
        this.pt({ x: s.x!, y: ((s.y1 ?? 0) + (s.y2 ?? imgH(S))) / 2 }, C.out, 3.5);
      }
    } else if (s.type === "line") s.points.forEach((p) => this.pt(p, C.h));
    else if (s.type === "measure") s.points.forEach((p, i) => this.pt(p, i === 0 ? C.in : C.out, 5));
    else if (s.type === "poly" || s.type === "mask" || s.type === "zone")
      s.points.forEach((p) => this.pt(p, s.type === "mask" ? C.mask : s.type === "zone" ? C.zone : C.h, 3.8));
    else if (s.type === "rect") corners(s).forEach((p) => this.pt(p, C.h));
    else if (s.type === "circle") { this.pt({ x: s.cx, y: s.cy }, C.h); this.pt({ x: s.cx + s.r, y: s.cy }, C.out); }
    else if (s.type === "path") {
      s.nodes.forEach((n) => {
        if (n.in) {
          cx.strokeStyle = C.in;
          cx.lineWidth = 1 / S.view.s;
          cx.beginPath(); cx.moveTo(n.x, n.y); cx.lineTo(n.in.x, n.in.y); cx.stroke();
          this.pt(n.in, C.in, 3);
        }
        if (n.out) {
          cx.strokeStyle = C.out;
          cx.lineWidth = 1 / S.view.s;
          cx.beginPath(); cx.moveTo(n.x, n.y); cx.lineTo(n.out.x, n.out.y); cx.stroke();
          this.pt(n.out, C.out, 3);
        }
        this.pt(n, C.h, 4);
      });
    }
  }

  private drawSnap(): void {
    const S = this.S;
    if (!S.snapHit) return;
    const cx = this.cx;
    cx.save();
    cx.strokeStyle = "#b7ff00";
    cx.fillStyle = "#b7ff0033";
    cx.lineWidth = 2 / S.view.s;
    cx.beginPath();
    cx.arc(S.snapHit.x, S.snapHit.y, (S.snapPx || 14) / S.view.s, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();
    cx.beginPath();
    cx.moveTo(S.snapHit.x - 7 / S.view.s, S.snapHit.y);
    cx.lineTo(S.snapHit.x + 7 / S.view.s, S.snapHit.y);
    cx.moveTo(S.snapHit.x, S.snapHit.y - 7 / S.view.s);
    cx.lineTo(S.snapHit.x, S.snapHit.y + 7 / S.view.s);
    cx.stroke();
    cx.restore();
  }

  // ------------------------------------------------------------- statiskt
  static stationOrientationOf(S: TraceState): "vertical" | "horizontal" {
    return stationOrientation(S);
  }
}
