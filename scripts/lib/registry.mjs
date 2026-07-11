/**
 * AI-CODING NOTE:
 * Responsibility: Load and validate canonical site and per-tool metadata into one immutable registry.
 * Inputs: config/site.json and tools/<slug>/tool.json.
 * Outputs: Frozen normalized registry.
 * Safe edits: Strict schema-aligned validation and normalization.
 * Do not: Infer required metadata, use mtime, or accept unknown fields.
 * Verification: npm