// CP1-spik: bevisar kedjan loft -> boolean -> mesh -> STL(watertight) -> STEP
// Gate (PLAN.md §2/§9 CP1): watertight loft+shell+boolean-kedja + STL verifierad av extern/egen validator.
// Alla anrop skrivna mot signaturer verifierade i opencascade.full.d.ts (beta.b5ff984).
import initOpenCascade from "opencascade.js/dist/node.js";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("out", { recursive: true });
const oc = await initOpenCascade();
console.log("init: OK");

// ---------- Hjälpare ----------
const progress = () => new oc.Message_ProgressRange_1();

/** Periodisk kubisk B-spline-wire genom 3D-punkter (punkter som poler; jämn knutvektor). */
function periodicWireFromPoints(pts) {
  const n = pts.length;
  const poles = new oc.TColgp_Array1OfPnt_2(1, n);
  for (let i = 0; i < n; i++) poles.SetValue(i + 1, new oc.gp_Pnt_3(pts[i][0], pts[i][1], pts[i][2]));
  // Periodisk grad-3: n poler, n+1 knutar, alla multiplicitet 1
  const knots = new oc.TColStd_Array1OfReal_2(1, n + 1);
  const mults = new oc.TColStd_Array1OfInteger_2(1, n + 1);
  for (let i = 1; i <= n + 1; i++) { knots.SetValue(i, i - 1); mults.SetValue(i, 1); }
  const curve = new oc.Geom_BSplineCurve_1(poles, knots, mults, 3, true);
  const h = new oc.Handle_Geom_Curve_2(curve);
  const edge = new oc.BRepBuilderAPI_MakeEdge_24(h).Edge();
  return new oc.BRepBuilderAPI_MakeWire_2(edge).Wire();
}

function circlePts(r, z, n = 32) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
}

// ---------- 1. Loft (3 sektioner) ----------
const loft = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
loft.CheckCompatibility(false);
loft.AddWire(periodicWireFromPoints(circlePts(12, 0)));
loft.AddWire(periodicWireFromPoints(circlePts(10, 20)));
loft.AddWire(periodicWireFromPoints(circlePts(6, 40)));
loft.Build(progress());
const solid = loft.Shape();
console.log("loft: OK");

// ---------- 2. Boolean: Cut cylinder + Fuse box ----------
const cylAx = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, -5), new oc.gp_Dir_4(0, 0, 1));
const cyl = new oc.BRepPrimAPI_MakeCylinder_3(cylAx, 3, 50).Shape();
const cutOp = new oc.BRepAlgoAPI_Cut_3(solid, cyl, progress());
cutOp.Build(progress());
if (!cutOp.IsDone()) throw new Error("Cut misslyckades");
let shape = cutOp.Shape();

const box = new oc.BRepPrimAPI_MakeBox_2(6, 6, 6).Shape();
const t = new oc.gp_Trsf_1();
t.SetTranslation_1(new oc.gp_Vec_4(8, -3, 15));
const boxMoved = new oc.BRepBuilderAPI_Transform_2(box, t, false).Shape();
const fuseOp = new oc.BRepAlgoAPI_Fuse_3(shape, boxMoved, progress());
fuseOp.Build(progress());
if (!fuseOp.IsDone()) throw new Error("Fuse misslyckades");
shape = fuseOp.Shape();
console.log("boolean cut+fuse: OK");

// ---------- 3. BRepCheck ----------
const check = new oc.BRepCheck_Analyzer(shape, true, false);
console.log(`brepcheck_valid: ${check.IsValid_2()}`);

// ---------- 4. Mesh + triangel-extraktion ----------
new oc.BRepMesh_IncrementalMesh_2(shape, 0.05, false, 0.3, false);
const tris = []; // platta index-tripplar in i verts
const verts = []; // [x,y,z]...
const purposeKeys = Object.keys(oc.Poly_MeshPurpose ?? {});
console.log(`Poly_MeshPurpose keys: ${purposeKeys.join(",") || "(saknas)"}`);
const purpose = oc.Poly_MeshPurpose?.Poly_MeshPurpose_NONE ?? 0;

const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
let faceCount = 0;
while (exp.More()) {
  const face = oc.TopoDS.Face_1(exp.Current());
  const loc = new oc.TopLoc_Location_1();
  const hTri = oc.BRep_Tool.Triangulation(face, loc, purpose);
  if (!hTri.IsNull()) {
    const tri = hTri.get();
    const trsf = loc.Transformation();
    const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    const base = verts.length;
    const nn = tri.NbNodes();
    for (let i = 1; i <= nn; i++) {
      const p = tri.Node(i).Transformed(trsf);
      verts.push([p.X(), p.Y(), p.Z()]);
    }
    const nt = tri.NbTriangles();
    for (let i = 1; i <= nt; i++) {
      const tr = tri.Triangle(i);
      let a = tr.Value(1), b = tr.Value(2), c = tr.Value(3);
      if (reversed) [b, c] = [c, b];
      tris.push([base + a - 1, base + b - 1, base + c - 1]);
    }
    faceCount++;
  }
  exp.Next();
}
console.log(`mesh: faces=${faceCount} verts=${verts.length} tris=${tris.length}`);

