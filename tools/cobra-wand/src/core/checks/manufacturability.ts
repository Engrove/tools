/**
 * Tillverkningsbarhetskontroller — Engrove Alien LT (Rev B).
 *
 * 1) Min väggtjocklek: analytiskt väggfält w(x) mot manufacturing.minWall_mm.
 *    IML-degenererade zoner klassificeras: zoner inom 0.05·span från nos-/bak-
 *    änden = TIP-TRIM (INFO — förväntad avsmalning där nålspets/ballastlob
 *    stänger; slutrapportens "trimAway thin_tip_regions"). Interiöra degenererade
 *    zoner = FAIL (självkorsningsrisk).
 * 2) Skalets självkorsning: IML existerar, inga INTERIÖRA degenererade zoner,
 *    V_IML < V_OML.
 * 3) Min featurestorlek: headshell-slotbredd och skruvkanal-Ø mot minFeature_mm.
 * 4) Drafthheuristik (INFORMATIV): tvådelad form, delningsplan XZ (y=0),
 *    utdragsriktning ±Y. Areaandelar undercut/otillräckligt släpp rapporteras.
 */
import type { CheckResult, CobraParams } from "../types.js";
import type { GeometryResult } from "../geometry/engine.js";
import { SectionField } from "../geometry/section.js";

/** Andel av spannet från vardera änden som räknas som accepterad tip-trim. */
const TIP_FRACTION = 0.05;

export function runManufacturabilityChecks(params: CobraParams, geo: GeometryResult): CheckResult[] {
  const out: CheckResult[] = [];
  const tip = classifyInvalidZones(params, geo.innerInvalidZones);
  out.push(checkMinWall(params, geo, tip));
  out.push(checkShellIntegrity(params, geo, tip));
  out.push(checkMinFeature(params));
  out.push(checkDraftHeuristic(params, geo));
  if (tip.tipZones.length > 0) {
    out.push({
      id: "tip_trim",
      label: "Tip-trim (tunna ändområden)",
      status: "INFO",
      detail: `IML avsmalnar vid ändzon x_norm ∈ {${tip.tipZones.map((z) => z.toFixed(2)).join(", ")}} — förväntad nos-/ballaststängning, trimmas bort. Ingen defekt.`,
    });
  }
  return out;
}

interface TipClassification {
  interiorZones: number[];
  tipZones: number[];
}

function classifyInvalidZones(params: CobraParams, zones: number[]): TipClassification {
  const nose = params.globalDimensions.noseExtent_norm;
  const rear = params.globalDimensions.rearExtent_norm;
  const span = rear - nose;
  const margin = TIP_FRACTION * span;
  const interiorZones: number[] = [];
  const tipZones: number[] = [];
  for (const z of zones) {
    if (z <= nose + margin || z >= rear - margin) tipZones.push(z);
    else interiorZones.push(z);
  }
  return { interiorZones, tipZones };
}

function checkMinWall(params: CobraParams, geo: GeometryResult, tip: TipClassification): CheckResult {
  const field = new SectionField(params);
  const nose = params.globalDimensions.noseExtent_norm;
  const rear = params.globalDimensions.rearExtent_norm;
  let minW = Infinity;
  let minAt = 0;
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const xn = nose + (i / N) * (rear - nose);
    const w = field.wallAt(xn);
    if (w < minW) {
      minW = w;
      minAt = xn;
    }
  }
  const limit = params.manufacturing.minWall_mm;
  if (tip.interiorZones.length > 0) {
    const zones = tip.interiorZones.map((z) => z.toFixed(2)).join(", ");
    return {
      id: "min_wall",
      label: "Min väggtjocklek",
      status: "FAIL",
      detail: `IML degenererad interiört vid x_norm ∈ {${zones}} — väggen konsumerar sektionen (självkorsningsrisk).`,
    };
  }
  return {
    id: "min_wall",
    label: "Min väggtjocklek",
    status: minW >= limit ? "PASS" : "FAIL",
    detail: `min w(x) = ${minW.toFixed(2)} mm vid x_norm=${minAt.toFixed(2)} (krav ≥ ${limit.toFixed(2)} mm).`,
  };
}

