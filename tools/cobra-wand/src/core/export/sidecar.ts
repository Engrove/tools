/**
 * Sidecar-metadata (PLAN.md §7): parametrar + hash + verktygsversion + tidsstämpel.
 *
 * parameterHash = SHA-256 över KANONISK JSON av params UTAN provenance-blocket
 * (provenance är metadata om dokumentet, inte geometri; att inkludera hashen i
 * sitt eget underlag vore cirkulärt). Kanonisk = rekursivt sorterade nycklar,
 * arrayer i ordning, JSON:s default-taltextning.
 */
import type { CobraParams, ProvenanceEntry } from "../types.js";
import { TOOL_VERSION } from "../defaults.js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${parts.join(",")}}`;
}

/** SHA-256 hex. Node: node:crypto. Webbläsare/Electron-renderer: WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (typeof window === "undefined" && typeof process !== "undefined") {
    const spec = "node:crypto"; // beräknad specifier: håll Node-grenen utanför webbundeln
    const { createHash } = (await import(/* @vite-ignore */ spec)) as typeof import("node:crypto");
    return createHash("sha256").update(bytes).digest("hex");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeParameterHash(params: CobraParams): Promise<string> {
  const { provenance: _omit, ...geometryParams } = params;
  return sha256Hex(canonicalJson(geometryParams));
}

export interface SidecarExportEntry {
  file: string;
  type: "stl" | "step" | "mounting_spec";
  chordalTolerance_mm?: number;
}

export interface Sidecar {
  sidecarVersion: "1.0.0";
  createdAt: string;
  toolVersion: string;
  parameterHash: string;
  sourcePromptIds: string[];
  exports: SidecarExportEntry[];
  params: CobraParams;
}

export async function buildSidecar(
  params: CobraParams,
  exports_: SidecarExportEntry[],
  provenanceLog: ProvenanceEntry[],
): Promise<{ sidecar: Sidecar; json: string; parameterHash: string }> {
  const parameterHash = await computeParameterHash(params);
  const sourcePromptIds = [
    ...new Set(
      provenanceLog
        .map((e) => e.sourcePromptId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  if (params.provenance.sourcePromptId) sourcePromptIds.push(params.provenance.sourcePromptId);
  const sidecar: Sidecar = {
    sidecarVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
    parameterHash,
    sourcePromptIds: [...new Set(sourcePromptIds)],
    exports: exports_,
    params: {
      ...params,
      provenance: { ...params.provenance, parameterHash, toolVersion: TOOL_VERSION },
    },
  };
  return { sidecar, json: JSON.stringify(sidecar, null, 2), parameterHash };
}
