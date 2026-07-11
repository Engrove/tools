/**
 * AI-rundtur via manuellt urklipp (PLAN.md §5, CP9). Ingen nätverkskoppling.
 *
 * Flöde: buildAiPrompt() → användaren klistrar in i valfri AI → svaret klistras
 * tillbaka → importAiResponse() validerar (denylist + schema) och producerar en
 * fältvis diff → ANVÄNDAREN godkänner → applyImport(). Aldrig auto-apply.
 *
 * Prompten namnger INTE förbjudna LT-nycklar (export-ytan ska vara fri från dem);
 * den stänger i stället dörren via det slutna schemat (additionalProperties:false)
 * och beskedet att okända nycklar ⇒ VALIDATION_REJECTED.
 */
import type { CobraParams, DiffEntry, ImportResult, ProvenanceEntry } from "../types.js";
import { COBRA_SCHEMA, validateCobraParams } from "../schema/validator.js";
import { canonicalJson, sha256Hex } from "../export/sidecar.js";
import { TOOL_VERSION } from "../defaults.js";

export interface AiPrompt {
  text: string;
  sourcePromptId: string;
}

export async function buildAiPrompt(params: CobraParams, userGoal: string): Promise<AiPrompt> {
  const hash = await sha256Hex(canonicalJson(params));
  const sourcePromptId = `cw-${Date.now().toString(36)}-${hash.slice(0, 8)}`;
  const goal = userGoal.trim() || "Föreslå en förbättrad parameteruppsättning med bibehållen designintention.";
  const text = [
    `# Engrove Cobra Wand — parameterförslag (sourcePromptId: ${sourcePromptId})`,
    ``,
    `Du är en formgivningsassistent för en parametrisk tonarms-wand. Nedan finns`,
    `(A) uppgiften, (B) aktuell parametervektor (JSON) och (C) det bindande JSON-schemat.`,
    ``,
    `## A. Uppgift`,
    goal,
    ``,
    `## Hårda regler`,
    `1. Svara med EXAKT ETT JSON-objekt och ingenting annat (ingen prosa, inga kodstaket).`,
    `2. Objektet ska vara ett KOMPLETT dokument enligt schemat i C (inte en patch).`,
    `3. Endast nycklar som finns i schemat är tillåtna. Okända nycklar avvisas`,
    `   automatiskt av verktyget (VALIDATION_REJECTED) och inget tillämpas.`,
    `4. Alla tal ska ligga inom schemats gränser. schemaVersion och modelFamily får inte ändras.`,
    `5. Sätt provenance.sourcePromptId till "${sourcePromptId}". Ändra inget annat i provenance.`,
    `6. Verktyget visar en fältvis diff och en människa godkänner innan något tillämpas.`,
    ``,
    `## B. Aktuell parametervektor`,
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    ``,
    `## C. Bindande JSON-schema (draft 2020-12-kompatibelt)`,
    "```json",
    JSON.stringify(COBRA_SCHEMA, null, 2),
    "```",
  ].join("\n");
  return { text, sourcePromptId };
}

/** Extraherar första balanserade JSON-objektet ur fritext (tål kodstaket och prosa runtom). */
export function extractJson(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

export function importAiResponse(text: string, current: CobraParams): ImportResult {
  const jsonText = extractJson(text);
  if (jsonText === null) {
    return { ok: false, errors: ["PARSE_ERROR: inget JSON-objekt hittades i svaret."], diff: [], candidate: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      errors: [`PARSE_ERROR: ogiltig JSON — ${e instanceof Error ? e.message : String(e)}`],
      diff: [],
      candidate: null,
    };
  }
  const v = validateCobraParams(parsed);
  if (!v.ok) {
    return { ok: false, errors: [`${v.code}:`, ...v.errors], diff: [], candidate: null };
  }
  const candidate = parsed as CobraParams;
  return { ok: true, errors: [], diff: flattenDiff(current, candidate), candidate };
}

/** Explicit tillämpning EFTER användarens godkännande. Returnerar nytt dokument + proveniensrad. */
export function applyImport(
  candidate: CobraParams,
  sourcePromptId: string | null,
  diffCount: number,
): { params: CobraParams; entry: ProvenanceEntry } {
  const params: CobraParams = {
    ...candidate,
    provenance: {
      createdAt: new Date().toISOString(),
      parameterHash: "",
      toolVersion: TOOL_VERSION,
      sourcePromptId,
    },
  };
  const entry: ProvenanceEntry = {
    ts: new Date().toISOString(),
    sourcePromptId,
    action: "AI_IMPORT_APPLIED",
    detail: `${diffCount} fält ändrade efter manuellt godkännande.`,
  };
  return { params, entry };
}

/** Platt fältvis diff (dot-paths, arrayindex som [i]). provenance exkluderas (metadata). */
export function flattenDiff(a: unknown, b: unknown, path = "", out: DiffEntry[] = []): DiffEntry[] {
  if (path === "" && a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ac = { ...(a as Record<string, unknown>) };
    const bc = { ...(b as Record<string, unknown>) };
    delete ac["provenance"];
    delete bc["provenance"];
    a = ac;
    b = bc;
  }
  const isObjA = a !== null && typeof a === "object";
  const isObjB = b !== null && typeof b === "object";
  if (!isObjA || !isObjB) {
    if (!Object.is(a, b)) out.push({ path: path || "$", before: a, after: b });
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n; i++) flattenDiff(aa[i], bb[i], `${path}[${i}]`, out);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    flattenDiff(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      path ? `${path}.${k}` : k,
      out,
    );
  }
  return out;
}

/** Append-only provenienslogg med pluggbar lagring (localStorage i appen, minne i tester). */
export interface ProvenanceStorage {
  load(): ProvenanceEntry[];
  save(entries: ProvenanceEntry[]): void;
}

export class MemoryProvenanceStorage implements ProvenanceStorage {
  private data: ProvenanceEntry[] = [];
  load(): ProvenanceEntry[] {
    return [...this.data];
  }
  save(entries: ProvenanceEntry[]): void {
    this.data = [...entries];
  }
}

export class ProvenanceLog {
  private entries: ProvenanceEntry[];
  constructor(private storage: ProvenanceStorage) {
    this.entries = storage.load();
  }
  add(entry: ProvenanceEntry): void {
    this.entries.push(entry);
    this.storage.save(this.entries);
  }
  all(): ProvenanceEntry[] {
    return [...this.entries];
  }
}
