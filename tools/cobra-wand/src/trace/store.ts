/**
 * TraceStore — flertrace-container för 3D-genereringspipelinen.
 *
 * Håller flera NAMNGIVNA TraceDocument (var och en = en serialiserad
 * TraceState + Rev C `trace_meta` med perspektiv/funktion). Detta är
 * 3D-verktygets projektnivå ("engrove_trace3d_project_v1") och ligger OVANPÅ
 * v15:s enskilda sessionspaket: varje dokument kan bryggas till/från ett
 * `.engrove-trace`-paket (project.ts).
 *
 * Serialisering strippar `img._im` (Image-instansen kan inte serialiseras;
 * dataUrl bevaras). Editorn återhydrerar `_im` via rehydrateImage() efter
 * setState.
 */
import {
  clone, createTraceState, type TraceMeta, type TraceState,
} from "./model.js";
import {
  applyProjectPackage, projectPayload, safeFileBase, type ProjectPackage,
} from "./project.js";
import { updateMeasurements } from "./frame.js";
import type { CobraParams } from "../core/types.js";

export const TRACE3D_PROJECT_SCHEMA = "engrove_trace3d_project_v1";
const LS_KEY = "engrove_trace3d_store";

/** TraceState utan den icke-serialiserbara Image-instansen. */
export type SerializedTraceState = Omit<TraceState, "img"> & {
  img: { name: string; width: number; height: number; dataUrl: string } | null;
};

export interface TraceDocument {
  id: string;
  meta: TraceMeta;
  state: SerializedTraceState;
}

export interface Trace3DProjectFile {
  schema_version: typeof TRACE3D_PROJECT_SCHEMA;
  saved_at: string;
  traces: TraceDocument[];
  activeId: string | null;
  params: CobraParams | null;
  provenance: { createdAt: string; note: string };
}

function docId(): string {
  return "tracedoc_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now().toString(36).slice(-4);
}

/** Djupklon som tappar `_im` (drar bort Image-instansen ur img). */
export function serializeState(S: TraceState): SerializedTraceState {
  const img = S.img ? { name: S.img.name, width: S.img.width, height: S.img.height, dataUrl: S.img.dataUrl } : null;
  const bare: TraceState = { ...S, img: S.img ? { ...S.img, _im: undefined } : null };
  const c = clone(bare) as SerializedTraceState;
  c.img = img;
  c.snapHit = null;
  c.cur = c.cur; // pågående objekt bevaras (v15-paritet)
  return c;
}

/** Bygger en live-TraceState (utan _im) ur ett serialiserat dokument. */
export function deserializeState(s: SerializedTraceState): TraceState {
  const live = clone(s) as unknown as TraceState;
  return live;
}

export class TraceStore {
  private docs: TraceDocument[] = [];
  private active: string | null = null;

  get documents(): readonly TraceDocument[] { return this.docs; }
  get activeId(): string | null { return this.active; }

  list(): { id: string; meta: TraceMeta; shapeCount: number; hasImage: boolean }[] {
    return this.docs.map((d) => ({
      id: d.id, meta: d.meta,
      shapeCount: d.state.shapes.length, hasImage: !!d.state.img,
    }));
  }

  get(id: string): TraceDocument | undefined {
    return this.docs.find((d) => d.id === id);
  }

  /** Skapar ett nytt tomt dokument och gör det aktivt. Namn görs unikt. */
  add(meta?: Partial<TraceMeta>): TraceDocument {
    const name = this.uniqueName(meta?.trace_name);
    const st = createTraceState({ ...meta, trace_name: name });
    st.meta.trace_name = name;
    const doc: TraceDocument = { id: docId(), meta: clone(st.meta), state: serializeState(st) };
    this.docs.push(doc);
    this.active = doc.id;
    return doc;
  }

  /**
   * Skriver tillbaka aktuellt live-tillstånd till ett dokument. Kör
   * updateMeasurements() innan serialisering så att real_length/
   * computed_real_length alltid är färska i det sparade dokumentet —
   * measure_sync-prompten (promptTypes.ts) läser dessa fält direkt ur
   * TraceDocument.state utan att själv räkna om dem.
   */
  update(id: string, S: TraceState): void {
    const doc = this.get(id);
    if (!doc) return;
    updateMeasurements(S);
    doc.state = serializeState(S);
    doc.meta = clone(S.meta);
  }

