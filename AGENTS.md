# Engrove/tools AI execution contract

MODE: `MACHINE_FIRST`
SCOPE: repository root and all descendants unless a nearer `AGENTS.md` explicitly overrides a rule
CANONICAL: this file is the single repository-wide source of truth for AI coding agents

## 0. Mandatory bootstrap

1. Read this file completely before analysis, planning, editing, testing, committing, or reporting.
2. Inspect the current repository state. Do not infer current behavior from prior conversations, old reports, commit messages, or README text.
3. Read the files that control the requested behavior before proposing changes.
4. For work under `tools/<slug>/`, also read that tool's `README.md`, `CONTRIBUTING.md`, `package.json`, `tool.json`, tests, schemas, and nearest instruction files.
5. Treat executable code, schemas, tests, and build scripts as stronger evidence than descriptive documentation.
6. If instructions conflict, use this order:
   - explicit current user requirement;
   - nearest path-scoped instruction file;
   - this file;
   - executable tests and schemas;
   - implementation code;
   - README and historical documents.
7. If a requested change would violate a non-negotiable production, security, geometry, persistence, or export invariant, stop and report the conflict. Do not silently weaken the invariant.
8. Never claim a command, test, browser workflow, deployment, or production URL was verified unless it was actually executed and its result was observed.

## 1. Repository identity

- Repository: `Engrove/tools`.
- Product: static hub for independent browser tools.
- Production branch: `main`.
- Production host: Cloudflare Pages.
- Canonical production domain: `https://tools.engroveaudio.com`.
- Root build command: `npm run build`.
- Root build output: `dist/`.
- `dist/` is generated, ignored, disposable, and MUST NOT be committed.
- Every push to `main`, including documentation-only pushes, rebuilds the complete repository state.
- A harmless final commit can expose a pre-existing build defect. Therefore validate the complete root build before every push to `main`.

## 2. Repository architecture

```text
src/                         hub UI copied to dist/
scripts/build.mjs            authoritative discovery/build/copy/manifest/deployment gate
tools/<slug>/                isolated tool source
  tool.json                  optional hub metadata
  index.html                 static entry OR source entry
  package.json               presence of scripts.build makes the tool buildable
  dist/                      generated per-tool output; never commit unless explicitly required by a different contract
dist/                        generated Cloudflare Pages artifact
```

Build semantics are authoritative in `scripts/build.mjs`:

- Ignore tool directories beginning with `_` or `.`.
- Skip tools with `tool.json.hidden === true`.
- Static tool: no `package.json` build script; copy source directory as-is.
- Buildable tool: `package.json.scripts.build` exists; install dependencies, run the tool build, and copy only `tool.json.buildOutputDir` or default `dist/`.
- Entry resolution occurs inside the copied output directory.
- The hub manifest is generated as `dist/tools.json`.
- Do not duplicate tool registration manually in the hub UI.
- Preserve tool isolation. Do not create hidden coupling between tools unless a shared module is explicitly designed, tested, and documented.

## 3. Cloudflare Pages hard invariants

### 3.1 Per-file asset limit

- Maximum generated asset size: `25 * 1024 * 1024` bytes.
- `scripts/build.mjs` MUST retain the recursive post-build size gate.
- Any generated file above the limit is a release blocker.
- Do not bypass, disable, round up, or convert this gate to a warning.
- Do not commit large generated binaries, base64 payloads, `node_modules/`, browser binaries, or WASM blobs to evade the gate.
- Assets that must exceed the limit require pinned external object storage/CDN delivery plus explicit runtime loading, CORS validation, content-type validation, cache policy, and browser smoke testing.

### 3.2 Cloud build dependency behavior

- Preserve `PUPPETEER_SKIP_DOWNLOAD=true` in the root per-tool build environment.
- Puppeteer is a test dependency; Cloudflare production builds MUST NOT download Chromium.
- Preserve `npm ci --no-audit --no-fund` when a lockfile exists.
- Use `npm install --no-audit --no-fund` only when no lockfile exists.
- Buildable production tools SHOULD have a committed lockfile. Missing lockfiles require explicit justification.
- Full repository work requires Node.js `>=22.12.0` and npm `>=10`.

### 3.3 Relative hosting

- Tools are hosted below `/tools/<slug>/`.
- Vite tools MUST use relative asset paths. Preserve `base: "./"` unless a verified routing redesign replaces it.
- Do not assume root hosting, SPA rewrite behavior, server-side execution, filesystem persistence, or privileged browser APIs.
- Production output must remain static and Cloudflare Pages compatible.

