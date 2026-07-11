/**
 * v18 trace-tester: SVG auto-trace (node-safe delar), RDP, smart node-editering,
 * panel-layout (utan DOM), projektpaket. Canvas/DOM-beroende delar (detectSvgCandidates,
 * sampleSvgGeometry) täcks av Puppeteer-smoke i scripts/smoke-v18.cjs.
 */
import { describe, it, expect } from "vitest";
import {
  importAutoTraceSummary, repairSvgTraceLinks, svgNumber,
  smartInsertNode, smartDeleteNode, reverseSelectedShape, smartSimplifySelected,
} from "../src/trace/svg-trace.js";
import {
  areaOfPoints, bboxOfPoints, pointInPoly, polyDistance,
  rdpOpen, simplifyPoints, sqSegDist,
} from "../src/trace/geometry.js";
import {
  panelLayoutLimits, readPanelWidth, clampPanelValue,
} from "../src/trace/panel-layout.js";
import {
  createTraceState, defaultSvgTrace, ensureSvgTrace, type PolyShape, type PathShape,
} from "../src/trace/model.js";
import { autoSmoothPath } from "../src/trace/geometry.js";
import { applyProjectPackage, projectPayload } from "../src/trace/project.js";

// ---------------------------------------------------------------- SVG-hjälpfunktioner (node-safe)

describe("svg-trace: rena hjälpfunktioner", () => {
  it("svgNumber hanterar komma och fallback", () => {
    expect(svgNumber("3,14", 0)).toBeCloseTo(3.14, 5);
    expect(svgNumber("abc", 99)).toBe(99);
    expect(svgNumber(null, 5)).toBe(5);
  });

  it("areaOfPoints kvadrat 10×10 ger ±100 px²", () => {
    const ps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(Math.abs(areaOfPoints(ps))).toBeCloseTo(100, 9);
  });

  it("areaOfPoints triangel (3,4,5-hörn)", () => {
    const ps = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }];
    expect(Math.abs(areaOfPoints(ps))).toBeCloseTo(6, 9);
  });

  it("bboxOfPoints räknar korrekt", () => {
    const ps = [{ x: 1, y: 2 }, { x: 5, y: -3 }, { x: 3, y: 7 }];
    const b = bboxOfPoints(ps);
    expect(b.x).toBe(1); expect(b.y).toBe(-3); expect(b.w).toBe(4); expect(b.h).toBe(10);
  });

  it("pointInPoly ray-casting: inne och ute i en enkel fyrkant", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPoly({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPoly({ x: 15, y: 5 }, sq)).toBe(false);
  });

  it("sqSegDist ger noll för punkt på segmentet", () => {
    expect(sqSegDist({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 9);
    expect(sqSegDist({ x: 0, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(9, 9);
  });

  it("polyDistance till närmsta kant", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polyDistance({ x: 5, y: -3 }, sq, false)).toBeCloseTo(3, 9);
  });
});

// ---------------------------------------------------------------- RDP

describe("RDP simplifyPoints", () => {
  it("rdpOpen med tol=0 returnerar alla punkter", () => {
    const ps = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }];
    expect(rdpOpen(ps, 0)).toHaveLength(4);
  });

  it("rdpOpen förenklar rak linje till 2 punkter", () => {
    const ps = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }));
    const out = rdpOpen(ps, 0.01);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 9, y: 0 });
  });

  it("simplifyPoints behåller minst 3 punkter för sluten form", () => {
    // En liten triangel skall ej simplifieras bort
    const tri = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 2.5, y: 4 }];
    const out = simplifyPoints(tri, 0.5, true);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("simplifyPoints bevarar extremt hög tolerans om form inte är rak", () => {
    const ps = [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }];
    const out = simplifyPoints(ps, 100, false);
    expect(out.length).toBe(2); // bara start + slut bevaras
  });
});

// ---------------------------------------------------------------- SVG kandidatimport