  rename(id: string, name: string): void {
    const doc = this.get(id);
    if (!doc) return;
    const uniq = this.uniqueName(name, id);
    doc.meta.trace_name = uniq;
    doc.state.meta.trace_name = uniq;
  }

  setMeta(id: string, patch: Partial<TraceMeta>): void {
    const doc = this.get(id);
    if (!doc) return;
    if (patch.trace_name !== undefined) { this.rename(id, patch.trace_name); delete patch.trace_name; }
    doc.meta = { ...doc.meta, ...patch };
    doc.state.meta = { ...doc.state.meta, ...patch };
  }

  duplicate(id: string): TraceDocument | null {
    const doc = this.get(id);
    if (!doc) return null;
    const name = this.uniqueName(doc.meta.trace_name + "_copy");
    const copy: TraceDocument = {
      id: docId(),
      meta: { ...clone(doc.meta), trace_name: name },
      state: { ...clone(doc.state), meta: { ...clone(doc.state.meta), trace_name: name } },
    };
    const ix = this.docs.findIndex((d) => d.id === id);
    this.docs.splice(ix + 1, 0, copy);
    this.active = copy.id;
    return copy;
  }

  remove(id: string): void {
    const ix = this.docs.findIndex((d) => d.id === id);
    if (ix < 0) return;
    this.docs.splice(ix, 1);
    if (this.active === id) this.active = this.docs[Math.min(ix, this.docs.length - 1)]?.id ?? null;
  }

  setActive(id: string): void {
    if (this.get(id)) this.active = id;
  }

  private uniqueName(base?: string, exceptId?: string): string {
    const wanted = (base && base.trim()) || "trace";
    const taken = new Set(this.docs.filter((d) => d.id !== exceptId).map((d) => d.meta.trace_name));
    if (!taken.has(wanted)) return wanted;
    let n = 2;
    while (taken.has(`${wanted}_${n}`)) n++;
    return `${wanted}_${n}`;
  }

  // ------------------------------------------------------------- v15-brygga

  /** Ett dokument → v15-sessionspaket (för `.engrove-trace`-export per trace). */
  documentToPackage(id: string): ProjectPackage | null {
    const doc = this.get(id);
    if (!doc) return null;
    const live = deserializeState(doc.state);
    const pkg = projectPayload(live);
    pkg.project.name = pkg.project.name || safeFileBase(doc.meta.trace_name);
    return pkg;
  }

  /** v15-sessionspaket → nytt dokument (import av `.engrove-trace`). */
  addFromPackage(pkg: unknown, fileName = "imported.engrove-trace", meta?: Partial<TraceMeta>): TraceDocument {
    const st = createTraceState(meta);
    applyProjectPackage(st, pkg, fileName);
    if (meta) st.meta = { ...st.meta, ...meta };
    st.meta.trace_name = this.uniqueName(meta?.trace_name || st.project_meta.name || "imported_trace");
    const doc: TraceDocument = { id: docId(), meta: clone(st.meta), state: serializeState(st) };
    this.docs.push(doc);
    this.active = doc.id;
    return doc;
  }

  // ------------------------------------------------------------- persistens

  toProjectFile(params: CobraParams | null): Trace3DProjectFile {
    return {
      schema_version: TRACE3D_PROJECT_SCHEMA,
      saved_at: new Date().toISOString(),
      traces: clone(this.docs),
      activeId: this.active,
      params: params ? clone(params) : null,
      provenance: { createdAt: new Date().toISOString(), note: "Engrove Alien LT trace3d project" },
    };
  }

  /** Läser in ett 3D-projekt. Returnerar medskickade params (för host). */
  fromProjectFile(obj: unknown): { params: CobraParams | null } {
    const o = obj as Partial<Trace3DProjectFile>;
    if (!o || o.schema_version !== TRACE3D_PROJECT_SCHEMA || !Array.isArray(o.traces)) {
      throw new Error("Not an Engrove trace3d project file.");
    }
    this.docs = clone(o.traces);
    this.active = o.activeId ?? this.docs[0]?.id ?? null;
    return { params: o.params ?? null };
  }

  saveLocal(params: CobraParams | null): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.toProjectFile(params)));
    } catch {
      /* localStorage kan vara otillgänglig (privat läge / kvot) — tyst. */
    }
  }

  loadLocal(): { params: CobraParams | null } | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return this.fromProjectFile(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  clear(): void {
    this.docs = [];
    this.active = null;
  }
}
