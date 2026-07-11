#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: parse generated SEO/AI surfaces and enforce exact public-tool parity.
 * Inputs: config/site.json, tools/*/tool.json and dist semantic outputs.
 * Outputs: exit 0 on parity; actionable failure otherwise.
 * Safe edits: stronger parsing and additional deterministic invariants.
 * Do not: use substring-only route discovery or accept missing generated surfaces.
 * Verification: npm run build && npm run check:seo.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from './lib/seo-compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const required = [
  'index.html','tools.json','robots.txt','sitemap.xml','sitemap.json','sitemap.txt','llms.txt','llms-full.txt',
  'for-agents.md','for-agents/index.html','ai.json','agent-capabilities.json','public-info.json',
  '.well-known/engrove-tools.json','.well-known/agent-skills/index.json','.well-known/agent-skills/engrove-tools/SKILL.md',
];

function fail(message) { throw new Error(`SEO_CHECK_FAILED: ${message}`); }
async function text(file) { return fs.readFile(path.join(dist, file), 'utf8'); }
async function parsed(file) { return JSON.parse(await text(file)); }
function sorted(values) { return [...values].sort(); }
function equalSet(actual, expected, label) {
  const a = JSON.stringify(sorted(actual));
  const e = JSON.stringify(sorted(expected));
  if (a !== e) fail(`${label} parity mismatch: ${a} != ${e}`);
}

for (const file of required) {
  try { await fs.access(path.join(dist, file)); } catch { fail(`missing ${file}`); }
}
const registry = await loadRegistry({root, dist});
const expected = registry.publicTools.map(tool => tool.slug);
const runtime = await parsed('tools.json');
equalSet(runtime.tools.map(tool => tool.slug), expected, 'tools.json');
const ai = await parsed('ai.json');
equalSet(ai.tools.map(tool => tool.slug), expected, 'ai.json');
const caps = await parsed('agent-capabilities.json');
equalSet(caps.tools, expected, 'agent-capabilities.json');
const publicInfo = await parsed('public-info.json');
equalSet(publicInfo.tools.map(tool => tool.slug), expected, 'public-info.json');
const sitemap = await parsed('sitemap.json');
const sitemapSlugs = sitemap.urls
  .map(url => new URL(url).pathname.match(/^\/tools\/([^/]+)\/$/)?.[1])
  .filter(Boolean);
equalSet(sitemapSlugs, expected, 'sitemap.json');
const hub = await text('index.html');
for (const tool of registry.publicTools) {
  if (!hub.includes(`href="${tool.canonicalPath}"`)) fail(`hub missing ${tool.slug}`);
  const page = await text(`tools/${tool.slug}/index.html`);
  if (!page.includes(`<link rel="canonical" href="${registry.site.canonicalOrigin}${tool.canonicalPath}">`)) fail(`${tool.slug}: canonical missing`);
  if (!page.includes('<script type="application/ld+json">')) fail(`${tool.slug}: JSON-LD missing`);
  if (!page.includes(tool.summary)) fail(`${tool.slug}: visible summary missing`);
  await fs.access(path.join(dist,'tools',tool.slug,'tool.ai.json'));
  await fs.access(path.join(dist,'tools',tool.slug,'tool.md'));
}
const robots = await text('robots.txt');
if (!robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no')) fail('robots content policy missing');
if (!robots.includes(`${registry.site.canonicalOrigin}/sitemap.xml`)) fail('robots sitemap missing');
if (caps.publicProgrammaticBackendApi !== false || caps.hasServerMcpEndpoint !== false) fail('capability boundary inverted');
console.log(`SEO CHECK PASS: ${expected.length} public tool(s), exact parity across generated surfaces.`);
