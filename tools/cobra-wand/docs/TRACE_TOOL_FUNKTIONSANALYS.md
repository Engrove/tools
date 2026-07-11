# Engrove Manual Trace Tool v14 — komplett analytisk funktionsanalys

**Analysmetod:** fullständig källkodsläsning av `Engrove_Manual_Trace_Tool_v14.html`
(906 rader; skriptkropp rad 87–906, CSS/HTML-skelett rad 1–86), korsverifierad mot
`Engrove_Manual_Trace_Tool_v14_AI_Vibe_Spec.md` (47 sektioner). Funktionsinventeringen
i spec §46 (108 funktioner) stämmer 1:1 mot källan — verifierat via symbolextraktion.
Avvikelser mellan spec och källa redovisas i §18. Detta dokument är den bindande
implementationsspecen för porten in i 3D-genereringsverktyget.

---

## 1. Identitet och arkitektur

Fristående enfils HTML/CSS/JS-app (inga beroenden, ingen server) för manuell
tracing ovanpå referensbild. Producerar ett **parat exportkontrakt**:

- **JSON** — auktoritativ, redigerbar geometri- och semantikkälla.
- **SVG** — visuell overlay av exakt samma data, bunden via
  `shape.id ↔ <g id="{id}" data-json-id="{id}">`.

Arkitekturen är en IIFE med ett enda globalt tillståndsobjekt `S`, canvas-2D-
rendering med full omritning per frame (`draw()`), och DOM-direktbindningar
(inga ramverk). All geometri lagras i **bildpixelkoordinater** (top-left, y ned);
pan/zoom är enbart en view-transform.

## 2. Globalt tillstånd `S` (verifierad fältkarta)

| Fält | Typ/Default | Funktion |
|---|---|---|
| `schema_version` | `"engrove_manual_trace_v14"` | exportstämpel |
| `img` | `null \| {name,width,height,dataUrl,_im}` | referensbild; `_im` = Image-instans (intern, exporteras ej) |
| `shapes` | `[]` | committade objekt (ordning = ritordning = z-order) |
| `sel` | `null \| shapeId \| "trace_frame.origin"` | selektion; origo är special-id `ORIGIN_SEL` |
| `tool` | `"select"` | aktivt verktyg: select/pan/origin/station/measure/line/pen/poly/zone/rect/circle/mask |
| `cur` | `null \| shape` | pågående (ej committat) objekt |
| `view` | `{s:1,x:0,y:0}` | zoomskala + pan-offset i skärmpixlar |
| `hist`/`fut` | `[]` | undo/redo-stackar; JSON-strängade snapshots `{shapes,sel,anchor,frame}`, max 80 |
| `drag` | `null \| {mode,...}` | aktiv musoperation (se §5) |
| `space` | `false` | Space-tangent nere ⇒ pan-läge |
| `grid`/`pts`/`snap`/`measureSnap` | `true` | visnings-/snap-toggles |
| `snapPx` | `14` | snap-tröskel i **skärmpixlar** (delas med `view.s` till bildpixlar) |
| `snapHit` | `null \| {x,y,dist}` | aktuell snap-träff för visuell indikator |
| `anchor` | `null \| {x,y}` | startpunkt för nästa verktyg (§8) |
| `frame` | se §3.2 | engineering frame: origo, axes, stationsspacing, skala |

Hjälpare: `id(p)` = `{prefix}_{6 tecken base36-random}_{4 tecken base36-tid}`;
`clone` = `JSON.parse(JSON.stringify(...))`; `sel()` = uppslag av valt shape.

## 3. Datamodell

### 3.1 Shape-typer (9 st, verifierade fältkontrakt)

