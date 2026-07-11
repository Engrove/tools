// Kör samtliga automatiska gates i sekvens och skriver VERIFICATION_LOG.md.
// Avbryter vid första fel (exit ≠ 0). Manuella gates (Onshape-import, Win11-
// fönstersmoke, interaktivitetskänsla) listas i README och loggas EJ här.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const steps = [
  { id: "typecheck", cmd: "npx tsc --noEmit", label: "TypeScript strict --noEmit" },
  { id: "tests", cmd: "npx vitest run", label: "Vitest: CP2–CP7, CP9–CP11 (inkl. OCCT-geometri-gates)" },
  { id: "build", cmd: "npx vite build", label: "Vite-produktionsbygge (renderer + WASM-asset)" },
];

const lines = [
  "# VERIFICATION_LOG — Engrove Cobra Wand Generator",
  "",
  `Körd: ${new Date().toISOString()}`,
  `Node: ${process.version}`,
  "",
];

let failed = false;
for (const s of steps) {
  const t0 = Date.now();
  process.stdout.write(`\n=== ${s.label}\n`);
  try {
    const out = execSync(s.cmd, { stdio: "pipe", encoding: "utf8", timeout: 1200_000 });
    const tail = out.trim().split("\n").slice(-12).join("\n");
    lines.push(`## ${s.id} — PASS (${((Date.now() - t0) / 1000).toFixed(1)} s)`, "", "```", tail, "```", "");
    process.stdout.write(tail + "\n");
  } catch (e) {
    failed = true;
    const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim().split("\n").slice(-30).join("\n");
    lines.push(`## ${s.id} — FAIL (${((Date.now() - t0) / 1000).toFixed(1)} s)`, "", "```", out, "```", "");
    process.stdout.write(`FAIL:\n${out}\n`);
    break;
  }
}

lines.push(failed ? "**RESULTAT: FAIL — leverans blockerad.**" : "**RESULTAT: PASS — samtliga automatiska gates gröna.**", "");
writeFileSync("VERIFICATION_LOG.md", lines.join("\n"));
process.exit(failed ? 1 : 0);
