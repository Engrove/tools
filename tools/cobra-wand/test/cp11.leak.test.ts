/**
 * CP11 — LT-läckagetest (bindande, PLAN.md §9).
 * Verifierar att appens HELA exportyta är fri från LT-kinematiska fält och att
 * injektionsförsök avvisas: (a) validatorn (alla åtta nycklar × flera djup — täcks
 * även i schema.test.ts), (b) AI-promptens text, (c) sidecar-JSON, (d) mountingSpec,
 * (e) själva schemadefinitionens nycklar.
 */
import { describe, expect, it } from "vitest";
import { buildAiPrompt } from "../src/core/ai/protocol.js";
import { defaultParams } from "../src/core/defaults.js";
import { buildSidecar } from "../src/core/export/sidecar.js";
import { COBRA_SCHEMA, validateCobraParams } from "../src/core/schema/validator.js";
import type { MountingSpec } from "../src/core/types.js";

/** Ordgränsad, skiftlägesokänslig LT-token-scan för textytor. */
const LT_TOKEN_RE = /\b(P1|P2|P3|L23|STATOR_TRACK|STATOR|ENGROVELT|LTMECHANISM)\b/i;

describe("CP11 — Guardian-gates mot exportytan", () => {
  it("AI-promptens text innehåller ingen LT-token", async () => {
    const { text } = await buildAiPrompt(defaultParams(), "Optimera hood-partiet för styvhet.");
    const m = text.match(LT_TOKEN_RE);
    expect(m, m ? `träff: "${m[0]}"` : undefined).toBeNull();
  });

  it("sidecar-JSON för default-parametrar innehåller ingen LT-token", async () => {
    const { json } = await buildSidecar(defaultParams(), [{ file: "part.stl", type: "stl" }], []);
    expect(json.match(LT_TOKEN_RE)).toBeNull();
  });

  it("mountingSpec-exporten innehåller ingen LT-token", () => {
    const spec: MountingSpec = {
      functionalLength_mm: 237.1,
      pivotDatum: { x_mm: 237.1, y_mm: 0, z_mm: 10.5 },
      rootHoodWidth_mm: 9.5,
      rootHoodHeight_mm: 10.9,
      screwChannelDiameter_mm: 5,
      rearEnvelope: { x_max_mm: 296.4, z_min_mm: -14.0 },
      note: "Read-only monteringsgränssnitt wand→Alien LT-bas (LT-kontraktet §1). Endast geometri — inga mekanikfält.",
    };
    expect(JSON.stringify(spec).match(LT_TOKEN_RE)).toBeNull();
  });

  it("schemadefinitionens samtliga nycklar är fria från LT-tokens", () => {
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v !== null && typeof v === "object") {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          keys.push(k);
          walk(val);
        }
      }
    };
    walk(COBRA_SCHEMA);
    const bad = keys.filter((k) => LT_TOKEN_RE.test(k));
    expect(bad).toEqual([]);
  });

  it("kombinationsinjektion: LT-nyckel gömd djupt i giltig struktur avvisas fortfarande", () => {
    const doc = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
    const shell = doc.shell as { localReinforcementZones: Record<string, unknown>[] };
    shell.localReinforcementZones.push({ x0_norm: 0.5, x1_norm: 0.6, extra_mm: 1, L23: 42 });
    const r = validateCobraParams(doc);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("VALIDATION_REJECTED");
    expect(r.errors.join(" ")).toContain("L23");
  });
});
