/**
 * Geometri-gates (CP3–CP7, CP10) — Rev B / Engrove Alien LT.
 * Alien LT: L=237.1 mm, X=0 nålspets, X=1.0·L pivot, kropp −0.05..1.25L.
 * Rak Y-symmetrisk kropp (ingen offsetböj/yaw). Kör mot riktiga opencascade.js i Node.
 * En enda testfil ⇒ en WASM-init (~11 s). Tunga steg har explicita timeouts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getOC, type OC } from "../src/core/oc/load.js";
import {
  buildGeometry, EXPORT_QUALITY, PREVIEW_QUALITY,
  type GeometryResult,
} from "../src/core/geometry/engine.js";
import { defaultParams } from "../src/core/defaults.js";
import { meshToBinarySTL, parseBinarySTL, verifyMesh } from "../src/core/export/stl.js";
import { writeSTEP } from "../src/core/export/step.js";
import { SectionField, sectionPoints3D } from "../src/core/geometry/section.js";
import { pointInMesh } from "../src/core/checks/meshProbe.js";
import { runManufacturabilityChecks } from "../src/core/checks/manufacturability.js";
import { computeParameterHash } from "../src/core/export/sidecar.js";

let oc: OC;
let geo: GeometryResult;

beforeAll(async () => {
  oc = await getOC();
  geo = buildGeometry(oc, defaultParams(), PREVIEW_QUALITY);
}, 180_000);

// ---------------------------------------------------------------- CP3: sektionsfält (analytiskt)

describe("CP3 — sektionsfältet är dimensionsexakt (analytiskt)", () => {
  it("bredd ~21.34 mm vid u=0.38 (interpolerad §8-knut)", () => {
    const p = defaultParams();
    const f = new SectionField(p);
    const s = f.sampleAt(0.38);
    const pts = sectionPoints3D(s, 64)!;
    const ys = pts.map((q) => q[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(21.339, 1); // ±0.1
  });

  it("yaw = 0 och yCenter = 0 i hela kroppen (rak Y-symmetrisk LT)", () => {
    const f = new SectionField(defaultParams());
    for (const u of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      const s = f.sampleAt(u);
      expect(s.yaw_rad, `yaw vid u=${u}`).toBe(0);
      expect(s.yCenter_mm, `yCenter vid u=${u}`).toBe(0);
    }
  });

  it("bbox X ∈ [nose·L, rear·L] = ca [−11.9, 296.4] mm", () => {
    const p = defaultParams();
    const L = p.globalDimensions.functionalLength_mm;
    const noseX = p.globalDimensions.noseExtent_norm * L;
    const rearX = p.globalDimensions.rearExtent_norm * L;
    expect(noseX).toBeCloseTo(-11.855, 0);
    expect(rearX).toBeCloseTo(296.375, 0);
  });
});

// ---------------------------------------------------------------- CP4/CP5: loft, skal, watertight

describe("CP4/CP5 — loft, skal och watertight", () => {
  it("partmesh är watertight med positiv volym", () => {
    const r = verifyMesh(geo.partMesh);
    expect(r.openEdges).toBe(0);
    expect(r.dupDirectedEdges).toBe(0);
    expect(r.degenerate).toBe(0);
    expect(r.volume_mm3).toBeGreaterThan(0);
    expect(r.watertight).toBe(true);
  });

  it("skalsolid finns, är watertight och V_skal < V_plugg", () => {
    expect(geo.shellShape).not.toBeNull();
    expect(geo.shellMesh).not.toBeNull();
    const r = verifyMesh(geo.shellMesh!);
    expect(r.watertight).toBe(true);
    expect(geo.metrics.volumeShellSolid_mm3!).toBeGreaterThan(0);
    expect(geo.metrics.volumeShellSolid_mm3!).toBeLessThan(geo.metrics.volumePlug_mm3);
  });

  it("bbox: kroppen spänner ≈ [−12, 297] mm i X (Alien LT-dimensioner)", () => {
    const { min, max } = geo.metrics.bbox;
    expect(min[0]).toBeGreaterThan(-13);
    expect(min[0]).toBeLessThan(-10.5);
    expect(max[0]).toBeGreaterThan(293);
    expect(max[0]).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------- CP6: dimensionella sonder

describe("CP6 — dimensionella sonder mot SLUTLIG mesh (slots, sadel, skruvkanal)", () => {
  it("headshell-slotpar: hål vid centrum, solid bortom slotändar", () => {
    const p = defaultParams();
    const f = new SectionField(p);
    const cs = p.features.topSlots.center_x_norm;
    const s = f.sampleAt(cs);
    const zProbe = s.zTop_mm - f.wallAt(cs) / 2;
    const halfLen = p.features.topSlots.length_mm / 2;
    const halfSpacing = p.features.topSlots.spacing_mm / 2;
    for (const v of [-halfSpacing, +halfSpacing]) {
      expect(pointInMesh(geo.partMesh, s.x_mm, v, zProbe), `slotcentrum v=${v}`).toBe(false);
      expect(pointInMesh(geo.partMesh, s.x_mm + halfLen + 1, v, zProbe), `bortom slotände v=${v}`).toBe(true);
    }
    // Mellan slottarna = solid
    expect(pointInMesh(geo.partMesh, s.x_mm, 0, zProbe), "takplatta mellan slots").toBe(true);
  });

  it("cartridge-sadel: nisch öppen underifrån; tak kvar", () => {
    const p = defaultParams();
    const f = new SectionField(p);
    const cb = p.features.cartridgeSaddle.center_x_norm;
    const s = f.sampleAt(cb);
    const zNisch = s.zBot_mm + p.features.cartridgeSaddle.depth_mm / 2;
    expect(pointInMesh(geo.partMesh, s.x_mm, 0, zNisch - 0.5), "i nischen").toBe(false);
    expect(pointInMesh(geo.partMesh, s.x_mm, 0, s.zTop_mm - f.wallAt(cb) / 2), "tak").toBe(true);
  });

  it("skruvkanal: vertikal borrning öppen, solid bredvid", () => {
    const p = defaultParams();
    const f = new SectionField(p);
    const sk = p.features.screwChannel;
    const s = f.sampleAt(sk.center_x_norm);
    const zMid = (s.zTop_mm + s.zBot_mm) / 2;
    expect(pointInMesh(geo.partMesh, s.x_mm, 0, zMid), "i skruvkanalen").toBe(false);
    const rOut = sk.diameter_mm / 2 + 1.0;
    expect(pointInMesh(geo.partMesh, s.x_mm, rOut, zMid), "utanför skruvkanal").toBe(true);
  });
});

// ---------------------------------------------------------------- CP7: export

describe("CP7 — export", () => {
  it(
    "STL i exportkvalitet: watertight, byte-rundtur identisk topologi, volym ≈ B-rep-volym",
    () => {
      // Bygger geometrin FÄRSK vid EXPORT_QUALITY (samma mönster som src/app/main.ts
      // gated()) i stället för att åter-tessellera geo.partShape, som redan bär en
      // Poly_Triangulation från PREVIEW_QUALITY i beforeAll. Att köra
      // BRepMesh_IncrementalMesh en andra gång på en redan mesh:ad shape med annan
      // deflection lämnar OCCT i ett tillstånd med kvarvarande degenererade
      // trianglar vid de gamla triangulationsgränserna — ett verifierat OCCT-
      // antimönster, inte ett fel i geometrimotorn eller STL-verifieraren.
      const geoExport = buildGeometry(oc, defaultParams(), EXPORT_QUALITY);
      try {
        const mesh = geoExport.partMesh;
        const rep = verifyMesh(mesh);
        expect(rep.watertight).toBe(true);
        const bytes = meshToBinarySTL(mesh, "alien lt part");
        const back = verifyMesh(parseBinarySTL(bytes));
        expect(back.watertight).toBe(true);
        expect(back.tris).toBe(rep.tris);
        const rel = Math.abs(back.volume_mm3 - geoExport.metrics.volumePart_mm3) / geoExport.metrics.volumePart_mm3;
        expect(rel).toBeLessThan(0.005);
      } finally {
        geoExport.dispose();
      }
    },
    120_000,
  );

  it(
    "manifold-3d korsverifierar volymen",
    async () => {
      const Module = (await import("manifold-3d")).default;
      const wasm = await Module();
      wasm.setup();
      const mesh = geo.partMesh;
      const m = new wasm.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(mesh.positions),
        triVerts: new Uint32Array(mesh.indices),
      });
      m.merge();
      const man = new wasm.Manifold(m);
      const own = verifyMesh(mesh);
      expect(Math.abs(man.volume() - own.volume_mm3) / own.volume_mm3).toBeLessThan(1e-6);
    },
    120_000,
  );

  it(
    "STEP: AP242-schema, ISO-10303-21-header, namn + parameterHash inbäddade",
    async () => {
      const hash = await computeParameterHash(defaultParams());
      const res = writeSTEP(oc, geo.plugShape, { name: "alien_lt_master_plug", parameterHash: hash });
      expect(res.schemaLine).toContain("AP242");
      // res.data är en Uint8Array (rå STEP-fil) — måste avkodas till text innan
      // strängjämförelser, annars letar toContain efter en sträng bland byte-tal.
      const text = new TextDecoder().decode(res.data);
      expect(text.slice(0, 50)).toContain("ISO-10303-21");
      expect(text).toContain("alien_lt_master_plug");
      expect(text).toContain(hash);
    },
    120_000,
  );
});

// ---------------------------------------------------------------- CP10: tillverkningsbarhetskontroller

describe("CP10 — tillverkningsbarhetskontroller (Rev B)", () => {
  it("runManufacturabilityChecks returnerar fyra eller fem kontroller", () => {
    const checks = runManufacturabilityChecks(defaultParams(), geo);
    // min_wall, shell_integrity, min_feature, draft_heuristic (+ ev tip_trim INFO)
    expect(checks.length).toBeGreaterThanOrEqual(4);
    expect(checks.map((c) => c.id)).toContain("min_wall");
    expect(checks.map((c) => c.id)).toContain("shell_integrity");
    expect(checks.map((c) => c.id)).toContain("min_feature");
    expect(checks.map((c) => c.id)).toContain("draft_heuristic");
  });

  it("min_wall PASS med standard-parametrar (vägg 1.6 mm ≥ minWall 1.2 mm)", () => {
    const checks = runManufacturabilityChecks(defaultParams(), geo);
    const mw = checks.find((c) => c.id === "min_wall")!;
    expect(mw.status).toBe("PASS");
  });

  it("shell_integrity PASS (skalsolid byggdes, V_skal > 0)", () => {
    const checks = runManufacturabilityChecks(defaultParams(), geo);
    const si = checks.find((c) => c.id === "shell_integrity")!;
    expect(si.status).toBe("PASS");
  });

  it("min_feature PASS (slotbredd 2.9 mm ≥ minFeature 0.4 mm)", () => {
    const checks = runManufacturabilityChecks(defaultParams(), geo);
    const mf = checks.find((c) => c.id === "min_feature")!;
    expect(mf.status).toBe("PASS");
  });
});
