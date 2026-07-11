/**
 * STL-export + watertight-verifiering (PLAN.md §4 punkt 6, §7).
 *
 * Verifieraren arbetar på float32-BITMÖNSTER (exakt det som skrivs till fil):
 *   – varje riktad kant förekommer exakt en gång och dess motriktning finns
 *     ⇒ sluten, konsekvent orienterad 2-mångfald,
 *   – inga degenererade trianglar,
 *   – signerad volym (divergenssatsen) > 0 ⇒ normaler utåt.
 * Euler-karakteristiken rapporteras (0 för genus-1, 2 för genus-0 osv.) men
 * gate-kravet är kant-/orienterings-/volymvillkoren ovan.
 */
import type { TriMesh, WatertightReport } from "../types.js";

/** Binär STL (little-endian float32) av en TriMesh. */
export function meshToBinarySTL(mesh: TriMesh, header = "Engrove Cobra Wand"): Uint8Array {
  const triCount = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const enc = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, enc.length).set(enc);
  dv.setUint32(80, triCount, true);
  let o = 84;
  const P = mesh.positions;
  for (let t = 0; t < triCount; t++) {
    const i = mesh.indices[t * 3] * 3;
    const j = mesh.indices[t * 3 + 1] * 3;
    const k = mesh.indices[t * 3 + 2] * 3;
    const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
    const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true);
    dv.setFloat32(o + 4, ny / l, true);
    dv.setFloat32(o + 8, nz / l, true);
    o += 12;
    for (const idx of [i, j, k]) {
      dv.setFloat32(o, P[idx], true);
      dv.setFloat32(o + 4, P[idx + 1], true);
      dv.setFloat32(o + 8, P[idx + 2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}

/** Verifierar en TriMesh topologiskt (float32-kvantiserad, dvs. exakt som STL:en skrivs). */
export function verifyMesh(mesh: TriMesh): WatertightReport {
  const q = new Float32Array(mesh.positions); // kvantisera till float32
  const qi = new Uint32Array(q.buffer);
  const vmap = new Map<string, number>();
  const remap = new Uint32Array(q.length / 3);
  for (let v = 0; v < q.length / 3; v++) {
    const key = `${qi[v * 3]}_${qi[v * 3 + 1]}_${qi[v * 3 + 2]}`;
    let id = vmap.get(key);
    if (id === undefined) {
      id = vmap.size;
      vmap.set(key, id);
    }
    remap[v] = id;
  }
  const edges = new Map<string, number>();
  let vol6 = 0;
  let degenerate = 0;
  const triCount = mesh.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const a = remap[mesh.indices[t * 3]];
    const b = remap[mesh.indices[t * 3 + 1]];
    const c = remap[mesh.indices[t * 3 + 2]];
    if (a === b || b === c || a === c) {
      degenerate++;
      continue;
    }
    const i = mesh.indices[t * 3] * 3;
    const j = mesh.indices[t * 3 + 1] * 3;
    const k = mesh.indices[t * 3 + 2] * 3;
    vol6 +=
      q[i] * (q[j + 1] * q[k + 2] - q[j + 2] * q[k + 1]) -
      q[i + 1] * (q[j] * q[k + 2] - q[j + 2] * q[k]) +
      q[i + 2] * (q[j] * q[k + 1] - q[j + 1] * q[k]);
    for (const [p, r] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = `${p}>${r}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let dup = 0;
  let openE = 0;
  for (const [k, cnt] of edges) {
    if (cnt !== 1) dup++;
    const gt = k.indexOf(">");
    if (!edges.has(`${k.slice(gt + 1)}>${k.slice(0, gt)}`)) openE++;
  }
  const V = vmap.size;
  const F = triCount - degenerate;
  const euler = V - edges.size / 2 + F;
  const volume = vol6 / 6;
  return {
    tris: triCount,
    verts: V,
    degenerate,
    dupDirectedEdges: dup,
    openEdges: openE,
    euler,
    volume_mm3: volume,
    watertight: degenerate === 0 && dup === 0 && openE === 0 && volume > 0,
  };
}

/** Parsar binär STL tillbaka till TriMesh (för byte-nivå-verifiering av exporten). */
export function parseBinarySTL(data: Uint8Array): TriMesh {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const triCount = dv.getUint32(80, true);
  const expected = 84 + triCount * 50;
  if (data.byteLength < expected) {
    throw new Error(`STL trunkerad: ${data.byteLength} B, förväntade ${expected} B för ${triCount} trianglar`);
  }
  const positions = new Float32Array(triCount * 9);
  const indices = new Uint32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const o = 84 + t * 50 + 12; // hoppa över normalen
    for (let v = 0; v < 3; v++) {
      positions[t * 9 + v * 3] = dv.getFloat32(o + v * 12, true);
      positions[t * 9 + v * 3 + 1] = dv.getFloat32(o + v * 12 + 4, true);
      positions[t * 9 + v * 3 + 2] = dv.getFloat32(o + v * 12 + 8, true);
    }
    indices[t * 3] = t * 3;
    indices[t * 3 + 1] = t * 3 + 1;
    indices[t * 3 + 2] = t * 3 + 2;
  }
  return { positions, indices };
}
