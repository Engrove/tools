/**
 * AI-prompttyper för flerstegs trace→3D-pipelinen.
 *
 * Alla byggare producerar {text, sourcePromptId} och matar EXAKT samma strikta
 * import som den befintliga rundturen (protocol.ts importAiResponse → diff →
 * applyImport): AI:n ska svara med ETT komplett CobraParams-dokument enligt
 * COBRA_SCHEMA, som valideras (LT-denylist → schema) före fältvis diff och
 * explicit mänskligt godkännande.
 *
 * KRITISKT (CP11/LT-kontraktet): promptytan får ALDRIG innehålla LT-mekanikens
 * förbjudna tokens. Trace-namn/beskrivningar är fri operatörstext och kan råka
 * innehålla dem — därför skrubbas all inbäddad trace-text med scrubLtTokens()
 * och hela prompttexten kan kontrolleras med scanPromptForLtTokens().
 *
 * Pipeline-steg:
 *   trace_to_3d  — alla/utvalda traces + schema ⇒ skapar 3D-objektet (tom start).
 *   proto_refine — global finjustering av nuvarande parametrar.
 *   zone_detail  — detaljprompt riktad mot namngivna zoner.
 *   measure_sync — måttavstämning mot uppmätta mm-värden.
 *   free_form    — fritt mål mot nuvarande parametrar.
 */
import type { CobraParams } from "../types.js";
import { COBRA_SCHEMA, LT_DENYLIST } from "../schema/validator.js";
import { canonicalJson, sha256Hex } from "../export/sidecar.js";
import { samplePath } from "../../trace/geometry.js";
import type { TraceDocument } from "../../trace/store.js";
import type { PathShape, TraceShape } from "../../trace/model.js";

export interface AiPrompt {
  text: string;
  sourcePromptId: string;
}

export type PromptType = "trace_to_3d" | "proto_refine" | "zone_detail" | "measure_sync" | "free_form";

const LT_RE = new RegExp(`\\b(${LT_DENYLIST.join("|")})\\b`, "gi");

/** Ersätter förbjudna LT-tokens i fri text så promptytan förblir denylist-fri. */
export function scrubLtTokens(s: string | undefined | null): string {
  return String(s ?? "").replace(LT_RE, "LT_REF");
}

/** Skanar godtycklig text efter förbjudna LT-tokens (för guard/test). */
export function scanPromptForLtTokens(text: string): string[] {
  const hits = text.match(LT_RE);
  return hits ? Array.from(new Set(hits.map((h) => h.toUpperCase()))) : [];
}

interface CompactShape {
  id: string;
  type: string;
  name: string;
  role: string;
  kind: string;
  description: string;
  references: { relation: string; target: string; note?: string }[];
  geometry: Record<string, unknown>;
}

/** Kompakt geometri per shape: path→samplad polylinje; mått behåller skala. */
function compactShape(s: TraceShape): CompactShape {
  const base: CompactShape = {
    id: s.id,
    type: s.type,
    name: scrubLtTokens(s.name || s.type),
    role: scrubLtTokens(s.role || "trace"),
    kind: scrubLtTokens(s.semantic?.feature_kind || ""),
    description: scrubLtTokens(s.description || ""),
    references: (s.references || []).map((r) => ({
      relation: scrubLtTokens(r.relation), target: scrubLtTokens(r.target),
      note: r.note ? scrubLtTokens(r.note) : undefined,
    })),
    geometry: {},
  };
  const round = (p: { x: number; y: number }) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
  switch (s.type) {
    case "line":
    case "poly":
    case "mask":
    case "zone":
      base.geometry = { points: s.points.map(round), closed: "closed" in s ? !!s.closed : false };
      break;
    case "measure":
      base.geometry = {
        points: s.points.map(round), length_px: +(s.length_px || 0).toFixed(2),
        real_length: s.real_length ?? null, unit: s.unit || "mm",
        is_scale_reference: !!s.is_scale_reference,
      };
      break;
    case "path":
      base.geometry = {
        node_count: (s as PathShape).nodes.length, closed: !!(s as PathShape).closed,
        sampled_polyline: samplePath(s as PathShape, 16).map(round),
      };
      break;
    case "station":
      base.geometry = {
        orientation: s.orientation, station_index: s.station_index,
        x: s.x, y: s.y, x1: s.x1, x2: s.x2, y1: s.y1, y2: s.y2, spacing_px: s.spacing_px,
      };
      break;
    case "rect":
      base.geometry = { x: +s.x.toFixed(2), y: +s.y.toFixed(2), w: +s.w.toFixed(2), h: +s.h.toFixed(2) };
      break;
    case "circle":
      base.geometry = { cx: +s.cx.toFixed(2), cy: +s.cy.toFixed(2), r: +s.r.toFixed(2) };
      break;
  }
  return base;
}

