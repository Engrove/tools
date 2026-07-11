import { describe, it, expect } from "vitest";
import {
  createTraceState, ensureShapeMeta, nextName, zonePalette,
  type PathShape, type MeasureShape, type ZoneShape, type TraceState,
} from "../src/trace/model.js";
import {
  autoSmoothPath, dist, hasEnough, samplePath, segDist,
} from "../src/trace/geometry.js";
import {
  enforceAxes, finalizeMeasure, updateMeasurements, addStationGrid,
} from "../src/trace/frame.js";
import {
  applyImportedTrace, buildSvg, enrichShapeForExport, outObj, svgElementKind,
} from "../src/trace/export.js";
import {
  applyProjectPackage, applyTraceObject, isProjectPackage, projectPayload,
  safeFileBase,
} from "../src/trace/project.js";
import { TraceStore, serializeState } from "../src/trace/store.js";
import {
  buildFreeFormPrompt, buildMeasureSyncPrompt, buildProtoRefinePrompt,
  buildTraceTo3DPrompt, buildZoneDetailPrompt, buildZoneRegistry, compactTrace,
  scanPromptForLtTokens, scrubLtTokens,
} from "../src/core/ai/promptTypes.js";
import { defaultParams } from "../src/core/defaults.js";

function stateWithShapes(): TraceState {
  const S = createTraceState({ trace_name: "top", perspective: "top_view", trace_function: "outer_contour_master" });
  S.img = { name: "ref.png", width: 1600, height: 1024, dataUrl: "data:image/png;base64,AAAA" };
  return S;
}

// ---------------------------------------------------------------- model

