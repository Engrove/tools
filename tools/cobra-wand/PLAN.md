# Kodningsplan: Cobra-lik parametrisk wand-generator (MVP)
**För AI vibe-kodning med Claude Fable 5 — manuell chat-session, ingen API**

Status: PLAN ONLY — ingen kod levereras i detta dokument.
Ägare: Jan-Eric (Engrove)
Relaterade underlag: "AI-driven applikation för Cobra-tonarmskroppen" (fullskalig arkitektur), "Cobra-tonarmskroppen för DIY" (formanalys), **Engrove LT Geometry Guardian** (bindande separationskontrakt).

---

## 0. Avgränsning — vad denna plan ÄR och INTE ÄR

Den fullskaliga arkitekturen i de bifogade underlagsdokumenten (FEA-kedja, ML-surrogat, laminatoptimering, Ansys/FEniCSx) är **Fas 2–4-material**, inte MVP. Den här planen beskriver en **fristående Windows 11-app** vars enda uppgift är:

1. Generera en parametrisk, Cobra-lik wand-geometri (yttre skal + tunnväggig struktur för gjutning).
2. Visa den i en roterbar/zoombar 3D-preview.
3. Exportera en tillverkningsbar **master-plugg** som STL (3D-print) och en **STEP-fil** för vidare arbete i Onshape.
4. Möjliggöra AI-assisterad parameteriteration via **manuellt kopierad JSON** — appen genererar en prompt+schema att klistra in i en Fable 5-chatt, och importerar sedan Fable 5:s JSON-svar med validering. Ingen API-nyckel, inget nätverksberoende för AI-delen.

**Explicit UTANFÖR MVP:** FEA/modalanalys, laminatoptimering, ML-surrogat, materialcertifiering, tillverkningsverktyg för formsprutning. Dessa återfinns redan specificerade i det tidigare arkitekturdokumentet och aktiveras i en senare fas när geometrikärnan är verifierad.

**Bindande gränssnittsregel (kritisk, se §1):** Denna app äger **endast** Cobra/freeform-kroppsgeometrin. Den får aldrig skriva, läsa eller föreslå LT-kinematiska fält (`P1`, `P2`, `P3`, `L23`, `STATOR_TRACK`, `engroveLt`). Det styrs av `Engrove LT Geometry Guardian`-skillen och ska verifieras med ett automatiskt test (§9, CP-11).

---

## 1. Arkitekturprincip: Cobra-kropp vs. LT-mekanik

Uppdraget "3D Cobra-objektet ska användas för LT-geometri" betyder **inte** att Cobra-generatorn ska producera LT-kinematik. Det betyder att den producerar en **kroppsform** (skal, headshell-tak, patronfack, monteringsgränssnitt) som sedan **mekaniskt buras in i** ditt separata Engrove Astraline LT-system. De två får dela app och UI, men aldrig dela sanningskälla.

```
[Cobra-formgenerator]  --geometrisk yta + monteringsgränssnitt-->  [LT-mekanik: STATOR_TRACK, P1/P2/P3, solver]
        äger: OML, IML, skal, features                                    äger: kinematik, tangentfel, transform
        modelFamily: "cobra_tonearm" | "freeform_centerline_ring_loft"    modelFamily: "engrove_lt"
```

Praktisk konsekvens för datamodellen (se §3): varje geometridokument taggas med ett `modelFamily`-fält. Applikationens schema-validator **förkastar** all patch/import som blandar Cobra-fält med LT-fält, exakt enligt Guardian-skillens §5.1 och §11.1. Detta är inte en stilistisk rekommendation utan en hård gate som ska testas (CP-11).

Det enda tillåtna gränssnittet mellan de två systemen är en **read-only monteringsspecifikation** (boss-diameter, borrhål, datumpunkt för lagerkopp) som Cobra-appen exporterar och som LT-systemet konsumerar som ett randvillkor — aldrig tvärtom.

---

## 2. Teknikstack (allt open source / gratis)

### Rekommenderad huvudstack — TypeScript/Electron