interface CompactTrace {
  trace_name: string;
  perspective: string;
  trace_function: string;
  description: string;
  image: { name: string; width: number; height: number } | null;
  frame: {
    origin: { x: number; y: number } | null;
    origin_role: string;
    origin_description: string;
    axes: { x: string; y: string; z: string };
    scale: { unit: string; unit_per_px: number | null } | null;
  };
  shapes: CompactShape[];
}

/** Kompakt trace för promptinbäddning (utan dataUrl/view/svg_binding). */
export function compactTrace(doc: TraceDocument): CompactTrace {
  const st = doc.state;
  return {
    trace_name: scrubLtTokens(doc.meta.trace_name),
    perspective: doc.meta.perspective,
    trace_function: doc.meta.trace_function,
    description: scrubLtTokens(doc.meta.description),
    image: st.img ? { name: scrubLtTokens(st.img.name), width: st.img.width, height: st.img.height } : null,
    frame: {
      origin: st.frame.origin,
      origin_role: scrubLtTokens(st.frame.origin_metadata?.location_role || "unspecified"),
      origin_description: scrubLtTokens(st.frame.origin_metadata?.description || ""),
      axes: st.frame.axes,
      scale: st.frame.scale?.unit_per_px
        ? { unit: st.frame.scale.unit, unit_per_px: +st.frame.scale.unit_per_px.toFixed(6) }
        : null,
    },
    shapes: st.shapes.map(compactShape),
  };
}

function selectDocs(docs: TraceDocument[], selectedIds?: string[]): TraceDocument[] {
  if (!selectedIds || !selectedIds.length) return docs;
  const set = new Set(selectedIds);
  return docs.filter((d) => set.has(d.id));
}

async function makeId(prefix: string, seed: unknown): Promise<string> {
  const hash = await sha256Hex(canonicalJson(seed));
  return `cw-${prefix}-${Date.now().toString(36)}-${hash.slice(0, 8)}`;
}

const HARD_RULES = (idLine: string): string[] => [
  `## Hårda regler`,
  `1. Svara med EXAKT ETT JSON-objekt och ingenting annat (ingen prosa, inga kodstaket).`,
  `2. Objektet ska vara ett KOMPLETT dokument enligt schemat i C (inte en patch).`,
  `3. Endast nycklar som finns i schemat är tillåtna. Okända nycklar avvisas`,
  `   automatiskt av verktyget (VALIDATION_REJECTED) och inget tillämpas.`,
  `4. Alla tal ska ligga inom schemats gränser. schemaVersion ("1.1.0") och`,
  `   modelFamily ("alien_lt_wand") får inte ändras.`,
  idLine,
  `6. Verktyget visar en fältvis diff och en människa godkänner innan något tillämpas.`,
  `7. Koordinatrymd i trace-data: bildpixlar, top-left origo, y nedåt. u = X/L där`,
  `   X=0 = nålspetsdatum och X=1.0·L = pivotdatum. Kroppen är rak och Y-symmetrisk`,
  `   (tangentiell LT — ingen offsetböj eller överhäng).`,
];

const SCHEMA_BLOCK = (): string[] => [
  `## C. Bindande JSON-schema (draft 2020-12-kompatibelt)`,
  "```json",
  JSON.stringify(COBRA_SCHEMA, null, 2),
  "```",
];

