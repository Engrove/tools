# Tool subtree AI contract

This file overrides repository-root statements where they conflict for `tools/**`.

- Every non-template tool directory MUST contain `tool.json` valid against `/schema/tool.schema.json`.
- Required public metadata MUST NOT be inferred from filenames, package data, source text, filesystem timestamps or build output.
- `slug` MUST equal the directory name.
- `canonicalPath` MUST equal `/tools/<slug>/`.
- Public tool routes MUST resolve to `/tools/<slug>/`; source entry filenames are implementation details.
- `updated` is source-owned ISO date metadata. Never derive it from mtime.
- Claims, limitations, privacy, evidence, FAQ and related-tool references are contract data and must remain factually supported.
- FAQ structured data is allowed only when the same FAQ is visible in generated HTML.
- Generated `dist/`, `tool.ai.json`, `tool.md`, sitemap, JSON-LD and agent files are never hand-edited.
- All tool metadata changes require `npm run build && npm run check:seo` from repository root.
- Read the tool-local README, CONTRIBUTING, package manifest, tests and schemas before editing implementation details.
