// Genererar THIRD_PARTY_LICENSES.md ur node_modules för RUNTIME-beroenden
// (det som faktiskt skeppas i bundeln) + verktygsnotiser. OCCT:s LGPL-2.1-
// förpliktelse (med OCCT-undantaget) dokumenteras explicit eftersom
// opencascade.js bäddar in Open CASCADE Technology i WASM-binären.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const runtimeDeps = ["ajv", "three", "opencascade.js", "manifold-3d"];
const toolDeps = ["vite", "vitest", "typescript"];

function licenseTextFor(dep) {
  const dir = join("node_modules", dep);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const candidates = readdirSync(dir).filter((f) => /^licen[cs]e/i.test(f));
  let text = "";
  if (candidates.length > 0) {
    text = readFileSync(join(dir, candidates[0]), "utf8").trim();
  }
  return { name: dep, version: pkg.version, license: pkg.license ?? "SE PAKET", text };
}

const parts = [
  "# THIRD_PARTY_LICENSES — Engrove Cobra Wand Generator",
  "",
  "Genererad av `scripts/gen-licenses.mjs`. Runtime-beroenden skeppas i appbundeln;",
  "verktygsberoenden används endast vid bygge/test och distribueras inte.",
  "",
  "## Särskild notis: Open CASCADE Technology (OCCT)",
  "",
  "`opencascade.js` bäddar in OCCT 7.6 i WASM-binären. OCCT licensieras under",
  "**LGPL-2.1 med Open CASCADE-undantaget** (statisk/inbäddad länkning tillåten",
  "utan att egen kod smittas, förutsatt att OCCT-notisen bevaras). Denna fil",
  "utgör den notisen och ska distribueras med applikationen. Källa:",
  "https://dev.opencascade.org/resources/licensing",
  "",
  "## Runtime-beroenden",
  "",
];

for (const dep of runtimeDeps) {
  const info = licenseTextFor(dep);
  parts.push(`### ${info.name}@${info.version} — ${info.license}`, "");
  if (info.text) parts.push("```", info.text, "```", "");
  else parts.push("_Licenstextfil saknas i paketet; se paketets package.json/repo._", "");
}

parts.push("## Byggverktyg (distribueras ej)", "");
for (const dep of toolDeps) {
  if (!existsSync(join("node_modules", dep, "package.json"))) continue;
  const pkg = JSON.parse(readFileSync(join("node_modules", dep, "package.json"), "utf8"));
  parts.push(`- ${dep}@${pkg.version} — ${pkg.license ?? "?"}`);
}
writeFileSync("THIRD_PARTY_LICENSES.md", parts.join("\n"));
console.log("THIRD_PARTY_LICENSES.md skriven.");
