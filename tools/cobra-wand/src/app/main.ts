/**
 * Engrove Alien LT — Trace→3D orkestrator (Rev C).
 *
 * Arkitektur: två flikar delar samma process.
 *   "2D Trace" — TraceEditor (v18) + TraceStore (multi-trace) + v15-projekt.
 *   "3D Modell" — tom start, parametrisk OCCT-motor, AI prompt-pipeline (5 steg),
 *                 gated export (STL/STEP), proveniens.
 *
 * Beroenden:
 *   trace/*  — v18 trace-subsystem (editor, svg-trace, panel-layout, store, export)
 *   core/*   — CobraParams/motor/AI/schema/export
 *   app/*    — panel.ts (3D-param-panel), viewport.ts (Three.js), styles.css
 *
 * GitHub-ready: inga globala sidoeffekter utanför main(); inga fristående IIFE:ar.
 */
import { getOC, type OC } from "../core/oc/load.js";
import {
  buildGeometry, EXPORT_QUALITY, PREVIEW_QUALITY, tessellate,
  type GeometryResult,
} from "../core/geometry/engine.js";
import { meshToBinarySTL, verifyMesh } from "../core/export/stl.js";
import { writeSTEP } from "../core/export/step.js";
import { buildSidecar, computeParameterHash, type SidecarExportEntry } from "../core/export/sidecar.js";
import { runManufacturabilityChecks } from "../core/checks/manufacturability.js";
import {
  applyImport, importAiResponse, ProvenanceLog,
  type ProvenanceStorage,
} from "../core/ai/protocol.js";
import {
  buildTraceTo3DPrompt, buildProtoRefinePrompt, buildZoneDetailPrompt,
  buildMeasureSyncPrompt, buildFreeFormPrompt, buildZoneRegistry,
  type PromptType, type ZoneTarget,
} from "../core/ai/promptTypes.js";
import type { CheckResult, CobraParams, ProvenanceEntry } from "../core/types.js";
import { defaultParams, TOOL_VERSION } from "../core/defaults.js";
import { buildPanel, type PanelHandle } from "./panel.js";
import { Viewport, type ViewMode } from "./viewport.js";

import { TraceEditor } from "../trace/editor.js";
import { TraceStore, type TraceDocument } from "../trace/store.js";
import { outObj, buildSvg } from "../trace/export.js";
import {
  applyProjectPackage, applyTraceObject, projectPayload, safeFileBase,
} from "../trace/project.js";
import {
  AXIS_OPTIONS, axisVec2, axisSign,
  enforceAxes, updateMeasurements,
} from "../trace/frame.js";
import {
  clearSvgCandidates, detectSvgCandidates, focusActiveSvgCandidate,
  repairSvgTraceLinks, reverseSelectedShape, safeSvgText,
  setSvgCandidateStatus, smartDeleteNode, smartInsertNode, smartSimplifySelected,
  svgCandidateAt, svgCoordinateFrame, traceSvgCandidates, traceIncludedSvg,
  activeSvgCandidate,
} from "../trace/svg-trace.js";
import {
  applyPanelWidth, installPanelResizer, restorePanelLayout,
} from "../trace/panel-layout.js";
import { ensureSvgTrace, type TraceMeta } from "../trace/model.js";

// ---------------------------------------------------------------- typer

declare global {
  interface Window {
    cobraBridge?: {
      saveFile(name: string, base64: string): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
    };
  }
}

// ---------------------------------------------------------------- hjälpare

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Saknat element: #${id}`);
  return el as T;
};
const $maybe = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

class LocalStorageProvenance implements ProvenanceStorage {
  private key = "engrove.provenance.v1";
  load(): ProvenanceEntry[] {
    try { return JSON.parse(localStorage.getItem(this.key) ?? "[]") as ProvenanceEntry[]; }
    catch { return []; }
  }
  save(entries: ProvenanceEntry[]): void {
    localStorage.setItem(this.key, JSON.stringify(entries.slice(-200)));
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => { clearTimeout(t); t = setTimeout(fn, ms); };
}

function toBase64(data: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < data.length; i += CH) s += String.fromCharCode(...data.subarray(i, i + CH));
  return btoa(s);
}

