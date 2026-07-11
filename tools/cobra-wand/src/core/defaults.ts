/**
 * Default-parametrar — Engrove Alien LT (Rev B).
 *
 * VERIFIED (källor):
 *   L = 237.1 mm — funktionell nålspets→pivot-längd (TD028-modalens tonarmslängd,
 *     LT-geometri-bilagan §3–§4).
 *   zTop/L-, zBottom/L- och W/L-tabellerna: slutrapport §7–§8 (ordagrant).
 *   nTop/nBottom-tabellen: slutrapport §10; inverterad mappning verifierad exakt
 *     vid alla fem knutar (scripts/alien-lt-tables.mjs).
 *   Slotspann u∈[0.03,0.13], sadel u∈[0.00,0.08], skruvkanal u≈1.16–1.20: §9, cmp_007.
 *   Slot c-c 12.7 mm: half-inch-cartridgestandard (Verified standard; ersätter
 *     dokumentets visuella estimat ±0.018–0.024L — dokumenterad avvikelse).
 *
 * KÄLLDOKUMENTENS EGEN NIVÅ: §7–§10-tabellerna är i källan flaggade som visuellt
 * uppskattade relativvärden ("ska senare ersättas av mm-mått") — de är Verified
 * SOM SPECIFIKATION, inte som uppmätt hårdvara.
 *
 * ASSUMED (flaggade för ägarbeslut):
 *   swan_drop = 0.065L (spec-band 0.055–0.075), terminal lobhöjd 0.030L @u=1.25,
 *   slotbredd 2.9 mm (M2.5 medium, strax över §9-bandet 0.008–0.012L),
 *   slotlängd 10.0 mm (mitt i §9-bandet 0.035–0.050L),
 *   sadel 19×12×6 mm, skruvkanal Ø5, vägg 1.6 mm,
 *   zoner +0.6 mm @[0.00,0.14] (slots/sadel-läppar) och +0.8 mm @[0.92,1.06] (root hood),
 *   minWall 1.2 / minFeature 0.4 / draftMin 2°.
 */
import type { CobraParams, SpinePoint, Station } from "./types.js";
import { naturalCubic } from "./geometry/interp.js";

export const TOOL_VERSION = "0.2.0";

/** Spine (mm, L=237.1): u≤1.00 direkt ur §7-tabellerna; u>1.00 härledd ur
 *  svanhalsformeln (§11) + sektionshöjder (§10). Beräknad i scripts/alien-lt-tables.mjs. */
export const ALIEN_SPINE: { dorsal: SpinePoint[]; ventral: SpinePoint[] } = {
  dorsal: [
    { x_norm: -0.05, z_offset_mm: 4.268 },
    { x_norm: 0.0, z_offset_mm: 6.165 },
    { x_norm: 0.04, z_offset_mm: 8.536 },
    { x_norm: 0.1, z_offset_mm: 10.907 },
    { x_norm: 0.25, z_offset_mm: 13.278 },
    { x_norm: 0.45, z_offset_mm: 14.226 },
    { x_norm: 0.65, z_offset_mm: 13.515 },
    { x_norm: 0.85, z_offset_mm: 11.855 },
    { x_norm: 1.0, z_offset_mm: 10.432 },
    { x_norm: 1.08, z_offset_mm: 8.919 },
    { x_norm: 1.18, z_offset_mm: 0.225 },
    { x_norm: 1.25, z_offset_mm: -6.876 },
  ],
  ventral: [
    { x_norm: -0.05, z_offset_mm: 0.948 },
    { x_norm: 0.0, z_offset_mm: -1.423 },
    { x_norm: 0.04, z_offset_mm: -4.742 },
    { x_norm: 0.1, z_offset_mm: -0.948 },
    { x_norm: 0.25, z_offset_mm: 0.0 },
    { x_norm: 0.45, z_offset_mm: 0.237 },
    { x_norm: 0.65, z_offset_mm: 0.237 },
    { x_norm: 0.85, z_offset_mm: 0.0 },
    { x_norm: 1.0, z_offset_mm: -0.474 },
    { x_norm: 1.08, z_offset_mm: -4.833 },
    { x_norm: 1.18, z_offset_mm: -16.847 },
    { x_norm: 1.25, z_offset_mm: -13.989 },
  ],
};

/** Stationer vid §8-tabellens breddknutar. width exakt = (W/L)·237.1; höjd =
 *  spine-höjd (seed); corner/belly inverterade ur §10-interpolationen (crown=1). */
