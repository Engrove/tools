/**
 * Miljömedveten opencascade.js-laddare (singleton).
 * Node (vitest/skript): dist/node.js (filsystemsladdad wasm).
 * Webbläsare/Electron-renderer: full.js + versionslåst extern WASM-asset.
 *
 * OpenCascade full WASM är större än Cloudflare Pages gräns för en enskild
 * asset. Den hämtas därför från jsDelivr i webbläsaren och inkluderas inte i
 * Vite/Pages-artefakten. URL:en är versionslåst till samma paketversion som
 * package.json/package-lock.json.
 */
import type { OpenCascadeInstance } from "opencascade.js";

export type OC = OpenCascadeInstance;

const OPENCASCADE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/opencascade.full.wasm";

let inst: Promise<OC> | null = null;

export function getOC(): Promise<OC> {
  if (!inst) {
    inst = (async (): Promise<OC> => {
      if (typeof window === "undefined") {
        // Beräknad specifier + @vite-ignore: hindrar Rollup från att statiskt
        // bundla Node-laddaren (node:path/url) i webbläsarbygget. Grenen
        // exekveras endast i Node (vitest/skript), där native import löser den.
        const spec = "opencascade.js/dist/node.js";
        const mod = (await import(/* @vite-ignore */ spec)) as { default: () => Promise<OC> };
        return mod.default();
      }

      const initMod = await import("opencascade.js/dist/opencascade.full.js");
      const init = initMod.default as unknown as (opts: {
        locateFile: (p: string) => string;
      }) => Promise<OC>;

      return init({
        locateFile: (p) => (p.endsWith(".wasm") ? OPENCASCADE_WASM_URL : p),
      });
    })();
  }
  return inst;
}