| Lager | Val | Licens | Motiv |
|---|---|---|---|
| Skal / paketering | Electron (eller Tauri som lättare alternativ) | MIT | Ger fristående `.exe` för Windows 11 utan installationskrav på Python |
| Språk/build | Vite + TypeScript | MIT | Du har redan detta i Engrove Audio Tools 3.0 — samma verktygskedja, samma vana |
| 3D-preview | Three.js | MIT | Du har redan koordinatramskontrakt och Three.js-erfarenhet från 3D-skivspelarvyn — direkt återanvändbar kompetens |
| CAD-kärna (B-rep/NURBS) | **opencascade.js** (WASM-port av OpenCASCADE Technology) | LGPL-2.1 | Enda realistiska open source B-rep-kärnan för sweep/loft/shell/boolean/STEP-export i webbmiljö |
| Mesh-efterbehandling / STL | `three-mesh-bvh` + egen tessellering, alt. `manifold-3d` (WASM) för robust boolean/watertight-kontroll | MIT | Watertight-verifiering innan export |
| Formvalidering | JSON Schema + `ajv` | MIT | Validerar både interna parametrar och importerad AI-JSON |

### Fallback-stack — Python (om opencascade.js visar sig för instabilt i CP1)

| Lager | Val | Licens |
|---|---|---|
| CAD-kärna | `build123d` (efterträdare till CadQuery, byggd på OCCT via OCP) | Apache-2.0 |
| GUI | PySide6 | LGPL-3.0 |
| 3D-preview | PyVista (VTK-baserad) inbäddad via `QtInteractor` | BSD-3 |
| Paketering | PyInstaller → fristående `.exe` | GPL med undantag för genererade binärer (fri distribution) |

**Licensobligation att dokumentera (CP-1 och CP-10):** LGPL (OCCT/opencascade.js, PySide6) tillåter fri distribution i egen app så länge biblioteket länkas dynamiskt/som separat modul och användaren kan byta ut det — vilket både Electron-bundling och Python-import naturligt uppfyller. En `THIRD_PARTY_LICENSES.md` ska genereras automatiskt i CP-10.

**Beslutsgate CP-1:** Bygg en minimal spik i båda kandidatstackarna endast om det första försöket i huvudstacken misslyckas att producera en watertight loft+shell+boolean-kedja. Annars låses TypeScript/Electron/Three.js/opencascade.js som primär stack för att undvika stackswitchkostnad senare.

---

## 3. Datamodell och JSON-schema (Cobra-familjen)

Kärnan är en versionerad, deterministisk parametervektor — **inte** fri text och **inte** fri mesh. Detta är samma princip som redan låg i det tidigare arkitekturdokumentet (parametrisk prior → geometri → export), nedskalad till MVP.

Minsta schema (konceptuell struktur, ej implementationskod):

- `schemaVersion`
- `modelFamily`: `"cobra_tonearm"` (låst för denna app; blockerar alla LT-nycklar)
- `globalDimensions`: `effectiveLength_mm`, `mountingDistance_mm`, `overhang_mm`, `offsetAngle_deg`, `headshellSlot_mm`, `cartridgeBoltCenter_mm`
- `spine`: två guidekurvor — `dorsal[]` och `ventral[]`, var och en en lista kontrollpunkter `{x_norm, z_offset_mm}` längs `x/L ∈ [0,1]`
- `stations[]`: lista enligt startbiblioteket (root, apex, shoulder, mid-span, hood-start, canopy, nose) med `{x_norm, width_mm, height_mm, crownFactor, bellyRelief, cornerFairness}`
- `shell`: `wallThickness_mm`, `localReinforcementZones[]` (endast geometrisk tjockleksflagga i MVP, inga materialdata)
- `features`: `cartridgeBay`, `topSlots[]` (M2.5, 12,5 mm), `wireExit`, `rootBoss` (LT-monteringsgränssnitt — enbart geometri, ingen kinematik)
- `manufacturing`: `stlChordalTolerance_mm` (default 0.01), `stepUnit` (mm)
- `provenance`: `createdAt`, `parameterHash`, `toolVersion`, `sourcePromptId` (kopplar tillbaka till en AI-rond, se §5)

