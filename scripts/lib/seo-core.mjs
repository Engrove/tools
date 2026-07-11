/**
 * AI-CODING NOTE:
 * Responsibility: Own normalized metadata loading, deterministic SEO rendering, parity checks, and safe runtime copying.
 * Inputs: config/site.json, tools/*/tool.json, source templates, built tool output.
 * Outputs: Immutable registry and deterministic public SEO/AI surfaces.
 * Safe edits: Schema-aligned validation, rendering, and exact-set parity logic.
 * Do not: Infer required metadata, use filesystem mtime as freshness, or emit unverified claims.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const TOOL_REQUIRED = ['$schema','schemaVersion','slug','name','shortName','summary','description','category','tags','keywords','entry','public','hidden','language','version','updated','canonicalPath','icon','ogImage','robots','capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations','privacy','access','claims','faq','evidence','relatedTools'];
const TOOL_OPTIONAL = ['buildOutputDir'];
const BAD_CLAIMS = ['guaranteed accuracy','certified','laboratory-grade','professional-grade','expert recommended','best in class','scientifically proven','trusted by professionals','AI-endorsed','definitive authority'];
const SKIP_NAMES = new Set(['node_modules','test','tests','src','.git','.vite','coverage']);
const SKIP_EXT = new Set(['.map','.zip','.tgz','.tar','.bak','.tmp']);

export const exists = async (file) => fs.access(file).then(() => true, () => false);
export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exactKeys = (obj, allowed, label) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${label}: object required`);
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  const missing = allowed.filter((k) => !(k in obj));
  if (unknown.length || missing.length) throw new Error(`${label}: unknown=[${unknown}] missing=[${missing}]`);
};
const nonEmptyArray = (v, label) => { if (!Array.isArray(v) || v.length === 0) throw new Error(`${label}: non-empty array required`); };
const safeRelative = (v, label) => {
  if (typeof v !== 'string' || !v || path.isAbsolute(v) || v.split(/[\\/]/).includes('..')) throw new Error(`${label}: safe relative path required`);
};
const httpsUrl = (v, label) => { const u = new URL(v); if (u.protocol !== 'https:') throw new Error(`${label}: https required`); };
const deepFreeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const child of Object.values(v)) deepFreeze(child); } return v; };

export async function loadRegistry(root, sourceRevision = null) {
  const site = JSON.parse(await fs.readFile(path.join(root,'config','site.json'),'utf8'));
  exactKeys(site, ['$schema','schemaVersion','siteId','name','canonicalOrigin','language','organization','contentPolicy'], 'site');
  if (site.schemaVersion !== '1.0.0' || site.canonicalOrigin !== 'https://tools.engroveaudio.com' || site.language !== 'en') throw new Error('site contract mismatch');
  httpsUrl(site.organization.id,'organization.id'); httpsUrl(site.organization.url,'organization.url');
  const toolsDir = path.join(root,'tools');
  const entries = (await fs.readdir(toolsDir,{withFileTypes:true})).filter((e)=>e.isDirectory()&&!e.name.startsWith('_')&&!e.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name));
  const tools = [];
  for (const entry of entries) {
    const dir = path.join(toolsDir,entry.name);
    const manifestPath = path.join(dir,'tool.json');
    if (!(await exists(manifestPath))) throw new Error(`MISSING_TOOL_MANIFEST: ${entry.name}`);
    const tool = JSON.parse(await fs.readFile(manifestPath,'utf8'));
    exactKeys(tool,[...TOOL_REQUIRED,...TOOL_OPTIONAL],`tool:${entry.name}`);
    if (tool.$schema !== '../../schema/tool.schema.json' || tool.schemaVersion !== '1.0.0') throw new Error(`schema mismatch: ${entry.name}`);
    if (tool.slug !== entry.name || tool.canonicalPath !== `/tools/${entry.name}/`) throw new Error(`route mismatch: ${entry.name}`);
    if (tool.public !== true || tool.hidden !== false || tool.language !== 'en') throw new Error(`public visibility mismatch: ${entry.name}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tool.updated)) throw new Error(`updated must be ISO date: ${entry.name}`);
    safeRelative(tool.entry,`${entry.name}.entry`); if (tool.buildOutputDir) safeRelative(tool.buildOutputDir,`${entry.name}.buildOutputDir`);
    for (const key of ['tags','keywords','capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations']) nonEmptyArray(tool[key],`${entry.name}.${key}`);
    exactKeys(tool.privacy,['processing','storesApplicationUserDataOnServer','requiresAccount','requiresOAuth'],`${entry.name}.privacy`);
    exactKeys(tool.access,['cost','registrationRequired'],`${entry.name}.access`);
    exactKeys(tool.claims,['mayClaim','negativeClaimBoundaries','mustNotClaim'],`${entry.name}.claims`);
    for (const key of ['mayClaim','negativeClaimBoundaries','mustNotClaim']) nonEmptyArray(tool.claims[key],`${entry.name}.claims.${key}`);
    for (const ev of tool.evidence) { exactKeys(ev,['type','label','url'],`${entry.name}.evidence`); httpsUrl(ev.url,`${entry.name}.evidence.url`); }
    const positive = new Set(tool.claims.mayClaim.map((x)=>x.toLowerCase()));
    if (tool.claims.mustNotClaim.some((x)=>positive.has(x.toLowerCase()))) throw new Error(`claim polarity collision: ${entry.name}`);
    tools.push({...tool, sourceDir:dir, canonicalUrl:`${site.canonicalOrigin}${tool.canonicalPath}`, appPath:`${tool.canonicalPath}app/`});
  }
  const slugs = new Set(tools.map((t)=>t.slug));
  if (slugs.size !== tools.length) throw new Error('duplicate slugs');
  for (const tool of tools) for (const related of tool.relatedTools) if (!slugs.has(related)) throw new Error(`unknown related tool: ${tool.slug}->${related}`);
  return deepFreeze({site:{...site},tools,publicTools:tools,generatedAt:null,sourceRevision});
}