| Typ | Geometrifält | Särskilda fält |
|---|---|---|
| `line` | `points[0..1]` | — |
| `measure` | `points[0..1]` | `length_px`, `real_length`, `computed_real_length`, `unit`, `is_scale_reference`, `scale_reference_id`, ev. `note` |
| `path` (Bezier/Pen) | `nodes[] {x,y,in{},out{},auto,mode}` | `closed`; export tillför `sampled_polyline_64` |
| `poly` | `points[]`, `closed` | — |
| `zone` | `points[]`, `closed:true` (tvingad) | palettstil, `fill_alpha 0.18`, `stroke_alpha 0.95`, `width 1.4` |
| `mask` | `points[]`, `closed` | `role:"ignore_mask"`, streckad rendering, fill-alpha 0.09 |
| `station` | vertikal: `x,y1,y2`; horisontell: `y,x1,x2` | `station_index`, `orientation`, `origin_ref`, `spacing_px` |
| `rect` | `x,y,w,h` | `clean()` normaliserar negativ w/h |
| `circle` | `cx,cy,r` | — |

Gemensamma fält (via `ensureShapeMeta`/`clean`/`enrichShapeForExport`):
`id`, `type`, `name`, `role`, `description`, `semantic{standard_name,display_name,
feature_kind,ai_hint}`, `references[]`, `style{stroke,fill,fill_alpha,stroke_alpha,width}`,
`created_at`, samt vid export `svg_binding{}` + `geometry_summary{}`.

### 3.2 `trace_frame`

```
origin {x,y} | null
origin_metadata {id:"trace_frame.origin", name, role:"datum", kind:"origin",
                 location_role, description, references[]}
axes {x:"+image_x", y:"+image_y", z:"+out_of_screen"}   // default i källan
station_spacing_px: number|null
scale {reference_measure_id, unit, px_per_unit, unit_per_px,
       source_length_px, source_real_length}
```

OBS spec §29 exemplifierar axes-default `y:"-into_screen", z:"-image_y"` — **källans
faktiska default är `y:"+image_y", z:"+out_of_screen"`** (rad 91). Speceexemplet är
ett användningsfall, inte defaulten.

### 3.3 Roll-defaults (`ensureShapeMeta`)

measure→`measurement`, station→`station`, mask→`ignore`, övriga→`trace`.
`defaultKind()`: path/poly→`outer_contour`, line→`datum`, measure→`measurement`,
station→`station`, mask→`ignore_zone`, zone→`semantic_zone`, rect/circle→`zone`.

### 3.4 Namngivning

`typeBase()`: path→`bezier_path`, poly→`polyline`, mask→`ignore_mask`, övriga = typnamn.
`nextName(t)` = `{base}_{pad3(max befintligt löpnummer+1)}`. `ensureShapeMeta`
ersätter namn ENDAST om namnet är ett råtypnamn (platshållarlistan) — operatörsnamn
bevaras. Stationer: `stationName(0)="station_0_origin"`, annars `station_±N`.

## 4. Koordinatsystem och transforms

- `scr(e)` — musevent → skärmpunkt relativt canvas.
- `toImg(p)` = `{(p.x−view.x)/view.s, (p.y−view.y)/view.s}`; `toScr` inversen.
- `size()` — HiDPI-korrekt: canvasbuffert × devicePixelRatio, `cx.setTransform(d,0,0,d,0,0)`.
- Zoomklamp `0.01..64`. Hjulzoom: faktor `exp(−deltaY·0.0012)` runt muspunkten.
  Högerdragszoom: faktor `exp(dy·0.010 + dx·0.003)` runt nedtryckspunkten (ankare
  hålls fix i både skärm och bild: `view.x = anchorSp.x − anchorImg.x·s`).
- `fit()` = min(bredd-/höjdkvot)·0.92, centrerad. `one()` = `{s:1,x:40,y:40}`.
- Grid: 64 px·s moduloraster, ritas endast om steget ≥ 8 px.

## 5. Händelsemaskinen (drag modes — kritisk logik, verifierad rad för rad)

`mousedown` beslutskedja (ordningen är bindande):

