/**
 * Engrove Alien LT Wand Generator — kärntyper (schema 1.1.0).
 *
 * KOORDINATRAMSKONTRAKT (bindande — Engrove_Alien_LT_3D_object_slutrapport §4):
 *   X: längs wanden. X=0.00L = NÅLSPETSDATUM, X=1.00L = pivot-/rotdatum.
 *      Fysisk kropp: noseExtent_norm (≈−0.05) … rearExtent_norm (≈1.25).
 *   Z: uppåt (dorsal positiv). Y: lateral. Högerhänt.
 *   Kroppen är RAK och Y-symmetrisk (tangentiell LT — ingen offsetböj/överhäng).
 *   u = x_norm = X/L där L = functionalLength_mm (nålspets→pivot).
 *   Enheter: mm, grader i schema.
 *
 * DESIGNBESLUT (Rev B — Alien LT; ersätter Cobra-defaults, se README §3):
 *   D1: dorsal(x)/ventral(x) är AUKTORITET för sektionens z_top/z_bot.
 *       stations[].height_mm är seed/UI-koppling; höjdändring justerar spinen
 *       LOKALT kring bevarad centerlinje (svanhalsfallet bevaras).
 *   D2: master-plugg = OML (∪ rootHub om aktiv). Del = plugg − sadel − slots − skruvkanal.
 *   D5: headshell-slots skär genomgående (zBot−2 → zTop+2); cartridge-sadeln är
 *       en LOKAL undersidesnisch vars tak clampas under dorsalskalet (aldrig
 *       full genomskärning — slutrapportens hårda negativregel).
 *   D6: svanhalsens fall och ballastlobens bakre stängning ligger i default-
 *       SPINEN (härledda ur §11-formeln, swan_drop=0.065L Assumed) — motorn
 *       har ingen separat svanhalstransform.
 *
 * LT-KONTRAKT (§1, oförändrat bindande): appen läser/skriver ALDRIG
 * LT-mekanikens fält. Denylist körs rekursivt före schemavalidering.
 */

export type ModelFamily = "alien_lt_wand";

export interface SpinePoint {
  /** Position u = X/L. Kan vara negativ (fysisk nos framför nålspetsdatum). */
  x_norm: number;
  /** Absolut z-läge (mm) för styrkurvan vid x_norm. */
  z_offset_mm: number;
}

export interface Station {
  x_norm: number;
  width_mm: number;
  /** Seed/UI-koppling till spinen (se D1). */
  height_mm: number;
  /** 1 = nUpper styrs helt av cornerFairness. Intervall [0.5, 2]. */
  crownFactor: number;
  /** 0 = ingen; 1 = kraftigt avplanad buk/käklinje. Intervall [0, 1]. */
  bellyRelief: number;
  /** (nTop−2)/3: 0 ⇒ n=2 (ellips) … 1 ⇒ n=5. Intervall [0, 1]. */
  cornerFairness: number;
}

export interface ReinforcementZone {
  x0_norm: number;
  x1_norm: number;
  extra_mm: number;
}

export interface CobraParams {
  schemaVersion: "1.1.0";
  modelFamily: ModelFamily;
  globalDimensions: {
    /** L: funktionell längd nålspets→pivot (mm). Alien LT: 237.1 (L2N, Verified). */
    functionalLength_mm: number;
    /** Främre fysisk utsträckning, u-enheter (≈ −0.05). */
    noseExtent_norm: number;
    /** Bakre fysisk utsträckning, u-enheter (≈ 1.25, svanhals+ballastlob). */
    rearExtent_norm: number;
    /** Slot-toe-in (grader) — roterar ENDAST slotparet; kroppen förblir rak. */
    slotToeIn_deg: number;
  };
  spine: {
    dorsal: SpinePoint[];
    ventral: SpinePoint[];
  };
  stations: Station[];
  shell: {
    wallThickness_mm: number;
    localReinforcementZones: ReinforcementZone[];
  };
  features: {
    /** Lokal undersidesnisch för pickup (slutrapport §9, §14). */
    cartridgeSaddle: {
      enabled: boolean;
      length_mm: number;
      width_mm: number;
      /** Nischdjup uppåt från zBot. Taket clampas under dorsalskalet (D5). */
      depth_mm: number;
      center_x_norm: number;
    };
    /** Obround cartridge-skruvslots i integrerade nosen (§9). */
    topSlots: {
      enabled: boolean;
      length_mm: number;
      /** C-C-avstånd. Half-inch-standard: 12.7 (Verified standard). */
      spacing_mm: number;
      width_mm: number;
      center_x_norm: number;
    };
    /** Central vertikal justerskruvkanal genom ballastloben (cmp_007). */
    screwChannel: {
      enabled: boolean;
      diameter_mm: number;
      center_x_norm: number;
    };
    /** Vertikalt pivotnav vid u=1.0 — platshållare för LT-gränssnittet (out of scope). */
    rootHub: {
      enabled: boolean;
      diameter_mm: number;
      /** Utstick ovanför dorsalskalet (mm). */
      height_mm: number;
    };
  };
  manufacturing: {
    stlChordalTolerance_mm: number;
    stepUnit: "mm";
    minFeature_mm: number;
    minWall_mm: number;
    draftMin_deg: number;
  };
  provenance: {
    createdAt: string;
    parameterHash: string;
    toolVersion: string;
    sourcePromptId: string | null;
  };
}

/** Ett samplat tvärsnitt. Alien LT: yaw/yCenter alltid 0 (rak kropp); fälten
 *  behålls i kontraktet för att hålla motor-/UI-koden generisk. */
export interface SectionSample {
  x_mm: number;
  x_norm: number;
  yCenter_mm: number;
  yaw_rad: number;
  zTop_mm: number;
  zBot_mm: number;
  halfWidth_mm: number;
  nUpper: number;
  nLower: number;
  wall_mm: number;
}

export interface TriMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface WatertightReport {
  tris: number;
  verts: number;
  degenerate: number;
  dupDirectedEdges: number;
  openEdges: number;
  euler: number;
  volume_mm3: number;
  watertight: boolean;
}

export interface GeometryMetrics {
  volumePlug_mm3: number;
  volumePart_mm3: number;
  volumeShellSolid_mm3: number | null;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  regenMs: number;
}

/** Read-only gränssnitt wand→Alien LT-bas (endast geometri — inga mekanikfält). */
export interface MountingSpec {
  functionalLength_mm: number;
  pivotDatum: { x_mm: number; y_mm: number; z_mm: number };
  rootHoodWidth_mm: number;
  rootHoodHeight_mm: number;
  screwChannelDiameter_mm: number;
  rearEnvelope: { x_max_mm: number; z_min_mm: number };
  note: string;
}

export type CheckStatus = "PASS" | "FAIL" | "INFO";
export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DiffEntry {
  path: string;
  before: unknown;
  after: unknown;
}

export interface ImportResult {
  ok: boolean;
  errors: string[];
  diff: DiffEntry[];
  candidate: CobraParams | null;
}

export interface ProvenanceEntry {
  ts: string;
  sourcePromptId: string | null;
  action: "AI_IMPORT_APPLIED" | "AI_IMPORT_REJECTED" | "EXPORT" | "MANUAL_EDIT";
  detail: string;
}
