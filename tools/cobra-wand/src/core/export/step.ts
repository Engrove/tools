/**
 * STEP-export (PLAN.md §7): AP242, mm, solid; namn/datum/parameterhash i header.
 *
 * ORDNINGSKRAV (empiriskt verifierat i scripts/ap242probe.mjs):
 * Första STEPControl_Writer-konstruktionen i processen kör STEPControl_Controller::Init,
 * som DEFINIERAR write.step.*-statics med defaultvärden (AP214IS) och därmed skriver
 * över tidigare SetCVal. Dessutom binder writerns modell protokollet vid KONSTRUKTION.
 * Korrekt sekvens: (1) initiera controllern en gång via slaskwriter,
 * (2) SetCVal("write.step.schema","AP242DIS"), (3) skapa den riktiga writern, (4) Transfer.
 * Gate-testet asserterar "AP242" i FILE_SCHEMA.
 */
import type { OC } from "../oc/load.js";

let stepSeq = 0;
let controllerReady = false;

function ensureStepController(oc: OC): void {
  if (controllerReady) return;
  const dummy = new oc.STEPControl_Writer_1();
  (dummy as { delete?: () => void }).delete?.();
  controllerReady = true;
}

export interface StepExportResult {
  data: Uint8Array;
  /** FILE_SCHEMA-radens innehåll, för gate-assertion. */
  schemaLine: string;
}

export function writeSTEP(
  oc: OC,
  shape: unknown,
  opts: { name: string; parameterHash: string },
): StepExportResult {
  ensureStepController(oc);
  const okSchema = oc.Interface_Static.SetCVal("write.step.schema", "AP242DIS");
  if (!okSchema) throw new Error("Interface_Static: kunde inte sätta write.step.schema");
  oc.Interface_Static.SetCVal("write.step.unit", "MM");
  const writer = new oc.STEPControl_Writer_1();
  const progress = new oc.Message_ProgressRange_1();
  writer.Transfer(shape as never, oc.STEPControl_StepModelType.STEPControl_AsIs as never, true, progress);
  const fname = `cobra_export_${++stepSeq}.step`;
  writer.Write(fname);
  const raw: Uint8Array = oc.FS.readFile(fname);
  try {
    oc.FS.unlink(fname);
  } catch {
    /* FS-städning är best effort */
  }
  (writer as { delete?: () => void }).delete?.();
  (progress as { delete?: () => void }).delete?.();
  return patchHeader(raw, opts);
}

/** Patchar FILE_DESCRIPTION/FILE_NAME i HEADER-sektionen (ren ASCII, ISO 10303-21). */
function patchHeader(raw: Uint8Array, opts: { name: string; parameterHash: string }): StepExportResult {
  const text = new TextDecoder().decode(raw);
  const endsec = text.indexOf("ENDSEC;");
  if (endsec < 0) throw new Error("STEP-header saknar ENDSEC — oväntat filformat");
  let header = text.slice(0, endsec);
  const body = text.slice(endsec);
  const safeName = opts.name.replace(/[^A-Za-z0-9_\-. ]/g, "_");
  const desc = `Engrove Cobra Wand; parameterHash=${opts.parameterHash}`;
  header = header.replace(/FILE_DESCRIPTION\(\('([^']*)'/, `FILE_DESCRIPTION(('${desc}'`);
  header = header.replace(/FILE_NAME\('([^']*)'/, `FILE_NAME('${safeName}'`);
  const schemaMatch = header.match(/FILE_SCHEMA\(\(([^)]*)\)\)/);
  const schemaLine = schemaMatch ? schemaMatch[1] : "";
  return { data: new TextEncoder().encode(header + body), schemaLine };
}
