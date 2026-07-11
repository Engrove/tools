# AI coding doctrine

MODE: `AI_VIBE_MAINTAINED`

- This repository is maintained primarily by AI/Vibe coding agents under explicit human direction.
- New JavaScript, TypeScript, and MJS files should remain at or below 800 lines.
- Files above 1200 lines require explicit review and a documented cohesion reason.
- Every new or substantially changed source file requires an `AI-CODING NOTE` header.
- Each module owns one responsibility.
- Generated files are changed only through their generators.
- Every public surface requires an exact-set parity check against the normalized registry.
- Mechanical file splitting and behavior changes must occur in separate commits or separately reviewable change sets.
- No runtime, deployment, indexing, API, privacy, or capability claim may be made without implementation evidence and owner-route verification.
- Required public metadata fails closed. Agents must not infer missing values or use filesystem timestamps as public freshness state.
- Public claims must remain inside the manifest-defined `mayClaim`, `negativeClaimBoundaries`, and `mustNotClaim` contract.