export function runtimeRegistry(registry) {
  return {schemaVersion:'1.0.0',canonicalOrigin:registry.site.canonicalOrigin,tools:registry.publicTools.map((t)=>({slug:t.slug,url:t.canonicalUrl,path:t.canonicalPath,name:t.name,summary:t.summary,category:t.category,tags:t.tags,updated:t.updated}))};
}

function jsonLdScript(value) { return JSON.stringify(value).replace(/</g,'\\u003c'); }
export function renderHub(registry) {
  const cards = registry.publicTools.map((t)=>`<a class="card" data-tool-slug="${escapeHtml(t.slug)}" data-search="${escapeHtml([t.name,t.summary,...t.tags,...t.keywords].join(' ').toLowerCase())}" href="${t.canonicalPath}"><div class="card-head"><span class="card-icon" aria-hidden="true">${escapeHtml(t.icon)}</span><h2 class="card-title">${escapeHtml(t.name)}</h2></div><p class="card-desc">${escapeHtml(t.summary)}</p><div class="card-meta">${t.tags.map((x)=>`<span class="tag">${escapeHtml(x)}</span>`).join('')}<time class="card-date" datetime="${t.updated}">${t.updated}</time></div></a>`).join('\n');
  const graph = {'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':registry.site.organization.id,name:registry.site.organization.name,url:registry.site.organization.url},{'@type':'WebSite','@id':`${registry.site.canonicalOrigin}/#website`,url:`${registry.site.canonicalOrigin}/`,name:registry.site.name,publisher:{'@id':registry.site.organization.id}},{'@type':'CollectionPage','@id':`${registry.site.canonicalOrigin}/#collection`,url:`${registry.site.canonicalOrigin}/`,name:registry.site.name,isPartOf:{'@id':`${registry.site.canonicalOrigin}/#website`}},{'@type':'ItemList',itemListElement:registry.publicTools.map((t,i)=>({'@type':'ListItem',position:i+1,url:t.canonicalUrl,name:t.name}))}]};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engrove Tools — Browser Engineering Utilities</title><meta name="description" content="Browser-based engineering and audio utilities with explicit capabilities, limitations, and local-processing boundaries."><meta name="robots" content="index,follow"><link rel="canonical" href="${registry.site.canonicalOrigin}/"><meta property="og:type" content="website"><meta property="og:title" content="Engrove Tools"><meta property="og:description" content="Browser-based engineering and audio utilities."><meta property="og:url" content="${registry.site.canonicalOrigin}/"><meta property="og:image" content="${registry.site.canonicalOrigin}/assets/tool-default-1200x630.png"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${jsonLdScript(graph)}</script></head><body><header class="site-header"><div class="wrap"><div class="brand"><strong>Engrove Tools</strong><p class="tagline">Browser engineering utilities</p></div><button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle color theme"><span class="theme-toggle-icon"></span></button></div></header><main class="wrap"><section class="intro"><h1>Engrove Tools</h1><p>Engrove Tools provides static browser-based engineering and audio utilities with explicit inputs, outputs, limitations, privacy boundaries, and source evidence.</p><p class="machine-links"><a href="/llms.txt">llms.txt</a> · <a href="/for-agents.md">for-agents.md</a> · <a href="/agent-capabilities.json">agent capabilities</a> · <a href="/sitemap.xml">sitemap</a></p></section><div class="toolbar"><label class="search" for="search"><span>Search</span><input id="search" type="search" placeholder="Filter tools"></label><span id="count" class="count">${registry.publicTools.length} tool${registry.publicTools.length===1?'':'s'}</span></div><section id="grid" class="grid" aria-label="Available tools">${cards}</section><noscript><p>JavaScript is optional; every public tool is linked above.</p></noscript><div id="empty" class="empty" hidden><p>No matching tools</p></div></main><footer class="site-footer"><div class="wrap"><span>No public backend API.</span><a href="https://github.com/Engrove/tools">Source</a></div></footer><script type="module" src="/app.js"></script></body></html>\n`;
}

