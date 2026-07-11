#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Run the root blocking test gate for every public tool with a declared npm test command.
 * Inputs: The canonical normalized registry and public tool package manifests.
 * Outputs: Preserved tool test output, a stable JSON summary, and a failing process exit when any tool cannot pass.
 * Safe edits: CLI orchestration and deterministic reporting only.
 * Do not: Hardcode tool slugs, infer public tools outside the registry, or downgrade process failures.
 * Verification: node --test test/tool-test-runner.test.mjs && npm run check:tools && npm run check:sanitation.
 */