**Hård valideringsregel:** schema-validatorn (`ajv`) kör en explicit denylist-kontroll: om `modelFamily !== "engrove_lt"` och något av nycklarna `P1|P2|P3|L23|STATOR|STATOR_TRACK|engroveLt|ltMechanism` förekommer i inkommande JSON (vare sig från UI eller från importerat AI-svar) → **VALIDATION_REJECTED**, ingen tillämpning. Detta är samma testfall som Guardian-skillens §5.1 och §11.1 beskriver och ska köras som automatiskt CI-test, inte bara manuell granskning.

Startvärdena i `stations[]` hämtas direkt från startbiblioteket i det första analysunderlaget (root≈0.03L, apex≈0.15L, shoulder≈0.35L, mid-span≈0.58L, hood-start≈0.84L, canopy≈0.93L, nose=1.0L) och är uttryckligen märkta som **foto-infererad startfamilj**, inte fabriksspecifikation — det ska synas i UI som en badge/tooltip, inte bara i dokumentation.

---

## 4. Geometripipeline (deterministisk kärna)

1. **Dubbla styrkurvor** — bygg dorsal- och ventrallinje som separata BSpline-kurvor (inte en enda centerline). Detta är den viktigaste korrigeringen mot den ursprungliga, enklare arkitekturen: en enda spline ger en "bananform", två oberoende linjer ger korrekt rotknäck och plant hood.
2. **Stationsprofiler** — vid varje `x_norm`, generera ett superellipse-liknande tvärsnitt parametriserat av bredd, höjd, crown och belly-relief.
3. **Loft/sweep** — bygg ytterhölje (OML) genom att svepa profilerna längs de två guidekurvorna (blend, inte ren linjär interpolation, för att undvika knäckta övergångar).
4. **Shell/offset** — härled innerhölje (IML) via en konstant eller zonvis varierande väggtjocklek. Exportera OML separat som **solid, vattentät master-plugg**.
5. **Booleska features** — subtrahera patronfack, två toppspår, wire-exit-hål, och lägg till root-boss som monteringsgränssnitt (rent geometriskt).
6. **Watertight-/manifold-kontroll** — kör en automatisk kontroll efter varje regenerering (t.ex. via `manifold-3d`) innan export tillåts.
7. **Tessellering & export** — STL (binär, konfigurerbar chordal tolerance, default 0.01 mm) för 3D-print av pluggen; STEP AP242 (mm som enhet) för Onshape.

---

## 5. AI-samarbetsprotokoll (manuell chattsession, ingen API)

Eftersom appen inte får anropa någon AI-API, byggs samarbetet som ett **filbaserat/urklippsbaserat rundturs-flöde**:

**A. Export-knapp ("Skapa AI-prompt"):**
- Appen genererar en textblob bestående av (1) en kort, fast systeminstruktion om uppgiften, (2) det aktuella parameterschemat i JSON (nuvarande värden), (3) ett explicit önskat svarsschema (samma JSON-struktur men tomma/målvärden), (4) en unik `sourcePromptId` för spårbarhet.
- Användaren kopierar detta manuellt in i en Fable 5-chattsession.

**B. Import-knapp ("Läs in AI-svar"):**
- Användaren klistrar in Fable 5:s JSON-svar i ett textfält.
- Appen schema-validerar (inkl. LT-denylist enligt §3) innan något visas.
- Vid giltig JSON: visa en **diff-vy** (fält-för-fält, gammalt vs. föreslaget värde) — **aldrig auto-apply**.
- Endast efter explicit bekräftelse ("Tillämpa ändringar") skrivs de nya parametrarna in, geometrin regenereras, och en post läggs i provenansloggen (`sourcePromptId`, tidsstämpel, diff, användarens beslut).

**C. Ogiltigt svar:** Om JSON:en inte validerar (fel schema, saknade fält, eller LT-fält närvarande) → tydligt felmeddelande med exakt vilket fält som bröt mot schemat, ingen tillämpning.