const list = (items)=>`<ul>${items.map((x)=>`<li>${escapeHtml(typeof x==='string'?x:x.description||x.name)}</li>`).join('')}</ul>`;
export function renderTool(registry, tool) {
  const faqHtml = tool.faq.length?`<section class="semantic-section"><h2>FAQ</h2>${tool.faq.map((x)=>`<article class="faq-item"><h3>${escapeHtml(x.question)}</h3><p>${escapeHtml(x.answer)}</p></article>`).join('')}</section>`:'';
  const graph = {'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':registry.site.organization.id,name:registry.site.organization.name,url:registry.site.organization.url},{'@type':'WebSite','@id':`${registry.site.canonicalOrigin}/#website`,url:`${registry.site.canonicalOrigin}/`,name:registry.site.name},{'@type':'WebPage','@id':`${tool.canonicalUrl}#webpage`,url:tool.canonicalUrl,name:tool.name,description:tool.summary,isPartOf:{'@id':`${registry.site.canonicalOrigin}/#website`}},{'@type':'WebApplication','@id':`${tool.canonicalUrl}#application`,name:tool.name,url:tool.canonicalUrl,description:tool.description,applicationCategory:tool.category,operatingSystem:'Web browser',isAccessibleForFree:true},{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:registry.site.name,item:`${registry.site.canonicalOrigin}/`},{'@type':'ListItem',position:2,name:tool.name,item:tool.canonicalUrl}]},...(tool.faq.length?[{'@type':'FAQPage',mainEntity:tool.faq.map((x)=>({'@type':'Question',name:x.question,acceptedAnswer:{'@type':'Answer',text:x.answer}}))}]:[])]};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(tool.name)} — Engrove Tools</title><meta name="description" content="${escapeHtml(tool.summary)}"><meta name="robots" content="${tool.robots}"><link rel="canonical" href="${tool.canonicalUrl}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(tool.name)}"><meta property="og:description" content="${escapeHtml(tool.summary)}"><meta property="og:url" content="${tool.canonicalUrl}"><meta property="og:image" content="${registry.site.canonicalOrigin}${tool.ogImage}"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${jsonLdScript(graph)}</script></head><body><main class="wrap tool-page"><nav class="breadcrumbs"><a href="/">Engrove Tools</a> / ${escapeHtml(tool.name)}</nav><section class="tool-hero"><h1>${escapeHtml(tool.name)}</h1><p class="atomic-summary">${escapeHtml(tool.summary)}</p><p>${escapeHtml(tool.description)}</p><a class="launch-button" href="${tool.appPath}">Launch tool</a></section><section class="semantic-section"><h2>What this tool does</h2>${list(tool.capabilities)}</section><section class="semantic-section"><h2>Supported inputs</h2>${list(tool.inputs)}</section><section class="semantic-section"><h2>Produced outputs</h2>${list(tool.outputs)}</section><section class="semantic-section"><h2>When to use</h2>${list(tool.whenToUse)}<h2>When not to use</h2>${list(tool.whenNotToUse)}</section><section class="semantic-section"><h2>Limitations</h2>${list(tool.limitations)}</section><section class="semantic-section"><h2>Privacy and processing</h2><p>Processing: ${escapeHtml(tool.privacy.processing)}. Server storage of application user data: ${tool.privacy.storesApplicationUserDataOnServer?'yes':'no'}. Account required: ${tool.privacy.requiresAccount?'yes':'no'}.</p></section><section class="semantic-section"><h2>Claim boundaries</h2><h3>Supported statements</h3>${list(tool.claims.mayClaim)}<h3>Explicit negative boundaries</h3>${list(tool.claims.negativeClaimBoundaries)}<h3>Statements that must not be made</h3>${list(tool.claims.mustNotClaim)}</section>${faqHtml}<section class="semantic-section"><h2>Evidence and source links</h2><ul>${tool.evidence.map((x)=>`<li><a href="${escapeHtml(x.url)}">${escapeHtml(x.label)}</a></li>`).join('')}</ul></section></main></body></html>\n`;
}

export function renderDiscovery(registry) {
  const urls = [`${registry.site.canonicalOrigin}/`,...registry.publicTools.map((t)=>t.canonicalUrl)];
  const toolAI = Object.fromEntries(registry.publicTools.flatMap((t)=>[[`tools/${t.slug}/tool.ai.json`,stableJson({schemaVersion:'1.0.0',tool:{slug:t.slug,name:t.name,url:t.canonicalUrl,summary:t.summary,capabilities:t.capabilities,inputs:t.inputs,outputs:t.outputs,whenToUse:t.whenToUse,whenNotToUse:t.whenNotToUse,limitations:t.limitations,privacy:t.privacy,claims:t.claims,evidence:t.evidence,relatedTools:t.relatedTools}})],[`tools/${t.slug}/tool.md`,`# ${t.name}\n\n${t.summary}\n\n## Capabilities\n${t.capabilities.map((x)=>`- ${x}`).join('\n')}\n\n## Limitations\n${t.limitations.map((x)=>`- ${x}`).join('\n')}\n`]]));
  const llms = `# ${registry.site.name}\n\nCanonical origin: ${registry.site.canonicalOrigin}\n\n## Tools\n${registry.publicTools.map((t)=>`- [${t.name}](${t.canonicalUrl}): ${t.summary}`).join('\n')}\n\nClaim boundary: no public backend API, user accounts, OAuth, commerce, or certification is provided.\n`;
  const full = `${llms}\n${registry.publicTools.map((t)=>`## ${t.name}\n\n${t.description}\n\nCapabilities:\n${t.capabilities.map((x)=>`- ${x}`).join('\n')}\n\nInputs:\n${t.inputs.map((x)=>`- ${x.name}: ${x.description}`).join('\n')}\n\nOutputs:\n${t.outputs.map((x)=>`- ${x.name}: ${x.description}`).join('\n')}\n\nLimitations:\n${t.limitations.map((x)=>`- ${x}`).join('\n')}\n\nMay claim:\n${t.claims.mayClaim.map((x)=>`- ${x}`).join('\n')}\n\nNegative boundaries:\n${t.claims.negativeClaimBoundaries.map((x)=>`- ${x}`).join('\n')}\n`).join('\n')}`;
  const caps = {schemaVersion:'1.0.0',canonicalOrigin:registry.site.canonicalOrigin,publicStaticDataResources:true,publicProgrammaticBackendApi:false,hasBrowserNativeModelContextTools:false,hasServerMcpEndpoint:false,hasOAuth:false,hasUserAccounts:false,hasCommerce:false,tools:registry.publicTools.map((t)=>({slug:t.slug,url:t.canonicalUrl}))};
  const ai = {schemaVersion:'1.0.0',site:{name:registry.site.name,canonicalOrigin:registry.site.canonicalOrigin,contentPolicy:registry.site.contentPolicy},tools:registry.publicTools.map((t)=>({slug:t.slug,name:t.name,url:t.canonicalUrl,summary:t.summary,capabilities:t.capabilities,limitations:t.limitations,privacy:t.privacy,claims:t.claims,evidence:t.evidence,relatedTools:t.relatedTools}))};
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u)=>`<url><loc>${u}</loc></url>`).join('')}</urlset>\n`;
  return {'robots.txt':`User-agent: *\nAllow: /\n\nContent-Signal: search=yes, ai-input=yes, ai-train=no\n\nSitemap: ${registry.site.canonicalOrigin}/sitemap.xml\n`,'sitemap.xml':sitemapXml,'sitemap.json':stableJson({schemaVersion:'1.0.0',urls}),'sitemap.txt':`${urls.join('\n')}\n`,'llms.txt':llms,'llms-full.txt':full,'for-agents.md':full,'for-agents/index.html':`<!doctype html><html lang="en"><head><meta name="robots" content="index,follow"><link rel="canonical" href="${registry.site.canonicalOrigin}/for-agents/"><title>Engrove Tools for agents</title></head><body><main><pre>${escapeHtml(full)}</pre></main></body></html>\n`,'ai.json':stableJson(ai),'agent-capabilities.json':stableJson(caps),'public-info.json':stableJson({schemaVersion:'1.0.0',name:registry.site.name,canonicalOrigin:registry.site.canonicalOrigin,contentPolicy:registry.site.contentPolicy,publicToolCount:registry.publicTools.length}),' .well-known/engrove-tools.json'.trim():stableJson({schemaVersion:'1.0.0',canonicalOrigin:registry.site.canonicalOrigin,agentCapabilities:`${registry.site.canonicalOrigin}/agent-capabilities.json`,tools:registry.publicTools.map((t)=>({slug:t.slug,url:t.canonicalUrl}))}),'.well-known/agent-skills/index.json':stableJson({schemaVersion:'1.0.0',skills:[{id:'engrove-tools',url:`${registry.site.canonicalOrigin}/.well-known/agent-skills/engrove-tools/SKILL.md`}]}),'.well-known/agent-skills/engrove-tools/SKILL.md':`# Engrove Tools\n\nUse the canonical public tool pages and structured manifests. No server MCP endpoint or public backend API is provided.\n`,...toolAI};
}

