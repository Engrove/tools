/**
 * AI-CODING NOTE:
 * Responsibility: Validate source metadata, build the normalized registry, render SEO and AI surfaces, copy runtime assets, and verify parity.
 * Inputs: config/site.json, tools/<slug>/tool.json, tool outputs, and public policy files.
 * Outputs: Immutable registry and deterministic public artifacts.
 * Safe edits: Schema-aligned validation, deterministic rendering, exact-set parity, and sanitation.
 * Do not: Infer required metadata, use filesystem timestamps as freshness, expose source routes, or emit unsupported claims.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SITE_KEYS=['$schema','schemaVersion','siteId','name','canonicalOrigin','language','organization','contentPolicy'];
const TOOL_REQUIRED=['$schema','schemaVersion','slug','name','shortName','summary','description','category','tags','keywords','entry','public','hidden','language','version','updated','canonicalPath','icon','ogImage','robots','capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations','privacy','access','claims','faq','evidence','relatedTools'];
const TOOL_OPTIONAL=['buildOutputDir'];
const BAD_CLAIMS=['guaranteed accuracy','certified','laboratory-grade','professional-grade','expert recommended','best in class','scientifically proven','trusted by professionals','ai-endorsed','definitive authority'];
const SKIP_NAMES=new Set(['node_modules','test','tests','src','.git','.vite','coverage']);
const SKIP_EXT=new Set(['.map','.zip','.tgz','.tar','.bak','.tmp']);

export const exists=async(file)=>fs.access(file).then(()=>true,()=>false);
export const stableJson=(value)=>`${JSON.stringify(value,null,2)}
`;
export const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const exactKeys=(value,allowed,label)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),`${label}: object required`);const unknown=Object.keys(value).filter((key)=>!allowed.includes(key));const missing=allowed.filter((key)=>!(key in value));assert(!unknown.length&&!missing.length,`${label}: unknown=[${unknown}] missing=[${missing}]`)};
const nonEmptyString=(value,label)=>assert(typeof value==='string'&&value.trim(),`${label}: non-empty string required`);
const nonEmptyArray=(value,label)=>assert(Array.isArray(value)&&value.length>0,`${label}: non-empty array required`);
const safeRelative=(value,label)=>{nonEmptyString(value,label);assert(!path.isAbsolute(value)&&!value.split(/[\/]/).includes('..'),`${label}: safe relative path required`)};
const httpsUrl=(value,label)=>{const url=new URL(value);assert(url.protocol==='https:',`${label}: https URL required`)};
const freeze=(value)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value};
const normalizeSet=(items)=>[...new Set(items)].sort();

function validateTool(tool,slug){
  exactKeys(tool,[...TOOL_REQUIRED,...TOOL_OPTIONAL],`tool:${slug}`);
  assert(tool.$schema==='../../schema/tool.schema.json'&&tool.schemaVersion==='1.0.0',`schema mismatch: ${slug}`);
  assert(tool.slug===slug&&tool.canonicalPath===`/tools/${slug}/`,`route mismatch: ${slug}`);
  assert(tool.public===true&&tool.hidden===false&&tool.language==='en',`visibility mismatch: ${slug}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tool.updated),`updated must be ISO date: ${slug}`);
  assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tool.version),`version invalid: ${slug}`);
  assert(tool.robots==='index,follow',`robots invalid: ${slug}`);
  assert(typeof tool.ogImage==='string'&&tool.ogImage.startsWith('/'),`ogImage invalid: ${slug}`);
  safeRelative(tool.entry,`${slug}.entry`);if(tool.buildOutputDir)safeRelative(tool.buildOutputDir,`${slug}.buildOutputDir`);
  for(const key of ['tags','keywords','capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations'])nonEmptyArray(tool[key],`${slug}.${key}`);
  for(const item of tool.inputs){exactKeys(item,['name','type','required','description'],`${slug}.input`);assert(typeof item.required==='boolean',`${slug}.input.required invalid`)}
  for(const item of tool.outputs)exactKeys(item,['name','type','description'],`${slug}.output`);
  exactKeys(tool.privacy,['processing','storesApplicationUserDataOnServer','requiresAccount','requiresOAuth'],`${slug}.privacy`);
  exactKeys(tool.access,['cost','registrationRequired'],`${slug}.access`);
  exactKeys(tool.claims,['mayClaim','negativeClaimBoundaries','mustNotClaim'],`${slug}.claims`);
  for(const key of ['mayClaim','negativeClaimBoundaries','mustNotClaim'])nonEmptyArray(tool.claims[key],`${slug}.claims.${key}`);
  for(const item of tool.faq)exactKeys(item,['question','answer'],`${slug}.faq`);
  for(const item of tool.evidence){exactKeys(item,['type','label','url'],`${slug}.evidence`);httpsUrl(item.url,`${slug}.evidence.url`)}
  const positives=new Set(tool.claims.mayClaim.map((item)=>item.toLowerCase()));
  assert(!tool.claims.mustNotClaim.some((item)=>positives.has(item.toLowerCase())),`claim polarity collision: ${slug}`);
}

export async function loadRegistry(root,sourceRevision=null){
  const site=JSON.parse(await fs.readFile(path.join(root,'config','site.json'),'utf8'));
  exactKeys(site,SITE_KEYS,'site');
  assert(site.$schema==='../schema/site.schema.json'&&site.schemaVersion==='1.0.0','site schema mismatch');
  assert(site.canonicalOrigin==='https://tools.engroveaudio.com'&&site.language==='en','site public identity mismatch');
  exactKeys(site.organization,['id','name','url'],'site.organization');httpsUrl(site.organization.id,'organization.id');httpsUrl(site.organization.url,'organization.url');
  exactKeys(site.contentPolicy,['searchIndexing','aiRetrievalInputContext','aiModelTraining'],'site.contentPolicy');
  exactKeys(site.contentPolicy.aiModelTraining,['policy','enforcement'],'site.contentPolicy.aiModelTraining');
  const entries=(await fs.readdir(path.join(root,'tools'),{withFileTypes:true})).filter((entry)=>entry.isDirectory()&&!entry.name.startsWith('_')&&!entry.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name));
  const tools=[];
  for(const entry of entries){const sourceDir=path.join(root,'tools',entry.name);const manifestPath=path.join(sourceDir,'tool.json');assert(await exists(manifestPath),`MISSING_TOOL_MANIFEST: ${entry.name}`);const tool=JSON.parse(await fs.readFile(manifestPath,'utf8'));validateTool(tool,entry.name);tools.push({...tool,sourceDir,canonicalUrl:`${site.canonicalOrigin}${tool.canonicalPath}`,appPath:`${tool.canonicalPath}app/`})}
  const slugs=new Set(tools.map((tool)=>tool.slug));assert(slugs.size===tools.length,'duplicate slugs');for(const tool of tools)for(const related of tool.relatedTools)assert(slugs.has(related),`unknown related tool: ${tool.slug}->${related}`);
  return freeze({site:{...site},tools,publicTools:tools,generatedAt:null,sourceRevision});
}

export const runtimeRegistry=(registry)=>({schemaVersion:'1.0.0',canonicalOrigin:registry.site.canonicalOrigin,tools:registry.publicTools.map((tool)=>({slug:tool.slug,url:tool.canonicalUrl,path:tool.canonicalPath,name:tool.name,summary:tool.summary,category:tool.category,tags:tool.tags,updated:tool.updated}))});
const jsonLd=(value)=>JSON.stringify(value).replace(/</g,'\u003c');
const list=(items)=>`<ul>${items.map((item)=>`<li>${escapeHtml(typeof item==='string'?item:item.description||item.name)}</li>`).join('')}</ul>`;

export function renderHub(registry){
  const cards=registry.publicTools.map((tool)=>`<a class="card" data-tool-slug="${escapeHtml(tool.slug)}" data-search="${escapeHtml([tool.name,tool.summary,...tool.tags,...tool.keywords].join(' ').toLowerCase())}" href="${tool.canonicalPath}"><div class="card-head"><span class="card-icon" aria-hidden="true">${escapeHtml(tool.icon)}</span><h2 class="card-title">${escapeHtml(tool.name)}</h2></div><p class="card-desc">${escapeHtml(tool.summary)}</p><div class="card-meta">${tool.tags.map((tag)=>`<span class="tag">${escapeHtml(tag)}</span>`).join('')}<time class="card-date" datetime="${tool.updated}">${tool.updated}</time></div></a>`).join('
');
  const graph={'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':registry.site.organization.id,name:registry.site.organization.name,url:registry.site.organization.url},{'@type':'WebSite','@id':`${registry.site.canonicalOrigin}/#website`,url:`${registry.site.canonicalOrigin}/`,name:registry.site.name,publisher:{'@id':registry.site.organization.id}},{'@type':'CollectionPage','@id':`${registry.site.canonicalOrigin}/#collection`,url:`${registry.site.canonicalOrigin}/`,name:registry.site.name,isPartOf:{'@id':`${registry.site.canonicalOrigin}/#website`}},{'@type':'ItemList',itemListElement:registry.publicTools.map((tool,index)=>({'@type':'ListItem',position:index+1,url:tool.canonicalUrl,name:tool.name}))}]};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engrove Tools — Browser Engineering Utilities</title><meta name="description" content="Browser-based engineering and audio utilities with explicit capabilities, limitations, and local-processing boundaries."><meta name="robots" content="index,follow"><link rel="canonical" href="${registry.site.canonicalOrigin}/"><meta property="og:type" content="website"><meta property="og:title" content="Engrove Tools"><meta property="og:description" content="Browser-based engineering and audio utilities."><meta property="og:url" content="${registry.site.canonicalOrigin}/"><meta property="og:image" content="${registry.site.canonicalOrigin}/assets/tool-default-1200x630.png"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${jsonLd(graph)}</script></head><body><header class="site-header"><div class="wrap"><div class="brand"><strong>Engrove Tools</strong><p class="tagline">Browser engineering utilities</p></div><button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle color theme"><span class="theme-toggle-icon"></span></button></div></header><main class="wrap"><section class="intro"><h1>Engrove Tools</h1><p>Engrove Tools provides static browser-based engineering and audio utilities with explicit inputs, outputs, limitations, privacy boundaries, and source evidence.</p><p class="machine-links"><a href="/llms.txt">llms.txt</a> · <a href="/for-agents.md">for-agents.md</a> · <a href="/agent-capabilities.json">agent capabilities</a> · <a href="/sitemap.xml">sitemap</a></p></section><div class="toolbar"><label class="search" for="search"><span>Search</span><input id="search" type="search" placeholder="Filter tools"></label><span id="count" class="count">${registry.publicTools.length} tool${registry.publicTools.length===1?'':'s'}</span></div><section id="grid" class="grid" aria-label="Available tools">${cards}</section><noscript><p>JavaScript is optional; every public tool is linked above.</p></noscript><div id="empty" class="empty" hidden><p>No matching tools</p></div></main><footer class="site-footer"><div class="wrap"><span>No public backend API.</span><a href="https://github.com/Engrove/tools">Source</a></div></footer><script type="module" src="/app.js"></script></body></html>
`;
}

export function renderTool(registry,tool){
  const faq=tool.faq.length?`<section class="semantic-section"><h2>FAQ</h2>${tool.faq.map((item)=>`<article class="faq-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></article>`).join('')}</section>`:'';
  const graph={'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':registry.site.organization.id,name:registry.site.organization.name,url:registry.site.organization.url},{'@type':'WebSite','@id':`${registry.site.canonicalOrigin}/#website`,url:`${registry.site.canonicalOrigin}/`,name:registry.site.name},{'@type':'WebPage','@id':`${tool.canonicalUrl}#webpage`,url:tool.canonicalUrl,name:tool.name,description:tool.summary,isPartOf:{'@id':`${registry.site.canonicalOrigin}/#website`}},{'@type':'WebApplication','@id':`${tool.canonicalUrl}#application`,name:tool.name,url:tool.canonicalUrl,description:tool.description,applicationCategory:tool.category,operatingSystem:'Web browser',isAccessibleForFree:true},{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:registry.site.name,item:`${registry.site.canonicalOrigin}/`},{'@type':'ListItem',position:2,name:tool.name,item:tool.canonicalUrl}]},...(tool.faq.length?[{'@type':'FAQPage',mainEntity:tool.faq.map((item)=>({'@type':'Question',name:item.question,acceptedAnswer:{'@type':'Answer',text:item.answer}}))}]:[])]};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(tool.name)} — Engrove Tools</title><meta name="description" content="${escapeHtml(tool.summary)}"><meta name="robots" content="${tool.robots}"><link rel="canonical" href="${tool.canonicalUrl}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(tool.name)}"><meta property="og:description" content="${escapeHtml(tool.summary)}"><meta property="og:url" content="${tool.canonicalUrl}"><meta property="og:image" content="${registry.site.canonicalOrigin}${tool.ogImage}"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${jsonLd(graph)}</script></head><body><main class="wrap tool-page"><nav class="breadcrumbs"><a href="/">Engrove Tools</a> / ${escapeHtml(tool.name)}</nav><section class="tool-hero"><h1>${escapeHtml(tool.name)}</h1><p class="atomic-summary">${escapeHtml(tool.summary)}</p><p>${escapeHtml(tool.description)}</p><a class="launch-button" href="${tool.appPath}">Launch tool</a></section><section class="semantic-section"><h2>What this tool does</h2>${list(tool.capabilities)}</section><section class="semantic-section"><h2>Supported inputs</h2>${list(tool.inputs)}</section><section class="semantic-section"><h2>Produced outputs</h2>${list(tool.outputs)}</section><section class="semantic-section"><h2>When to use</h2>${list(tool.whenToUse)}<h2>When not to use</h2>${list(tool.whenNotToUse)}</section><section class="semantic-section"><h2>Limitations</h2>${list(tool.limitations)}</section><section class="semantic-section"><h2>Privacy and processing</h2><p>Processing: ${escapeHtml(tool.privacy.processing)}. Server storage of application user data: ${tool.privacy.storesApplicationUserDataOnServer?'yes':'no'}. Account required: ${tool.privacy.requiresAccount?'yes':'no'}.</p></section><section class="semantic-section"><h2>Claim boundaries</h2><h3>Supported statements</h3>${list(tool.claims.mayClaim)}<h3>Explicit negative boundaries</h3>${list(tool.claims.negativeClaimBoundaries)}<h3>Statements that must not be made</h3>${list(tool.claims.mustNotClaim)}</section>${faq}<section class="semantic-section"><h2>Evidence and source links</h2><ul>${tool.evidence.map((item)=>`<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a></li>`).join('')}</ul></section></main></body></html>
`;
}

export function renderDiscovery(registry){
  const urls=[`${registry.site.canonicalOrigin}/`,...registry.publicTools.map((tool)=>tool.canonicalUrl)];
  const llms=`# ${registry.site.name}

Canonical origin: ${registry.site.canonicalOrigin}

## Tools
${registry.publicTools.map((tool)=>`- [${tool.name}](${tool.canonicalUrl}): ${tool.summary}`).join('
')}

Claim boundary: no public backend API, user accounts, OAuth, commerce, certification, or guaranteed accuracy is provided.
`;
  const full=`${llms}
${registry.publicTools.map((tool)=>`## ${tool.name}

${tool.description}

Capabilities:
${tool.capabilities.map((item)=>`- ${item}`).join('
')}

Inputs:
${tool.inputs.map((item)=>`- ${item.name}: ${item.description}`).join('
')}

Outputs:
${tool.outputs.map((item)=>`- ${item.name}: ${item.description}`).join('
')}

When to use:
${tool.whenToUse.map((item)=>`- ${item}`).join('
')}

When not to use:
${tool.whenNotToUse.map((item)=>`- ${item}`).join('
')}

Limitations:
${tool.limitations.map((item)=>`- ${item}`).join('
')}

Privacy: ${tool.privacy.processing}; server storage=${tool.privacy.storesApplicationUserDataOnServer}.

May claim:
${tool.claims.mayClaim.map((item)=>`- ${item}`).join('
')}

Negative boundaries:
${tool.claims.negativeClaimBoundaries.map((item)=>`- ${item}`).join('
')}

Must not claim:
${tool.claims.mustNotClaim.map((item)=>`- ${item}`).join('
')}

Evidence:
${tool.evidence.map((item)=>`- ${item.label}: ${item.url}`).join('
')}
`).join('
')}`;
  const capabilities={schemaVersion:'1.0.0',canonicalOrigin:registry.site.canonicalOrigin,publicStaticDataResources:true,publicProgrammaticBackendApi:false,hasBrowserNativeModelContextTools:false,hasServerMcpEndpoint:false,hasOAuth:false,hasUserAccounts:false,hasCommerce:false,tools:registry.publicTools.map((tool)=>({slug:tool.slug,url:tool.canonicalUrl}))};
  const ai={schemaVersion:'1.0.0',site:{name:registry.site.name,canonicalOrigin:registry.site.canonicalOrigin,contentPolicy:registry.site.contentPolicy},tools:registry.publicTools.map((tool)=>({slug:tool.slug,name:tool.name,url:tool.canonicalUrl,summary:tool.summary,capabilities:tool.capabilities,inputs:tool.inputs,outputs:tool.outputs,whenToUse:tool.whenToUse,whenNotToUse:tool.whenNotToUse,limitations:tool.limitations,privacy:tool.privacy,claims:tool.claims,evidence:tool.evidence,relatedTools:tool.relatedTools}))};
  const output={'robots.txt':`User-agent: *
Allow: /

Content-Signal: search=yes, ai-input=yes, ai-train=no

Sitemap: ${registry.site.canonicalOrigin}/sitemap.xml
`,'sitemap.xml':`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url)=>`<url><loc>${url}</loc></url>`).join('')}</urlset>
`,'sitemap.json':stableJson({schemaVersion:'1.0.0',urls}),'sitemap.txt':`${urls.join('
')}
`,'llms.txt':llms,'llms-full.txt':full,'for-agents.md':full,'for-agents/index.html':`<!doctype html><html lang="en"><head><meta name="robots" content="index,follow"><link rel="canonical" href="${registry.site.canonicalOrigin}/for-agents/"><title>Engrove Tools for agents</title></head><body><main><pre>${escapeHtml(full)}</pre></main></body></html>
`,'ai.json':stableJson(ai),'agent-capabilities.json':stableJson(capabilities),'public-info.json':stableJson({schemaVersion:'1.0.0',name:registry.site.name,canonicalOrigin:registry.site.canonicalOrigin,contentPolicy:registry.site.contentPolicy,publicToolCount:registry.publicTools.length}),'.well-known/engrove-tools.json':stableJson({schemaVersion:'1.0.0',canonicalOrigin:registry.site.canonicalOrigin,agentCapabilities:`${registry.site.canonicalOrigin}/agent-capabilities.json`,tools:registry.publicTools.map((tool)=>({slug:tool.slug,url:tool.canonicalUrl}))}),'.well-known/agent-skills/index.json':stableJson({schemaVersion:'1.0.0',skills:[{id:'engrove-tools',url:`${registry.site.canonicalOrigin}/.well-known/agent-skills/engrove-tools/SKILL.md`}]}),'.well-known/agent-skills/engrove-tools/SKILL.md':'# Engrove Tools

Use canonical public pages and structured manifests. No server MCP endpoint or public backend API is provided.
'};
  for(const tool of registry.publicTools){output[`tools/${tool.slug}/tool.ai.json`]=stableJson({schemaVersion:'1.0.0',tool:ai.tools.find((item)=>item.slug===tool.slug)});output[`tools/${tool.slug}/tool.md`]=`# ${tool.name}

${tool.summary}

## Capabilities
${tool.capabilities.map((item)=>`- ${item}`).join('
')}

## Limitations
${tool.limitations.map((item)=>`- ${item}`).join('
')}
`}
  return output;
}

export async function ensureDir(dir){await fs.mkdir(dir,{recursive:true})}
export async function writeFile(root,relative,content){const target=path.join(root,relative);await ensureDir(path.dirname(target));await fs.writeFile(target,content)}
export async function copyRuntime(from,to){for(const entry of await fs.readdir(from,{withFileTypes:true})){if(SKIP_NAMES.has(entry.name)||SKIP_EXT.has(path.extname(entry.name)))continue;const source=path.join(from,entry.name),target=path.join(to,entry.name);if(entry.isDirectory())await copyRuntime(source,target);else if(entry.isFile()){await ensureDir(path.dirname(target));await fs.copyFile(source,target)}}}
export async function listFiles(dir){const result=[];if(!(await exists(dir)))return result;for(const entry of await fs.readdir(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await listFiles(target));else if(entry.isFile())result.push(target)}return result.sort()}
const extractJsonLd=(html)=>[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match)=>JSON.parse(match[1]));
const slugsFrom=(value)=>normalizeSet(value.map((item)=>item.slug));

export async function checkOutput(root,out,registry=null){
  registry ||= await loadRegistry(root);
  const required=['index.html','tools.json','robots.txt','sitemap.xml','sitemap.json','sitemap.txt','llms.txt','llms-full.txt','for-agents.md','for-agents/index.html','ai.json','agent-capabilities.json','public-info.json','.well-known/engrove-tools.json','.well-known/agent-skills/index.json','.well-known/agent-skills/engrove-tools/SKILL.md','_headers'];
  for(const relative of required)assert(await exists(path.join(out,relative)),`missing generated surface: ${relative}`);
  const expected=normalizeSet(registry.publicTools.map((tool)=>tool.slug));
  const runtime=JSON.parse(await fs.readFile(path.join(out,'tools.json'),'utf8'));assert(JSON.stringify(slugsFrom(runtime.tools))===JSON.stringify(expected),'tools.json parity failure');
  const ai=JSON.parse(await fs.readFile(path.join(out,'ai.json'),'utf8'));assert(JSON.stringify(slugsFrom(ai.tools))===JSON.stringify(expected),'ai.json parity failure');
  const caps=JSON.parse(await fs.readFile(path.join(out,'agent-capabilities.json'),'utf8'));assert(JSON.stringify(slugsFrom(caps.tools))===JSON.stringify(expected),'agent-capabilities parity failure');
  const well=JSON.parse(await fs.readFile(path.join(out,'.well-known','engrove-tools.json'),'utf8'));assert(JSON.stringify(slugsFrom(well.tools))===JSON.stringify(expected),'well-known parity failure');
  const hub=await fs.readFile(path.join(out,'index.html'),'utf8');assert((hub.match(/<h1[ >]/g)||[]).length===1,'hub must contain one H1');for(const tool of registry.publicTools){assert(hub.includes(`href="${tool.canonicalPath}"`),`hub route missing: ${tool.slug}`);const page=await fs.readFile(path.join(out,'tools',tool.slug,'index.html'),'utf8');assert(page.includes(`<link rel="canonical" href="${tool.canonicalUrl}">`),`canonical missing: ${tool.slug}`);const graphs=extractJsonLd(page);assert(graphs.length===1,`JSON-LD count invalid: ${tool.slug}`);for(const item of tool.faq)assert(page.includes(escapeHtml(item.question))&&page.includes(escapeHtml(item.answer)),`FAQ parity failure: ${tool.slug}`);const toolAi=JSON.parse(await fs.readFile(path.join(out,'tools',tool.slug,'tool.ai.json'),'utf8'));assert(toolAi.tool.slug===tool.slug,`tool.ai mismatch: ${tool.slug}`)}
  const sitemap=JSON.parse(await fs.readFile(path.join(out,'sitemap.json'),'utf8'));const expectedUrls=[`${registry.site.canonicalOrigin}/`,...registry.publicTools.map((tool)=>tool.canonicalUrl)].sort();assert(JSON.stringify([...sitemap.urls].sort())===JSON.stringify(expectedUrls),'sitemap parity failure');
  const robots=await fs.readFile(path.join(out,'robots.txt'),'utf8');assert(robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'),'robots content signal missing');
  const allText=(await Promise.all((await listFiles(out)).filter((file)=>/\.(html|json|txt|md)$/.test(file)&&!file.endsWith('build-info.json')).map((file)=>fs.readFile(file,'utf8')))).join('
').toLowerCase();
  for(const phrase of BAD_CLAIMS){const allowed=registry.publicTools.some((tool)=>[...tool.claims.negativeClaimBoundaries,...tool.claims.mustNotClaim].some((item)=>item.toLowerCase().includes(phrase)));assert(!allText.includes(phrase)||allowed,`unsupported affirmative claim: ${phrase}`)}
  for(const file of await listFiles(out)){const relative=path.relative(out,file);const stat=await fs.stat(file);assert(stat.size<=25*1024*1024,`Cloudflare asset too large: ${relative}`);assert(!SKIP_EXT.has(path.extname(file))&&!/(^|[\/])(node_modules|test|tests|src)([\/]|$)/.test(relative),`forbidden output: ${relative}`)}
  const middleware=await fs.readFile(path.join(root,'functions','_middleware.ts'),'utf8');assert(middleware.includes("hostname.endsWith('.pages.dev')")&&middleware.includes('noindex, nofollow')&&middleware.includes('text/markdown'),'preview or Markdown policy missing');
  return {publicToolCount:registry.publicTools.length};
}

export async function hashTree(dir,exclude=new Set(['build-info.json'])){const hash=createHash('sha256');for(const file of await listFiles(dir)){const relative=path.relative(dir,file).split(path.sep).join('/');if(exclude.has(relative))continue;hash.update(relative);hash.update(await fs.readFile(file))}return hash.digest('hex')}
