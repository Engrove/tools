/**
 * Miljömedveten opencascade.js-laddare (singleton).
 * Node (vitest/skript): dist/node.js (filsystemsladdad wasm).
 * Webbläsare/Electron-renderer: full.js + wasm via Vite ?url-asset.
 */
import type { OpenCascadeInstance } from "opencascade.js";

export type OC = OpenCascadeInstance;

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
      const wasmUrl = (await import("opencascade.js/dist/opencascade.full.wasm?url")).default;
      const init = initMod.default as unknown as (opts: {
        locateFile: (p: string) => string;
      }) => Promise<OC>;
      return init({ locateFile: (p) => (p.endsWith(".wasm") ? wasmUrl : p) });
    })();
  }
  return inst;
}