describe("model", () => {
  it("nextName ökar löpnummer per typbas", () => {
    const S = createTraceState();
    S.shapes.push({ id: "a", type: "line", name: "line_001", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(nextName(S, "line")).toBe("line_002");
    expect(nextName(S, "path")).toBe("bezier_path_001");
    expect(nextName(S, "poly")).toBe("polyline_001");
  });

  it("ensureShapeMeta är idempotent och bevarar operatörsnamn", () => {
    const S = createTraceState();
    const s: PathShape = { id: "p", type: "path", name: "my_contour", closed: false, nodes: [] };
    ensureShapeMeta(S, s, 0);
    const firstName = s.name;
    ensureShapeMeta(S, s, 0);
    expect(s.name).toBe(firstName);
    expect(s.name).toBe("my_contour");
    expect(s.semantic?.feature_kind).toBe("outer_contour");
  });

  it("zonePalette wrappar modulärt", () => {
    expect(zonePalette(0)).toBe(zonePalette(10));
    expect(zonePalette(1)).not.toBe(zonePalette(0));
  });

  it("persistent zonfärgssekvens överlever borttagning (Q10)", () => {
    const S = createTraceState();
    const z1: ZoneShape = { id: "z1", type: "zone", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true };
    ensureShapeMeta(S, z1, 0);
    const c1 = z1.style?.stroke;
    const z2: ZoneShape = { id: "z2", type: "zone", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true };
    ensureShapeMeta(S, z2, 0);
    const c2 = z2.style?.stroke;
    expect(c1).not.toBe(c2); // sekvensen gick framåt trots samma index-argument
  });
});

// ---------------------------------------------------------------- geometry

describe("geometry", () => {
  it("dist och segDist", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(segDist({ x: 0, y: 5 }, { x: -10, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 9);
    expect(segDist({ x: 20, y: 0 }, { x: -10, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(10, 9);
  });

  it("autoSmoothPath ger kollineära in/ut-handtag vid inre auto-nod", () => {
    const s: PathShape = {
      id: "p", type: "path", closed: false,
      nodes: [
        { x: 0, y: 0, in: null, out: null, auto: true, mode: "smooth" },
        { x: 10, y: 5, in: null, out: null, auto: true, mode: "smooth" },
        { x: 20, y: 0, in: null, out: null, auto: true, mode: "smooth" },
      ],
    };
    autoSmoothPath(s);
    const n = s.nodes[1];
    const vIn = { x: n.x - n.in!.x, y: n.y - n.in!.y };
    const vOut = { x: n.out!.x - n.x, y: n.out!.y - n.y };
    const cross = vIn.x * vOut.y - vIn.y * vOut.x;
    expect(Math.abs(cross)).toBeLessThan(1e-9); // kollineära
  });

  it("samplePath ger 1 + n·segment punkter (öppen) och stänger varv", () => {
    const s: PathShape = {
      id: "p", type: "path", closed: false,
      nodes: [
        { x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 3, y: 0 }, auto: true, mode: "smooth" },
        { x: 10, y: 0, in: { x: 7, y: 0 }, out: { x: 10, y: 0 }, auto: true, mode: "smooth" },
      ],
    };
    expect(samplePath(s, 16)).toHaveLength(1 + 16);
    const closed: PathShape = { ...s, closed: true };
    expect(samplePath(closed, 16)).toHaveLength(1 + 2 * 16);
  });

  it("hasEnough följer per-typ-reglerna", () => {
    expect(hasEnough({ id: "z", type: "zone", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: true } as ZoneShape)).toBe(false);
    expect(hasEnough({ id: "z", type: "zone", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true } as ZoneShape)).toBe(true);
    expect(hasEnough({ id: "l", type: "line", points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }] })).toBe(false);
    expect(hasEnough({ id: "l", type: "line", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] })).toBe(true);
  });
});

// ---------------------------------------------------------------- frame

describe("frame", () => {
  it("enforceAxes flyttar kolliderande axel till ledig bas", () => {
    const S = createTraceState();
    S.frame.axes = { x: "+image_x", y: "+image_x", z: "+out_of_screen" };
    enforceAxes(S, "x");
    const bases = new Set([S.frame.axes.x, S.frame.axes.y, S.frame.axes.z].map((v) =>
      v.includes("image_x") ? "x" : v.includes("image_y") ? "y" : "z"));
    expect(bases.size).toBe(3); // alla tre baser distinkta
    expect(S.frame.axes.x).toBe("+image_x"); // ändrad axel vann
  });

  it("finalizeMeasure sätter skala ur injicerat svar och räknar om följande mått", () => {
    const S = stateWithShapes();
    const ref: MeasureShape = { id: "m1", type: "measure", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    S.shapes.push(ref);
    finalizeMeasure(S, ref, () => ({ real: 50, unit: "mm" }));
    expect(ref.is_scale_reference).toBe(true);
    expect(S.frame.scale.px_per_unit).toBeCloseTo(2, 9); // 100 px / 50 mm
    const m2: MeasureShape = { id: "m2", type: "measure", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] };
    S.shapes.push(m2);
    updateMeasurements(S);
    expect(m2.real_length).toBeCloseTo(100, 9); // 200 px / 2 = 100 mm
  });

  it("addStationGrid skapar −count..+count med origin-röd station 0", () => {
    const S = stateWithShapes();
    addStationGrid(S, 100, 3, true);
    const stations = S.shapes.filter((s) => s.type === "station");
    expect(stations).toHaveLength(7);
    const zero = stations.find((s) => s.type === "station" && s.station_index === 0);
    expect(zero?.style?.stroke).toBe("#ff4d6d");
  });
});

// ---------------------------------------------------------------- export

describe("export", () => {
  it("svgElementKind mappar typer korrekt", () => {
    expect(svgElementKind({ id: "l", type: "line", points: [] } as never)).toBe("path");
    expect(svgElementKind({ id: "z", type: "zone", points: [], closed: true } as never)).toBe("polygon");
    expect(svgElementKind({ id: "m", type: "measure", points: [] } as never)).toBe("line");
  });

  it("enrichShapeForExport ger path sampled_polyline_64 (16/segment)", () => {
    const s: PathShape = {
      id: "p", type: "path", closed: false,
      nodes: [
        { x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: 3, y: 0 }, auto: true, mode: "smooth" },
        { x: 10, y: 0, in: { x: 7, y: 0 }, out: { x: 10, y: 0 }, auto: true, mode: "smooth" },
      ],
    };
    const c = enrichShapeForExport(s, 0) as PathShape;
    expect(c.sampled_polyline_64).toHaveLength(1 + 16);
    expect(c.svg_binding?.svg_selector).toBe("g#p");
  });

  it("outObj innehåller trace_meta och strippar dataUrl utan flagga", () => {
    const S = stateWithShapes();
    const o = outObj(S, false);
    expect(o.trace_meta.perspective).toBe("top_view");
    expect(o.image?.dataUrl).toBeUndefined();
    const withImg = outObj(S, true);
    expect(withImg.image?.dataUrl).toContain("data:image/png");
  });

  it("buildSvg binder shape via g#id + metadata-block", () => {
    const S = stateWithShapes();
    S.shapes.push({ id: "line_x", type: "line", name: "edge", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
    const svg = buildSvg(S);
    expect(svg).toContain('id="line_x"');
    expect(svg).toContain('data-json-id="line_x"');
    expect(svg).toContain('id="engrove_trace_json_binding"');
  });

  it("applyImportedTrace flaggar trasiga referensmål (Q12) och hoppar view (Q4)", () => {
    const S = stateWithShapes();
    S.view = { s: 4, x: 10, y: 10 };
    const res = applyImportedTrace(S, {
      shapes: [{ id: "s1", type: "line", name: "e", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        references: [{ relation: "parallel_to", target: "ghost_id", note: "", created_at: "", source: "x" }] }],
      trace_frame: S.frame, selectedId: null,
      view: { s: 99, x: 99, y: 99 },
    });
    expect(res.brokenRefs.length).toBe(1);
    expect(res.brokenRefs[0]).toContain("ghost_id");
    expect(S.view.s).toBe(4); // view importerades ALDRIG
  });
});

// ---------------------------------------------------------------- v15 project

describe("v15 project package", () => {
  it("safeFileBase saneras till säker filbas", () => {
    expect(safeFileBase("Räksmörgås v2.json")).toMatch(/^[\w.-]+$/);
    expect(safeFileBase("")).toBe("engrove_trace_project");
    expect(safeFileBase(null)).toBe("engrove_trace_project");
  });

  it("projectPayload/isProjectPackage: paketet detekteras", () => {
    const S = stateWithShapes();
    const pkg = projectPayload(S);
    expect(pkg.package_type).toBe("engrove_trace_project");
    expect(pkg.schema_version).toBe("engrove_trace_project_v1");
    expect(pkg.source_app.version).toBe("15");
    expect(isProjectPackage(pkg)).toBe(true);
    expect(isProjectPackage({ shapes: [] })).toBe(false);
  });

  it("applyProjectPackage återställer hela sessionen inkl. settings och historik", () => {
    const src = stateWithShapes();
    src.shapes.push({ id: "l", type: "line", name: "e", points: [{ x: 0, y: 0 }, { x: 9, y: 9 }] });
    src.tool = "zone";
    src.snap = false;
    src.snapPx = 20;
    src.view = { s: 3.5, x: 12, y: 34 };
    src.hist.push("{}");
    const pkg = projectPayload(src);

    const dst = createTraceState();
    const r = applyProjectPackage(dst, pkg, "my.engrove-trace");
    expect(dst.shapes).toHaveLength(1);
    expect(dst.tool).toBe("zone");
    expect(dst.snap).toBe(false);
    expect(dst.snapPx).toBe(20);
    expect(dst.hist).toHaveLength(1);
    expect(r.savedView).toEqual({ s: 3.5, x: 12, y: 34 });
    expect(r.imageDataUrl).toContain("data:image/png");
  });

  it("applyTraceObject auto-detekterar projekt vs vanlig trace", () => {
    const S1 = createTraceState();
    const pkg = projectPayload(stateWithShapes());
    expect(applyTraceObject(S1, pkg, "x.engrove-trace").isProject).toBe(true);

    const S2 = createTraceState();
    const plain = { shapes: [{ id: "a", type: "line", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], trace_frame: S2.frame };
    const r = applyTraceObject(S2, plain, "plain.json");
    expect(r.isProject).toBe(false);
    expect(S2.shapes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- store

describe("TraceStore", () => {
  it("add/rename/duplicate ger unika namn", () => {
    const store = new TraceStore();
    store.add({ trace_name: "side" });
    store.add({ trace_name: "side" }); // kollision ⇒ side_2
    const names = store.list().map((d) => d.meta.trace_name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("side");
    expect(names).toContain("side_2");
  });

  it("remove flyttar aktiv markering", () => {
    const store = new TraceStore();
    const a = store.add({ trace_name: "a" });
    const b = store.add({ trace_name: "b" });
    store.setActive(a.id);
    store.remove(a.id);
    expect(store.activeId).toBe(b.id);
  });

  it("toProjectFile/fromProjectFile round-trippar", () => {
    const store = new TraceStore();
    store.add({ trace_name: "t1" });
    store.add({ trace_name: "t2" });
    const file = store.toProjectFile(defaultParams());
    const store2 = new TraceStore();
    const { params } = store2.fromProjectFile(file);
    expect(store2.documents).toHaveLength(2);
    expect(params?.modelFamily).toBe("alien_lt_wand");
  });

  it("documentToPackage/addFromPackage bryggar v15", () => {
    const store = new TraceStore();
    const d = store.add({ trace_name: "bridge" });
    const doc = store.get(d.id)!;
    doc.state.shapes.push({ id: "l", type: "line", name: "e", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] });
    const pkg = store.documentToPackage(d.id)!;
    expect(isProjectPackage(pkg)).toBe(true);
    const back = store.addFromPackage(pkg, "bridge.engrove-trace", { trace_name: "bridge_in" });
    expect(store.get(back.id)?.state.shapes.length).toBe(1);
  });

  it("serializeState tappar _im men behåller dataUrl", () => {
    const S = stateWithShapes();
    (S.img as { _im?: unknown })._im = { fake: true };
    const ser = serializeState(S);
    expect((ser.img as { _im?: unknown })._im).toBeUndefined();
    expect(ser.img?.dataUrl).toContain("data:image/png");
  });
});

// ---------------------------------------------------------------- promptTypes

describe("AI prompt types", () => {
  it("scrubLtTokens neutraliserar förbjudna tokens; scan hittar dem", () => {
    expect(scrubLtTokens("nära P1 och STATOR_TRACK")).not.toMatch(/\bP1\b|\bSTATOR_TRACK\b/);
    expect(scanPromptForLtTokens("text med P2 här").length).toBeGreaterThan(0);
    expect(scanPromptForLtTokens("helt ren text").length).toBe(0);
  });

  it("compactTrace strippar dataUrl och behåller perspektiv/funktion", () => {
    const store = new TraceStore();
    const d = store.add({ trace_name: "t", perspective: "side_view_left", trace_function: "profile_guide" });
    const ct = compactTrace(store.get(d.id)!);
    expect(ct.perspective).toBe("side_view_left");
    expect(JSON.stringify(ct)).not.toContain("dataUrl");
  });

  it("alla fem promptbyggare producerar denylist-fria promptytor", async () => {
    const store = new TraceStore();
    // Injicera provocerande LT-tokens i operatörstext:
    const d = store.add({ trace_name: "P1_body", perspective: "top_view", trace_function: "outer_contour_master" });
    const doc = store.get(d.id)!;
    doc.meta.description = "kropp nära STATOR och L23";
    doc.state.shapes.push({
      id: "z", type: "zone", name: "STATOR_zone", role: "zone",
      description: "ENGROVELT proxyområde", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true,
    });
    doc.state.shapes.push({
      id: "m", type: "measure", name: "P2_len", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      real_length: 50, unit: "mm", is_scale_reference: true,
    });
    const params = defaultParams();

    const prompts = await Promise.all([
      buildTraceTo3DPrompt(store.documents as never),
      buildProtoRefinePrompt(params, "gör nosen med P3 tunnare", store.documents as never),
      buildZoneDetailPrompt(params, store.documents as never, [{ traceId: d.id, shapeId: "z" }], "detaljera STATOR"),
      buildMeasureSyncPrompt(params, store.documents as never),
      buildFreeFormPrompt(params, "P1 STATOR justering"),
    ]);
    for (const p of prompts) {
      expect(scanPromptForLtTokens(p.text)).toEqual([]);
      expect(p.sourcePromptId).toMatch(/^cw-/);
    }
  });

  it("trace_to_3d bäddar in schema och trace-data", async () => {
    const store = new TraceStore();
    store.add({ trace_name: "t" });
    const p = await buildTraceTo3DPrompt(store.documents as never);
    expect(p.text).toContain("alien_lt_wand");
    expect(p.text).toContain("Bindande JSON-schema");
  });

  it("zonregistret adresserar via (traceId, shapeId) — samma zonnamn i två traces förblir åtskilda", async () => {
    const store = new TraceStore();
    const a = store.add({ trace_name: "top_view_trace", perspective: "top_view" });
    const b = store.add({ trace_name: "side_view_trace", perspective: "side_view_left" });
    const docA = store.get(a.id)!;
    const docB = store.get(b.id)!;
    // Två zoner med IDENTISKT namn i olika traces — ett namnbaserat register skulle kollapsa dem.
    docA.state.shapes.push({
      id: "zoneA", type: "zone", name: "headshell_area", role: "zone",
      description: "top view zon", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true,
    });
    docB.state.shapes.push({
      id: "zoneB", type: "zone", name: "headshell_area", role: "zone",
      description: "side view zon", points: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }], closed: true,
    });

    const registry = buildZoneRegistry(store.documents as never);
    expect(registry).toHaveLength(2);
    expect(registry.map((z) => z.shapeId).sort()).toEqual(["zoneA", "zoneB"]);

    const params = defaultParams();
    // Adressera ENDAST zonen i trace A trots att namnet är identiskt i B.
    const p = await buildZoneDetailPrompt(params, store.documents as never, [{ traceId: a.id, shapeId: "zoneA" }], "detaljera");
    expect(p.text).toContain("top view zon");
    expect(p.text).not.toContain("side view zon");
  });
});
