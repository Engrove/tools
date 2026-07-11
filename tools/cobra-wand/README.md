# Engrove Alien LT · Trace→3D

Parametrisk 3D-genereringsverktyg med inbyggd multi-trace-editor (v18) för DIY high-end audio. Arbetsflödet: manuell trace + SVG auto-trace → AI-promptpipeline (5 steg) → OCCT-parametrisk 3D-modell → gated STL/STEP-export.

## Arkitektur

```
src/
├── trace/          # v18 trace-subsystem (modulär TypeScript-port av enfilsappen)
│   ├── model.ts    # TraceState, 9 shape-typer, SvgTraceState (v18)
│   ├── geometry.ts # Bezier, autosmooth, RDP, sqSegDist, smart node-editering (v18)
│   ├── frame.ts    # Axes, origo, stationer, mät/skala, snap (3 varianter)
│   ├── export.ts   # JSON/SVG-exportkontrakt (stabila shape.id)
│   ├── editor.ts   # Canvas-editor: 14 verktyg, 7 drag-modes (källexakt v18)
│   ├── svg-trace.ts    # v18: kandidatdetektering, tracing, smart insert/delete/reverse
│   ├── panel-layout.ts # v18: draggabara panelseparatorer (rail/inspector)
│   ├── project.ts  # v15-sessionspaket (.engrove-trace) inkl. svgTrace-persistens
│   └── store.ts    # Multi-trace-container (TraceDocument, 3D-projektfil)
├── core/           # 3D-motor
│   ├── types.ts    # CobraParams schema 1.1.0 (alien_lt_wand)
│   ├── defaults.ts # Alien LT-defaults (Verified ur slutrapporten §7-§10)
│   ├── schema/     # AJV-validering + LT-denylist (8 tokens, rekursiv)
│   ├── geometry/   # OCCT: engine.ts, section.ts (superellips), interp.ts
│   ├── export/     # STL (watertight-gate), STEP (AP242), sidecar JSON
│   ├── checks/     # Tillverkningsbarhet: tip-trim INFO, min_wall, draft
│   ├── oc/         # OpenCascade.js WASM-laddning
│   └── ai/         # protocol.ts (urklipp-rundtur), promptTypes.ts (5 steg)
└── app/            # UI-orkestrator
    ├── main.ts     # Tvåfliks-orkestrator (2D Trace + 3D Modell), tom 3D-start
    ├── panel.ts    # Rev B param-panel (Alien LT-fält, D1-koppling)
    ├── viewport.ts # Three.js 3D (Alien LT-kamera/klipp, clear() för tom start)
    └── styles.css  # Mörkt tema, tabbar, v18-trace-layout
```

## Koordinatramskontrakt

| Datum | X (mm) | Status |
|---|---|---|
| Nålspets | 0.0 | X=0-origo |
| Pivot/rot (L) | 237.1 | **Verified** (TD028-modal) |
| Nos | −11.855 | −0.05·L |
| Ballastlob bakkant | +296.375 | +1.25·L |

Kroppen är **rak och Y-symmetrisk** — tangentiell LT, ingen offsetvinkel/överhäng.

## Kommandon

```bash
npm install          # Installera beroenden
npm run dev          # Vite HMR
npx tsc --noEmit     # Strict type-check
npx vitest run test/trace.test.ts test/trace-v18.test.ts \
  test/schema.test.ts test/interp.test.ts test/ai.test.ts \
  test/cp11.leak.test.ts test/stl-verifier.test.ts   # Icke-WASM tester
npm test             # Full testsvit inkl. OCCT (ca 1-2 min)
npm run build        # Produktionsbygge (dist/)
```

## AI-promptpipeline

| Steg | Typ | Syfte |
|---|---|---|
| 1 | trace_to_3d | Traces → skapar 3D ur tom start |
| 2 | proto_refine | Global finjustering |
| 3 | zone_detail | Namngivna SVG-zoner |
| 4 | measure_sync | mm-måttavstämning |
| 5 | free_form | Fritt mål |

Alla promptytor är garanterat fria från LT-denylist-tokens (P1/P2/P3/L23/STATOR/STATOR_TRACK/ENGROVELT/LTMECHANISM). Svar valideras via AJV-schema → diff → manuellt godkännande → apply.

## Testöversikt

116 icke-WASM tester passerar över 7 testfiler (`npx vitest run ...` ovan). `test/geometry.gates.test.ts`
(16 tester) kräver OCCT-WASM-init (~1 min). Full svit: 132 tester, 8 testfiler
(`npm test`). Siffrorna ovan är manuellt verifierade mot faktisk testoutput —
avvikelse mot `npm test`-utdata ska rättas här, inte i testfilerna.

## Krav

Node.js ≥ 22, npm ≥ 10. Körs i Chrome/Edge, både lokalt via `npm run dev`/`file://` och hostat via Cloudflare Pages.