1. `button===2` → `mode:"zoom"` (sparar anchorSp/anchorImg/startS).
2. `button===1 || S.space || tool==="pan"` → `mode:"pan"`.
3. `button!==0` → ignoreras. Annars:
4. `originHit(raw)` (avstånd < 20/s till origo) → `hist()`, sel=origo, `mode:"origin"`.
5. Tvåpunktsobjekt aktivt (`cur ∈ {measure,line,rect,circle}`) → `mode:"place2"` + live-preview (drag-release-stöd).
6. `hitNode(raw, includeCurrent=true)` träff:
   - tool=select → `hist()` (endast för committat shape), `mode:"edit"`.
   - annat ritverktyg → **`mode:"nodeClickOrEdit"`** (trackpadregeln): rörelse >3 px
     skärm ⇒ eskalerar till `edit` (med fördröjd `hist()` via `histDone`-flagga);
     släpp utan rörelse ⇒ `clickToolAt(start)` = fortsätt/starta från punkten.
7. tool=select utan nodträff: `hit(raw)` shape-träff → edit; annars sel=null + `mode:"pending"`.
8. Övriga verktyg på tom yta → `mode:"pending"`.

`pending`: rörelse >3 px ⇒ eskalerar till `pan` (vänsterdrag på tom yta panorerar,
trackpadregeln); släpp utan rörelse ⇒ `clickToolAt(raw)` (klick = placera punkt).

`mouseup` (window-nivå, fångar släpp utanför canvas): place2 ⇒ `clickToolAt` (avslutar
tvåpunktsobjektet); nodeClickOrEdit utan rörelse ⇒ `clickToolAt(drag.start)`;
pending utan rörelse ⇒ `clickToolAt(drag.raw)`; alltid `drag=null, snapHit=null`.