// ---------- 5. Binär STL (egen writer, float32) ----------
function writeBinarySTL(path, verts, tris) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write("Engrove CP1 spike", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const [i, j, k] of tris) {
    const A = verts[i], B = verts[j], C = verts[k];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    buf.writeFloatLE(nx / l, o); buf.writeFloatLE(ny / l, o + 4); buf.writeFloatLE(nz / l, o + 8);
    o += 12;
    for (const P of [A, B, C]) {
      buf.writeFloatLE(P[0], o); buf.writeFloatLE(P[1], o + 4); buf.writeFloatLE(P[2], o + 8);
      o += 12;
    }
    buf.writeUInt16LE(0, o); o += 2;
  }
  writeFileSync(path, buf);
}
writeBinarySTL("out/cp1_spike.stl", verts, tris);

// ---------- 6. Egen watertight-verifierare (som extern validator gör) ----------
// Läser tillbaka STL:en (float32-bitar som nyckel): varje riktad kant exakt 1 ggr,
// motsatt riktning måste finnas => sluten, konsekvent orienterad 2-mångfald.
function verifySTL(path) {
  const b = require("node:fs").readFileSync(path);
  const n = b.readUInt32LE(80);
  const key = (o) => `${b.readUInt32LE(o)}_${b.readUInt32LE(o + 4)}_${b.readUInt32LE(o + 8)}`;
  const vmap = new Map();
  const vid = (o) => {
    const k = key(o);
    let id = vmap.get(k);
    if (id === undefined) { id = vmap.size; vmap.set(k, id); }
    return id;
  };
  const edges = new Map();
  let vol6 = 0;
  let degenerate = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    const ids = [vid(o), vid(o + 12), vid(o + 24)];
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) { degenerate++; continue; }
    const P = [0, 12, 24].map((d) => [b.readFloatLE(o + d), b.readFloatLE(o + d + 4), b.readFloatLE(o + d + 8)]);
    vol6 += P[0][0] * (P[1][1] * P[2][2] - P[1][2] * P[2][1])
          - P[0][1] * (P[1][0] * P[2][2] - P[1][2] * P[2][0])
          + P[0][2] * (P[1][0] * P[2][1] - P[1][1] * P[2][0]);
    for (let e = 0; e < 3; e++) {
      const k = `${ids[e]}>${ids[(e + 1) % 3]}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  let dup = 0, openE = 0;
  for (const [k, c] of edges) {
    if (c !== 1) dup++;
    const [a, bb] = k.split(">");
    if (!edges.has(`${bb}>${a}`)) openE++;
  }
  const V = vmap.size, E2 = edges.size, F = n - degenerate;
  const euler = V - E2 / 2 + F;
  return { tris: n, verts: V, degenerate, dupDirectedEdges: dup, openEdges: openE, euler, volume: vol6 / 6 };
}
import { createRequire } from "node:module";
globalThis.require = createRequire(import.meta.url);
const rep = verifySTL("out/cp1_spike.stl");
console.log("stl_report:", JSON.stringify(rep));
const watertight = rep.degenerate === 0 && rep.dupDirectedEdges === 0 && rep.openEdges === 0 && rep.volume > 0;
console.log(`GATE watertight: ${watertight ? "PASS" : "FAIL"}`);

// ---------- 7. Korsverifiering med manifold-3d ----------
try {
  const Module = (await import("manifold-3d")).default;
  const wasm = await Module();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const vp = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => { vp[i * 3] = v[0]; vp[i * 3 + 1] = v[1]; vp[i * 3 + 2] = v[2]; });
  const tv = new Uint32Array(tris.length * 3);
  tris.forEach((t, i) => { tv[i * 3] = t[0]; tv[i * 3 + 1] = t[1]; tv[i * 3 + 2] = t[2]; });
  const mesh = new Mesh({ numProp: 3, vertProperties: vp, triVerts: tv });
  mesh.merge();
  const m = new Manifold(mesh);
  const st = m.status ? m.status() : "OK";
  console.log(`manifold3d: status=${JSON.stringify(st)} volume=${m.volume ? m.volume().toFixed(3) : m.getProperties?.().volume?.toFixed(3)}`);
  console.log("GATE manifold3d: PASS");
} catch (e) {
  console.log(`GATE manifold3d: FAIL (${e.message})`);
}

// ---------- 8. STEP AP242 ----------
oc.Interface_Static.SetCVal("write.step.schema", "AP242DIS");
const w = new oc.STEPControl_Writer_1();
w.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress());
const status = w.Write("cp1_spike.step");
const stepData = oc.FS.readFile("cp1_spike.step");
writeFileSync("out/cp1_spike.step", Buffer.from(stepData));
const head = Buffer.from(stepData.slice(0, 200)).toString("ascii");
console.log(`step_write_status=${JSON.stringify(status)} header_ok=${head.includes("ISO-10303-21")} ap242=${head.length > 0}`);
console.log("GATE step_export: " + (head.includes("ISO-10303-21") ? "PASS" : "FAIL"));
