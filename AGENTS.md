# Engrove/tools AI execution contract

MODE: `AI_VIBE_MANDATORY`
SCOPE: repository root and all descendants
CANONICAL_GENERAL_POLICY: `AI_VIBE_CODING_RULES.md`
CANONICAL_REPOSITORY_POLICY: this file

## 0. Mandatory bootstrap

Every AI agent that analyzes, edits, reviews, tests, commits, publishes, or reports on this repository MUST, before substantive work:

1. read `AI_VIBE_CODING_RULES.md` completely;
2. read this file completely;
3. read `EIC.md` and `AI_CODING_DOCTRINE.md`;
4. inspect the current repository state and the files that own the requested behavior;
5. classify work level, risk, invariants, direct consumers, and blast radius as required by the canonical policy.

This applies regardless of model, vendor, coding assistant, IDE, connector, CLI, task size, or requested output. Tool-specific instruction files may add stricter rules but MUST NOT weaken, bypass, summarize away, or contradict `AI_VIBE_CODING_RULES.md`.

Instruction precedence:

1. current explicit user requirement, except where it requests fabricated evidence, unsafe behavior, or silent violation of repository invariants;
2. nearest path-scoped `AGENTS.md`, only for additional or stricter local requirements;
3. this file;
4. `AI_VIBE_CODING_RULES.md`;
5. `AI_CODING_DOCTRINE.md` and `EIC.md`;
6. executable schemas, checks, tests, and build code;
7. implementation code;
8. README and historical reports.

If two authoritative sources materially conflict, report `BLOCKER`. Never resolve the conflict by inventing a hierarchy not defined here.

## 1. Repository identity

- Repository: `Engrove/tools`.
- Product: deterministic static hub for independent browser tools.
- Production branch: `main`.
- Production host: Cloudflare Pages.
- Canonical production domain: `https://tools.engroveaudio.com`.
- Root build command: `npm run build`.
- Root build output: `dist/`.
- `dist/` is generated, ignored, disposable, and MUST NOT be committed.
- Every push to `main`, including documentation-only changes, rebuilds the complete repository state.
- A source commit, CI result, preview deployment, and production custom-domain response are separate evidence domains.

## 2. Repository architecture

```text
config/site.json              public site identity and analytics source
schema/*.schema.json          strict source schemas
tools/<slug>/tool.json        required public tool metadata
src/                          hub runtime source
scripts/lib/registry.mjs      immutable normalized registry
scripts/lib/render.mjs        generated HTML and discovery renderer
scripts/lib/verify.mjs        generated-output and parity gates
scripts/build.mjs             deterministic build orchestrator
functions/_middleware.ts      preview and content-negotiation policy
dist/                         disposable generated deployment output
```

Build semantics are authoritative in `scripts/build.mjs`:

- Ignore tool directories beginning with `_` or `.`.
- Every non-hidden tool directory requires a valid `tool.json`.
- Static tool: no `package.json` build script; copy allowed runtime source.
- Buildable tool: install from the lockfile where available, execute the build, and copy only the declared output.
- Canonical public route: `/tools/<slug>/`.
- Interactive application route: `/tools/<slug>/app/`.
- The hub, sitemap, structured data, and AI-discovery files are generated from the normalized registry.
- Never duplicate tool registration or generated SEO data manually.
- Preserve tool isolation unless a shared module has an explicit owner, contract, tests, and documentation.

## 3. Repository-specific hard invariants

### 3.1 Cloudflare Pages

- Maximum generated asset size: `25 * 1024 * 1024` bytes.
- The recursive post-build size gate MUST remain blocking.
- Do not commit generated binaries, base64 payloads, `node_modules/`, browser binaries, or WASM blobs to evade the limit.
- Production output must remain static and Cloudflare Pages compatible.
- Vite tools MUST use relative asset paths unless a verified routing redesign replaces that contract.
- Do not assume server-side execution, filesystem persistence, privileged browser APIs, or SPA fallback behavior.

### 3.2 Dependency behavior

- Preserve `PUPPETEER_SKIP_DOWNLOAD=true` in production build environments.
- Use `npm ci --no-audit --no-fund` when a lockfile exists.
- Use `npm install --no-audit --no-fund` only when no lockfile exists.
- Buildable production tools SHOULD commit a lockfile; absence requires explicit justification.
- Full repository work requires Node.js `>=22.12.0` and npm `>=10`.
- Do not add or update dependencies without a concrete requirement, compatibility analysis, lockfile handling, and relevant build/runtime verification.

### 3.3 Public metadata and claims

- `config/site.json` and validated `tools/*/tool.json` manifests own all public SEO, route, privacy, analytics, capability, claim, and freshness state.
- Required metadata fails closed. Do not infer missing public values from filenames, timestamps, source comments, or prior conversations.
- Public claims MUST remain within manifest-defined `mayClaim`, `negativeClaimBoundaries`, and `mustNotClaim` contracts.
- Generated public files are changed only through their generators.

