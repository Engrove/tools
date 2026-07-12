# Repository AI execution boundary

This repository is maintained through AI-assisted engineering workflows.

## Mandatory policy

Every coding, analysis, review, test, commit, publication, and reporting task MUST begin by reading:

1. `AI_VIBE_CODING_RULES.md` — complete general governance;
2. root `AGENTS.md` — repository architecture, invariants, gates, and reporting integration;
3. `AI_CODING_DOCTRINE.md` — compact doctrine and cross-reference.

Orchestrated multi-step work using EIC, Jan-Eric, and Hjalmar MUST also read `AI_VIBE_ORCHESTRATED_WORKFLOW.md`.

That document owns the repository-specific role model, handoff cycle, modularity limits, connector discipline, and review stop points. This boundary document does not duplicate its full text.

Tool-specific bootstrap files and skills may add stricter requirements but may not weaken or replace these sources.

## Authoritative execution order

1. Current explicit user requirement, subject to safety, evidence integrity, and repository invariants.
2. Nearest path-scoped `AGENTS.md`, for additional or stricter local rules only.
3. Root `AGENTS.md`.
4. `AI_VIBE_CODING_RULES.md`.
5. `AI_VIBE_ORCHESTRATED_WORKFLOW.md` for orchestrated role-separated work.
6. `AI_CODING_DOCTRINE.md` and this boundary document.
7. Executable schemas, checks, tests, and build code.
8. Implementation code.
9. README and historical reports.

The normalized registry built from `config/site.json` and every public `tools/*/tool.json` owns all public SEO, AI-discovery, route, claim, privacy, and freshness state. Generated output is disposable and must never be edited manually.

Repository source, local tests, CI, preview deployment, production deployment, runtime behavior, metadata, file content, and visual output are separate evidence domains. Claims must be limited to the domain actually verified.

Use scoped test statuses from the canonical policy. Never report an unqualified `PASS`.
