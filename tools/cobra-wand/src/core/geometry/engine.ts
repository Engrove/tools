/**
 * Geometrimotor (PLAN.md §4, CP3–CP6). All OCCT-interaktion isolerad hit.
 *
 * Pipeline: sektionsfält → periodiska interpolerande B-spline-wires →
 * ThruSections-loft (OML, IML med variabel inset = vägg(x)) →
 * booleska features (bay, slots, wireExit, rootBoss) → tessellering.
 *
 * Wire-konstruktion: exakta poler via periodicCubicPoles (cyklisk tridiagonal)
 * ⇒ samplade konturpunkter LIGGER PÅ kurvan ⇒ bredd/höjd träffas exakt vid axlarna.
 *
 * Minne: OCCT-objekt i WASM frigörs ej av GC. Byggets temporärer spåras i en
 * scope-lista och delete():as efter bygget; returnerade shapes ägs av anroparen
 * via GeometryResult.dispose().
 */
import type { OC } from "../oc/load.js";
import type { CobraParams, GeometryMetrics, MountingSpec, SectionSample, TriMesh } from "../types.js";
import { SectionField, sectionPoints3D } from "./section.js";
import { periodicCubicPoles } from "./interp.js";

export interface BuildQuality {
  loftSections: number;
  pointsPerSection: number;
  linDeflection_mm: number;
  angDeflection_rad: number;
  brepCheck: boolean;
}

export const PREVIEW_QUALITY: BuildQuality = {
  loftSections: 25,
  pointsPerSection: 48,
  linDeflection_mm: 0.08,
  angDeflection_rad: 0.5,
  brepCheck: false,
};

export const EXPORT_QUALITY: BuildQuality = {
  loftSections: 41,
  pointsPerSection: 72,
  linDeflection_mm: 0.01,
  angDeflection_rad: 0.25,
  brepCheck: true,
};

export interface GeometryResult {
  /** Master-plugg (D2): OML ∪ rootBoss, inga snitt. */
  plugShape: unknown;
  /** Full del: plugg − bay − slots − wireExit. */
  partShape: unknown;
  /** Skalsolid (OML − IML) för inspektion, null om IML degenererad. */
  shellShape: unknown | null;
  partMesh: TriMesh;
  shellMesh: TriMesh | null;
  metrics: GeometryMetrics;
  mountingSpec: MountingSpec;
  /** x_norm-zoner där IML-sektionen blev degenererad (självkorsningsindikator). */
  innerInvalidZones: number[];
  sections: SectionSample[];
  brepValid: boolean | null;
  dispose(): void;
}

type Deleter = { delete?: () => void };

class Scope {
  private items: Deleter[] = [];
  track<T extends Deleter>(o: T): T {
    this.items.push(o);
    return o;
  }
  drop(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].delete?.();
      } catch {
        /* redan frigjord */
      }
    }
    this.items = [];
  }
}

function progress(oc: OC, sc: Scope) {
  return sc.track(new oc.Message_ProgressRange_1());
}

/** Sluten, exakt interpolerande periodisk kubisk B-spline-wire genom 3D-punkter. */
function buildPeriodicWire(oc: OC, sc: Scope, pts: [number, number, number][]): unknown {
  const n = pts.length;
  const px = periodicCubicPoles(pts.map((p) => p[0]));
  const py = periodicCubicPoles(pts.map((p) => p[1]));
  const pz = periodicCubicPoles(pts.map((p) => p[2]));
  const poles = sc.track(new oc.TColgp_Array1OfPnt_2(1, n));
  for (let i = 0; i < n; i++) poles.SetValue(i + 1, sc.track(new oc.gp_Pnt_3(px[i], py[i], pz[i])));
  const knots = sc.track(new oc.TColStd_Array1OfReal_2(1, n + 1));
  const mults = sc.track(new oc.TColStd_Array1OfInteger_2(1, n + 1));
  for (let i = 1; i <= n + 1; i++) {
    knots.SetValue(i, i - 1);
    mults.SetValue(i, 1);
  }
  const curve = new oc.Geom_BSplineCurve_1(poles, knots, mults, 3, true);
  const handle = sc.track(new oc.Handle_Geom_Curve_2(curve));
  const edgeMk = sc.track(new oc.BRepBuilderAPI_MakeEdge_24(handle));
  const wireMk = sc.track(new oc.BRepBuilderAPI_MakeWire_2(edgeMk.Edge()));
  return wireMk.Wire();
}

