# AI Coding Doctrine

REPOSITORY_MODE: AI_VIBE_MAINTAINED
CANONICAL_AGENT_CONTRACT: `AGENTS.md`

- Prefer new JS/TS/MJS source files at or below 800 lines.
- Files above 1200 lines require explicit architectural review.
- Every new or substantially changed source file begins with an `AI-CODING NOTE` declaring responsibility, inputs, outputs, safe edits, forbidden edits, and exact verification commands.
- One responsibility per module.
- Generated files are modified only through their owning generator.
- Every public SEO, structured-data, route, sitemap, and agent surface requires parity checks against the normalized registry.
- Mechanical splitting and behavioral changes occur in separate commits.
- Never claim runtime, deployment, indexing, API, OAuth, account, commerce, or production behavior without implementation and owner-route evidence.
- Public metadata is explicit source data. Missing required metadata fails closed; it is never inferred from filenames, source code, filesystem timestamps, or prose.
- Same source revision must produce byte-identical semantic output. Wall-clock timestamps are excluded from indexable output.
