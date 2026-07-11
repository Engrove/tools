# AI VIBE 3D FREEFORM LOFT SPEC TD052

## Claim boundary

TD052 is a **local source/package candidate**. This specification does not claim browser verified, runtime deployed, Onshape verified, FEA validated, manufacturing ready, GitHub branch pushed, Cloudflare deployed, or production ready.

Expected acceptance wording for the first patch is `PASS_WITH_SCOPE` or `PARTIAL_PASS` for local source/Node/schema evidence only.

## Root cause: why sparse sliderpatch is insufficient

TD051B cleaned the sparse AI response schema, but the AI Vibe 3D shape language still primarily pushes sparse control sliders. Slider patches are adequate for bounded Cobra/runtime state changes, but they are a poor semantic carrier for genuinely free 3D form. A model can ask for “long low monocoque”, “flat integrated headshell”, “asymmetric crescent bridge”, or “side-bent headshell”, but a sparse slider surface forces those intentions into unrelated numeric knobs. That creates recurring semantic errors: worm-like cross-sections, fake counterweights made from tails/rings, detachable-looking headshell parts, and hidden geometry changes that bypass physical analysis.

TD052 adds a new alternative model, not a replacement for TD051B/Parametric Cobra/Classic:

```text
böjbar centrumlinje + abstrakta formringar + separata feature-objekt + befintlig fysisk analys
```

## New tab

The new UI scaffold is:

```text
AI Vibe 3D Freeform Loft
```

It exposes:

```text
Copy Freeform AI Prompt
Apply Freeform AI Response
```

The tab is intended to live beside the existing Parametric Cobra / Classic model.

## Centerline model

The centerline is a Catmull-Rom curve with station value `s` from 0 to 1.

Writable centerline fields:

```text
s: 0..1
x: -20..280 mm
y: -40..40 mm
z: -40..40 mm
point count: 2..32
curveType: catmull_rom
```

Default centerline:

```json
{
  "centerline": {
    "curveType": "catmull_rom",
    "points": [
      { "id": "stylus_front", "s": 0, "x": 0, "y": 0, "z": 0, "locked": true },
      { "id": "headshell_interface", "s": 0.14, "x": 34, "y": 0, "z": 2.5 },
      { "id": "mid_armwand", "s": 0.50, "x": 125, "y": 0, "z": 6.5 },
      { "id": "rear_terminal", "s": 0.90, "x": 220, "y": 0, "z": 1.5 },
      { "id": "pivot_reference", "s": 1, "x": 237.05, "y": 0, "z": 0, "locked": true }
    ]
  }
}
```

Protected datums must not be moved by external AI:

```text
stylus point
pivot point
LP plane
N1-P2 / effective length
cartridge datum
headshell plane
```

## Ring / station section model

Rings are abstract section forms, not tube sections. The ring system supports changes from circle to triangle to square to crescent or custom loop.

Required shape families:

```text
circle
ellipse
superellipse
rounded_rectangle
sharp_polygon
triangle
trapezoid
asymmetric_egg
flat_bottom_headshell
crescent
custom_bezier_loop
custom_polar_profile
```

Writable ring fields and ranges:

```text
widthMm: 3..45
heightMm: 2..35
wallThicknessMm: 0.6..3.0
rotationDeg: -180..180
tiltDeg: -45..45
cornerSharpness: 0..1
superellipseExponent: 0.35..8
asymmetryY: -1..1
asymmetryZ: -1..1
topRidgeHeightMm: 0..5
bottomFlatness: 0..1
crescentCutDepth: 0..0.85
controlPoints count: 4..32
station/ring count: 4..64
```

## Feature objects

TD052 separates form rings from mechanical/semantic feature objects:

```text
integratedHeadshell
sideBentHeadshellMount
titaniumMountPlate
cartridgeSlots
wireDuct
rearTerminal
counterweightStack
```

Rules:

- `titaniumMountPlate` is a TD051 structural laminated interface plate, never a loose underside plate.
- `cartridgeSlots` is a separate slot feature.
- `counterweightStack` is a separate rear-terminal assembly.
- Counterweight is not faked with ring form, tail form, or rear bend.
- In standard modes the headshell mount is integrated into the arm, not a detachable loose part.

