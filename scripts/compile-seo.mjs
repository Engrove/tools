#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: invoke the deterministic SEO/AI registry compiler and finalize valid embedded tool documents.
 * Inputs: repository source tree, public headers and generated dist directory.
 * Outputs: validated semantic discovery surfaces, same-origin app documents and Cloudflare headers in dist.
 * Safe edits: invocation parameters, deterministic document finalization and explicit error reporting.
 * Do not: duplicate registry logic or generate independent route lists.
 * Verification: npm run build && npm run check:seo.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSeo } from './lib/seo-compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const marker = '<section aria-label="Interactive tool">';
const suffix = '</section></main></body></html>\n';

async function finalizeHubDocument() {
  const hubPath = path.join(dist, 'index.html');
  const html = await fs.readFile(hubPath, 'utf8');
  await fs.writeFile(hubPath, html.replaceAll('/assets/tool-default-1200x630.png', '/assets/tool-default-1200x630.svg'));
}

async function finalizeToolDocuments(registry) {
  for (const tool of registry.publicTools) {
    const indexPath = path.join(dist, 'tools', tool.slug, 'index.html');
    const html = await fs.readFile(indexPath, 'utf8');
    const start = html.indexOf(marker);
    const end = html.lastIndexOf(suffix);
    if (start < 0 || end < start) throw new Error(`SEO_TOOL_DOCUMENT_INVALID: ${tool.slug}`);
    const appHtml = html.slice(start + marker.length, end);
    await fs.writeFile(path.join(dist, 'tools', tool.slug, 'app.html'), appHtml);
    const title = tool.name.replace(/[&<>"']/g, '');
    const iframe = `<section aria-label="Interactive tool"><h2>Launch tool</h2><iframe src="./app.html" title="${title}" style="width:100%;min-height:80vh;border:0" loading="eager"></iframe>${suffix}`;
    await fs.writeFile(indexPath, `${html.slice(0, start)}${iframe}`);
  }
}

compileSeo({ root, dist })
  .then(async registry => {
    await finalizeHubDocument();
    await finalizeToolDocuments(registry);
    await fs.copyFile(path.join(root, 'public', '_headers'), path.join(dist, '_headers'));
    console.log(`SEO compiler: ${registry.publicTools.length} public tool(s), deterministic surfaces emitted.`);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
