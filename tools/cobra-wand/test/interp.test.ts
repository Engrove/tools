import { describe, expect, it } from "vitest";
import { naturalCubic, periodicCubicPoles, rampBetween, smootherstep } from "../src/core/geometry/interp.js";

describe("periodicCubicPoles — exakt interpolation", () => {
  it("återger cirkelpunkter exakt via (P[i-1]+4P[i]+P[i+1])/6", () => {
    const N = 64;
    const R = 12.34;
    const qx: number[] = [];
    const qy: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      qx.push(R * Math.cos(a));
      qy.push(R * Math.sin(a));
    }
    const px = periodicCubicPoles(qx);
    const py = periodicCubicPoles(qy);
    for (let i = 0; i < N; i++) {
      const im = (i - 1 + N) % N;
      const ip = (i + 1) % N;
      expect((px[im] + 4 * px[i] + px[ip]) / 6).toBeCloseTo(qx[i], 9);
      expect((py[im] + 4 * py[i] + py[ip]) / 6).toBeCloseTo(qy[i], 9);
    }
  });

  it("kastar för n<3", () => {
    expect(() => periodicCubicPoles([1, 2])).toThrow();
  });
});

describe("naturalCubic", () => {
  it("interpolerar stödpunkterna exakt", () => {
    const xs = [0, 0.3, 0.55, 1];
    const ys = [2, -1, 4, 0.5];
    const s = naturalCubic(xs, ys);
    xs.forEach((x, i) => expect(s.at(x)).toBeCloseTo(ys[i], 10));
  });

  it("extrapolerar linjärt utanför intervallet", () => {
    const s = naturalCubic([0, 1], [0, 2]);
    expect(s.at(-1)).toBeCloseTo(-2, 10);
    expect(s.at(2)).toBeCloseTo(4, 10);
  });

  it("avvisar icke-monoton x-vektor", () => {
    expect(() => naturalCubic([0, 0.5, 0.4], [1, 2, 3])).toThrow(/stigande/);
  });
});

describe("smootherstep / rampBetween", () => {
  it("ändpunkter och mittvärde", () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 10);
  });
  it("rampBetween klipper utanför fönstret", () => {
    expect(rampBetween(0.1, 0.2, 0.4)).toBe(0);
    expect(rampBetween(0.5, 0.2, 0.4)).toBe(1);
  });
});