export const ALIEN_STATIONS: Station[] = [
  { x_norm: -0.05, width_mm: 9.01, height_mm: 3.32, crownFactor: 1, bellyRelief: 0.636, cornerFairness: 0.1866 },
  { x_norm: 0.0, width_mm: 11.855, height_mm: 7.588, crownFactor: 1, bellyRelief: 0.6514, cornerFairness: 0.1933 },
  { x_norm: 0.08, width_mm: 15.412, height_mm: 13.08, crownFactor: 1, bellyRelief: 0.6757, cornerFairness: 0.204 },
  { x_norm: 0.2, width_mm: 18.968, height_mm: 11.691, crownFactor: 1, bellyRelief: 0.71, cornerFairness: 0.2207 },
  { x_norm: 0.38, width_mm: 21.339, height_mm: 14.404, crownFactor: 1, bellyRelief: 0.7511, cornerFairness: 0.2515 },
  { x_norm: 0.55, width_mm: 20.865, height_mm: 13.562, crownFactor: 1, bellyRelief: 0.7706, cornerFairness: 0.2914 },
  { x_norm: 0.72, width_mm: 18.494, height_mm: 12.992, crownFactor: 1, bellyRelief: 0.7603, cornerFairness: 0.328 },
  { x_norm: 0.88, width_mm: 13.752, height_mm: 11.439, crownFactor: 1, bellyRelief: 0.7111, cornerFairness: 0.3333 },
  { x_norm: 1.0, width_mm: 9.484, height_mm: 10.906, crownFactor: 1, bellyRelief: 0.6103, cornerFairness: 0.3191 },
  { x_norm: 1.1, width_mm: 15.412, height_mm: 15.103, crownFactor: 1, bellyRelief: 0.3864, cornerFairness: 0.3431 },
  { x_norm: 1.18, width_mm: 20.865, height_mm: 17.072, crownFactor: 1, bellyRelief: 0.125, cornerFairness: 0.4 },
  { x_norm: 1.25, width_mm: 14.226, height_mm: 7.113, crownFactor: 1, bellyRelief: 0, cornerFairness: 0.4553 },
];

/**
 * D1-koppling: sätter ny sektionshöjd vid x_norm genom LOKAL spine-justering
 * kring BEVARAD centerlinje (svanhalsfallet förstörs inte). Punkter vid samma
 * x uppdateras; annars infogas nya (sorterat). Vid fulla arrayer (24) ersätts
 * närmaste punkt.
 */
export function adjustSpineForStationHeight(
  spine: { dorsal: SpinePoint[]; ventral: SpinePoint[] },
  x_norm: number,
  newHeight_mm: number,
): void {
  const dS = naturalCubic(spine.dorsal.map((p) => p.x_norm), spine.dorsal.map((p) => p.z_offset_mm));
  const vS = naturalCubic(spine.ventral.map((p) => p.x_norm), spine.ventral.map((p) => p.z_offset_mm));
  const center = (dS.at(x_norm) + vS.at(x_norm)) / 2;
  upsert(spine.dorsal, x_norm, +(center + newHeight_mm / 2).toFixed(3));
  upsert(spine.ventral, x_norm, +(center - newHeight_mm / 2).toFixed(3));
}

function upsert(arr: SpinePoint[], x: number, z: number): void {
  const EPS = 1e-6;
  const hit = arr.find((p) => Math.abs(p.x_norm - x) < EPS);
  if (hit) {
    hit.z_offset_mm = z;
    return;
  }
  if (arr.length >= 24) {
    let best = 0;
    for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i].x_norm - x) < Math.abs(arr[best].x_norm - x)) best = i;
    arr[best] = { x_norm: x, z_offset_mm: z };
  } else {
    arr.push({ x_norm: x, z_offset_mm: z });
  }
  arr.sort((a, b) => a.x_norm - b.x_norm);
}

export function defaultParams(): CobraParams {
  return {
    schemaVersion: "1.1.0",
    modelFamily: "alien_lt_wand",
    globalDimensions: {
      functionalLength_mm: 237.1,
      noseExtent_norm: -0.05,
      rearExtent_norm: 1.25,
      slotToeIn_deg: 0,
    },
    spine: {
      dorsal: ALIEN_SPINE.dorsal.map((p) => ({ ...p })),
      ventral: ALIEN_SPINE.ventral.map((p) => ({ ...p })),
    },
    stations: ALIEN_STATIONS.map((s) => ({ ...s })),
    shell: {
      wallThickness_mm: 1.6,
      localReinforcementZones: [
        { x0_norm: 0.0, x1_norm: 0.14, extra_mm: 0.6 },
        { x0_norm: 0.92, x1_norm: 1.06, extra_mm: 0.8 },
      ],
    },
    features: {
      cartridgeSaddle: { enabled: true, length_mm: 19, width_mm: 12, depth_mm: 6, center_x_norm: 0.04 },
      topSlots: { enabled: true, length_mm: 10, spacing_mm: 12.7, width_mm: 2.9, center_x_norm: 0.08 },
      screwChannel: { enabled: true, diameter_mm: 5, center_x_norm: 1.18 },
      rootHub: { enabled: false, diameter_mm: 12, height_mm: 4 },
    },
    manufacturing: {
      stlChordalTolerance_mm: 0.01,
      stepUnit: "mm",
      minFeature_mm: 0.4,
      minWall_mm: 1.2,
      draftMin_deg: 2,
    },
    provenance: {
      createdAt: new Date().toISOString(),
      parameterHash: "",
      toolVersion: TOOL_VERSION,
      sourcePromptId: null,
    },
  };
}