## 4. Required workflow

1. Resolve scope and invariants.
2. Inspect current implementation and tests.
3. Identify the smallest complete change set.
4. Modify source, tests, schemas, metadata, and documentation together when behavior changes.
5. Run the narrowest relevant tests during iteration.
6. Run the complete required gate before publishing.
7. Inspect generated output, not only source compilation.
8. Inspect `git diff` for unrelated edits, generated files, secrets, binaries, stale comments, and contradictory docs.
9. Publish only the intended files.
10. Verify the resulting commit and, when deployment is part of the task, verify the actual production deployment and URL.

## 5. Mandatory validation gates

Every push to `main` MUST pass from repository root:

```bash
npm run clean
npm run build
```

The root build is mandatory even for documentation-only changes because Cloudflare rebuilds the complete tree.

Browser smoke testing is mandatory when changing runtime loading, UI state, persistence, routing, or generated assets. Open the built hub, open each affected tool through its hub route, and confirm there are no console errors, failed dynamic imports, CORS errors, MIME errors, or initialization failures.

If any mandatory gate cannot run, report `PASS_WITH_LIMITATIONS` or `FAIL`; never report `PASS`.

## 6. Change discipline

- Prefer minimal, local, reversible diffs.
- Do not perform opportunistic refactors inside a bug fix.
- Do not rewrite stable modules only to change style.
- Do not add runtime dependencies when platform APIs or existing dependencies suffice.
- Do not update dependencies without a concrete requirement, lockfile update, compatibility analysis, build verification, and browser verification.
- Do not suppress TypeScript errors with `any`, broad casts, `@ts-ignore`, or disabled checks unless the exact boundary is unavoidable and documented.
- Do not weaken schemas, validation, safety gates, or tests to make a failing payload pass.
- Fix the implementation or correct invalid test assumptions.
- Do not introduce silent fallback behavior that hides corrupted state, invalid geometry, missing assets, or failed exports.
- Errors must be actionable and identify the failing tool, file, operation, and invariant.
- New or materially rewritten modules SHOULD remain under 500 non-generated lines. Exceeding this requires a clear cohesion reason.
- Keep functions single-purpose. Split orchestration from pure logic and browser side effects.
- Preserve existing naming conventions and local formatting.
- Comments must explain invariants, non-obvious constraints, or failure causes; do not narrate obvious syntax.

## 7. Data, security, and browser safety

- Never commit credentials, API keys, tokens, private URLs, session data, user files, or environment-specific secrets.
- Do not add telemetry, analytics, tracking, remote logging, or external data submission without explicit approval.
- Do not use `eval`, `new Function`, dynamic script injection, or unpinned remote executable code.
- Treat imported JSON, SVG, project files, AI responses, and browser storage as untrusted input.
- Validate before application. Preserve schema validation and manual acceptance boundaries.
- SVG/HTML sanitization MUST reject external `url(...)` references and unsafe active content. Only local `url(#id)` fragment references may survive where supported.
- Do not inject unsanitized user or AI content through `innerHTML`.
- File export must be deterministic, explicit, and user-triggered.

## 8. Documentation consistency

- README describes current user/developer behavior; this file governs AI execution behavior.
- Update README when commands, architecture, tool discovery, deployment, runtime dependencies, URLs, or user-visible behavior change.
- Update this file when a recurring AI failure, release blocker, architectural invariant, or mandatory gate is discovered.
- Remove stale instructions instead of accumulating contradictions.
- Test counts and version claims must match observed output and committed package versions.

## 9. Git and publishing rules

- Default: work on an isolated branch and review the complete diff before updating `main`.
- Direct `main` writes require explicit user instruction.
- Never force-push or rewrite `main`.
- Do not mix unrelated tasks in one change set.
- Commit messages must state the actual intent, not the file operation.
- A successful GitHub commit is not proof of a successful Cloudflare deployment.
- A green build is not proof of correct browser behavior.
- A working preview is not proof that the custom production domain serves the same commit.

## 10. Required completion report

Return exactly grounded status information using this semantic structure:

```text
RESULT: PASS | PASS_WITH_LIMITATIONS | FAIL
SCOPE: files/components changed
COMMITS: branch and commit identifiers
VALIDATION: commands/workflows actually executed and observed
DEPLOYMENT: commit/build/domain actually verified, or NOT_VERIFIED
LIMITATIONS: unavailable tools, blocked network, missing credentials, or unexecuted gates
RESIDUAL_RISK: concrete remaining risks only
```

Never omit limitations. Never transform an assumption into a verification claim.
