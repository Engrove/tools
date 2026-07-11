/**
 * AI-CODING NOTE:
 * Responsibility: Validate source metadata, build the normalized registry, render every SEO/AI surface, copy runtime assets, and verify parity.
 * Inputs: config/site.json, tools/<slug>/tool.json, tool output directories, and public policy files.
 * Outputs: Immutable registry plus deterministic generated text and JSON artifacts.
 * Safe edits: Schema-aligned validation, deterministic rendering, exact-set parity, and sanitation.
 * Do not: Infer required metadata, use filesystem timestamps as freshness, expose source routes, or emit unsupported claims.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SITE_KEYS=['$schema','schemaVersion','siteId','name','canonicalOrigin','language','organization','contentPolicy'];
const TOOL_KEYS=['$schema','schemaVersion','slug','name','shortName','summary','description','category','tags','keywords','entry','buildOutputDir','public','hidden','language','version','updated','canonicalPath','