Detta säkerställer att Fable 5 aldrig är en direkt beslutsinstans över geometrin (samma princip som i det ursprungliga arkitekturdokumentet), bara en förslagsgenerator som passerar determinstisk validering.

---

## 6. 3D-preview — krav

- Fri orbit-kamera (rotera, zoom, pan) med Three.js `OrbitControls`.
- Växla mellan: yttre skal (master-plugg-vy) / genomskuren shell-vy (för att inspektera väggtjocklek) / trådnät (för att bedöma ytkvalitet).
- Visuella markörer för stationslinjer, spårcentrum och rootboss — hjälper vid manuell jämförelse mot referensfoton.
- Live-regenerering vid parameterändring (debounce, inte per tangenttryck) — mål: under ~300 ms för nominell upplösning i förhandsgranskningsläge (lägre tessellering än exportupplösning).
- Separat "exportkvalitet"-knapp som kör den finare chordal-tolerance-tesselleringen bara vid faktisk export, för att hålla preview snabb.

---

## 7. Export & filformat

| Format | Syfte | Krav |
|---|---|---|
| STL (binär) | 3D-print av master-plugg | Chordal tolerance ≤ 0.01 mm, verifierad watertight/manifold före export |
| STEP AP242 | Vidare arbete i Onshape | mm som enhet, metadata (namn, datum, `parameterHash`) inbäddad |
| JSON sidecar | Provenans | Parametersnapshot, verktygsversion, hash, `sourcePromptId`-historik |

Onshape-import ska testas manuellt som en explicit CP-gate (CP-7): filen ska kunna importeras utan geometrifel eller väggtjockleksvarningar i Onshapes egen import-diagnostik.

---

## 8. Manufacturability-kontroller (MVP-nivå, ej full FEA)

Enkla, snabba, deterministiska kontroller som körs automatiskt efter varje regenerering:

- Minsta väggtjocklek över hela skalet (flagga zoner under tröskelvärde).
- Självkorsningskontroll på IML mot OML (shell-offset som skär sig själv).
- Minsta features-storlek på spår/hål (jämför mot verktygs-/printerupplösning).
- Enkel drag-/undercut-heuristik för tvådelad formverktygsuppdelning (informativ, inte auktoritativ — flaggas tydligt som heuristik, inte som formell draftanalys).

---

## 9. Checkpoint-plan för Fable 5 (CP0–CP12)

Samma governance-stil som redan används i EIC/learning-hub-arbetet: varje CP har mål, leverabel, och en hård acceptance gate. Ingen CP anses klar utan att gaten är objektivt verifierad (inte "ser bra ut").

