# TD051 AI Vibe 3D Titanium Interface Plate Sparse Contract

Runtime target: `V28.8.0-Fas20-AIResponseApplyRuntime` plus TD051 titanium head interface plate placement remediation.

TD051 is the current normative contract for external AI handoff in this package. TD049/TD050 sparse Cobra continuity rules remain active. TD047 and TD048 are legacy/history only.

## Core sparse-patch rule

External AI must emit a strict JSON sparse shape patch, not a copied session or full-state delta.

- Do not return full `inputs`, `selects`, `checkboxes` or `flags`.
- `selects`, `checkboxes` and `flags` must be empty unless a future schema-specific semantic action explicitly allows a field.
- Protected alignment, cartridge, physics, mass, export and global state must not be directly AI-written.
- Cobra invariants are enforced after sanitize/apply.

## TD051 titanium interface plate rule

Titanium mounting plate is a structural laminated interface between the carbon armwand / integrated headshell structure and the cartridge / tonehead mounting surface. It must not be placed as a loose underside plate below the cartridge or headshell.

Internal Swedish control rule:

> Titanplattan är en strukturell laminerad gränssnittsplatta mellan armkropp/integrerat headshell och tonhuvudets monteringsyta. Den får inte placeras som en lös underplatta under tonhuvudet.

## Semantic separation

`headshellSlots.plate` / `headshellSlots.slotCarrierPlate` is slot-carrier/reference geometry for half-inch / M2.5 cartridge slots.

`titaniumMountPlate` is the separate structural laminated titanium interface plate.

They are not the same object and must not be silently mixed.

## Writable titanium controls

The following fields are writable in the sparse shape-patch contract because runtime geometry now consumes them through `TitaniumMountPlate.resolveTitaniumMountPlatePose()`:

- `titaniumPlateEnabled`
- `titaniumPlateLength`
- `titaniumPlateWidth`
- `titaniumPlateThickness`
- `titaniumPlateMass`
- `titaniumPlateX`
- `titaniumPlateYOffset`
- `titaniumPlateZOffset`
- `titaniumAdhesiveThickness`
- `titaniumAdhesiveDampingLossFactor`

`TitaniumMountPlate.resolveTitaniumMountPlatePose() uses `titaniumPlateX`, `titaniumPlateYOffset` and `titaniumPlateZOffset` to place actual titaniumMountPlate render/export geometry. X is clamped into the headshell-to-neck interface zone so the plate cannot become a loose underside plate in the pickup/slot area.

If `titaniumPlateEnabled=false`, render/export must not emit titaniumMountPlate. Headshell slot carrier/reference geometry may still exist, but it is not titaniumMountPlate and must be labeled as slot-carrier/reference geometry.

## Cobra continuity rules preserved

TD051 retains the TD049/TD050 rules:

- sparse AI delta;
- protected state filtering;
- no full-state passthrough;
- Cobra invariants after sanitize/apply;
- front ramp release after rampEnd;
- form-continuity audit;
- no AI writes to protected alignment/cart/physics/mass/export/global state.

## Prompt embedding

Every Copy full AI prompt must embed:

```text
aiVibe3DSculptReferenceDocuments.schemaJson
aiVibe3DSculptReferenceDocuments.markdownSpec
```

Both embedded documents must identify TD051 as the primary version. TD049/TD050 may be mentioned only as retained sparse-Cobra continuity history.

## Boundary

TD051 is a package-level runtime/schema/spec/test contract. It does not prove browser/WebGL rendering, Onshape CAD import, FEA, manufacturing readiness, STL geometry beyond local package tests, or audio performance unless those are separately executed and logged.