export async function ensureDir(dir) { await fs.mkdir(dir,{recursive:true}); }
export async function writeFile(root, relative, content) { const target=path.join(root,relative); await ensureDir(path.dirname(target)); await fs.writeFile(target,content); }
export async function copyRuntime(from,to) {
  for (const entry of await fs.readdir(from,{withFileTypes:true})) {
    if (SKIP_NAMES.has(entry.name) || SKIP_EXT.has(path.extname(entry.name))) continue;
    const src=path.join(from,entry.name), dst=path.join(to,entry.name);
    if (entry.isDirectory()) await copyRuntime(src,dst); else if (entry.isFile()) { await ensureDir(path.dirname(dst)); await fs.copyFile(src,dst); }
  }
}
export async function listFiles(dir) { const result=[]; if (!(await exists(dir))) return result; for (const e of await fs.readdir(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) result.push(...await listFiles(p)); else if(e.isFile()) result.push(p); } return result.sort(); }

export async function checkOutput(root,out,registry=await loadRegistry(root)) {
  const required=['index.html','tools.json','robots.txt','sitemap.xml','sitemap.json','sitemap.txt','llms.txt','llms-full.txt','for-agents.md','for-agents/index.html','ai.json','agent-capabilities.json','public-info.json','.well-known/engrove-tools.json','.well-known/agent-skills/index.json','.well-known/agent-skills/engrove-tools/SKILL.md','_headers'];
  for(const f of required) if(!(await exists(path.join(out,f)))) throw new Error(`missing generated surface: ${f}`);
  const runtime=JSON.parse(await fs.readFile(path.join(out,'tools.json'),'utf8'));
  const expected=registry.publicTools.map((t)=>t.slug).sort();
  const actual=runtime.tools.map((t)=>t.slug).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error('tools.json parity failure');
  const hub=await fs.readFile(path.join(out,'index.html'),'utf8');
  for(const t of registry.publicTools){ if(!hub.includes(`href="${t.canonicalPath}"`)) throw new Error(`hub route missing: ${t.slug}`); const page=await fs.readFile(path.join(out,'tools',t.slug,'index.html'),'utf8'); if(!page.includes(`<link rel="canonical" href="${t.canonicalUrl}">`)) throw new Error(`canonical missing: ${t.slug}`); for(const q of t.faq) if(!page.includes(escapeHtml(q.question))||!page.includes(escapeHtml(q.answer))) throw new Error(`FAQ parity failure: ${t.slug}`); }
  const sitemap=await fs.readFile(path.join(out,'sitemap.txt'),'utf8'); for(const u of [`${registry.site.canonicalOrigin}/`,...registry.publicTools.map((t)=>t.canonicalUrl)]) if(!sitemap.split(/\r?\n/).includes(u)) throw new Error(`sitemap parity missing: ${u}`);
  const claimsText=(await Promise.all((await listFiles(out)).filter((f)=>/\.(html|json|txt|md)$/.test(f)&&!f.endsWith('build-info.json')).map((f)=>fs.readFile(f,'utf8')))).join('\n').toLowerCase();
  for(const phrase of BAD_CLAIMS){ const allowed=registry.publicTools.some((t)=>[...t.claims.negativeClaimBoundaries,...t.claims.mustNotClaim].some((x)=>x.toLowerCase().includes(phrase))); if(claimsText.includes(phrase)&&!allowed) throw new Error(`unsupported claim: ${phrase}`); }
  for(const f of await listFiles(out)){ const rel=path.relative(out,f); const stat=await fs.stat(f); if(stat.size>25*1024*1024) throw new Error(`Cloudflare asset too large: ${rel}`); if(SKIP_EXT.has(path.extname(f))||/(^|[\\/])(node_modules|test|tests|src)([\\/]|$)/.test(rel)) throw new Error(`forbidden output: ${rel}`); }
  const middleware=await fs.readFile(path.join(root,'functions','_middleware.ts'),'utf8'); if(!middleware.includes("endsWith('.pages.dev')")||!middleware.includes('noindex, nofollow')||!middleware.includes('text/markdown')) throw new Error('preview/markdown policy missing');
  return {publicToolCount:registry.publicTools.length};
}

export async function hashTree(dir, exclude=new Set(['build-info.json'])) { const h=createHash('sha256'); for(const f of await listFiles(dir)){ const rel=path.relative(dir,f).split(path.sep).join('/'); if(exclude.has(rel)) continue; h.update(rel); h.update(await fs.readFile(f)); } return h.digest('hex'); }
