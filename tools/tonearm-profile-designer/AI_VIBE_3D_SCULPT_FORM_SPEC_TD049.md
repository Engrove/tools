# TD049 AI Vibe 3D Sparse Cobra Continuity Contract

Runtime target: `V28.8.0-Fas20-AIResponseApplyRuntime` plus TD049 sparse Cobra continuity remediation.

TD049 is the current normative contract for external AI handoff. TD047 and TD048 are legacy/history only. External AI must emit a strict JSON sparse shape patch, not a copied session or full-state delta.

## 1. Contract summary

TD049 defines these runtime rules:

1. **Sparse AI delta only** — include only changed `inputs` that are part of the sculpt allowlist. Do not echo the current session state.
2. **Protected state filtering** — runtime sanitization removes non-writable fields before apply.
3. **No full-state passthrough** — examples and prompt text must not teach external AI to return complete `selects`, `checkboxes` or `flags`.
4. **Cobra invariants after sanitize** — trusted runtime code enforces Cobra mode invariants after incoming AI deltas have been filtered.
5. **Front ramp release after `sculptFrontRampEndX`** — front stiffness height is released through a C2 smootherstep envelope instead of dropping directly to the lower base profile.
6. **Form-continuity audit** — generated rings are audited for abrupt front height/top-Z/area/width discontinuities.
7. **No AI writes to protected state** — external AI may not directly write protected alignment, cartridge, geometry-root, physics, mass, export, diagnostic or global state.

## 2. Allowed output shape

External AI should return only minified JSON with this shape:

```json
{
  "schema": "tonearm-designer-ai-delta",
  "version": 1,
  "app": "V28.8.0-Fas20-AIResponseApplyRuntime",
  "modelFamily": "cobra_tonearm",
  "name": "cobra_sparse_shape_patch",
  "inputs": {
    "sculptHeadFlatEnabled": 1,
    "sculptFrontStiffnessRampEnabled": 1,
    "sculptFrontRampEndX": 78,
    "sculptFrontRampTargetHeight": 10,
    "headH": 6.2,
    "neckW": 16
  },
  "selects": {},
  "checkboxes": {},
  "flags": {},
  "unsupportedAttributes": []
}
```

`selects`, `checkboxes` and `flags` must be empty unless a future schema-specific semantic action explicitly allows a field. The TD049 Cobra prompt example intentionally uses empty objects for those sections.

Do not use any example name or semantics that imply a copied full session, complete application state, or legacy passthrough delta.

## 3. Protected fields

External AI deltas must not write these classes directly:

- alignment and geometry-root fields such as `apex`, `cartX`, `pivotOffsetZ`, `pivotToStylus`, `overhang`, `effectiveLength`;
- selector state such as `rearMode`;
- cartridge/alignment fields;
- mass, physics and counterweight fields not in the sparse sculpt allowlist;
- export and manufacturing controls;
- diagnostic/global runtime flags;
- `selects`, `checkboxes` and `flags` copied from the live session.

The runtime allowlist and sanitizer must remove or ignore protected writes before apply. Cobra-specific trusted invariants may then be applied by runtime code.

## 4. Cobra invariants

When Cobra mode applies, runtime invariants after sanitize/apply must force or preserve:

```text
rearMode = cobra_integrated_tail
apex = 237
cartX = -0.05
cobraArchitectureEnabled = true
enableCobraArchitecture = true
headH >= 5.8
neckW >= 16
includeRearWeightDiscsInExport = true
```

Additional canonical Cobra counterweight/accessory controls may be enforced by trusted runtime code, but they are not an invitation for external AI to echo full state or write protected sections.

## 5. Front continuity

TD048 introduced a local front stiffness ramp, but a hard handoff at `sculptFrontRampEndX` could reproduce an abrupt X78→X79 height/top-Z fall when the base profile after the ramp is lower.

TD049 changes the rule:

- ramp reaches target height at `sculptFrontRampEndX`;
- after ramp end, height release uses a C2 smootherstep envelope over a release length derived from headshell blend and neck length;
- the runtime continuity audit checks `maxHeightDropPerMm`, `maxTopZDropPerMm`, shell-area drop, curvature warning and `minFrontWidthMm`.

Acceptance requires no continuity failures in the front audit for the TD049 broken-ramp replay case.

## 6. Prompt embedding

The Copy full AI prompt must embed:

```text
aiVibe3DSculptReferenceDocuments.schemaJson
aiVibe3DSculptReferenceDocuments.markdownSpec
```

Both embedded documents must identify TD049 as the primary version. TD048 may be mentioned only as a historical predecessor.

## 7. Claim boundary

TD049 is a runtime/schema/spec/test contract for the supplied package. It does not prove browser/WebGL rendering, Onshape CAD import, FEA, manufacturing readiness or audio performance unless those are separately executed and logged.


## TD051 supersession note

TD051 supersedes the prompt/schema primary label for the titaniumMountPlate placement contract while preserving the TD049 sparse Cobra continuity rules. Use `AI_VIBE_3D_SCULPT_FORM_SPEC_TD051.md` and the embedded TD051 prompt documents as the current external-AI handoff contract.