/** Steg 1: skapar 3D-objektet ur en eller flera namngivna traces (tom start). */
export async function buildTraceTo3DPrompt(
  docs: TraceDocument[], selectedIds?: string[],
): Promise<AiPrompt> {
  const chosen = selectDocs(docs, selectedIds).map(compactTrace);
  const sourcePromptId = await makeId("t2d", chosen);
  const text = [
    `# Engrove Alien LT — skapa 3D-parametrar ur trace (sourcePromptId: ${sourcePromptId})`,
    ``,
    `Du är en formgivningsassistent för en parametrisk, tangentiell linear-tracking`,
    `tonarms-wand ("Engrove Alien LT", Continuum Cobra-inspirerad kropp). Nedan finns`,
    `(A) en eller flera manuella trace-objekt med perspektiv, funktion, semantiska`,
    `zoner, mått och referensrelationer; (B) tomt utgångsläge; (C) det bindande schemat.`,
    `Syntetisera trace-data till EN komplett parametervektor för wand-kroppen.`,
    ``,
    `## A. Trace-objekt (kompakt; JSON är koordinatkälla)`,
    "```json",
    JSON.stringify(chosen, null, 2),
    "```",
    ``,
    `## B. Utgångsläge`,
    `3D-modellen är TOM. Detta är den initiala genereringen: härled functionalLength,`,
    `spine (dorsal/ventral), stationer (bredd/höjd/form) och features ur trace-datan.`,
    `Använd measure-objektens real_length som mm-sanning där de finns.`,
    ``,
    ...HARD_RULES(`5. Sätt provenance.sourcePromptId till "${sourcePromptId}". Ändra inget annat i provenance.`),
    ``,
    ...SCHEMA_BLOCK(),
  ].join("\n");
  return { text, sourcePromptId };
}

/** Steg 2: global finjustering av nuvarande 3D-parametrar. */
export async function buildProtoRefinePrompt(
  params: CobraParams, goal: string, docs?: TraceDocument[], selectedIds?: string[],
): Promise<AiPrompt> {
  const chosen = docs ? selectDocs(docs, selectedIds).map(compactTrace) : [];
  const sourcePromptId = await makeId("ref", { params, goal });
  const text = [
    `# Engrove Alien LT — finjustera 3D-prototyp (sourcePromptId: ${sourcePromptId})`,
    ``,
    `(A) mål, (B) aktuell parametervektor, (C) schema. Returnera ett komplett,`,
    `förbättrat dokument med bibehållen designintention.`,
    ``,
    `## A. Mål`,
    scrubLtTokens(goal.trim()) || "Förbättra formen med bibehållen designintention.",
    ...(chosen.length
      ? ["", `### Referens-traces (kompakt)`, "```json", JSON.stringify(chosen, null, 2), "```"]
      : []),
    ``,
    `## B. Aktuell parametervektor`,
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    ``,
    ...HARD_RULES(`5. Behåll provenance.sourcePromptId = "${sourcePromptId}".`),
    ``,
    ...SCHEMA_BLOCK(),
  ].join("\n");
  return { text, sourcePromptId };
}

/** Stabil, adresserbar zonnyckel (Rev C §19 "Zonregister") — trace-id + shape-id, inte namn. */
export interface ZoneTarget {
  traceId: string;
  shapeId: string;
}

/** Bygger zonregistret: alla zon-shapes över alla traces, adresserade via (traceId, shapeId). */
export function buildZoneRegistry(
  docs: TraceDocument[],
): { traceId: string; traceName: string; shapeId: string; name: string }[] {
  const out: { traceId: string; traceName: string; shapeId: string; name: string }[] = [];
  for (const d of docs) {
    for (const s of d.state.shapes) {
      if (s.type !== "zone") continue;
      out.push({ traceId: d.id, traceName: d.meta.trace_name, shapeId: s.id, name: s.name || "zone" });
    }
  }
  return out;
}

