import { describe, expect, it } from "vitest";
import { defaultParams } from "../src/core/defaults.js";
import { LT_DENYLIST, scanForLtKeys, validateCobraParams } from "../src/core/schema/validator.js";

describe("CP2 — schema & denylist (PLAN.md §3)", () => {
  it("accepterar default-parametrarna", () => {
    const r = validateCobraParams(defaultParams());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.code).toBe("OK");
  });

  const injectionSites: { label: string; inject: (doc: Record<string, unknown>, key: string) => void }[] = [
    { label: "toppnivå", inject: (d, k) => ((d as Record<string, unknown>)[k] = 1) },
    {
      label: "globalDimensions",
      inject: (d, k) => (((d.globalDimensions as Record<string, unknown>)[k] = 1)),
    },
    {
      label: "stations[0]",
      inject: (d, k) => (((d.stations as Record<string, unknown>[])[0][k] = 1)),
    },
    {
      label: "features.rootHub",
      inject: (d, k) =>
        ((((d.features as Record<string, unknown>).rootHub as Record<string, unknown>)[k] = 1)),
    },
  ];

  const originalCaseKeys = ["P1", "P2", "P3", "L23", "STATOR", "STATOR_TRACK", "engroveLt", "ltMechanism"];

  for (const key of originalCaseKeys) {
    for (const site of injectionSites) {
      it(`avvisar LT-nyckel "${key}" injicerad i ${site.label} med VALIDATION_REJECTED`, () => {
        const doc = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
        site.inject(doc, key);
        const r = validateCobraParams(doc);
        expect(r.ok).toBe(false);
        expect(r.code).toBe("VALIDATION_REJECTED");
        expect(r.errors.join(" ")).toContain(key);
      });
    }
  }

  it("matchar denylistan skiftlägesokänsligt (striktare tolkning, dokumenterad)", () => {
    const doc = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
    (doc as Record<string, unknown>)["stator"] = { x: 1 };
    const r = validateCobraParams(doc);
    expect(r.code).toBe("VALIDATION_REJECTED");
  });

  it("scanForLtKeys hittar nästlade träffar med korrekt väg", () => {
    const hits = scanForLtKeys({ a: { b: [{ ltMechanism: 5 }] } });
    expect(hits).toEqual(["$.a.b[0].ltMechanism"]);
  });

  it("avvisar okänd (icke-LT) nyckel som SCHEMA_INVALID", () => {
    const doc = JSON.parse(JSON.stringify(defaultParams())) as Record<string, unknown>;
    doc["favoriteColor"] = "teal";
    const r = validateCobraParams(doc);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("SCHEMA_INVALID");
  });

  it("avvisar gränsbrott (slotToeIn_deg utanför ±5°)", () => {
    const doc = defaultParams();
    doc.globalDimensions.slotToeIn_deg = 90;
    const r = validateCobraParams(doc);
    expect(r.code).toBe("SCHEMA_INVALID");
    expect(r.errors.join(" ")).toContain("slotToeIn_deg");
  });

  it("denylistan täcker exakt de åtta kontraktsnycklarna", () => {
    expect([...LT_DENYLIST].sort()).toEqual(
      ["P1", "P2", "P3", "L23", "STATOR", "STATOR_TRACK", "ENGROVELT", "LTMECHANISM"].sort(),
    );
  });
});