describe("importAutoTraceSummary", () => {
  it("importerar kandidater med korrekta defaultvärden", () => {
    const st = importAutoTraceSummary({
      source_name: "test.svg",
      candidates: [
        { element_id: "path1", tag: "path", closed: true, area_px2: 100, length_px: 50, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
      ],
    });
    expect(st.sourceName).toBe("test.svg");
    expect(st.candidates).toHaveLength(1);
    expect(st.candidates[0].status).toBe("include");
    expect(st.candidates[0].closed).toBe(true);
    expect(st.candidates[0].area).toBe(100);
    expect(st.candidates[0].unavailable).toBe(false);
  });

  it("kandidat utan points markeras unavailable", () => {
    const st = importAutoTraceSummary({
      candidates: [{ element_id: "x" }],
    });
    expect(st.candidates[0].unavailable).toBe(true);
  });
});

// ---------------------------------------------------------------- repairSvgTraceLinks

describe("repairSvgTraceLinks", () => {
  it("reparerar tracedShapeId via label-matchning", () => {
    const S = createTraceState();
    S.shapes.push({ id: "s1", type: "poly", name: "path_001", closed: false, points: [] });
    S.svgTrace = defaultSvgTrace();
    S.svgTrace.candidates = [{
      id: "c1", label: "path_001", sourceIndex: 0, elementId: null,
      tag: "path", status: "include", tracedShapeId: "gammal_id_som_inte_existerar",
      closed: true, area: 100, length: 0, bbox: { x: 0, y: 0, w: 0, h: 0 },
      fill: "none", stroke: "none", points: [],
    }];
    repairSvgTraceLinks(S);
    expect(S.svgTrace.candidates[0].tracedShapeId).toBe("s1");
  });
});

// ---------------------------------------------------------------- Smart node-editering

describe("smartInsertNode", () => {
  it("infogar en nod i en poly på närmaste segment", () => {
    const S = createTraceState();
    const s: PolyShape = {
      id: "p", type: "poly", closed: false,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    };
    S.shapes.push(s);
    S.sel = "p";
    S.view.s = 1;
    smartInsertNode(S, { x: 5, y: 0.2 });
    expect(s.points).toHaveLength(4);
    // Ny nod ska vara nära (5, 0)
    const inserted = s.points[1];
    expect(inserted.x).toBeCloseTo(5, 0);
    expect(inserted.y).toBeCloseTo(0, 1);
  });
});

describe("smartDeleteNode", () => {
  it("tar bort närmaste nod om tillräckligt nära (<22/s)", () => {
    const S = createTraceState();
    const s: PolyShape = {
      id: "p", type: "poly", closed: false,
      points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 0 }],
    };
    S.shapes.push(s);
    S.sel = "p";
    S.view.s = 1;
    smartDeleteNode(S, { x: 5, y: 0 });
    expect(s.points).toHaveLength(3);
    expect(s.points.map(p => p.x)).not.toContain(5);
  });

  it("tar inte bort nod om poly skulle bli för kort (min=2 för öppen)", () => {
    const S = createTraceState();
    const s: PolyShape = {
      id: "p", type: "poly", closed: false,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    };
    S.shapes.push(s);
    S.sel = "p";
    S.view.s = 1;
    smartDeleteNode(S, { x: 0, y: 0 });
    expect(s.points).toHaveLength(2); // oförändrad
  });
});

describe("reverseSelectedShape", () => {
  it("reverserar poly-punktordning", () => {
    const S = createTraceState();
    const s: PolyShape = {
      id: "p", type: "poly", closed: false,
      points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }],
    };
    S.shapes.push(s);
    S.sel = "p";
    reverseSelectedShape(S);
    expect(s.points[0].x).toBe(10);
    expect(s.points[2].x).toBe(0);
  });

  it("reverserar path och byter in/out-handtag", () => {
    const S = createTraceState();
    const s: PathShape = {
      id: "p", type: "path", closed: false,
      nodes: [
        { x: 0, y: 0, in: { x: -1, y: 0 }, out: { x: 1, y: 0 }, auto: false, mode: "smooth" },
        { x: 10, y: 0, in: { x: 9, y: 0 }, out: { x: 11, y: 0 }, auto: false, mode: "smooth" },
      ],
    };
    S.shapes.push(s);
    S.sel = "p";
    reverseSelectedShape(S);
    expect(s.nodes[0].x).toBe(10);
    // in/out byttes
    expect(s.nodes[0].in?.x).toBe(11);
    expect(s.nodes[0].out?.x).toBe(9);
  });
});

describe("smartSimplifySelected", () => {
  it("simplifierar en poly med hög tolerans till 2 punkter (rak)", () => {
    const S = createTraceState();
    const s: PolyShape = {
      id: "p", type: "poly", closed: false,
      points: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 })),
    };
    S.shapes.push(s);
    S.sel = "p";
    smartSimplifySelected(S, 0.01);
    expect(s.points.length).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------- panel-layout

describe("panel-layout (pure logic)", () => {
  it("clampPanelValue klampar korrekt", () => {
    expect(clampPanelValue(50, 80, 200)).toBe(80);
    expect(clampPanelValue(150, 80, 200)).toBe(150);
    expect(clampPanelValue(250, 80, 200)).toBe(200);
  });

  it("clampPanelValue med identiska gränser", () => {
    expect(clampPanelValue(100, 100, 100)).toBe(100);
    expect(clampPanelValue(0, 100, 100)).toBe(100);
  });
});

// ---------------------------------------------------------------- v18 projektpaket

describe("v18 projektpaket + svgTrace-persistens", () => {
  it("svgTrace-data round-trippar via projectPayload/applyProjectPackage", () => {
    const src = createTraceState();
    ensureSvgTrace(src);
    src.svgTrace.sourceName = "test.svg";
    src.svgTrace.candidates = [{
      id: "c1", label: "path_001", sourceIndex: 0, elementId: "path1",
      tag: "path", status: "include", tracedShapeId: null,
      closed: true, area: 100, length: 50, bbox: { x: 0, y: 0, w: 10, h: 10 },
      fill: "red", stroke: "none", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }],
    }];
    src.svgTrace.settings.simplifyTol = 2.5;
    src.svgTrace.settings.output = "path";

    const pkg = projectPayload(src);
    const dst = createTraceState();
    applyProjectPackage(dst, pkg, "test.engrove-trace");

    expect(dst.svgTrace.sourceName).toBe("test.svg");
    expect(dst.svgTrace.candidates).toHaveLength(1);
    expect(dst.svgTrace.candidates[0].label).toBe("path_001");
    expect(dst.svgTrace.settings.simplifyTol).toBe(2.5);
    expect(dst.svgTrace.settings.output).toBe("path");
  });

  it("sourceText rensas inte vid serialisering (persisteras för re-detect)", () => {
    const S = createTraceState();
    ensureSvgTrace(S);
    S.svgTrace.sourceText = "<svg><rect/></svg>";
    const pkg = projectPayload(S);
    const dst = createTraceState();
    applyProjectPackage(dst, pkg);
    // sourceText bevaras i projektet
    expect(dst.svgTrace.sourceText).toBe("<svg><rect/></svg>");
  });
});