`dblclick`: `finish(false)` för poly/mask/pen — **inte zone** (spec-quirk #1, åtgärdas i porten).
`mousemove` utan drag: `previewCurrentAt` (live andra-punkt för measure/line/rect/circle).
Statusfältet `curS` uppdateras med snappad bildkoordinat varje move.

## 6. Verktygsflöden (exakta beteenden ur `clickToolAt`)

- **select**: nod-/handtagsträff prioriteras (tröskel 14/s), därefter shape-avstånd
  (tröskel 12/s); origo väljs via egen hit-zon (20/s).
- **origin**: `setOrigin(p)` — `hist()`, sätter frame.origin, metadata-id, sel=origo.
- **station**: `addStationAt(p)` — orientering ur X-axeln (§10); koordinat ur klick;
  index = `round((coord−originCoord)/spacing)` om spacing finns, **annars sekventiellt
  antal stationer** (quirk Q7); linjeändar = hela bildens bredd/höjd.
- **measure**: klick 1 skapar `points:[p,p]` + anchor; klick 2 (eller drag-release via
  place2) sätter `points[1]` + commit ⇒ `finalizeMeasure`. Egen snap (`measureSnapPoint`)
  som ignorerar measure-objekt. Anchor-kedjning: nästa mått startar i förra måttets slut.
- **line/rect/circle**: samma tvåklicks-/drag-release-mönster; anchor som startpunkt
  om satt; live-preview av andra punkten.
- **poly/mask/zone**: klick lägger punkt; anchor kan ge de två första punkterna; zone
  tvingas `closed:true` från start och får palettstil per index; avslut via End Tool /
  Close Path (poly/mask även dubbelklick).
- **pen** (`addPen`): klick = auto-smooth-nod, Shift-klick = corner-nod (`auto:false`);
  anchor ger nod 0+1 direkt; `autoSmoothPath` körs efter varje ny nod.

## 7. Snap-subsystemet (tre varianter)

1. **`snapPoint(p,{off,includeCurrent})`** — generell: kandidater = origo + alla shapes
   `contactPoints()` (+ ev. `S.cur`); närmsta inom `snapPx/view.s`; sätter `S.snapHit`.
   `Alt` ⇒ `off`. `contactPoints`: station = ändar+mitt; line/measure = 2 punkter;
   poly/mask/zone = alla punkter; rect = 4 hörn; circle = centrum+radiepunkt; path = noder.
2. **`measureSnapPoint(p,e)`** — separat toggle (`msnap`); skannar origo + shapes + cur
   men **hoppar över `type==="measure"`** (mått ska inte snappa mot måttlinjer).
3. **`snapStationCoord(p,ori,excludeId)`** — 1D-snap längs stationens led mot origo-,
   stations- och kontaktpunkts-koordinater; sätter riktad snapHit.

Visuell indikator (`snapDraw`): grön cirkel (radie=snapPx/s) + kors vid träffen.

## 8. Anchor-systemet

`S.anchor` = "fortsätt härifrån". Sätts av: avslutad tvåpunktsplacering (klick 1),
`commitCurrentKeepAnchor` (senaste punkt, utom vid `closed`-commit ⇒ null),
`undoActivePoint` (kvarvarande sista punkt), poly/zone/mask-punktläggning, pen-nod.
Konsumeras av `startWithAnchor`-mönstret i clickToolAt: nytt tvåpunktsobjekt får
anchor som startpunkt och fullbordas direkt av klicket; poly/mask/zone får
`[anchor, p]` som två första punkter; pen får nod(anchor)+nod(p).
**Verktygsbyte** (`setTool`) auto-committar pågående objekt och behåller anchor.

## 9. Mät- och skalsubsystemet

`finalizeMeasure(m)` vid commit: om ingen skala finns ⇒ `prompt` verkligt mått +
enhet; accepterat ⇒ måttet blir skalfreferens (`is_scale_reference:true`) och
`frame.scale` fylls (`px_per_unit = px/real`); avböjt ⇒ `real_length:null` + note.
Med skala ⇒ `real_length = px/px_per_unit`, `scale_reference_id` sätts.
`updateMeasurements()` räknar om ALLA mått (körs i varje `outObj`): referensen
uppdaterar skalan ur sin aktuella pixellängd (flyttas referensmåttet omkalibreras
alltså hela dokumentet), övriga får `computed_real_length`. `parseNum` tål komma
som decimaltecken.

## 10. Origo, axes och stationer

- **Origo**: placeras/dras (`moveOriginTo` med startoffset); flytt uppdaterar alla
  spacing-indexerade stationer (`updateStationPositionsFromOrigin`). Egen metadata
  med `location_role` (stylus_tip/pivot/cartridge_proxy/headshell_datum/...) via
  prompt (`editOriginMeta`) eller metadata-panelen.
- **Axes**: sex riktningsval per axel (±image_x, ±image_y, ±screen_z).
  `enforceAxes(changed)` löser baskonflikt: ändrad axel vinner, kolliderande axel
  flyttas till ledig bas (defaults `+image_x/+image_y/+out_of_screen`).
  `axisVec2` ger 2D-vektor (null för skärm-z). `drawFrame` ritar origokors + tre
  axelpilar (X `#b7ff00`, Y `#00e5d4`, Z `#ff66cc`); skärm-z ritas som ⊙ (punkt) /
  ⊗ (kryss) beroende på tecken.
- **Stationsorientering**: X längs image_y ⇒ horisontella stationer, annars vertikala.
- **Add stations** (`stations()`): prompt spacing (default bildbredd/10) + antal per
  sida; confirm för att rensa befintliga; skapar index −N..+N; station 0 rödfärgas.

## 11. Metadata, referenser, panel

Panelen binder Name/Role/Kind/Description mot valt shape ELLER origo (special-sel).
`applyProps`: origo ⇒ `kind` + ev. `location_role`; shape ⇒ `semantic.feature_kind`,
`display_name=name`. `addReference` lägger `{relation,target,note,created_at,
source:"manual_trace_property_panel"}`; mål = origo/axes/image/valfritt shape-id.
16 relationstyper (parallel_to … proxy_for). Referenslistan renderas i panelen.
`list()` = objektlista (origo först, mått med real length), klick väljer.

## 12. Undo/redo

`hist()` pushar snapshot FÖRE mutation (anropsplatser: setOrigin, addStationAt,
stations, commit, applyProps, addReference, editOriginMeta, del, smoothSelected,
clearTrace, apply/loadJ, select-klick, origin-drag-start, edit-drag-start).
`undo()`: **först** `undoActivePoint()` (tar bort senaste punkt i pågående objekt,
verktyget förblir aktivt — path re-smoothas, tvåpunktsobjekt avbryts med anchor
kvar); annars stackpop med nuläge → fut. `redo()` symmetriskt. Max 80 poster.

## 13. Rendering

`draw()`-ordning: clear → grid (skärmrum) → transform (translate+scale) → bild
eller fallbackrektangel 1000×700 → `drawFrame` → alla shapes (`shape(s, selected)`)
→ `S.cur` (temp=vit) → `snapDraw` → restore. Alla linjebredder/radier delas med
`view.s` (konstant skärmstorlek). Handles ritas för valt/pågående objekt om
`pts`-togglen är på: path-noder med in-handtag `#ff8fab` + out-handtag `#7df9ff`
och tangentlinjer; measure start `in`-färg / slut `out`-färg; stationsändar + mitt.
Färgtabell C exakt enligt spec §38. Mask = streckad `[8/s,5/s]` + fill-alpha 0.09.
Zone = fill-alpha ur stil (default 0.18) + heldragen kant. Measure-etikett:
`REF `-prefix för referens, `px` + ` = real unit` vid skala.

## 14. Export

### 14.1 JSON (`outObj(inc)`)

`ensureAllMeta()` + `updateMeasurements()` körs alltid först. Toppnivå:
`schema_version, description (traceDescription()), coordinate_space, image
{name,width,height,dataUrl?}, view, trace_frame (klon), selectedId, shapes[]`
där varje shape berikas (`enrichShapeForExport`): description-fallback,
`svg_binding` (join-nyckel, json_path `$.shapes[i]`, selector `g#id`, renderat
element via `svgElementKind`), `geometry_summary` (typ-specifik), och för path
`sampled_polyline_64` = `sample(s,16)` (16 samplingar per kubiskt segment —
namnet "64" är historiskt, quirk Q5).

`traceDescription()` = det fullständiga AI-läskontraktet: sv/en-förklaring,
`file_pair_contract`, `pairing`, `coordinate_contract` (inkl. aktuella axes+scale
+ ai_reading_order), `metadata_contract`, `shape_type_mapping`, `claim_boundary`.

### 14.2 SVG (`saveSvg`)

`<svg viewBox="0 0 w h">` innehållande: (1) `<metadata id="engrove_trace_json_binding">`
med XML-escapad JSON (schema_version, description, trace_frame, shape-summaries);
(2) `<image id="trace_reference_image" opacity=.35>` om bild finns (dataUrl bäddas
ALLTID i SVG, oberoende av JSON-checkboxen — quirk Q6); (3) `<g id="trace_origin">`
med origometadata + kors; (4) per shape `<g>` med 13 dataattribut (id, data-json-id,
data-json-path, data-shape-index, data-type, data-role, data-name, data-description,
data-feature-kind, data-reference-count, data-rendered-element, data-zone,
data-station-index) + `<title>` + geometrielementet via `ssvg()` (path med C-segment
+ Z; measure-line med data-length-px/data-real-length/data-unit/data-scale-reference;
zone som polygon med fill-opacity ur stil, övriga fill="none"/fill-opacity=0).

### 14.3 Import (`apply`/`loadJ`)

Läser `shapes`, `trace_frame||frame`, `selectedId`, ev. `image.dataUrl` (laddar
bilden). Kör `ensureAllMeta()` (normaliserar saknad metadata). **`view` exporteras
men importeras ALDRIG** (quirk Q4). Parsefel ⇒ `alert`.

## 15. Tangentbord, paste, drag/drop, layout

- Space=pan-läge; Escape=avbryt cur+drag; Delete/Backspace=del (ej när JSON-textarean
  har fokus); Ctrl/Cmd+Z=undo (punktnivå först); Ctrl/Cmd+Y=redo; Alt=snap av temporärt.
- `window.paste`: första image-item laddas (blockeras när JSON-textarean är aktiv).
- Drag/drop på stage: bildfil ⇒ loadImg; `.json` ⇒ loadJ; overlay "Drop image or JSON here".
- `syncLayout`: mäter topbar-höjd → CSS-variabel; sidopanel-kollaps; `size()` efter.
  Responsiva brytpunkter 1180/880 px (sidopanel blir overlay).

## 16. Funktionskatalog (108 funktioner, verifierat beteende)

**Metadata/namn:** `pad3` zeropad; `typeBase` typ→namnbas; `nextName` löpnummer;
`defaultKind` typ→feature_kind; `ensureFrameMeta`/`ensureShapeMeta`/`ensureAllMeta`
normalisering (idempotent); `selectedObjectLabel`; `targetOptionsHtml` referensmål;
`escapeAttr` HTML-escape; `updateProps`/`applyProps` panelbindning; `editOriginMeta`
prompt-flöde; `addReference`.
**Historik:** `hist`, `undo`, `redo`, `undoActivePoint`.
**Vy/transform:** `size` (HiDPI), `scr`, `toImg`, `toScr`, `fit`, `one`, `grid`, `syncLayout`, `toggleSide`.
**Objektlogik:** `pointCount`, `lastPoint`, `hasEnough` (min-punktsregler §36 i spec,
verifierade), `zonePalette` (10 färger, index-modulo), `ensureZoneStyle`, `setAnchor`,
`commitCurrentKeepAnchor` (auto-smooth av path, zone-stängning, `hasEnough`-gate,
`clean`, `finalizeMeasure`, meta, sel, anchor), `startWithAnchor`, `setTool`
(auto-commit), `clean` (created_at, stil, rect-normalisering), `commit`, `finish`.
**Bild/data:** `loadImg` (FileReader→dataURL), `loadData` (Image-onload→fit),
`loadJ`, `apply`, `dl` (Blob-nedladdning), `save`, `saveSvg`, `clearTrace`
(behåller bild + axes, nollställer resten efter confirm).
**Axes:** `axisBase`, `axisSign`, `axisVec2`, `axisLabel`, `populateAxisSelects`,
`enforceAxes` (konfliktlösning), `updateAxisUI`.
**Stationer:** `stationOrientation`, `stationCoordFromPoint`, `stationOriginCoord`,
`stationLineEnds`, `updateStationPositionsFromOrigin`, `setOrigin`, `stationName`,
`addStationAt`, `stations` (bulk).
**Rendering:** `drawFrame`, `draw`, `stroke`, `pt`, `shape`, `pathDraw`, `corners`,
`handles`, `snapDraw`.
**Mät/skala:** `measureLen`, `ensureScale`, `parseNum`, `updateMeasurements`,
`finalizeMeasure`, `measureSnapPoint`.
**Geometri/hit:** `d` (avstånd), `seg` (punkt-segment-avstånd med t-klamp),
`sample` (kubisk Bezier-sampling, 16/segment, closed-varv), `autoSmoothPath`
(kollineära handtag; tangent = next−prev; handtagslängd min(korda/3, 0.48·min-korda);
ändnoder envägs med cap 0.42·längd; `auto:false` orörda), `addPen`, `hitHandles`
(typspecifika handtag med kind/index), `shapeDist` (typspecifikt kantavstånd; path
via 12-sampling), `hit` (handtag 14/s före shape 12/s), `hitNode` (18/s, inkl. cur),
`contactPoints`, `snapPoint`, `snapStationCoord`, `moveWhole` (heltranslation per typ,
path inkl. handtag), `edit` (per-typ nod/handtags-/hörn-/radie-redigering; rect via
motstående hörn; path-nod flyttar handtag med och re-smoothar auto-noder; manuellt
draget handtag ⇒ `auto:false, mode:"manual"`), `originHit`, `moveOriginTo`,
`clickToolAt`, `previewCurrentAt`.
**Export:** `svgElementKind`, `shapeGeomSummary`, `defaultShapeDescription`,
`svgBindingForShape`, `traceDescription`, `enrichShapeForExport`, `outObj`,
`sync` (metanormalisering + JSON-textarea + statusbar + list + props + draw),
`list`, `escapeXml`, `ssvg`, `del`, `smoothSelected` (path: alla noder→auto+smooth;
poly: **ersätts** av nytt path-objekt med namn `{namn}_smooth_path`, ny id, samma index).

## 17. Bindande invarianter (spec §44.1, källverifierade)

JSON = source of truth; SVG = overlay med bindningsmetadata; `shape.id` = stabil
join-nyckel; alla shapes namn-/beskrivningsbara; zoner transparenta, överlappande,
semantiska; origo+axes exporteras; måttlinje definierar skala; stationer relativa
origo+spacing; snap mot punkter/origo/stationer/aktuella punkter; trackpadvänlig
interaktion (§5-maskinen); polyline kvar; koordinater i bildpixlar, view påverkar
aldrig geometri.

## 18. Verifierade avvikelser/quirks (källfynd)

| # | Fynd | Hantering i porten |
|---|---|---|
| Q1 | Zone avslutas inte av dubbelklick (endast poly/mask/pen) | Åtgärdas (spec §44.2.1 sanktionerar) |
| Q2 | `apply()` kör `ensureAllMeta()` två gånger | Städas (harmlöst) |
| Q3 | `edit()` station-gren innehåller död `h.kind==="shape"`-kod (moveWhole returnerar före) | Städas |
| Q4 | `view` exporteras men återläses aldrig vid import | Bevaras exportmässigt; import fortsatt geometri-neutral (dokumenterat) |
| Q5 | `sampled_polyline_64` samplas med 16/segment | Fältnamn bevaras (schemakompatibilitet), dokumenteras |
| Q6 | SVG bäddar alltid bild-dataUrl; JSON endast via checkbox | Bevaras (spec §44.2.5: avsiktligt) |
| Q7 | Station utan spacing får sekventiellt index i stället för positionsberäknat | Bevaras (beteendekompatibilitet), dokumenteras |
| Q8 | `hist()` på varje select-klick ger extra undo-steg | Bevaras (riskfri), noteras |
| Q9 | Dubbelklicksavslut lämnar två nära-duplicerade slutpunkter | Trailing-dedupe (<0.5 px) vid dbl-finish, dokumenterad förbättring |
| Q10 | Zonfärg per shapes-index kan återanvändas efter delete | Persistent zonfärgsindex i porten (spec §44.2.4) |
| Q11 | Spec §29-exemplets axes-default ≠ källans default | Källans default gäller |
| Q12 | Referensmåls-id valideras inte vid load (spec §44.2.10) | Varningsflagga vid import i porten |

## 19. Integrationsmappning till 3D-genereringsverktyget (Rev C-arkitektur)

| v14-koncept | Integrerad roll |
|---|---|
| Ett dokument (implicit) | **TraceDocument** — namngivet objekt med `trace_meta {trace_name, perspective, trace_function}`; flera per projekt (TraceStore) |
| perspective | top_view / side_view_left / side_view_right / front_view / rear_view / bottom_view / section / detail / other |
| trace_function | outer_contour_master / profile_guide / dimension_reference / zone_map / detail_study / other |
| JSON-export | Per-trace (v14-kompatibel, `schema_version` bevarad) + projektfil `engrove_trace3d_project_v1` |
| Zoner (namngivna) | **Zonregister** över alla traces ⇒ adresserbara mål för finjusteringsprompter |
| Mått/skala | mm-sanning in i promptpipelinen (`measure_sync`) |
| Origo/axes/location_role | Datummappning trace→3D-ram i prompterna |
| trace_frame + shapes | Kompakt promptserialisering (utan dataUrl/view/svg_binding; paths som samplade polylinjer) |

**Promptpipeline (flerstegs):** `trace_to_3d` (alla/utvalda traces + 3D-schema ⇒
komplett parameterdokument), `proto_refine` (global finjustering), `zone_detail`
(zonriktad detaljprompt), `measure_sync` (måttavstämning), `free_form`. Alla svar
går genom befintlig strikt import (LT-denylist → schema → diff → explicit apply).
3D-vyn startar TOM; första giltiga import skapar modellen.

---

*Analysen är komplett: samtliga 108 källfunktioner, händelsemaskinens samtliga
7 drag-modes, alla 9 shape-typer, tre snap-varianter, båda exportkontrakten och
12 verifierade avvikelser är kartlagda mot källkod. Detta dokument utgör bindande
portningsspec.*