### 3.4 Security and browser data

- Never commit credentials, API keys, tokens, private URLs, session data, user files, or environment-specific secrets.
- Do not add telemetry, analytics, tracking, remote logging, or external data submission without explicit approval and corresponding policy, CSP, schema, renderer, test, and documentation changes.
- Do not use `eval`, `new Function`, dynamic script injection, or unpinned remote executable code.
- Treat imported JSON, SVG, project files, AI responses, browser storage, and fetched text as untrusted input.
- Validate before application and preserve manual acceptance boundaries where they exist.
- SVG/HTML sanitization MUST reject unsafe active content and external `url(...)` references. Only local `url(#id)` fragment references may survive where supported.
- Do not inject unsanitized user or AI content through `innerHTML`.
- File export must be deterministic, explicit, and user-triggered.

## 4. Required change workflow

Follow `AI_VIBE_CODING_RULES.md` in full. Repository-specific minimum sequence:

1. state goal, requirements, non-goals, change point, consumers, possible contract changes, invariants, verification surfaces, work level, and risk;
2. inspect current source and direct consumers;
3. identify the smallest fully sufficient change set;
4. modify source, tests, schemas, metadata, and documentation together when behavior changes;
5. run narrow checks during iteration;
6. run the complete root gate before publishing;
7. inspect generated output, not only source compilation;
8. inspect the full diff for unrelated edits, generated files, secrets, binaries, stale comments, and contradictory documentation;
9. publish only intended files;
10. perform persistent readback of branch, commit, and changed files;
11. verify production only through the deployment owner or custom-domain response.

Do not optimize the workflow for speed, low token use, or minimal analysis. Optimize for correctness, code quality, contract preservation, security, and evidence.

## 5. Mandatory validation gates

Every update intended for `main` MUST pass from repository root:

```bash
npm run clean
npm run build
npm run check:seo
npm run check:determinism
npm run check:sanitation
```

`npm run check` validates source governance and mandatory AI-policy integration.

Browser smoke testing is mandatory when changing runtime loading, UI state, persistence, routing, generated assets, or browser-visible behavior. Open the built hub, launch each affected tool through its generated hub route, and inspect console, network, initialization, persistence, and relevant export/import workflows.

Use only scoped statuses from the canonical policy:

- `PASS_WITH_SCOPE`
- `PARTIAL_PASS`
- `NOT_TESTED`
- `NOT_AVAILABLE`
- `BLOCKER`

Never report an unqualified `PASS`.

## 6. Change discipline

- Prefer minimal, local, reversible diffs that are fully sufficient.
- Do not perform opportunistic refactors inside unrelated work.
- Do not rewrite stable modules only to change style.
- Do not weaken schemas, validation, safety gates, or tests to make a payload pass.
- Fix the implementation or correct an invalid test assumption.
- Do not introduce silent fallback behavior that hides corrupted state, invalid geometry, missing assets, failed exports, or unsupported configuration.
- Errors must identify the failing tool, file, operation, and invariant without exposing sensitive data.
- New or materially rewritten modules SHOULD remain under 500 non-generated lines. Exceeding this requires a documented cohesion reason.
- Each module owns one responsibility; orchestration should remain thin.
- Comments explain invariants, non-obvious constraints, security motives, or failure causes—not obvious syntax or unsupported status claims.

## 7. Documentation consistency

- `AI_VIBE_CODING_RULES.md` is the complete general execution policy.
- This file binds that policy to repository-specific architecture and invariants.
- `AI_CODING_DOCTRINE.md` is a compact doctrine, not a competing source.
- `EIC.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and `.agents/skills/ai-vibe-coding/SKILL.md` are bootstrap surfaces and MUST point back to the canonical policy.
- README describes current developer behavior and mandatory bootstrap.
- Remove stale instructions instead of accumulating contradictory copies.
- Test counts and version claims must match observed output and committed versions.

## 8. Git and publishing rules

- Default: work on an isolated branch and review the complete diff before updating `main`.
- Direct `main` writes require explicit user instruction.
- Never force-push or rewrite `main`.
- Do not mix unrelated tasks in one change set.
- Commit messages must state intent, not merely file operations.
- Publication is a destructive/high-impact action under the canonical policy and requires explicit user mandate. This request provides that mandate only for the requested policy integration.
- A successful write is not complete until repository readback confirms the correct target, commit, and content.

## 9. Completion report

Use the compact report structure defined in section 20 of `AI_VIBE_CODING_RULES.md`. At minimum include:

```text
Resultat:
Omfattning:
Ändringar:
Kvalitetsbedömning:
Verifiering:
Begränsningar:
Claim:
Nästa steg:
```

Never transform an assumption, successful API response, source commit, local test, CI result, preview, or metadata record into a stronger claim than its authoritative evidence supports.