/** Steg 3: detaljprompt riktad mot namngivna zoner över alla traces. */
export async function buildZoneDetailPrompt(
  params: CobraParams, docs: TraceDocument[], zoneTargets: ZoneTarget[], goal: string,
): Promise<AiPrompt> {
  // Adressering sker via (traceId, shapeId) — INTE zonnamn. Namn är fri operatörstext
  // och kan krocka mellan traces (t.ex. samma zonnamn i top_view och side_view); en
  // namnbaserad matchning skulle antingen kollapsa dem ihop eller missa träffar.
  const wanted = new Set(zoneTargets.map((z) => `${z.traceId}::${z.shapeId}`));
  const zones: { trace: string; name: string; description: string; points: { x: number; y: number }[] }[] = [];
  for (const d of docs) {
    for (const s of d.state.shapes) {
      if (s.type !== "zone") continue;
      if (wanted.size && !wanted.has(`${d.id}::${s.id}`)) continue;
      zones.push({
        trace: scrubLtTokens(d.meta.trace_name),
        name: scrubLtTokens(s.name || ""),
        description: scrubLtTokens(s.description || ""),
        points: s.points.map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })),
      });
    }
  }
  const sourcePromptId = await makeId("zone", { zones, goal });
  const text = [
    `# Engrove Alien LT — zonriktad detaljering (sourcePromptId: ${sourcePromptId})`,
    ``,
    `Finjustera ENDAST de parametrar som styr de namngivna zonerna nedan. Returnera`,
    `ändå ett komplett dokument (oförändrade fält utanför zonerna).`,
    ``,
    `## A. Mål`,
    scrubLtTokens(goal.trim()) || "Detaljera de angivna zonerna.",
    ``,
    `## A2. Namngivna zoner (koordinater i bildpixlar)`,
    "```json",
    JSON.stringify(zones, null, 2),
    "```",
    ``,
    `## B. Aktuell parametervektor`,
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    ``,
    ...HARD_RULES(`5. Behåll provenance.sourcePromptId = "${sourcePromptId}".`),
    ``,
    ...SCHEMA_BLOCK(),
  ].join("\n");
  return { text, sourcePromptId };
}

/** Steg 4: måttavstämning mot uppmätta mm-värden. */
export async function buildMeasureSyncPrompt(
  params: CobraParams, docs: TraceDocument[],
): Promise<AiPrompt> {
  const measures: { trace: string; name: string; real_length: number | null; unit: string; is_reference: boolean }[] = [];
  for (const d of docs) {
    for (const s of d.state.shapes) {
      if (s.type !== "measure") continue;
      measures.push({
        trace: scrubLtTokens(d.meta.trace_name),
        name: scrubLtTokens(s.name || "measure"),
        real_length: s.real_length ?? null,
        unit: s.unit || "mm",
        is_reference: !!s.is_scale_reference,
      });
    }
  }
  const sourcePromptId = await makeId("msync", { measures });
  const text = [
    `# Engrove Alien LT — måttavstämning (sourcePromptId: ${sourcePromptId})`,
    ``,
    `Justera parametrarna så att modellens dimensioner stämmer med de uppmätta`,
    `mm-värdena nedan (skalfreferensen är auktoritativ). Returnera ett komplett dokument.`,
    ``,
    `## A. Uppmätta mått`,
    "```json",
    JSON.stringify(measures, null, 2),
    "```",
    ``,
    `## B. Aktuell parametervektor`,
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    ``,
    ...HARD_RULES(`5. Behåll provenance.sourcePromptId = "${sourcePromptId}".`),
    ``,
    ...SCHEMA_BLOCK(),
  ].join("\n");
  return { text, sourcePromptId };
}

/** Steg 5: fritt mål mot nuvarande parametrar. */
export async function buildFreeFormPrompt(params: CobraParams, goal: string): Promise<AiPrompt> {
  const sourcePromptId = await makeId("free", { params, goal });
  const text = [
    `# Engrove Alien LT — fritt parameterförslag (sourcePromptId: ${sourcePromptId})`,
    ``,
    `## A. Uppgift`,
    scrubLtTokens(goal.trim()) || "Föreslå en förbättrad parameteruppsättning med bibehållen designintention.",
    ``,
    `## B. Aktuell parametervektor`,
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    ``,
    ...HARD_RULES(`5. Behåll provenance.sourcePromptId = "${sourcePromptId}".`),
    ``,
    ...SCHEMA_BLOCK(),
  ].join("\n");
  return { text, sourcePromptId };
}