## Standard presets

### Cobra Freeform Standard

Preset id:

```text
long_low_cobra_monocoque
```

Intent:

```text
long low monocoque
non-worm cross-section progression
integrated headshell
rear-terminal disc-stack counterweight feature
controlled rear transition
```

### Straight LT Standard

Preset id:

```text
straight_low_mass_lt_arm
```

Intent:

```text
straight or near-straight centerline
integrated headshell
no Cobra rear elbow
low mass / high stiffness intent
physical analysis bridge intact
```

### Integrated Side-Bent Headshell Standard

Preset id:

```text
integrated_side_bent_headshell
```

Intent:

```text
normal side-bent headshell mount
side bend is part of centerline/local headshell geometry
headshell is not detachable loose part
cartridge datum remains valid
slot geometry remains valid
```

## AI response schema

Schema name:

```text
tonearm-designer-ai-freeform-loft-response
```

Top-level response:

```json
{
  "schema": "tonearm-designer-ai-freeform-loft-response",
  "version": 1,
  "app": "V28.8.0-Fas20-AIResponseApplyRuntime",
  "mode": "freeform_centerline_ring_loft",
  "name": "short_name",
  "centerlinePatch": {},
  "ringPatch": {},
  "featurePatch": {},
  "analysisTargets": {},
  "unsupportedAttributes": []
}
```

Contract:

```text
strict JSON only
sparse patch only
no direct STL/OBJ/mesh triangles from AI
no protected datum movement
no unknown fields
no full-state passthrough
no LT mechanism/P1/P2/P3/STATOR/L23 writes
all numeric fields have min/max
all enums explicit
unsupported geometry listed in unsupportedAttributes
```

## Prompt contract

The generated prompt embeds:

```text
current centerline
current rings
current features
all writable fields
all min/max/enum constraints
engineering targets
mass/COM/COG context
cartridge/headshell datum context
counterweight context
Onshape/export audit context
complete JSON schema
Markdown spec
unsupportedAttributes policy
```

## Loft kernel

The first TD052 kernel is deterministic. It samples the centerline and interpolates ring sections to produce a closed mesh/intermediate geometry object. The kernel is intended as a scaffold for browser/WebGL/export integration, not final CAD/FEA/manufacturing proof.

## Physical-analysis bridge

The adapter boundary maps generated freeform geometry to the fields the existing physical analysis chain needs:

```text
mass
volume
COM / COG
inertia tensor
effective mass proxy
vertical/horizontal resonance estimate
EI / first bending proxy
wire duct clearance
cartridge datum
headshell datum
counterweight relation
printability/export audit
Onshape 1:1 audit
```

Current bridge status is intentionally `PARTIAL_PASS` because it verifies the shape of adapter data locally but does not verify browser STL export, Onshape import, FEA, manufacturing, or runtime behavior.

## Acceptance

Minimum acceptance covered by TD052 tools:

1. Schema has no dangling refs.
2. Real JSON Schema validation accepts known-good freeform response.
3. Schema rejects protected datum movement.
4. Schema rejects unknown fields.
5. Schema rejects direct mesh triangles.
6. Ring generator supports circle, triangle, square, crescent, custom Bezier loop.
7. Known-good loft creates closed deterministic mesh or valid intermediate geometry object.
8. Centerline locked datums remain fixed.
9. Physical-analysis adapter receives mass/COM/COG-required geometry fields.
10. Cobra preset is long-low and non-worm.
11. Straight LT preset is straight/near-straight and not Cobra elbow.
12. Integrated side-bent headshell preset has valid cartridge/headshell datum.
13. Titanium plate remains a separate feature and not loose underside plate.
14. TD049/TD051/TD051B existing regressions still pass.

## Known limitations

- UI is a scaffold, not an independently browser-smoked feature.
- Loft mesh is deterministic local kernel output; final rendering/export integration remains limited.
- Physical analysis bridge returns local estimates and required fields but not validated engineering results.
- Onshape 1:1 audit remains `NOT_TESTED`.
- Browser/WebGL/STL export/FEA/manufacturing/runtime deployment are outside this candidate claim boundary.
