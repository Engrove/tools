import { describe, expect, it } from "vitest";
import { meshToBinarySTL, parseBinarySTL, verifyMesh } from "../src/core/export/stl.js";
import type { TriMesh } from "../src/core/types.js";

/** Enhetskub [0,1]³ med utåtriktade normaler (12 trianglar). */
function cube(): TriMesh {
  const p = [
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // z=0 (botten)
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, // z=1 (topp)
  ];
  const q = [
    0, 2, 1, 0, 3, 2, // botten (normal −Z)
    4, 5, 6, 4, 6, 7, // topp (+Z)
    0, 1, 5, 0, 5, 4, // y=0 (−Y)
    3, 6, 2, 3, 7, 6, // y=1 (+Y)
    1, 2, 6, 1, 6, 5, // x=1 (+X)
    0, 4, 7, 0, 7, 3, // x=0 (−X)
  ];
  return { positions: new Float32Array(p), indices: new Uint32Array(q) };
}

describe("verifyMesh — testa testaren", () => {
  it("godkänner sluten kub: watertight, Euler=2, volym=1", () => {
    const r = verifyMesh(cube());
    expect(r.watertight).toBe(true);
    expect(r.openEdges).toBe(0);
    expect(r.dupDirectedEdges).toBe(0);
    expect(r.euler).toBe(2);
    expect(r.volume_mm3).toBeCloseTo(1, 9);
  });

  it("underkänner kub med borttagen triangel (öppna kanter)", () => {
    const c = cube();
    const r = verifyMesh({ positions: c.positions, indices: c.indices.slice(0, c.indices.length - 3) });
    expect(r.watertight).toBe(false);
    expect(r.openEdges).toBeGreaterThan(0);
  });

  it("underkänner kub med flippad triangel (dubblerade riktade kanter)", () => {
    const c = cube();
    const idx = new Uint32Array(c.indices);
    [idx[1], idx[2]] = [idx[2], idx[1]]; // flippa första triangeln
    const r = verifyMesh({ positions: c.positions, indices: idx });
    expect(r.watertight).toBe(false);
    expect(r.dupDirectedEdges).toBeGreaterThan(0);
  });

  it("underkänner inverterad kub (negativ volym) trots sluten topologi", () => {
    const c = cube();
    const idx = new Uint32Array(c.indices);
    for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
    const r = verifyMesh({ positions: c.positions, indices: idx });
    expect(r.openEdges).toBe(0);
    expect(r.volume_mm3).toBeCloseTo(-1, 9);
    expect(r.watertight).toBe(false);
  });

  it("STL-rundtur: skriv → parsa → verifiera identisk topologi och volym", () => {
    const stl = meshToBinarySTL(cube(), "unit cube");
    const back = parseBinarySTL(stl);
    const r = verifyMesh(back);
    expect(r.watertight).toBe(true);
    expect(r.tris).toBe(12);
    expect(r.verts).toBe(8);
    expect(r.volume_mm3).toBeCloseTo(1, 6);
  });
});
