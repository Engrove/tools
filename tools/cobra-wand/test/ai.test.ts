import { describe, expect, it } from "vitest";
import {
  applyImport,
  buildAiPrompt,
  extractJson,
  flattenDiff,
  importAiResponse,
  MemoryProvenanceStorage,
  ProvenanceLog,
} from "../src/core/ai/protocol.js";
import { defaultParams } from "../src/core/defaults.js";

describe("CP9 — AI-rundtur (PLAN.md §5)", () => {
  it("bygger prompt med sourcePromptId, aktuell JSON och schema", async () => {
    const p = defaultParams();
    const { text, sourcePromptId } = await buildAiPrompt(p, "Gör hooden 2 mm bredare.");
    expect(sourcePromptId).toMatch(/^cw-[a-z0-9]+-[0-9a-f]{8}$/);
    expect(text).toContain(sourcePromptId);
    expect(text).toContain('"modelFamily"');
    expect(text).toContain("additionalProperties");
    expect(text).toContain("VALIDATION_REJECTED");
    expect(text).toContain("Gör hooden 2 mm bredare.");
  });

  it("extractJson klarar kodstaket och omgivande prosa", () => {
    const inner = '{"a": {"b": "}"}, "c": [1,2]}';
    expect(extractJson("Här är svaret:\n```json\n" + inner + "\n```\nHälsningar")).toBe(inner);
  });

  it("extractJson returnerar null utan objekt", () => {
    expect(extractJson("bara text")).toBeNull();
  });

  it("import av ogiltig JSON ger PARSE_ERROR utan kandidat", () => {
    const r = importAiResponse("{trasig", defaultParams());
    expect(r.ok).toBe(false);
    expect(r.candidate).toBeNull();
    expect(r.errors[0]).toContain("PARSE_ERROR");
  });

  it("import av dokument med LT-nyckel avvisas (VALIDATION_REJECTED)", () => {
    const doc = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
    doc["STATOR_TRACK"] = { evil: true };
    const r = importAiResponse(JSON.stringify(doc), defaultParams());
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("VALIDATION_REJECTED");
  });

  it("giltigt modifierat dokument ger diff med korrekt väg — och tillämpas INTE automatiskt", () => {
    const current = defaultParams();
    const modified = JSON.parse(JSON.stringify(current)) as ReturnType<typeof defaultParams>;
    modified.stations[5].width_mm = 25.5;
    modified.shell.wallThickness_mm = 1.8;
    const r = importAiResponse("```json\n" + JSON.stringify(modified) + "\n```", current);
    expect(r.ok).toBe(true);
    expect(r.candidate).not.toBeNull();
    const paths = r.diff.map((d) => d.path);
    expect(paths).toContain("stations[5].width_mm");
    expect(paths).toContain("shell.wallThickness_mm");
    expect(r.diff.length).toBe(2);
    // current är oförändrad — apply är ett separat, explicit steg.
    expect(current.stations[5].width_mm).not.toBe(25.5);
  });

  it("applyImport sätter proveniens och loggen är append-only", () => {
    const current = defaultParams();
    const modified = JSON.parse(JSON.stringify(current)) as ReturnType<typeof defaultParams>;
    modified.features.topSlots.width_mm = 3.2;
    const r = importAiResponse(JSON.stringify(modified), current);
    expect(r.ok).toBe(true);
    const { params, entry } = applyImport(r.candidate!, "cw-test-deadbeef", r.diff.length);
    expect(params.features.topSlots.width_mm).toBe(3.2);
    expect(params.provenance.sourcePromptId).toBe("cw-test-deadbeef");
    expect(entry.action).toBe("AI_IMPORT_APPLIED");
    const log = new ProvenanceLog(new MemoryProvenanceStorage());
    log.add(entry);
    expect(log.all().length).toBe(1);
    expect(log.all()[0].sourcePromptId).toBe("cw-test-deadbeef");
  });

  it("flattenDiff exkluderar provenance (metadata, ej geometri)", () => {
    const a = defaultParams();
    const b = JSON.parse(JSON.stringify(a)) as ReturnType<typeof defaultParams>;
    b.provenance.createdAt = "2099-01-01T00:00:00Z";
    expect(flattenDiff(a, b)).toEqual([]);
  });
});