/** Loft av sektionsfältet. inset=true ⇒ IML med per-sektion vägg(x). Returnerar {shape|null, invalidZones}. */
function buildLoft(
  oc: OC,
  sc: Scope,
  sections: SectionSample[],
  pointsPerSection: number,
  inset: boolean,
): { shape: unknown | null; invalidZones: number[] } {
  const invalid: number[] = [];
  const rings: { s: SectionSample; pts: [number, number, number][] }[] = [];
  for (const s of sections) {
    const pts = sectionPoints3D(s, pointsPerSection, inset ? s.wall_mm : 0);
    if (pts === null) invalid.push(s.x_norm);
    else rings.push({ s, pts });
  }
  if (inset && invalid.length > 0) {
    // Kontiguitetskrav: IML byggs endast om giltiga sektioner bildar en sammanhängande följd ≥ 3.
    const validNorms = new Set(rings.map((r) => r.s.x_norm));
    let run = 0;
    let bestStart = -1;
    let bestLen = 0;
    let curStart = 0;
    sections.forEach((s, i) => {
      if (validNorms.has(s.x_norm)) {
        if (run === 0) curStart = i;
        run++;
        if (run > bestLen) {
          bestLen = run;
          bestStart = curStart;
        }
      } else run = 0;
    });
    if (bestLen < 3) return { shape: null, invalidZones: invalid };
    const kept = sections.slice(bestStart, bestStart + bestLen);
    rings.length = 0;
    for (const s of kept) {
      const pts = sectionPoints3D(s, pointsPerSection, s.wall_mm);
      if (pts) rings.push({ s, pts });
    }
  }
  if (rings.length < 3) return { shape: null, invalidZones: invalid };
  const loft = sc.track(new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6));
  loft.CheckCompatibility(false);
  for (const r of rings) loft.AddWire(buildPeriodicWire(oc, sc, r.pts) as never);
  loft.Build(progress(oc, sc));
  return { shape: loft.Shape(), invalidZones: invalid };
}

function translateRotateZ(
  oc: OC,
  sc: Scope,
  shape: unknown,
  yaw_rad: number,
  tx: number,
  ty: number,
  tz: number,
): unknown {
  const t = sc.track(new oc.gp_Trsf_1());
  const axis = sc.track(new oc.gp_Ax1_2(sc.track(new oc.gp_Pnt_3(0, 0, 0)), sc.track(new oc.gp_Dir_4(0, 0, 1))));
  t.SetRotation_1(axis, yaw_rad);
  const t2 = sc.track(new oc.gp_Trsf_1());
  t2.SetTranslation_1(sc.track(new oc.gp_Vec_4(tx, ty, tz)));
  t2.Multiply(t); // först rotation, sedan translation
  const mk = sc.track(new oc.BRepBuilderAPI_Transform_2(shape as never, t2, true));
  return mk.Shape();
}

/** Kapselprisma: längd length (X), bredd width (Y), höjd z0..z1. Centrerad i origo (XY). */
function buildCapsule(oc: OC, sc: Scope, length: number, width: number, z0: number, z1: number): unknown {
  const r = width / 2;
  const straight = Math.max(0.01, length - width);
  const h = z1 - z0;
  const boxMk = sc.track(new oc.BRepPrimAPI_MakeBox_2(straight, width, h));
  let solid = translateRotateZ(oc, sc, boxMk.Shape(), 0, -straight / 2, -width / 2, z0);
  for (const sx of [-straight / 2, straight / 2]) {
    const ax = sc.track(
      new oc.gp_Ax2_3(sc.track(new oc.gp_Pnt_3(sx, 0, z0)), sc.track(new oc.gp_Dir_4(0, 0, 1))),
    );
    const cyl = sc.track(new oc.BRepPrimAPI_MakeCylinder_3(ax, r, h));
    const fuse = sc.track(new oc.BRepAlgoAPI_Fuse_3(solid as never, cyl.Shape(), progress(oc, sc)));
    fuse.Build(progress(oc, sc));
    if (!fuse.IsDone()) throw new Error("Kapselfuse misslyckades");
    solid = fuse.Shape();
  }
  return solid;
}

function boolOp(oc: OC, sc: Scope, kind: "cut" | "fuse", a: unknown, b: unknown, label: string): unknown {
  const op =
    kind === "cut"
      ? sc.track(new oc.BRepAlgoAPI_Cut_3(a as never, b as never, progress(oc, sc)))
      : sc.track(new oc.BRepAlgoAPI_Fuse_3(a as never, b as never, progress(oc, sc)));
  op.Build(progress(oc, sc));
  if (!op.IsDone()) throw new Error(`Boolesk ${kind} misslyckades: ${label}`);
  return op.Shape();
}

