#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: validate public metadata and generate every SEO/AI discovery surface from one immutable registry.
 * Inputs: config/site.json, tools/*/tool.json, built dist tool directories.
 * Outputs: deterministic HTML, JSON-LD, sitemap, robots and agent discovery files under dist/.
 * Safe edits: schema-aligned rendering, parity checks and deterministic serialization.
 *