function checkShellIntegrity(params: CobraParams, geo: GeometryResult, tip: TipClassification): CheckResult {
  if (!geo.shellShape || geo.metrics.volumeShellSolid_mm3 === null) {
    return {
      id: "shell_integrity",
      label: "Skal (OML−IML)",
      status: "FAIL",
      detail: "IML kunde inte byggas — skalet självkorsar eller är degenererat. Öka höjd/bredd eller minska vägg.",
    };
  }
  const vShell = geo.metrics.volumeShellSolid_mm3;
  const vPlug = geo.metrics.volumePlug_mm3;
  const ok = vShell > 0 && vShell < vPlug && tip.interiorZones.length === 0;
  return {
    id: "shell_integrity",
    label: "Skal (OML−IML)",
    status: ok ? "PASS" : "FAIL",
    detail: `V_skal = ${(vShell / 1000).toFixed(2)} cm³, V_plugg = ${(vPlug / 1000).toFixed(2)} cm³, vägg ${params.shell.wallThickness_mm.toFixed(2)} mm${tip.tipZones.length ? ` (tip-trim vid ${tip.tipZones.length} ändzon(er), ej fel)` : ""}.`,
  };
}

function checkMinFeature(params: CobraParams): CheckResult {
  const limit = params.manufacturing.minFeature_mm;
  const items: { name: string; v: number }[] = [];
  if (params.features.topSlots.enabled) items.push({ name: "slotbredd", v: params.features.topSlots.width_mm });
  if (params.features.screwChannel.enabled) items.push({ name: "skruvkanal-Ø", v: params.features.screwChannel.diameter_mm });
  if (items.length === 0) {
    return { id: "min_feature", label: "Min featurestorlek", status: "PASS", detail: "Inga aktiva småfeatures." };
  }
  const worst = items.reduce((a, b) => (a.v < b.v ? a : b));
  return {
    id: "min_feature",
    label: "Min featurestorlek",
    status: worst.v >= limit ? "PASS" : "FAIL",
    detail: `minsta feature: ${worst.name} = ${worst.v.toFixed(2)} mm (krav ≥ ${limit.toFixed(2)} mm).`,
  };
}

function checkDraftHeuristic(params: CobraParams, geo: GeometryResult): CheckResult {
  const m = geo.partMesh;
  const sinMin = Math.sin((params.manufacturing.draftMin_deg * Math.PI) / 180);
  let areaTotal = 0;
  let areaUndercut = 0;
  let areaShallow = 0;
  const P = m.positions;
  const triCount = m.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const i = m.indices[t * 3] * 3;
    const j = m.indices[t * 3 + 1] * 3;
    const k = m.indices[t * 3 + 2] * 3;
    const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
    const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const a2 = Math.hypot(nx, ny, nz);
    if (a2 < 1e-12) continue;
    const area = a2 / 2;
    areaTotal += area;
    const cy = (P[i + 1] + P[j + 1] + P[k + 1]) / 3;
    const pull = cy >= 0 ? 1 : -1;
    const dot = (ny / a2) * pull;
    if (dot < -sinMin) areaUndercut += area;
    else if (Math.abs(dot) < sinMin) areaShallow += area;
  }
  const pu = areaTotal > 0 ? (100 * areaUndercut) / areaTotal : 0;
  const ps = areaTotal > 0 ? (100 * areaShallow) / areaTotal : 0;
  return {
    id: "draft_heuristic",
    label: `Drafthheuristik ±Y (≥${params.manufacturing.draftMin_deg}°)`,
    status: "INFO",
    detail: `undercut-area ${pu.toFixed(1)} %, otillräckligt släpp ${ps.toFixed(1)} % av ytan. Heuristik — ej formell draftanalys.`,
  };
}
