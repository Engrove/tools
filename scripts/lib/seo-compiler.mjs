#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: validate public metadata and generate every SEO/AI discovery surface from one immutable registry.
 * Inputs: config/site.json, tools/*/tool.json, built dist tool directories.
 * Outputs: deterministic HTML, JSON-LD, sitemap, robots and agent discovery files under dist/.
 * Safe edits: schema-aligned rendering, parity checks and deterministic serialization.
 * Do not: infer required metadata, use mtimes, emit unsupported claims, or hand-maintain generated route lists.
 * Verification: npm run build && npm run check:seo.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const REQUIRED_TOOL_KEYS = [
  '$schema','schemaVersion','slug','name','shortName','summary','description','category','tags','keywords',
  'entry','public','hidden','language','version','updated','canonicalPath','icon','ogImage','robots',
  'capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations','privacy','access','claims',
  'faq','evidence','relatedTools',
];
const FORBIDDEN_CLAIMS = [
  'guaranteed accuracy','laboratory-grade','professional-grade','expert recommended','best in class',
  'scientifically proven','trusted by professionals','ai-endorsed','definitive authority',
];

function fail(message) { throw new Error(`SEO_CONTRACT_VIOLATION: ${message}`); }
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function stableTools(tools) { return [...tools].sort((a,b) => a.slug.localeCompare(b.slug)); }
function canonical(site, suffix='') { return new URL(suffix, site.canonicalOrigin).href; }
function assertArray(value, key, allowEmpty=false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail(`${key} must be a${allowEmpty ? '' : ' non-empty'} array`);
}
function assertRelativeEntry(entry) {
  if (typeof entry !== 'string' || !entry || path.isAbsolute(entry) || entry.includes('..') || entry.includes('\\')) fail(`invalid entry: ${entry}`);
}
function validateSite(site) {
  if (site.schemaVersion !== '1.0.0') fail('unsupported site schemaVersion');
  if (site.canonicalOrigin !== 'https://tools.engroveaudio.com') fail('canonicalOrigin mismatch');
  if (site.language !== 'en') fail('public language must be en');
  return Object.freeze(site);
}
function validateTool(raw, directorySlug) {
  for (const key of REQUIRED_TOOL_KEYS) if (!(key in raw)) fail(`${directorySlug}/tool.json missing ${key}`);
  const unknown = Object.keys(raw).filter(key => !REQUIRED_TOOL_KEYS.includes(key));
  if (unknown.length) fail(`${directorySlug}/tool.json unknown keys: ${unknown.join(', ')}`);
  if (raw.schemaVersion !== '1.0.0') fail(`${directorySlug}: unsupported schemaVersion`);
  if (raw.slug !== directorySlug) fail(`${directorySlug}: slug mismatch`);
  if (raw.canonicalPath !== `/tools/${raw.slug}/`) fail(`${directorySlug}: canonicalPath mismatch`);
  if (raw.public !== true || raw.hidden !== false) fail(`${directorySlug}: public tools require public=true and hidden=false`);
  if (raw.language !== 'en') fail(`${directorySlug}: language must be en`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.updated)) fail(`${directorySlug}: updated must be ISO date`);
  assertRelativeEntry(raw.entry);
  for (const key of ['tags','keywords','capabilities','whenToUse','whenNotToUse','limitations']) assertArray(raw[key], `${directorySlug}.${key}`);
  for (const key of ['inputs','outputs','faq','evidence','relatedTools']) assertArray(raw[key], `${directorySlug}.${key}`, true);
  for (const key of ['mayClaim','negativeClaimBoundaries','mustNotClaim']) assertArray(raw.claims?.[key], `${directorySlug}.claims.${key}`);
  const positives = new Set(raw.claims.mayClaim.map(v => v.toLowerCase()));
  for (const claim of raw.claims.mustNotClaim) if (positives.has(claim.toLowerCase())) fail(`${directorySlug}: contradictory claim`);
  for (const item of raw.evidence) if (!/^https:\/\//.test(item.url)) fail(`${directorySlug}: evidence URL must use https`);
  return Object.freeze(raw);
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function write(file, content) { await fs.mkdir(path.dirname(file), {recursive:true}); await fs.writeFile(file, content); }

export async function loadRegistry({root, dist}) {
  const site = validateSite(await readJson(path.join(root, 'config/site.json')));
  const toolsRoot = path.join(root, 'tools');
  const entries = (await fs.readdir(toolsRoot, {withFileTypes:true}))
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .sort((a,b) => a.name.localeCompare(b.name));
  const tools = [];
  for (const entry of entries) {
    const manifestPath = path.join(toolsRoot, entry.name, 'tool.json');
    try { await fs.access(manifestPath); } catch { fail(`${entry.name}: tool.json required`); }
    const tool = validateTool(await readJson(manifestPath), entry.name);
    const sourceEntry = path.resolve(toolsRoot, entry.name, tool.entry);
    if (!sourceEntry.startsWith(path.resolve(toolsRoot, entry.name) + path.sep)) fail(`${entry.name}: entry escapes tool directory`);
    const builtEntry = path.join(dist, 'tools', tool.slug, 'index.html');
    try { await fs.access(builtEntry); } catch { fail(`${entry.name}: built canonical entry missing at ${builtEntry}`); }
    tools.push(tool);
  }
  const slugs = new Set(tools.map(t => t.slug));
  if (slugs.size !== tools.length) fail('duplicate slugs');
  for (const tool of tools) for (const related of tool.relatedTools) if (!slugs.has(related)) fail(`${tool.slug}: unknown related tool ${related}`);
  return Object.freeze({site, tools:Object.freeze(stableTools(tools)), publicTools:Object.freeze(stableTools(tools.filter(t => t.public && !t.hidden))), generatedAt:null, sourceRevision:null});
}

function hubJsonLd(registry) {
  const {site, publicTools} = registry;
  return {
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'Organization','@id':site.organization.id,name:site.organization.name,url:site.organization.url},
      {'@type':'WebSite','@id':canonical(site,'/#website'),url:site.canonicalOrigin,name:site.name,inLanguage:site.language,publisher:{'@id':site.organization.id}},
      {'@type':'CollectionPage','@id':canonical(site,'/#collection'),url:site.canonicalOrigin,name:site.name,isPartOf:{'@id':canonical(site,'/#website')},mainEntity:{'@id':canonical(site,'/#tools')}},
      {'@type':'ItemList','@id':canonical(site,'/#tools'),itemListElement:publicTools.map((t,i)=>({'@type':'ListItem',position:i+1,url:canonical(site,t.canonicalPath),name:t.name}))},
    ],
  };
}
function toolJsonLd(registry, tool) {
  const {site} = registry;
  const graph = [
    {'@type':'WebPage','@id':canonical(site,`${tool.canonicalPath}#page`),url:canonical(site,tool.canonicalPath),name:tool.name,description:tool.summary,inLanguage:tool.language,isPartOf:{'@id':canonical(site,'/#website')}},
    {'@type':'WebApplication','@id':canonical(site,`${tool.canonicalPath}#software`),name:tool.name,description:tool.description,url:canonical(site,tool.canonicalPath),applicationCategory:tool.category,operatingSystem:'Any modern web browser',isAccessibleForFree:tool.access.cost === 'free',offers:undefined},
    {'@type':'BreadcrumbList','@id':canonical(site,`${tool.canonicalPath}#breadcrumbs`),itemListElement:[
      {'@type':'ListItem',position:1,name:site.name,item:site.canonicalOrigin},
      {'@type':'ListItem',position:2,name:tool.name,item:canonical(site,tool.canonicalPath)},
    ]},
  ];
  if (tool.faq.length) graph.push({'@type':'FAQPage','@id':canonical(site,`${tool.canonicalPath}#faq`),mainEntity:tool.faq.map(f=>({'@type':'Question',name:f.question,acceptedAnswer:{'@type':'Answer',text:f.answer}}))});
  return {'@context':'https://schema.org','@graph':graph};
}
function metadata(site, title, description, pathName, robots, ogImage) {
  const url = canonical(site,pathName);
  return `<title>${esc(title)}</title>\n<meta name="description" content="${esc(description)}">\n<link rel="canonical" href="${esc(url)}">\n<meta name="robots" content="${esc(robots)}">\n<meta property="og:type" content="website">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(description)}">\n<meta property="og:url" content="${esc(url)}">\n<meta property="og:image" content="${esc(canonical(site,ogImage))}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${esc(title)}">\n<meta name="twitter:description" content="${esc(description)}">\n<meta name="twitter:image" content="${esc(canonical(site,ogImage))}">`;
}
function list(title, items) { return `<section><h2>${esc(title)}</h2><ul>${items.map(v=>`<li>${esc(typeof v === 'string' ? v : `${v.name}: ${v.description}`)}</li>`).join('')}</ul></section>`; }
function renderHub(registry) {
  const {site,publicTools}=registry;
  const cards=publicTools.map(t=>`<article class="card"><a href="${esc(t.canonicalPath)}"><h2>${esc(t.name)}</h2><p>${esc(t.summary)}</p><p>${t.tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join(' ')}</p></a></article>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata(site,`${site.name} — Browser-based engineering tools`,'Free browser-based Engrove tools for audio engineering, tracing and parametric CAD.', '/', 'index,follow','/assets/tool-default-1200x630.png')}<link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(hubJsonLd(registry))}</script></head><body><header class="site-header"><div class="wrap"><h1>${esc(site.name)}</h1><p>Free browser-based engineering tools with explicit capabilities, limitations and privacy boundaries.</p></div></header><main class="wrap"><section aria-labelledby="tools-heading"><h2 id="tools-heading">Available tools</h2><div id="grid" class="grid">${cards}</div></section><noscript><p>All public tools are listed above and remain accessible without JavaScript.</p></noscript><nav aria-label="Machine-readable resources"><a href="/llms.txt">LLM index</a> <a href="/for-agents.md">Agent guide</a> <a href="/agent-capabilities.json">Capabilities JSON</a></nav></main><footer class="site-footer"><div class="wrap"><a href="https://github.com/Engrove/tools" rel="noopener">Source on GitHub</a></div></footer><script src="/app.js" type="module"></script></body></html>\n`;
}
function renderTool(registry, tool, appHtml) {
  const {site}=registry;
  const faq=tool.faq.length?`<section><h2>Frequently asked questions</h2>${tool.faq.map(f=>`<article><h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p></article>`).join('')}</section>`:'';
  const evidence=tool.evidence.length?`<section><h2>Evidence and source links</h2><ul>${tool.evidence.map(e=>`<li><a href="${esc(e.url)}" rel="noopener">${esc(e.label)}</a></li>`).join('')}</ul></section>`:'';
  const related=tool.relatedTools.length?`<section><h2>Related tools</h2><ul>${tool.relatedTools.map(slug=>{const r=registry.tools.find(t=>t.slug===slug);return `<li><a href="${esc(r.canonicalPath)}">${esc(r.name)}</a></li>`}).join('')}</ul></section>`:'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata(site,`${tool.name} | ${site.name}`,tool.summary,tool.canonicalPath,tool.robots,tool.ogImage)}<script type="application/ld+json">${JSON.stringify(toolJsonLd(registry,tool))}</script></head><body><main><article class="seo-introduction"><nav aria-label="Breadcrumb"><a href="/">${esc(site.name)}</a> / ${esc(tool.shortName)}</nav><h1>${esc(tool.name)}</h1><p>${esc(tool.summary)}</p><section><h2>What this tool does</h2><p>${esc(tool.description)}</p></section>${list('Supported inputs',tool.inputs)}${list('Produced outputs',tool.outputs)}${list('When to use',tool.whenToUse)}${list('When not to use',tool.whenNotToUse)}${list('Limitations',tool.limitations)}<section><h2>Privacy and processing</h2><p>Processing: ${esc(tool.privacy.processing)}. Server storage of application user data: ${tool.privacy.storesApplicationUserDataOnServer?'yes':'no'}. Account required: ${tool.privacy.requiresAccount?'yes':'no'}.</p></section>${list('Claim boundaries',tool.claims.negativeClaimBoundaries)}${faq}${evidence}${related}</article><section aria-label="Interactive tool">${appHtml}</section></main></body></html>\n`;
}
function toolMarkdown(tool) { return `# ${tool.name}\n\n${tool.summary}\n\n## Capabilities\n${tool.capabilities.map(v=>`- ${v}`).join('\n')}\n\n## Inputs\n${tool.inputs.map(v=>`- ${v.name}: ${v.description}`).join('\n')}\n\n## Outputs\n${tool.outputs.map(v=>`- ${v.name}: ${v.description}`).join('\n')}\n\n## Limitations\n${tool.limitations.map(v=>`- ${v}`).join('\n')}\n\n## Claim boundaries\n${tool.claims.negativeClaimBoundaries.map(v=>`- ${v}`).join('\n')}\n`;
}
function assertClaims(text, label) { const lower=text.toLowerCase(); for (const phrase of FORBIDDEN_CLAIMS) if (lower.includes(phrase)) fail(`${label}: unsupported phrase "${phrase}"`); }

export async function compileSeo({root,dist}) {
  const registry=await loadRegistry({root,dist});
  const {site,publicTools}=registry;
  const toolSet=publicTools.map(t=>t.slug);
  await write(path.join(dist,'index.html'),renderHub(registry));
  for (const tool of publicTools) {
    const entry=path.join(dist,'tools',tool.slug,'index.html');
    const appHtml=await fs.readFile(entry,'utf8');
    const rendered=renderTool(registry,tool,appHtml);
    assertClaims(rendered,`${tool.slug}/index.html`);
    await write(entry,rendered);
    await write(path.join(dist,'tools',tool.slug,'tool.ai.json'),json(tool));
    await write(path.join(dist,'tools',tool.slug,'tool.md'),toolMarkdown(tool));
  }
  const runtime={schemaVersion:'1.0.0',canonicalOrigin:site.canonicalOrigin,tools:publicTools.map(t=>({slug:t.slug,url:canonical(site,t.canonicalPath),path:t.canonicalPath,name:t.name,summary:t.summary,category:t.category,tags:t.tags,updated:t.updated}))};
  await write(path.join(dist,'tools.json'),json(runtime));
  const urls=[site.canonicalOrigin,...publicTools.map(t=>canonical(site,t.canonicalPath))];
  await write(path.join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${esc(u)}</loc></url>`).join('')}</urlset>\n`);
  await write(path.join(dist,'sitemap.json'),json({schemaVersion:'1.0.0',urls}));
  await write(path.join(dist,'sitemap.txt'),`${urls.join('\n')}\n`);
  await write(path.join(dist,'robots.txt'),`User-agent: *\nAllow: /\n\nContent-Signal: search=yes, ai-input=yes, ai-train=no\n\nSitemap: ${canonical(site,'/sitemap.xml')}\n`);
  const concise=`# ${site.name}\n\nCanonical origin: ${site.canonicalOrigin}\n\n${publicTools.map(t=>`- [${t.name}](${canonical(site,t.canonicalPath)}): ${t.summary}`).join('\n')}\n\nClaim boundaries: static public resources are provided; no public programmatic backend API, OAuth, user accounts or commerce system is provided.\n\nFull corpus: ${canonical(site,'/llms-full.txt')}\n`;
  const full=`# ${site.name} full public corpus\n\n${publicTools.map(toolMarkdown).join('\n---\n')}\n`;
  assertClaims(concise,'llms.txt'); assertClaims(full,'llms-full.txt');
  await write(path.join(dist,'llms.txt'),concise); await write(path.join(dist,'llms-full.txt'),full);
  await write(path.join(dist,'for-agents.md'),full);
  await write(path.join(dist,'for-agents','index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Engrove Tools for agents</title><meta name="robots" content="index,follow"><link rel="canonical" href="${canonical(site,'/for-agents/')}"></head><body><pre>${esc(full)}</pre></body></html>\n`);
  const capabilities={schemaVersion:'1.0.0',canonicalOrigin:site.canonicalOrigin,publicStaticDataResources:true,publicProgrammaticBackendApi:false,hasBrowserNativeModelContextTools:false,hasServerMcpEndpoint:false,hasOAuth:false,hasUserAccounts:false,hasCommerce:false,tools:toolSet};
  await write(path.join(dist,'agent-capabilities.json'),json(capabilities));
  await write(path.join(dist,'ai.json'),json({schemaVersion:'1.0.0',site,tools:publicTools}));
  await write(path.join(dist,'public-info.json'),json({schemaVersion:'1.0.0',name:site.name,canonicalOrigin:site.canonicalOrigin,contentPolicy:site.contentPolicy,tools:runtime.tools}));
  await write(path.join(dist,'.well-known','engrove-tools.json'),json({schemaVersion:'1.0.0',canonicalOrigin:site.canonicalOrigin,registry:'/tools.json',agentCapabilities:'/agent-capabilities.json',skills:'/.well-known/agent-skills/index.json'}));
  await write(path.join(dist,'.well-known','agent-skills','index.json'),json({schemaVersion:'1.0.0',skills:[{id:'engrove-tools',url:'/.well-known/agent-skills/engrove-tools/SKILL.md'}]}));
  await write(path.join(dist,'.well-known','agent-skills','engrove-tools','SKILL.md'),`# Engrove Tools public discovery skill\n\nUse ${site.canonicalOrigin} to discover public browser tools. Read /agent-capabilities.json before making runtime or API claims.\n`);
  const generated=await fs.readdir(path.join(dist,'tools'),{withFileTypes:true});
  const generatedSet=generated.filter(e=>e.isDirectory()).map(e=>e.name).sort();
  if (JSON.stringify(generatedSet)!==JSON.stringify(toolSet)) fail(`generated tool parity mismatch: ${generatedSet} vs ${toolSet}`);
  return registry;
}