async function saveFile(name: string, data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (window.cobraBridge) {
    const r = await window.cobraBridge.saveFile(name, toBase64(bytes));
    if (r.canceled) return "avbruten";
    if (!r.ok) throw new Error(r.error ?? "okänt fel i sparbryggan");
    return `sparad: ${r.path}`;
  }
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  return `nedladdad: ${name}`;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmt(v: unknown): string { return v === undefined ? "—" : JSON.stringify(v); }

// ---------------------------------------------------------------- tillstånd

let oc: OC;
let params: CobraParams | null = null; // null = tom start (Rev C)
let geo: GeometryResult | null = null;
let panel: PanelHandle | null = null;
let viewport: Viewport;
let lastPromptId: string | null = null;
let pendingCandidate: CobraParams | null = null;
let pendingDiffCount = 0;
const sessionExports: SidecarExportEntry[] = [];
const provenance = new ProvenanceLog(new LocalStorageProvenance());

const store = new TraceStore();
let editor: TraceEditor;
let activeDocId: string | null = null;

// ---------------------------------------------------------------- 3D-motor

function setOverlay(visible: boolean, text = "Bygger geometri …"): void {
  $maybe("buildOverlayText") && ($("buildOverlayText").textContent = text);
  $maybe("buildOverlay")?.classList.toggle("hidden", !visible);
}

async function regen(): Promise<void> {
  if (!params) { viewport.clear(); return; }
  setOverlay(true);
  $("statusLine").textContent = "";
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  try {
    const next = buildGeometry(oc, params, PREVIEW_QUALITY);
    geo?.dispose();
    geo = next;
    const plugMesh = tessellate(oc, geo.plugShape, PREVIEW_QUALITY.linDeflection_mm, PREVIEW_QUALITY.angDeflection_rad);
    viewport.setMeshes(geo.partMesh, plugMesh, geo.shellMesh);
    viewport.setStations(params);
    renderHud();
    renderChecks(runManufacturabilityChecks(params, geo));
    void updateHashLabel();
    $("emptyState").classList.add("hidden");
    $("modelState").textContent = `Alien LT · L=${params.globalDimensions.functionalLength_mm.toFixed(1)} mm`;
  } catch (e) {
    $("statusLine").textContent = `Geometrifel: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    setOverlay(false);
  }
}

const regenDebounced = debounce(() => void regen(), 300);

// ---------------------------------------------------------------- workspace-autosave
//
// EN autosave täcker BÅDA sidorna av symbiosen mellan trace och 3D: alla
// namngivna traces (TraceStore) OCH aktuella 3D-parametrar sparas tillsammans
// i localStorage (engrove_trace3d_store, se store.ts). Appen hostas över
// HTTPS (Cloudflare Pages) eller file://; i file://-läget är localStorage
// odefinierat mellan webbläsare (MDN), så autosave/återställning är
// best-effort där — saveLocal/loadLocal fångar redan interna undantag tyst.

function autosaveNow(): void {
  store.saveLocal(params);
  const el = $maybe("autosaveStatus");
  if (el) el.textContent = `Autosparad ${new Date().toLocaleTimeString()}`;
}
const autosaveWorkspace = debounce(autosaveNow, 800);

/** Körs INNAN buildTraceEditor(): läser en tidigare autosparad session. */
function restoreWorkspaceOnStartup(): boolean {
  const r = store.loadLocal();
  if (!r || store.documents.length === 0) return false;
  params = r.params;
  return true;
}

function renderHud(): void {
  if (!geo) return;
  const w = verifyMesh(geo.partMesh);
  const { min, max } = geo.metrics.bbox;
  const dims = `${(max[0] - min[0]).toFixed(1)} × ${(max[1] - min[1]).toFixed(1)} × ${(max[2] - min[2]).toFixed(1)} mm`;
  $("hud").innerHTML =
    `regen ${geo.metrics.regenMs} ms\n` +
    `V_del ${(geo.metrics.volumePart_mm3 / 1000).toFixed(2)} cm³\n` +
    `bbox ${dims}\n` +
    `watertight <span class="${w.watertight ? "ok" : "bad"}">${w.watertight ? "PASS" : "FAIL"}</span>` +
    (geo.brepValid === null ? "" : `\nbrepcheck ${geo.brepValid ? "PASS" : "FAIL"}`);
}

function renderChecks(checks: CheckResult[]): void {
  const host = $("checksPanel");
  host.innerHTML = "";
  for (const c of checks) {
    const row = document.createElement("div");
    row.className = "check-row";
    row.innerHTML = `<span class="st ${c.status}">${c.status}</span><span class="lbl">${c.label}</span><span class="det">${c.detail}</span>`;
    host.append(row);
  }
}

async function updateHashLabel(): Promise<void> {
  if (!params) { $maybe("hashLabel") && ($("hashLabel").textContent = "—"); return; }
  const h = await computeParameterHash(params);
  $maybe("hashLabel") && ($("hashLabel").textContent = h.slice(0, 12));
}

// ---------------------------------------------------------------- tabbar

function setTab(tab: "trace" | "model3d"): void {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>(".tabview").forEach((v) => v.classList.toggle("active", v.id === "view" + (tab === "trace" ? "Trace" : "Model3d")));
}

function wireTabbar(): void {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab as "trace" | "model3d"));
  });
}

// ---------------------------------------------------------------- trace-UI (v18)

function renderDocList(): void {
  const box = $maybe("tDocList");
  if (!box) return;
  box.innerHTML = "";
  store.list().forEach((d) => {
    const row = document.createElement("div");
    row.className = "doc-row" + (d.id === store.activeId ? " active" : "");
    row.innerHTML = `<span class="dn">${esc(d.meta.trace_name)}</span><span class="dp">${d.meta.perspective}</span><span class="ds">${d.shapeCount} shapes${d.hasImage ? " · img" : ""}</span>`;
    row.addEventListener("click", () => activateDoc(d.id));
    box.append(row);
  });
  // Uppdatera trace-väljare för AI-prompt
  renderPromptTracePicker();
}

function activateDoc(id: string): void {
  const prev = store.activeId;
  // prev !== id guard: annars skulle activateDoc(currentlyActiveId) skriva över
  // dokumentets state med editorns ANNU-EJ-HYDRERADE state (t.ex. direkt efter
  // att en ny TraceEditor konstruerats vid sessionsåterställning i main()).
  if (prev && prev !== id && editor) store.update(prev, editor.S);
  store.setActive(id);
  activeDocId = id;
  const doc = store.get(id);
  if (!doc) return;
  const live = { ...doc.state };
  editor.setState(live as never);
  editor.rehydrateImage();
  renderDocList();
  syncDocMetaPanel();
}

function syncDocMetaPanel(): void {
  const doc = store.get(store.activeId || "");
  if (!doc) return;
  ($maybe<HTMLInputElement>("tDocName") || {} as HTMLInputElement).value = doc.meta.trace_name;
  ($maybe<HTMLSelectElement>("tDocPerspective") || {} as HTMLSelectElement).value = doc.meta.perspective;
  ($maybe<HTMLSelectElement>("tDocFunction") || {} as HTMLSelectElement).value = doc.meta.trace_function;
  ($maybe<HTMLTextAreaElement>("tDocDesc") || {} as HTMLTextAreaElement).value = doc.meta.description;
}

function saveActiveDoc(): void {
  if (editor && store.activeId) store.update(store.activeId, editor.S);
}

/**
 * Patchar aktiva dokumentets metadata (namn/perspektiv/funktion/beskrivning)
 * via metadatapanelen. MÅSTE ÄVEN patcha editor.S.meta — annars vinner den
 * levande editorns (oförändrade) meta nästa gång saveActiveDoc()/store.update()
 * körs (t.ex. vid varje trace-mutation, dokumentbyte eller Save Workspace),
 * vilket tyst river upp panelens ändring. store.setMeta() ensamt räcker inte:
 * det skriver bara storens kopia, inte den editor som fortsatt är i bruk.
 */
function applyMetaPatchToActiveDoc(patch: Partial<TraceMeta>): void {
  if (!store.activeId) return;
  store.setMeta(store.activeId, patch);
  const doc = store.get(store.activeId);
  if (doc && editor) editor.S.meta = { ...editor.S.meta, ...doc.meta };
}

function renderPromptTracePicker(): void {
  const box = $maybe("promptTraceList");
  if (!box) return;
  box.innerHTML = "";
  store.list().forEach((d) => {
    const la = document.createElement("label");
    const ck = document.createElement("input");
    ck.type = "checkbox"; ck.value = d.id; ck.checked = true;
    la.append(ck, ` ${esc(d.meta.trace_name)} [${d.meta.perspective}]`);
    box.append(la);
  });
}

function renderPromptZonePicker(): void {
  const box = $maybe("promptZoneList");
  if (!box) return;
  box.innerHTML = "";
  // Adresserade via (traceId, shapeId) — se buildZoneRegistry — inte namn, eftersom
  // samma zonnamn kan förekomma i flera traces (t.ex. top_view + side_view) och
  // annars skulle kollapsas ihop till ett odelbart mål i väljaren.
  buildZoneRegistry(store.documents as TraceDocument[]).forEach((z) => {
    const la = document.createElement("label");
    const ck = document.createElement("input");
    ck.type = "checkbox"; ck.value = `${z.traceId}::${z.shapeId}`; ck.checked = true;
    la.append(ck, ` ${esc(z.name)} `, Object.assign(document.createElement("span"), {
      className: "dp", textContent: `[${z.traceName}]`,
    }));
    box.append(la);
  });
}

// ---------------------------------------------------------------- AI-pipeline (5 prompt-typer)

function getSelectedTraceIds(): string[] {
  const box = $maybe("promptTraceList");
  if (!box) return store.list().map((d) => d.id);
  return [...box.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value);
}

function getSelectedZoneTargets(): ZoneTarget[] {
  const box = $maybe("promptZoneList");
  if (!box) return [];
  return [...box.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => {
    const [traceId, shapeId] = i.value.split("::");
    return { traceId, shapeId };
  });
}

function wireAiPanel(): void {
  const typeEl = $maybe<HTMLSelectElement>("promptType");
  typeEl?.addEventListener("change", () => {
    const t = typeEl.value as PromptType;
    $maybe("traceSelectRow")?.classList.toggle("hidden", t === "measure_sync" || t === "free_form");
    $maybe("zoneSelectRow")?.classList.toggle("hidden", t !== "zone_detail");
    if (t === "zone_detail") renderPromptZonePicker();
  });

  $maybe("btnCopyPrompt")?.addEventListener("click", () => {
    void (async () => {
      if (!oc) { $("importResult").innerHTML = `<span class="dim">OC ej laddat ännu.</span>`; return; }
      const type = (typeEl?.value as PromptType) || "free_form";
      const goal = ($maybe<HTMLTextAreaElement>("aiGoal") || { value: "" }).value;
      saveActiveDoc();
      const docs = store.documents as TraceDocument[];
      const selectedIds = getSelectedTraceIds();
      const zoneTargets = getSelectedZoneTargets();
      let prompt;
      if (type === "trace_to_3d") {
        prompt = await buildTraceTo3DPrompt(docs, selectedIds);
      } else if (type === "proto_refine" && params) {
        prompt = await buildProtoRefinePrompt(params, goal, docs, selectedIds);
      } else if (type === "zone_detail" && params) {
        prompt = await buildZoneDetailPrompt(params, docs, zoneTargets, goal);
      } else if (type === "measure_sync" && params) {
        prompt = await buildMeasureSyncPrompt(params, docs);
      } else {
        prompt = await buildFreeFormPrompt(params || defaultParams(), goal);
      }
      lastPromptId = prompt.sourcePromptId;
      $maybe("promptIdLabel") && ($("promptIdLabel").textContent = prompt.sourcePromptId);
      await navigator.clipboard.writeText(prompt.text);
      $("importResult").innerHTML = `<span class="dim">Prompt kopierad (${prompt.text.length} tecken).</span>`;
    })();
  });

  $maybe("btnValidateImport")?.addEventListener("click", () => {
    const raw = ($maybe<HTMLTextAreaElement>("aiResponse") || { value: "" }).value;
    const res = importAiResponse(raw, params || defaultParams());
    const host = $("importResult");
    const applyBtn = $maybe<HTMLButtonElement>("btnApplyImport");
    pendingCandidate = null; pendingDiffCount = 0;
    if (applyBtn) applyBtn.disabled = true;
    if (!res.ok) {
      host.innerHTML = `<div class="err">${res.errors.map(esc).join("\n")}</div>`;
      return;
    }
    if (res.diff.length === 0) {
      host.innerHTML = `<span class="dim">Giltigt dokument — inga fältändringar.</span>`;
      return;
    }
    pendingCandidate = res.candidate; pendingDiffCount = res.diff.length;
    if (applyBtn) applyBtn.disabled = false;
    const rows = res.diff.map((d) => `<tr><td>${esc(d.path)}</td><td class="before">${esc(fmt(d.before))}</td><td class="after">${esc(fmt(d.after))}</td></tr>`).join("");
    host.innerHTML = `<span class="dim">${res.diff.length} fältändringar — granska och tillämpa:</span><table class="diff"><thead><tr><th>fält</th><th>före</th><th>efter</th></tr></thead><tbody>${rows}</tbody></table>`;
  });

  $maybe("btnApplyImport")?.addEventListener("click", () => {
    if (!pendingCandidate) return;
    const { params: next, entry } = applyImport(pendingCandidate, lastPromptId, pendingDiffCount);
    params = next;
    provenance.add(entry);
    renderProvenance();
    pendingCandidate = null;
    ($maybe<HTMLButtonElement>("btnApplyImport") || {} as HTMLButtonElement).disabled = true;
    $("importResult").innerHTML = `<span class="dim">Tillämpat. ${entry.detail}</span>`;
    if (!panel) {
      panel = buildPanel($("paramPanel"), () => params || defaultParams(), regenDebounced);
    } else {
      panel.refresh();
    }
    void regen();
    autosaveWorkspace();
  });
}

// ---------------------------------------------------------------- export

function wireExports(): void {
  const status = (msg: string, isError = false): void => {
    const el = $maybe("exportStatus");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "var(--fail)" : "var(--text-dim)";
  };
  const needParams = (): CobraParams | null => {
    if (!params) { status("3D-modell ej skapad. Generera via trace_to_3d-prompten.", true); return null; }
    return params;
  };
  const gated = (): GeometryResult => {
    const q = { ...EXPORT_QUALITY, linDeflection_mm: params!.manufacturing.stlChordalTolerance_mm };
    return buildGeometry(oc, params!, q);
  };
  const exportStl = (which: "part" | "plug"): void => {
    void (async () => {
      const p = needParams(); if (!p) return;
      setOverlay(true, "Bygger exportkvalitet …");
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      let g: GeometryResult | null = null;
      try {
        g = gated();
        const mesh = which === "part" ? g.partMesh : tessellate(oc, g.plugShape, p.manufacturing.stlChordalTolerance_mm, EXPORT_QUALITY.angDeflection_rad);
        const rep = verifyMesh(mesh);
        if (!rep.watertight) { status(`EXPORT AVBRUTEN — ej watertight (öppna kanter: ${rep.openEdges}).`, true); return; }
        const hash = await computeParameterHash(p);
        const name = `alien_lt_${which}_${hash.slice(0, 8)}.stl`;
        const out = await saveFile(name, meshToBinarySTL(mesh, `Engrove Alien LT ${which} ${hash.slice(0, 8)}`));
        sessionExports.push({ file: name, type: "stl", chordalTolerance_mm: p.manufacturing.stlChordalTolerance_mm });
        provenance.add({ ts: new Date().toISOString(), sourcePromptId: p.provenance.sourcePromptId, action: "EXPORT", detail: name });
        renderProvenance();
        status(`STL ${out} — ${rep.tris} tri, V=${(rep.volume_mm3 / 1000).toFixed(2)} cm³.`);
      } catch (e) { status(`Exportfel: ${e instanceof Error ? e.message : String(e)}`, true); }
      finally { g?.dispose(); setOverlay(false); }
    })();
  };
  const exportStep = (which: "part" | "plug"): void => {
    void (async () => {
      const p = needParams(); if (!p) return;
      setOverlay(true, "Bygger exportkvalitet …");
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      let g: GeometryResult | null = null;
      try {
        g = gated();
        if (g.brepValid === false) { status("EXPORT AVBRUTEN — BRepCheck underkände modellen.", true); return; }
        const hash = await computeParameterHash(p);
        const name = `alien_lt_${which}_${hash.slice(0, 8)}.step`;
        const res = writeSTEP(oc, which === "part" ? g.partShape : g.plugShape, { name: `alien_lt_${which}`, parameterHash: hash });
        if (!res.schemaLine.includes("AP242")) { status(`EXPORT AVBRUTEN — STEP-schema "${res.schemaLine}", förväntade AP242.`, true); return; }
        const out = await saveFile(name, res.data);
        sessionExports.push({ file: name, type: "step" });
        provenance.add({ ts: new Date().toISOString(), sourcePromptId: p.provenance.sourcePromptId, action: "EXPORT", detail: name });
        renderProvenance();
        status(`STEP ${out} — AP242 mm.`);
      } catch (e) { status(`Exportfel: ${e instanceof Error ? e.message : String(e)}`, true); }
      finally { g?.dispose(); setOverlay(false); }
    })();
  };
  $maybe("btnExportStlPart")?.addEventListener("click", () => exportStl("part"));
  $maybe("btnExportStlPlug")?.addEventListener("click", () => exportStl("plug"));
  $maybe("btnExportStepPart")?.addEventListener("click", () => exportStep("part"));
  $maybe("btnExportStepPlug")?.addEventListener("click", () => exportStep("plug"));
  $maybe("btnExportSidecar")?.addEventListener("click", () => {
    void (async () => {
      const p = needParams(); if (!p) return;
      try {
        const { json, parameterHash } = await buildSidecar(p, sessionExports, provenance.all());
        const out = await saveFile(`alien_lt_sidecar_${parameterHash.slice(0, 8)}.json`, json);
        status(`Sidecar ${out}.`);
      } catch (e) { status(`Exportfel: ${e instanceof Error ? e.message : String(e)}`, true); }
    })();
  });
  $maybe("btnExportMounting")?.addEventListener("click", () => {
    void (async () => {
      if (!geo) { status("Ingen geometri byggd.", true); return; }
      const out = await saveFile("alien_lt_mounting_spec.json", JSON.stringify(geo.mountingSpec, null, 2));
      sessionExports.push({ file: "alien_lt_mounting_spec.json", type: "mounting_spec" });
      status(`MountingSpec ${out}.`);
    })();
  });
}

function renderProvenance(): void {
  const host = $maybe("provenancePanel");
  if (!host) return;
  const items = provenance.all().slice(-8).reverse();
  host.innerHTML = items.length === 0
    ? '<span class="dim">Inga händelser ännu.</span>'
    : items.map((e) => `<div>${e.ts.slice(0, 19)} · ${e.action} · ${esc(e.detail)}${e.sourcePromptId ? ` · ${e.sourcePromptId}` : ""}</div>`).join("");
}

// ---------------------------------------------------------------- 3D toolbar

function wireViewToolbar(): void {
  document.querySelectorAll<HTMLButtonElement>("#viewToolbar button.view").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#viewToolbar button.view").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.view as ViewMode;
      viewport.setMode(mode);
      $maybe("clipRow")?.classList.toggle("hidden", mode !== "shell");
    });
  });
  ($maybe<HTMLInputElement>("clipSlider"))?.addEventListener("input", (e) => {
    viewport.setClipFraction(Number((e.target as HTMLInputElement).value));
  });
  ($maybe<HTMLInputElement>("chkStations"))?.addEventListener("change", (e) => {
    viewport.setStationsVisible((e.target as HTMLInputElement).checked);
  });
  $maybe("btnLoadPreset")?.addEventListener("click", () => {
    params = defaultParams();
    if (!panel) panel = buildPanel($("paramPanel"), () => params || defaultParams(), regenDebounced);
    else panel.refresh();
    $maybe("emptyState")?.classList.add("hidden");
    void regen();
    autosaveWorkspace();
  });
  $maybe("btnClearModel")?.addEventListener("click", () => {
    params = null; geo?.dispose(); geo = null;
    viewport.clear();
    if (panel) { panel.refresh(); panel = null; }
    $maybe("emptyState")?.classList.remove("hidden");
    $maybe("modelState") && ($("modelState").textContent = "Tom start — ingen defaultform. Generera ur trace-prompter eller ladda Alien LT-preseten.");
    $("hud").innerHTML = "";
    $("checksPanel").innerHTML = "";
    updateHashLabel();
    autosaveWorkspace();
  });
}

// ---------------------------------------------------------------- workspace save/load (2D+3D)

/**
 * Symbiosen mellan trace och 3D vid persistens: en workspace-fil bär BÅDA
 * sidorna tillsammans (alla TraceDocument + aktuella CobraParams), till
 * skillnad från "Save Project" (ett enskilt v15-.engrove-trace-paket per
 * trace) och "Download JSON" (en enskild traces geometri). Bygger på
 * TraceStore.toProjectFile/fromProjectFile (store.ts) — tidigare
 * implementerade men aldrig nåbara från UI:t.
 */
function wireWorkspace(): void {
  $maybe("tSaveWorkspace")?.addEventListener("click", () => {
    saveActiveDoc();
    const file = store.toProjectFile(params);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "engrove_trace3d_workspace.engrove-trace3d"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
  $maybe("tOpenWorkspace")?.addEventListener("click", () => $maybe<HTMLInputElement>("tWorkspaceFile")?.click());
  $maybe<HTMLInputElement>("tWorkspaceFile")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const { params: restoredParams } = store.fromProjectFile(JSON.parse(String(ev.target?.result)));
        applyRestoredWorkspace(restoredParams);
      } catch (err) {
        alert("Workspace open error: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    r.readAsText(f);
    (e.target as HTMLInputElement).value = "";
  });
}

/** Appliceras efter en lyckad store.fromProjectFile: hydrerar editor + 3D-vy. */
function applyRestoredWorkspace(restoredParams: CobraParams | null): void {
  activeDocId = store.activeId ?? store.documents[0]?.id ?? null;
  if (activeDocId) activateDoc(activeDocId);
  else renderDocList();

  params = restoredParams;
  if (params) {
    if (!panel) panel = buildPanel($("paramPanel"), () => params || defaultParams(), regenDebounced);
    else panel.refresh();
    $maybe("emptyState")?.classList.add("hidden");
    void regen();
  } else {
    geo?.dispose(); geo = null;
    viewport.clear();
    if (panel) { panel.refresh(); panel = null; }
    $maybe("emptyState")?.classList.remove("hidden");
    $("hud").innerHTML = "";
    $("checksPanel").innerHTML = "";
  }
  autosaveWorkspace();
}

// ---------------------------------------------------------------- trace-editor setup

function buildTraceEditor(restored: boolean): void {
  const canvas = $<HTMLCanvasElement>("tCanvas");
  const stage = $("traceStage");
  const drop = $maybe("tDrop");

  const dialogs = {
    prompt: (msg: string, def: string): string | null => window.prompt(msg, def),
    confirm: (msg: string): boolean => window.confirm(msg),
    alert: (msg: string): void => window.alert(msg),
  };

  if (!restored) {
    // Startdokument (ingen tidigare session hittades i webbläsarens autosave).
    const first = store.add({ trace_name: "trace_001", perspective: "other", trace_function: "outer_contour_master" });
    activeDocId = first.id;
  } else {
    activeDocId = store.activeId ?? store.documents[0]?.id ?? null;
  }

  editor = new TraceEditor(
    stage, canvas, drop, dialogs,
    {
      onSync: (refreshJson) => {
        if (store.activeId) store.update(store.activeId, editor.S);
        if (refreshJson) {
          const ta = $maybe<HTMLTextAreaElement>("tJson");
          if (ta) ta.value = JSON.stringify(outObj(editor.S, false), null, 2);
        }
        syncTraceStatusBar();
        renderDocList();
        updateSvgTracePanel();
        renderPromptTracePicker();
        autosaveWorkspace();
      },
      onCursor: (x, y) => {
        const el = $maybe("tCurS");
        if (el) el.textContent = `x:${x.toFixed(1)} y:${y.toFixed(1)}`;
      },
      isTextInputActive: () => {
        const a = document.activeElement;
        return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT"));
      },
    },
  );

  // Hydrera editorn med det återställda dokumentets tillstånd (den precis
  // konstruerade editorn börjar annars tom). activateDoc(id===activeId) är
  // säkert här: guarden mot store.update(prev===id) skyddar mot att skriva
  // över det nyss återställda dokumentet med editorns tomma starttillstånd.
  if (restored && activeDocId) activateDoc(activeDocId);
}

function syncTraceStatusBar(): void {
  const S = editor.S;
  $maybe("tImgS") && ($("tImgS").textContent =
    (S.project_meta?.name ? `project:${S.project_meta.name} · ` : "") +
    (S.img ? `${S.img.name} ${S.img.width}×${S.img.height}px` : "no image") +
    (S.svgTrace?.candidates?.length ? ` · SVG:${S.svgTrace.candidates.length}` : ""));
  $maybe("tSelS") && ($("tSelS").textContent = `selection:${S.sel || "none"}${S.anchor ? ` anchor:${S.anchor.x.toFixed(1)},${S.anchor.y.toFixed(1)}` : ""}${S.frame.scale?.px_per_unit ? ` scale:${(S.frame.scale.unit_per_px ?? 0).toFixed(6)} ${S.frame.scale.unit || "mm"}/px` : " scale:unset"}`);
  $maybe("tToolS") && ($("tToolS").textContent = `tool: ${S.tool}`);
}

// ---------------------------------------------------------------- SVG auto-trace UI (v18)

function updateSvgTracePanel(): void {
  const S = editor.S;
  const st = ensureSvgTrace(S);
  repairSvgTraceLinks(S);
  const inc = st.candidates.filter((c) => c.status === "include").length;
  const ign = st.candidates.filter((c) => c.status === "ignore").length;
  const tr = st.candidates.filter((c) => c.tracedShapeId).length;
  const statusEl = $maybe("svgTraceStatus");
  if (statusEl) {
    statusEl.innerHTML = st.sourceName
      ? `<strong>${st.sourceName}</strong> · ${st.candidates.length} objects · ${inc} included · ${ign} ignored · ${tr} traced`
      : "Load an SVG with clear filled/stroked objects.";
  }
  const box = $maybe("svgCandidateList");
  if (!box) return;
  box.innerHTML = "";
  st.candidates.forEach((c) => {
    const row = document.createElement("div");
    row.className = "svgCand" + (c.id === st.activeId ? " on" : "") + (c.status === "ignore" ? " ignore" : "") + (c.tracedShapeId ? " traced" : "");
    const ck = document.createElement("input"); ck.type = "checkbox"; ck.checked = c.status === "include";
    ck.onclick = (e) => { e.stopPropagation(); setSvgCandidateStatus(S, c, ck.checked ? "include" : "ignore"); editor.refresh(); };
    const text = document.createElement("div"), title = document.createElement("div"), meta = document.createElement("div");
    title.textContent = c.label; meta.className = "meta";
    meta.textContent = `${c.tag} · ${c.closed ? "closed" : "open"} · ${c.area ? c.area.toFixed(0) + " px²" : Number(c.length || 0).toFixed(1) + " px"}${c.unavailable ? " · re-detect source SVG" : ""}`;
    text.append(title, meta);
    const b = document.createElement("button");
    b.textContent = c.unavailable ? "Re-detect" : (c.tracedShapeId ? "Update" : "Trace");
    b.disabled = !!c.unavailable;
    b.onclick = (e) => { e.stopPropagation(); st.activeId = c.id; traceSvgCandidates(S, [c]); editor.refresh(); };
    row.onclick = () => { st.activeId = c.id; updateSvgTracePanel(); editor.draw(); };
    row.ondblclick = () => { if (!c.unavailable) { traceSvgCandidates(S, [c]); editor.refresh(); } };
    row.append(ck, text, b); box.appendChild(row);
  });
}

function wireTraceToolbar(): void {
  // Verktygsknappar
  document.querySelectorAll<HTMLButtonElement>("#tTools button[data-t]").forEach((b) => {
    b.addEventListener("click", () => {
      editor.setTool(b.dataset.t as never);
      document.querySelectorAll("#tTools button[data-t]").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    });
  });
  // Edit-knappar
  $maybe("tFinish")?.addEventListener("click", () => editor.finish(false));
  $maybe("tClose")?.addEventListener("click", () => editor.finish(true));
  $maybe("tSmooth")?.addEventListener("click", () => editor.smoothSelected());
  $maybe("tDel")?.addEventListener("click", () => editor.del());
  $maybe("tUndo")?.addEventListener("click", () => editor.undo());
  $maybe("tRedo")?.addEventListener("click", () => editor.redo());
  $maybe("tFit")?.addEventListener("click", () => editor.fit());
  $maybe("tOne")?.addEventListener("click", () => editor.one());
  $maybe("tStations")?.addEventListener("click", () => editor.stationsDialog());
  // v18 extra
  $maybe("tSmartSimplify")?.addEventListener("click", () => {
    const tol = ensureSvgTrace(editor.S).settings.simplifyTol;
    smartSimplifySelected(editor.S, tol);
    editor.refresh();
  });
  $maybe("tReverseShape")?.addEventListener("click", () => { reverseSelectedShape(editor.S); editor.refresh(); });
  // Toggles
  ($maybe<HTMLInputElement>("tGrid"))?.addEventListener("change", (e) => { editor.S.grid = (e.target as HTMLInputElement).checked; editor.draw(); });
  ($maybe<HTMLInputElement>("tPts"))?.addEventListener("change", (e) => { editor.S.pts = (e.target as HTMLInputElement).checked; editor.draw(); });
  ($maybe<HTMLInputElement>("tSnap"))?.addEventListener("change", (e) => { editor.S.snap = (e.target as HTMLInputElement).checked; editor.S.snapHit = null; editor.draw(); });
  ($maybe<HTMLInputElement>("tMsnap"))?.addEventListener("change", (e) => { editor.S.measureSnap = (e.target as HTMLInputElement).checked; editor.S.snapHit = null; editor.draw(); });
  // Axes
  AXIS_OPTIONS.forEach(([v, label]) => {
    ["tXdir", "tYdir", "tZdir"].forEach((id) => {
      const sel = $maybe<HTMLSelectElement>(id);
      if (!sel) return;
      const opt = document.createElement("option"); opt.value = v; opt.textContent = label;
      sel.append(opt);
    });
  });
  (["tXdir", "tYdir", "tZdir"] as const).forEach((id, ki) => {
    const key = ["x", "y", "z"][ki] as "x" | "y" | "z";
    $maybe<HTMLSelectElement>(id)?.addEventListener("change", (e) => {
      editor.setAxis(key, (e.target as HTMLSelectElement).value);
    });
  });
  // Dokument-hantering
  $maybe("tDocNew")?.addEventListener("click", () => {
    saveActiveDoc();
    const doc = store.add({ trace_name: `trace_${String(store.list().length + 1).padStart(3, "0")}` });
    activateDoc(doc.id);
    autosaveWorkspace();
  });
  $maybe("tDocDup")?.addEventListener("click", () => {
    saveActiveDoc();
    if (!store.activeId) return;
    const dup = store.duplicate(store.activeId);
    if (dup) activateDoc(dup.id);
    autosaveWorkspace();
  });
  $maybe("tDocDel")?.addEventListener("click", () => {
    if (!store.activeId || store.list().length <= 1) return;
    store.remove(store.activeId);
    const first = store.list()[0];
    if (first) activateDoc(first.id);
    autosaveWorkspace();
  });
  $maybe("tDocName")?.addEventListener("change", (e) => {
    applyMetaPatchToActiveDoc({ trace_name: (e.target as HTMLInputElement).value });
    syncDocMetaPanel();
    renderDocList();
    autosaveWorkspace();
  });
  $maybe("tDocPerspective")?.addEventListener("change", (e) => {
    applyMetaPatchToActiveDoc({ perspective: (e.target as HTMLSelectElement).value as never });
    renderDocList();
    autosaveWorkspace();
  });
  $maybe("tDocFunction")?.addEventListener("change", (e) => {
    applyMetaPatchToActiveDoc({ trace_function: (e.target as HTMLSelectElement).value as never });
    autosaveWorkspace();
  });
  ($maybe<HTMLTextAreaElement>("tDocDesc"))?.addEventListener("change", (e) => {
    applyMetaPatchToActiveDoc({ description: (e.target as HTMLTextAreaElement).value });
    autosaveWorkspace();
  });
  // Bild/projekt-laddning
  $maybe("tOpen")?.addEventListener("click", () => $maybe<HTMLInputElement>("tImgFile")?.click());
  $maybe<HTMLInputElement>("tImgFile")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.type === "image/svg+xml" || /\.svg$/i.test(f.name)) {
      void loadSvgTraceFileFull(f);
    } else {
      editor.loadImageFile(f);
    }
  });
  $maybe("tOpenProject")?.addEventListener("click", () => $maybe<HTMLInputElement>("tProjectFile")?.click());
  $maybe<HTMLInputElement>("tProjectFile")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try { editor.openProjectPackage(JSON.parse(String(ev.target?.result)), f.name); }
      catch (err) { alert("Project open error: " + (err instanceof Error ? err.message : String(err))); }
    };
    r.readAsText(f);
  });
  $maybe("tSaveProject")?.addEventListener("click", () => {
    saveActiveDoc();
    const suggested = editor.S.project_meta?.name || safeFileBase(editor.S.img?.name || "engrove_trace_project");
    const name = window.prompt("Project name", suggested);
    if (name === null) return;
    const pkg = editor.buildProjectPackage();
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = safeFileBase(name || suggested) + ".engrove-trace"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
  $maybe("tLoad")?.addEventListener("click", () => $maybe<HTMLInputElement>("tJsonFile")?.click());
  $maybe<HTMLInputElement>("tJsonFile")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try { editor.openTraceObject(JSON.parse(String(ev.target?.result)), f.name); }
      catch (err) { alert("Open error: " + (err instanceof Error ? err.message : String(err))); }
    };
    r.readAsText(f);
  });
  $maybe("tSave")?.addEventListener("click", () => {
    const o = outObj(editor.S, ($maybe<HTMLInputElement>("tIncImg"))?.checked ?? false);
    const blob = new Blob([JSON.stringify(o, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "engrove_manual_trace.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
  $maybe("tSvg")?.addEventListener("click", () => {
    const svg = buildSvg(editor.S);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "engrove_manual_trace.svg"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
  $maybe("tClear")?.addEventListener("click", () => editor.clearTrace());
  $maybe("tApply")?.addEventListener("click", () => editor.applyJson(($maybe<HTMLTextAreaElement>("tJson") || { value: "" }).value));
  $maybe("tCopy")?.addEventListener("click", () => navigator.clipboard.writeText(($maybe<HTMLTextAreaElement>("tJson") || { value: "" }).value));
  // v18 SVG auto-trace
  $maybe("tOpenSvgTrace")?.addEventListener("click", () => $maybe<HTMLInputElement>("tSvgFile")?.click());
  $maybe<HTMLInputElement>("tSvgFile")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    void loadSvgTraceFileFull(f);
  });
  $maybe("svgTraceActive")?.addEventListener("click", () => {
    const c = activeSvgCandidate(editor.S);
    if (c) { traceSvgCandidates(editor.S, [c]); editor.refresh(); }
  });
  $maybe("svgTraceIncluded")?.addEventListener("click", () => {
    const included = ensureSvgTrace(editor.S).candidates.filter((c) => c.status === "include");
    traceSvgCandidates(editor.S, included);
    editor.refresh();
  });
  $maybe("svgIncludeAll")?.addEventListener("click", () => {
    ensureSvgTrace(editor.S).candidates.forEach((c) => (c.status = "include"));
    updateSvgTracePanel(); editor.draw();
  });
  $maybe("svgIgnoreAll")?.addEventListener("click", () => {
    ensureSvgTrace(editor.S).candidates.forEach((c) => (c.status = "ignore"));
    updateSvgTracePanel(); editor.draw();
  });
  $maybe("svgClearCandidates")?.addEventListener("click", () => { clearSvgCandidates(editor.S); updateSvgTracePanel(); editor.draw(); });
  $maybe("svgFocusActive")?.addEventListener("click", () => { focusActiveSvgCandidate(editor.S, $("traceStage")); editor.draw(); });
  $maybe("svgRedetect")?.addEventListener("click", () => {
    const st = ensureSvgTrace(editor.S);
    if (st.sourceText) void detectSvgCandidates(editor.S, st.sourceText, st.sourceName || "").then(() => { updateSvgTracePanel(); editor.draw(); });
    else $maybe<HTMLInputElement>("tSvgFile")?.click();
  });
  // Metadata-panel
  $maybe("tPropApply")?.addEventListener("click", applyTraceObjProps);
}

async function loadSvgTraceFileFull(f: File): Promise<void> {
  const readFileText = (file: File): Promise<string> =>
    new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result || "")); r.onerror = () => no(r.error); r.readAsText(file); });
  const readFileDataUrl = (file: File): Promise<string> =>
    new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result || "")); r.onerror = () => no(r.error); r.readAsDataURL(file); });
  try {
    const [txt, data] = await Promise.all([readFileText(f), readFileDataUrl(f)]);
    const frame = svgCoordinateFrame(txt);
    await new Promise<void>((ok, no) => {
      const im = new Image();
      im.onload = () => {
        const width = frame?.width || im.naturalWidth, height = frame?.height || im.naturalHeight;
        editor.S.img = { name: f.name, width, height, dataUrl: data, _im: im };
        editor.fit(); ok();
      };
      im.onerror = () => no(new Error("Could not render SVG image."));
      im.src = data;
    });
    await detectSvgCandidates(editor.S, txt, f.name);
    updateSvgTracePanel();
    editor.refresh();
  } catch (e) { alert("SVG auto trace error: " + (e instanceof Error ? e.message : String(e))); }
}

function applyTraceObjProps(): void {
  const S = editor.S;
  const s = S.shapes.find((x) => x.id === S.sel);
  if (!s) return;
  const name = ($maybe<HTMLInputElement>("tPropName") || { value: "" }).value.trim();
  const role = ($maybe<HTMLInputElement>("tPropRole") || { value: "" }).value.trim();
  const kind = ($maybe<HTMLSelectElement>("tPropKind") || { value: "" }).value;
  const desc = ($maybe<HTMLTextAreaElement>("tPropDesc") || { value: "" }).value.trim();
  if (name) s.name = name;
  if (role) s.role = role;
  if (kind) { s.semantic = s.semantic || {}; s.semantic.feature_kind = kind; }
  if (desc) s.description = desc;
  editor.refresh();
}

// ---------------------------------------------------------------- panel-layout v18

function wirePanelLayout(): void {
  const left = $maybe("leftResizer");
  const right = $maybe("rightResizer");
  restorePanelLayout(left, right);
  installPanelResizer(left, "rail", 1, () => editor?.size(), left, right);
  installPanelResizer(right, "inspector", -1, () => editor?.size(), left, right);
  window.addEventListener("resize", () => {
    applyPanelWidth("rail", readPanelWidth("rail"), false, left, right);
    applyPanelWidth("inspector", readPanelWidth("inspector"), false, left, right);
  });
}

function readPanelWidth(name: string): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--" + name)) || 0;
}

// ---------------------------------------------------------------- start

async function main(): Promise<void> {
  $maybe("verLabel") && ($("verLabel").textContent = `v${TOOL_VERSION}`);
  wireTabbar();
  const restored = restoreWorkspaceOnStartup();
  buildTraceEditor(restored);
  wireTraceToolbar();
  wireWorkspace();
  wirePanelLayout();
  syncDocMetaPanel();
  renderDocList();
  viewport = new Viewport($("viewport"));
  wireViewToolbar();
  wireAiPanel();
  wireExports();
  renderProvenance();
  setOverlay(true, "Laddar OpenCascade (WASM, ~50 MB) …");
  oc = await getOC();
  setOverlay(false);
  if (restored && params) {
    // Återställd session hade en 3D-modell — bygg panel + geometri nu när OC är laddat.
    if (!panel) panel = buildPanel($("paramPanel"), () => params || defaultParams(), regenDebounced);
    $maybe("emptyState")?.classList.add("hidden");
    void regen();
  } else {
    // Tom start — laddar INTE defaultParams() automatiskt
    $maybe("emptyState")?.classList.remove("hidden");
  }
}

void main();
