/**
 * Punkt-i-mesh-test via strålparitet (Möller–Trumbore längs +Z).
 * Används av CP6-gaten för att dimensionellt verifiera slots/borrningar mot den
 * SLUTLIGA tessellerade geometrin (inte mot parametrarna som skapade den).
 * Strålriktningen störs med en liten irrationell vinkel för att undvika
 * kant-/hörnträffar (degenererad paritet).
 */
import type { TriMesh } from "../types.js";

const DIR: [number, number, number] = normalize([1.7e-4, 2.3e-4, 1]);

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function pointInMesh(mesh: TriMesh, px: number, py: number, pz: number): boolean {
  const P = mesh.positions;
  const idx = mesh.indices;
  let crossings = 0;
  const [dx, dy, dz] = DIR;
  const EPS = 1e-9;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = P[a], ay = P[a + 1], az = P[a + 2];
    const e1x = P[b] - ax, e1y = P[b + 1] - ay, e1z = P[b + 2] - az;
    const e2x = P[c] - ax, e2y = P[c + 1] - ay, e2z = P[c + 2] - az;
    const hx = dy * e2z - dz * e2y;
    const hy = dz * e2x - dx * e2z;
    const hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < EPS) continue;
    const inv = 1 / det;
    const sx = px - ax, sy = py - ay, sz = pz - az;
    const u = (sx * hx + sy * hy + sz * hz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt > EPS) crossings++;
  }
  return crossings % 2 === 1;
}