/** Tessellera shape → TriMesh (orienteringsmedveten, transform tillämpad). */
export function tessellate(oc: OC, shape: unknown, lin: number, ang: number): TriMesh {
  const sc = new Scope();
  try {
    sc.track(new oc.BRepMesh_IncrementalMesh_2(shape as never, lin, false, ang, false));
    const positions: number[] = [];
    const indices: number[] = [];
    const exp = sc.track(
      new oc.TopExp_Explorer_2(shape as never, oc.TopAbs_ShapeEnum.TopAbs_FACE as never, oc.TopAbs_ShapeEnum.TopAbs_SHAPE as never),
    );
    while (exp.More()) {
      const face = oc.TopoDS.Face_1(exp.Current());
      const loc = sc.track(new oc.TopLoc_Location_1());
      const hTri = oc.BRep_Tool.Triangulation(face, loc, 0 as never);
      if (!hTri.IsNull()) {
        const tri = hTri.get();
        const trsf = loc.Transformation();
        const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
        const base = positions.length / 3;
        const nn = tri.NbNodes();
        for (let i = 1; i <= nn; i++) {
          const p = tri.Node(i).Transformed(trsf);
          positions.push(p.X(), p.Y(), p.Z());
        }
        const nt = tri.NbTriangles();
        for (let i = 1; i <= nt; i++) {
          const t = tri.Triangle(i);
          let a = t.Value(1);
          let b = t.Value(2);
          let c = t.Value(3);
          if (reversed) [b, c] = [c, b];
          indices.push(base + a - 1, base + b - 1, base + c - 1);
        }
      }
      exp.Next();
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  } finally {
    sc.drop();
  }
}

/**
 * Analytisk volym via adaptiv Gauss-kvadratur (VolumeProperties_2, eps=1e-6).
 * Den icke-adaptiva VolumeProperties_1 (fast kvadraturordning) har verifierat
 * ~1 % systematiskt fel på kroppens kraftigt krökta B-spline-loftade ytor —
 * otillräckligt för CP7:s volymjämförelse och för tillförlitliga UI-/
 * tillverkningsbarhetsmått. Den adaptiva varianten itererar mot begärd
 * noggrannhet och konvergerar till <0.05 % mot den oberoende mesh-volymen.
 */
function volumeOf(oc: OC, sc: Scope, shape: unknown): number {
  const props = sc.track(new oc.GProp_GProps_1());
  oc.BRepGProp.VolumeProperties_2(shape as never, props, 1e-6, false, false);
  return props.Mass();
}

function bboxOfMesh(m: TriMesh): GeometryMetrics["bbox"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = m.positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/** Huvudentré: bygger komplett geometri för aktuell parametervektor. */
export function buildGeometry(oc: OC, params: CobraParams, q: BuildQuality): GeometryResult {
  const t0 = Date.now();
  const persist = new Scope(); // ägs av resultatet (shapes)
  const sc = new Scope(); // temporärer, släpps innan retur
  try {
    const field = new SectionField(params);
    const sections = field.sampleSpan(q.loftSections);

    const oml = buildLoft(oc, sc, sections, q.pointsPerSection, false);
    if (!oml.shape) throw new Error("OML-loft misslyckades");
    let plug: unknown = oml.shape;

    const f = params.features;
    const g = params.globalDimensions;

    // Rotnav (valfritt, default av): vertikal cylinder vid pivotdatum u=1.0 (D2).
    if (f.rootHub.enabled) {
      const sh = field.sampleAt(1.0);
      const ax = sc.track(
        new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(1.0 * field.L, 0, sh.zBot_mm - 1)),
          sc.track(new oc.gp_Dir_4(0, 0, 1)),
        ),
      );
      const hub = sc.track(
        new oc.BRepPrimAPI_MakeCylinder_3(
          ax,
          f.rootHub.diameter_mm / 2,
          sh.zTop_mm - sh.zBot_mm + 1 + f.rootHub.height_mm,
        ),
      );
      plug = boolOp(oc, sc, "fuse", plug, hub.Shape(), "rootHub");
    }

    let part: unknown = plug;

    // Cartridge-sadel: LOKAL undersidesnisch (D5) — taket clampas under dorsalskalet,
    // aldrig full genomskärning (slutrapportens hårda negativregel).
    if (f.cartridgeSaddle.enabled) {
      const sb = field.sampleAt(f.cartridgeSaddle.center_x_norm);
      const z0 = sb.zBot_mm - 2;
      const z1 = Math.min(sb.zBot_mm + f.cartridgeSaddle.depth_mm, sb.zTop_mm - field.wallAt(f.cartridgeSaddle.center_x_norm));
      if (z1 > z0 + 0.5) {
        const boxMk = sc.track(
          new oc.BRepPrimAPI_MakeBox_2(f.cartridgeSaddle.length_mm, f.cartridgeSaddle.width_mm, z1 - z0),
        );
        const centered = translateRotateZ(
          oc,
          sc,
          boxMk.Shape(),
          0,
          -f.cartridgeSaddle.length_mm / 2,
          -f.cartridgeSaddle.width_mm / 2,
          0,
        );
        const placed = translateRotateZ(oc, sc, centered, 0, sb.x_mm, 0, z0);
        part = boolOp(oc, sc, "cut", part, placed, "cartridgeSaddle");
      }
    }

    // Headshell-slots: kapselpar, genomgående (D5), roterade med slot-toe-in.
    if (f.topSlots.enabled) {
      const ss = field.sampleAt(f.topSlots.center_x_norm);
      const z0 = ss.zBot_mm - 2;
      const z1 = ss.zTop_mm + 2;
      const toeIn = (g.slotToeIn_deg * Math.PI) / 180;
      const capsule = buildCapsule(oc, sc, f.topSlots.length_mm, f.topSlots.width_mm, 0, z1 - z0);
      const half = f.topSlots.spacing_mm / 2;
      let cutter = translateRotateZ(oc, sc, capsule, 0, 0, -half, 0);
      const second = translateRotateZ(oc, sc, capsule, 0, 0, +half, 0);
      cutter = boolOp(oc, sc, "fuse", cutter, second, "slotpar");
      const placed = translateRotateZ(oc, sc, cutter, toeIn, ss.x_mm, 0, z0);
      part = boolOp(oc, sc, "cut", part, placed, "topSlots");
    }

    // Central vertikal justerskruvkanal genom ballastloben (cmp_007).
    if (f.screwChannel.enabled) {
      const sk = field.sampleAt(f.screwChannel.center_x_norm);
      const ax = sc.track(
        new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(sk.x_mm, 0, sk.zBot_mm - 2)),
          sc.track(new oc.gp_Dir_4(0, 0, 1)),
        ),
      );
      const bore = sc.track(
        new oc.BRepPrimAPI_MakeCylinder_3(ax, f.screwChannel.diameter_mm / 2, sk.zTop_mm - sk.zBot_mm + 4),
      );
      part = boolOp(oc, sc, "cut", part, bore.Shape(), "screwChannel");
    }

    // IML / skalsolid
    const iml = buildLoft(oc, sc, sections, q.pointsPerSection, true);
    let shellShape: unknown | null = null;
    if (iml.shape) shellShape = boolOp(oc, sc, "cut", oml.shape, iml.shape, "skal (OML−IML)");

    let brepValid: boolean | null = null;
    if (q.brepCheck) {
      const an = sc.track(new oc.BRepCheck_Analyzer(part as never, true, false));
      brepValid = an.IsValid_2();
    }

    const partMesh = tessellate(oc, part, q.linDeflection_mm, q.angDeflection_rad);
    const shellMesh = shellShape ? tessellate(oc, shellShape, q.linDeflection_mm, q.angDeflection_rad) : null;

    const metrics: GeometryMetrics = {
      volumePlug_mm3: volumeOf(oc, sc, plug),
      volumePart_mm3: volumeOf(oc, sc, part),
      volumeShellSolid_mm3: shellShape ? volumeOf(oc, sc, shellShape) : null,
      bbox: bboxOfMesh(partMesh),
      regenMs: Date.now() - t0,
    };

    const sPivot = field.sampleAt(1.0);
    const sRear = field.sampleAt(field.rearExtent);
    const mountingSpec: MountingSpec = {
      functionalLength_mm: field.L,
      pivotDatum: { x_mm: 1.0 * field.L, y_mm: 0, z_mm: (sPivot.zTop_mm + sPivot.zBot_mm) / 2 },
      rootHoodWidth_mm: sPivot.halfWidth_mm * 2,
      rootHoodHeight_mm: sPivot.zTop_mm - sPivot.zBot_mm,
      screwChannelDiameter_mm: f.screwChannel.enabled ? f.screwChannel.diameter_mm : 0,
      rearEnvelope: { x_max_mm: sRear.x_mm, z_min_mm: sRear.zBot_mm },
      note: "Read-only monteringsgränssnitt wand→Alien LT-bas (LT-kontraktet §1). Endast geometri — inga mekanikfält.",
    };

    // Flytta ägandet av returnerade shapes till persist-scopen.
    persist.track(plug as Deleter);
    persist.track(part as Deleter);
    if (shellShape) persist.track(shellShape as Deleter);

    return {
      plugShape: plug,
      partShape: part,
      shellShape,
      partMesh,
      shellMesh,
      metrics,
      mountingSpec,
      innerInvalidZones: iml.invalidZones,
      sections,
      brepValid,
      dispose: () => persist.drop(),
    };
  } finally {
    sc.drop();
  }
}