| CP | Mål | Leverabel | Acceptance gate |
|---|---|---|---|
| **CP0** | Governance-bootstrap | Repo-skelett, README med scope/out-of-scope, denna plan som referens, licensmanifest-stub | Repo existerar; README anger uttryckligen MVP-avgränsningen i §0 |
| **CP1** | Stackvalidering | Minimal Electron+Vite+Three.js+opencascade.js-spik: skapa en enkel solid, exportera STL | STL öppnas och verifieras watertight i extern viewer/validator |
| **CP2** | Datamodell & schema | JSON Schema för Cobra-familjen (§3), `ajv`-validator inkl. LT-denylist | Schema accepterar startbiblioteket från §3; avvisar varje LT-nyckel (testfall enligt Guardian §5.1) |
| **CP3** | Geometrimotor: spine + profiler | Dubbla guidekurvor + stationsprofiler | Genererar giltig kurvuppsättning för nominella parametrar utan självkorsning |
| **CP4** | OML-loft | Sammanhängande yttre skal | Watertight solid för nominellt parameterset |
| **CP5** | Shell/IML | Skalad innerstruktur med väggtjocklek | Shell-operation lyckas utan självkorsning; tjocklek inom tolerans |
| **CP6** | Booleska features | Patronfack, toppspår, wire-exit, root-boss | Alla features appliceras rent (inga orphan-ytor); slotmått verifieras mot mål (12,5 mm etc.) |
| **CP7** | Export | STL + STEP + JSON sidecar | STL watertight; STEP importeras felfritt i Onshape (manuell verifiering) |
| **CP8** | 3D-preview | Orbit-kontroller, live-regenerering, vytoggel | Rotation/zoom flyter vid nominell upplösning; regenerering < ~300 ms i previewläge |
| **CP9** | AI-protokoll | Export-prompt-knapp + import/validering/diff/apply-flöde | Ogiltig JSON avvisas med specifikt felmeddelande; giltig JSON kräver explicit bekräftelse innan tillämpning |
| **CP10** | Manufacturability-kontroller | Väggtjockleks-, självkorsnings-, feature-storlekskontroller | Kontrollpanel visar pass/fail efter varje regenerering |
| **CP11** | LT-separationskontrakt (bindande) | Automatiskt testfall som kör Guardian-skillens gates 5.1/11.1 mot appens hela export-yta | Testet failar highlightat om något LT-fält någonsin läcker ut från Cobra-appen |
| **CP12** | Paketering & fullständig rundtur | Fristående `.exe`, licensbunt, README, end-to-end-demo (prompt → Fable 5-chatt → import → export → Onshape) | Kör på en ren Windows 11-maskin utan extra installationer; hela rundturen loggad i provenansloggen |

### Mall för Fable 5-prompt per CP (struktur, ej färdig text)

Varje CP-prompt till Fable 5 bör innehålla, i denna ordning:
1. Kort kontext: vilket lager i pipelinen (§4) detta CP berör.
2. Explicit **in-scope** och **out-of-scope** för just detta CP (kopiera från tabellen ovan).
3. Det exakta JSON-schemat/interfacet som ska implementeras (från §3), utan fri tolkning.
4. Acceptance-gate-kriteriet ordagrant, så Fable 5 vet vad som räknas som klart.
5. En explicit instruktion: "Skriv inte kod för kommande CP:n, håll dig till detta lager."
6. En instruktion om att flagga i svaret om något krävt antagande gjorts (Verified/Assumed-boundary, samma princip som i din EIC-retrospektiv-metodik).

---

## 10. Risker och antaganden (Verified/Assumed-gränser)

- **Assumed:** opencascade.js hanterar shell/loft/boolean-kedjan tillräckligt robust för denna geometriklass utan att kräva C++/pythonocc-fallback. Verifieras i CP1.
- **Assumed:** Onshape importerar STEP AP242 utan manuell reparation. Verifieras manuellt i CP7 — om det failar, fallback till STEP AP214 eller IGES som nödlösning (medvetet sämre topologibevarande, se det ursprungliga underlagets varning om IGES).
- **Verified (från underlag):** Cobra-manualens officiella mått (239 mm effektiv längd, 221,7 mm monteringsavstånd, 23° offset, 12,5 mm headshell-spår, M2.5) används som hårda ankarpunkter i schemat — inte som gissning.
- **Assumed:** Stationstabellens normaliserade positioner (root≈0.03L osv.) är foto-inferens och ska förbli synligt märkta som sådana i UI, inte tystas ned till "fakta".
- **Risk:** Sammanblandning av Cobra- och LT-fält är den enskilt farligaste regressionen för hela ekosystemet (skulle korrumpera LT-solverns sanningskälla). Därför är CP11 en bindande, inte valfri, gate.

---

## 11. Nästa steg efter MVP (redan specificerat, ej del av denna leverans)

När geometrikärnan (CP0–CP12) är verifierad och du har en fysisk plugg/gjutform i handen, aktiveras Fas 2–4 från det ursprungliga arkitekturdokumentet: snabb fysik-surrogat, högfidelitets-FEA (FEniCSx/CalculiX/Ansys ACP), laminatoptimering och materialcertifiering. Ingen av dessa ska påbörjas innan CP12 är godkänd — annars upprepas samma risk som redan identifierats i din retrospektiv-metodik: att bygga ovanpå overifierad substrat.
