/**
 * Sektionsfält — Engrove Alien LT (Rev B). Ren TS utan OCCT.
 *
 * Domän: u = x_norm ∈ [noseExtent, rearExtent] (typiskt −0.05 … 1.25).
 * u=0 är NÅLSPETSDATUM, u=1.0 pivot-/rotdatum (slutrapport §4).
 * Kroppen är RAK och Y-symmetrisk: yaw och yCenter är alltid 0 — tangentiell
 * LT-mekanik ersätter offsetvinkel/överhäng (LT-bilagan §7). Cobra-offsetböjen
 * (Rev A) är borttagen; slot-toe-in hanteras som ren cutter-rotation i motorn.
 *
 * Formspråksmappning (verifierad exakt mot §10-tabellen vid alla knutar,
 * scripts/alien-lt-tables.mjs):
 *   nBase  = 2 + 3·cornerFairness        (= nTop med crown=1)
 *   nUpper = clamp(nBase · crownFactor, 1.6, 12)
 *   nLower = clamp(nBase · (1 + 1.5·bellyRelief), 2, 12)   (= nBottom)
 */
import type { CobraParams, SectionSample } from "../types.js";
import { naturalCubic, rampBetween, type CubicSpline } from "./interp.js";

/** Minsta halvdimension (mm) för en giltig IML-sektion. */
export const MIN_INNER_HALFDIM_MM = 0.5;

export class SectionField {
  readonly L: number;
  readonly noseExtent: number;
  readonly rearExtent: number;
  private dorsal: CubicSpline;
  private ventral: CubicSpline;
  private width: CubicSpline;
  private crown: CubicSpline;
  private belly: CubicSpline;
  private corner: CubicSpline;
  private params: CobraParams;

  constructor(params: CobraParams) {
    this.params = params;
    this.L = params.globalDimensions.functionalLength_mm;
    this.noseExtent = params.globalDimensions.noseExtent_norm;
    this.rearExtent = params.globalDimensions.rearExtent_norm;
    if (!(this.rearExtent > this.noseExtent + 0.2)) {
      throw new Error(`Ogiltiga extents: nose=${this.noseExtent}, rear=${this.rearExtent}`);
    }
    const sx = params.stations.map((s) => s.x_norm);
    this.assertMonotone(sx, "stations");
    this.width = naturalCubic(sx, params.stations.map((s) => s.width_mm));
    this.crown = naturalCubic(sx, params.stations.map((s) => s.crownFactor));
    this.belly = naturalCubic(sx, params.stations.map((s) => s.bellyRelief));
    this.corner = naturalCubic(sx, params.stations.map((s) => s.cornerFairness));
    const dx = params.spine.dorsal.map((p) => p.x_norm);
    const vx = params.spine.ventral.map((p) => p.x_norm);
    this.assertMonotone(dx, "spine.dorsal");
    this.assertMonotone(vx, "spine.ventral");
    this.dorsal = naturalCubic(dx, params.spine.dorsal.map((p) => p.z_offset_mm));
    this.ventral = naturalCubic(vx, params.spine.ventral.map((p) => p.z_offset_mm));
  }

  private assertMonotone(xs: number[], label: string): void {
    for (let i = 1; i < xs.length; i++) {
      if (!(xs[i] > xs[i - 1])) throw new Error(`${label}: x_norm ej strikt stigande vid index ${i}`);
    }
  }

  wallAt(x_norm: number): number {
    const b = 0.03;
    let w = this.params.shell.wallThickness_mm;
    for (const z of this.params.shell.localReinforcementZones) {
      const inZone =
        rampBetween(x_norm, z.x0_norm - b, z.x0_norm + b) - rampBetween(x_norm, z.x1_norm - b, z.x1_norm + b);
      w += z.extra_mm * Math.max(0, inZone);
    }
    return w;
  }

  sampleAt(x_norm: number): SectionSample {
    const zTop = this.dorsal.at(x_norm);
    const zBot = this.ventral.at(x_norm);
    if (!(zTop > zBot)) {
      throw new Error(
        `Sektion ogiltig vid u=${x_norm.toFixed(3)}: dorsal(${zTop.toFixed(2)}) ≤ ventral(${zBot.toFixed(2)})`,
      );
    }
    const cf = Math.min(1, Math.max(0, this.corner.at(x_norm)));
    const nBase = 2 + 3 * cf;
    const crown = this.crown.at(x_norm);
    const belly = Math.min(1, Math.max(0, this.belly.at(x_norm)));
    return {
      x_mm: x_norm * this.L,
      x_norm,
      yCenter_mm: 0,
      yaw_rad: 0,
      zTop_mm: zTop,
      zBot_mm: zBot,
      halfWidth_mm: Math.max(0.1, this.width.at(x_norm) / 2),
      nUpper: clamp(nBase * crown, 1.6, 12),
      nLower: clamp(nBase * (1 + 1.5 * belly), 2, 12),
      wall_mm: this.wallAt(x_norm),
    };
  }

  /** Jämnt fördelade loftsektioner över [noseExtent, rearExtent] inkl. ändarna. */
  sampleSpan(count: number): SectionSample[] {
    const out: SectionSample[] = [];
    for (let i = 0; i < count; i++) {
      const u = this.noseExtent + (i / (count - 1)) * (this.rearExtent - this.noseExtent);
      out.push(this.sampleAt(u));
    }
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Samplar sektionens slutna kontur i världskoordinater.
 * Per-halva superellips (§10-formeln): Y = hw·sgn(c)|c|^{2/n}, Z = zc + hh·sgn(s)|s|^{2/n},
 * n = nUpper för Z>zc (dorsal canopy), nLower för Z<zc (käklinje).
 * inset > 0 ⇒ IML-sektion. Returnerar null om degenererad.
 */
export function sectionPoints3D(s: SectionSample, nPts: number, inset = 0): [number, number, number][] | null {
  const hw = s.halfWidth_mm - inset;
  const zc = (s.zTop_mm + s.zBot_mm) / 2;
  const hh = (s.zTop_mm - s.zBot_mm) / 2 - inset;
  if (hw < MIN_INNER_HALFDIM_MM || hh < MIN_INNER_HALFDIM_MM) return null;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < nPts; i++) {
    const t = (2 * Math.PI * i) / nPts;
    const c = Math.cos(t);
    const si = Math.sin(t);
    const n = si >= 0 ? s.nUpper : s.nLower;
    const ly = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const lz = hh * Math.sign(si) * Math.pow(Math.abs(si), 2 / n);
    pts.push([s.x_mm, ly, zc + lz]);
  }
  return pts;
}
