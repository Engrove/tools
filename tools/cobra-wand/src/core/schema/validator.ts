/**
 * Schema & validering (schema 1.1.0 — Engrove Alien LT, Rev B).
 *
 * HÅRD VALIDERINGSREGEL (LT-kontraktet §1, OFÖRÄNDRAD): denylist-kontroll körs
 * rekursivt på ALLA nycklar i inkommande JSON FÖRE schemavalidering.
 * Träff ⇒ VALIDATION_REJECTED. Matchning skiftlägesokänslig.
 */
import { Ajv, type ValidateFunction } from "ajv";
import type { CobraParams } from "../types.js";

export const LT_DENYLIST = ["P1", "P2", "P3", "L23", "STATOR", "STATOR_TRACK", "ENGROVELT", "LTMECHANISM"] as const;

const spinePoint = {
  type: "object",
  additionalProperties: false,
  required: ["x_norm", "z_offset_mm"],
  properties: {
    x_norm: { type: "number", minimum: -0.15, maximum: 1.4 },
    z_offset_mm: { type: "number", minimum: -120, maximum: 120 },
  },
} as const;

export const COBRA_SCHEMA = {
  $id: "https://engroveaudio.com/schema/alien-lt-wand/1.1.0",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "modelFamily",
    "globalDimensions",
    "spine",
    "stations",
    "shell",
    "features",
    "manufacturing",
    "provenance",
  ],
  properties: {
    schemaVersion: { const: "1.1.0" },
    modelFamily: { const: "alien_lt_wand" },
    globalDimensions: {
      type: "object",
      additionalProperties: false,
      required: ["functionalLength_mm", "noseExtent_norm", "rearExtent_norm", "slotToeIn_deg"],
      properties: {
        functionalLength_mm: { type: "number", minimum: 150, maximum: 400 },
        noseExtent_norm: { type: "number", minimum: -0.15, maximum: 0 },
        rearExtent_norm: { type: "number", minimum: 1.0, maximum: 1.4 },
        slotToeIn_deg: { type: "number", minimum: -5, maximum: 5 },
      },
    },
    spine: {
      type: "object",
      additionalProperties: false,
      required: ["dorsal", "ventral"],
      properties: {
        dorsal: { type: "array", minItems: 2, maxItems: 24, items: spinePoint },
        ventral: { type: "array", minItems: 2, maxItems: 24, items: spinePoint },
      },
    },
    stations: {
      type: "array",
      minItems: 3,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x_norm", "width_mm", "height_mm", "crownFactor", "bellyRelief", "cornerFairness"],
        properties: {
          x_norm: { type: "number", minimum: -0.15, maximum: 1.4 },
          width_mm: { type: "number", minimum: 2, maximum: 80 },
          height_mm: { type: "number", minimum: 2, maximum: 60 },
          crownFactor: { type: "number", minimum: 0.5, maximum: 2 },
          bellyRelief: { type: "number", minimum: 0, maximum: 1 },
          cornerFairness: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    shell: {
      type: "object",
      additionalProperties: false,
      required: ["wallThickness_mm", "localReinforcementZones"],
      properties: {
        wallThickness_mm: { type: "number", minimum: 0.4, maximum: 8 },
        localReinforcementZones: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["x0_norm", "x1_norm", "extra_mm"],
            properties: {
              x0_norm: { type: "number", minimum: -0.15, maximum: 1.4 },
              x1_norm: { type: "number", minimum: -0.15, maximum: 1.4 },
              extra_mm: { type: "number", minimum: 0, maximum: 6 },
            },
          },
        },
      },
    },
    features: {
      type: "object",
      additionalProperties: false,
      required: ["cartridgeSaddle", "topSlots", "screwChannel", "rootHub"],
      properties: {
        cartridgeSaddle: {
          type: "object",
          additionalProperties: false,
          required: ["enabled", "length_mm", "width_mm", "depth_mm", "center_x_norm"],
          properties: {
            enabled: { type: "boolean" },
            length_mm: { type: "number", minimum: 5, maximum: 60 },
            width_mm: { type: "number", minimum: 4, maximum: 40 },
            depth_mm: { type: "number", minimum: 1, maximum: 20 },
            center_x_norm: { type: "number", minimum: -0.05, maximum: 0.3 },
          },
        },
        topSlots: {
          type: "object",
          additionalProperties: false,
          required: ["enabled", "length_mm", "spacing_mm", "width_mm", "center_x_norm"],
          properties: {
            enabled: { type: "boolean" },
            length_mm: { type: "number", minimum: 4, maximum: 30 },
            spacing_mm: { type: "number", minimum: 6, maximum: 30 },
            width_mm: { type: "number", minimum: 1.5, maximum: 6 },
            center_x_norm: { type: "number", minimum: 0, maximum: 0.3 },
          },
        },
        screwChannel: {
          type: "object",
          additionalProperties: false,
          required: ["enabled", "diameter_mm", "center_x_norm"],
          properties: {
            enabled: { type: "boolean" },
            diameter_mm: { type: "number", minimum: 2, maximum: 12 },
            center_x_norm: { type: "number", minimum: 1.0, maximum: 1.35 },
          },
        },
        rootHub: {
          type: "object",
          additionalProperties: false,
          required: ["enabled", "diameter_mm", "height_mm"],
          properties: {
            enabled: { type: "boolean" },
            diameter_mm: { type: "number", minimum: 4, maximum: 30 },
            height_mm: { type: "number", minimum: 0, maximum: 20 },
          },
        },
      },
    },
    manufacturing: {
      type: "object",
      additionalProperties: false,
      required: ["stlChordalTolerance_mm", "stepUnit", "minFeature_mm", "minWall_mm", "draftMin_deg"],
      properties: {
        stlChordalTolerance_mm: { type: "number", minimum: 0.001, maximum: 0.5 },
        stepUnit: { const: "mm" },
        minFeature_mm: { type: "number", minimum: 0.05, maximum: 5 },
        minWall_mm: { type: "number", minimum: 0.2, maximum: 8 },
        draftMin_deg: { type: "number", minimum: 0, maximum: 15 },
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["createdAt", "parameterHash", "toolVersion", "sourcePromptId"],
      properties: {
        createdAt: { type: "string" },
        parameterHash: { type: "string" },
        toolVersion: { type: "string" },
        sourcePromptId: { type: ["string", "null"] },
      },
    },
  },
} as const;

let compiled: ValidateFunction | null = null;
function getValidator(): ValidateFunction {
  if (!compiled) {
    const ajv = new Ajv({ allErrors: true, strict: true });
    compiled = ajv.compile(COBRA_SCHEMA as unknown as object);
  }
  return compiled;
}

export interface ValidationResult {
  ok: boolean;
  code: "OK" | "VALIDATION_REJECTED" | "SCHEMA_INVALID" | "PARSE_ERROR";
  errors: string[];
}

/** Rekursiv nyckelscan mot LT-denylistan. Returnerar träffarnas vägar. */
export function scanForLtKeys(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...scanForLtKeys(v, `${path}[${i}]`)));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((LT_DENYLIST as readonly string[]).includes(k.toUpperCase())) {
        hits.push(`${path}.${k}`);
      }
      hits.push(...scanForLtKeys(v, `${path}.${k}`));
    }
  }
  return hits;
}

/** Fullständig validering: denylist FÖRST (hård gate), därefter schema. */
export function validateCobraParams(data: unknown): ValidationResult {
  const ltHits = scanForLtKeys(data);
  if (ltHits.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_REJECTED",
      errors: ltHits.map((p) => `LT-kinematiskt fält förbjudet i wand-dokument: ${p} (LT-kontraktet §1)`),
    };
  }
  const validate = getValidator();
  const valid = validate(data);
  if (!valid) {
    const errors = (validate.errors ?? []).map(
      (e) => `${e.instancePath || "$"} ${e.message ?? "ogiltigt"}${e.params ? ` (${JSON.stringify(e.params)})` : ""}`,
    );
    return { ok: false, code: "SCHEMA_INVALID", errors };
  }
  return { ok: true, code: "OK", errors: [] };
}

export function assertCobraParams(data: unknown): CobraParams {
  const r = validateCobraParams(data);
  if (!r.ok) throw new Error(`${r.code}: ${r.errors.join("; ")}`);
  return data as CobraParams;
}
