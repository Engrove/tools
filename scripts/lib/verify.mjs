/**
 * AI-CODING NOTE:
 * Responsibility: Write and copy generated files and verify route, claim, sanitation, analytics, and deterministic parity.
 * Inputs: Normalized registry and generated dist tree.
 * Outputs: Validation result or a blocking error.
 * Safe edits: Exact parsed checks and output sanitation.
 * Do not: Downgrade failures or validate structured files by substring alone.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exists } from './registry.mjs';

const SKIP=new Set(['node_modules','test','tests','src','.git','.vite','coverage','package.json','package-lock.json','tool.json']);
const EXT=new Set(['.map','.zip','.tgz','.tar','.bak','.tmp']);
const ANALYTICS_TAG='<script data-cfasync="false" defer src="/analytics.js"></script>';
const assert=(value,message)=>{if(!value)throw new Error(message)};
const sorted=(items)=>[...new Set(items)].sort();
const exactSet=(actual,expected,label)=>assert(JSON.stringify(sorted(actual))===JSON.stringify(sorted(expected)),`${label} parity failure`);

export async function writeFile(root,relative,content){const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content)}
export async function copyRuntime(from,to){for(const entry of await fs.readdir(from,{withFileTypes:true})){if(SKIP.has(entry.name)||EXT.has(path.extname(entry.name)))continue;const source=path.join(from,entry.name),target=path.join(to,entry.name);if(entry.isDirectory())await copyRuntime(source,target);else if(entry.isFile()){await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target)}}}
export async function listFiles(dir){const result=[];if(!(await exists(dir)))return result;for(const entry of await fs.readdir(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await listFiles(target));else if(entry.isFile())result.push(target)}return result.sort()}
function structuredToolSlugs(value){assert(Array.isArray(value.tools),'structured tool list missing');return value.tools.map((tool)=>tool.slug)}

export async function checkOutput(root,out,registry){
  const required=['index.html','analytics.js','tools.json','robots.txt','sitemap.xml','sitemap.json','sitemap.txt','llms.txt','llms-full.txt','for-agents.md','for-agents/index.html','ai.json','agent-capabilities.json','public-info.json','.well-known/engrove-tools.json','.well-known/agent-skills/index.json','.well-known/agent-skills/engrove-tools/SKILL.md','_headers'];
  for(const file of required)assert(await exists(path.join(out,file)),`missing generated surface: ${file}`);
  const expected=sorted(registry.publicTools.map((tool)=>tool.slug));
  for(const file of ['tools.json','ai.json','agent-capabilities.json','public-info.json','.well-known/engrove-tools.json']){const value=JSON.parse(await fs.readFile(path.join(out,file),'utf8'));exactSet(structuredToolSlugs(value),expected,file)}
  const analytics=await fs.readFile(path.join(out,'analytics.js'),'utf8');
  assert(analytics.includes(registry.site.analytics.productionHostname),'analytics production hostname missing');
  assert(analytics.includes(registry.site.analytics.googleAnalyticsMeasurementId),'Google Analytics ID missing');
  assert(analytics.includes(registry.site.analytics.microsoftClarityProjectId),'Microsoft Clarity ID missing');
  assert(analytics.includes('window.location.hostname!==expectedHost'),'analytics production-host guard missing');
  assert(analytics.includes('https://www.googletagmanager.com/gtag/js'),'Google Analytics loader missing');
  assert(analytics.includes('https://www.clarity.ms/tag/'),'Microsoft Clarity loader missing');
  const generatedHtml=(await listFiles(out)).filter((file)=>path.extname(file).toLowerCase()==='.html');
  assert(generatedHtml.length>0,'generated HTML surfaces missing');
  for(const file of generatedHtml){const html=await fs.readFile(file,'utf8');assert(html.includes(ANALYTICS_TAG),`generated HTML Rocket Loader-safe analytics bootstrap missing: ${path.relative(out,file)}`);assert(!html.includes('<script defer src="/analytics.js"></script>'),`generated HTML contains unprotected analytics bootstrap: ${path.relative(out,file)}`)}
  const hub=await fs.readFile(path.join(out,'index.html'),'utf8');
  assert((hub.match(/<h1[ >]/g)||[]).length===1,'hub H1 failure');
  assert(hub.includes(ANALYTICS_TAG),'hub Rocket Loader-safe analytics bootstrap missing');
  for(const requiredMeta of ['twitter:title','twitter:description','twitter:image','og:title','og:description','og:image'])assert(hub.includes(`name="${requiredMeta}"`)||hub.includes(`property="${requiredMeta}"`),`hub metadata missing: ${requiredMeta}`);
  for(const tool of registry.publicTools){
    assert(hub.includes(`href="${tool.canonicalPath}"`),`hub route missing: ${tool.slug}`);
    const page=await fs.readFile(path.join(out,'tools',tool.slug,'index.html'),'utf8');
    assert(page.includes(`<link rel="canonical" href="${tool.canonicalUrl}">`),`canonical missing: ${tool.slug}`);
    assert(page.includes(ANALYTICS_TAG),`landing Rocket Loader-safe analytics bootstrap missing: ${tool.slug}`);
    for(const requiredMeta of ['twitter:title','twitter:description','twitter:image','og:title','og:description','og:image'])assert(page.includes(`name="${requiredMeta}"`)||page.includes(`property="${requiredMeta}"`),`${tool.slug} metadata missing: ${requiredMeta}`);
    const scripts=[...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];assert(scripts.length===1,`JSON-LD missing: ${tool.slug}`);const graph=JSON.parse(scripts[0][1]);const faqNode=graph['@graph']?.find((node)=>node['@type']==='FAQPage');assert(Boolean(faqNode)===Boolean(tool.faq.length),`FAQ JSON-LD polarity failure: ${tool.slug}`);for(const faq of tool.faq)assert(page.includes(faq.question)&&page.includes(faq.answer),`FAQ parity failure: ${tool.slug}`);
    for(const related of tool.relatedTools){const target=registry.tools.find((candidate)=>candidate.slug===related);assert(page.includes(`href="${target.canonicalPath}"`),`related-tool link missing: ${tool.slug}->${related}`)}
    const launchIndex=page.indexOf('<h2>Launch tool</h2>');const evidenceIndex=page.indexOf('<h2>Evidence and source links</h2>');assert(launchIndex>evidenceIndex&&launchIndex>0,`launch section ordering failure: ${tool.slug}`);
    const appEntry=path.join(out,'tools',tool.slug,'app',tool.entry);assert(await exists(appEntry),`runtime entry missing: ${tool.slug}`);assert((await fs.readFile(appEntry,'utf8')).includes(ANALYTICS_TAG),`runtime Rocket Loader-safe analytics bootstrap missing: ${tool.slug}`);
    assert(await exists(path.join(out,'tools',tool.slug,'tool.ai.json')),`tool.ai.json missing: ${tool.slug}`);assert(await exists(path.join(out,'tools',tool.slug,'tool.md')),`tool.md missing: ${tool.slug}`);
  }
  const sitemap=JSON.parse(await fs.readFile(path.join(out,'sitemap.json'),'utf8'));const urls=[`${registry.site.canonicalOrigin}/`,...registry.publicTools.map((tool)=>tool.canonicalUrl)].sort();assert(JSON.stringify([...sitemap.urls].sort())===JSON.stringify(urls),'sitemap parity failure');
  const robots=await fs.readFile(path.join(out,'robots.txt'),'utf8');assert(robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'),'robots policy missing');
  const headers=await fs.readFile(path.join(out,'_headers'),'utf8');assert(headers.includes('/tools/*/app/*')&&headers.includes('X-Robots-Tag: noindex, nofollow'),'runtime noindex policy missing');for(const origin of ['https://www.googletagmanager.com','https://www.clarity.ms','https://www.google-analytics.com','https://*.clarity.ms'])assert(headers.includes(origin),`analytics CSP origin missing: ${origin}`);
  const full=await fs.readFile(path.join(out,'llms-full.txt'),'utf8');for(const tool of registry.publicTools)for(const text of [tool.name,tool.description,...tool.whenToUse,...tool.whenNotToUse,...tool.limitations,...tool.claims.mayClaim,...tool.claims.negativeClaimBoundaries,...tool.claims.mustNotClaim])assert(full.includes(text),`llms-full parity failure: ${tool.slug}`);
  for(const file of await listFiles(out)){const relative=path.relative(out,file);const stat=await fs.stat(file);assert(stat.size<=25*1024*1024,`asset too large: ${relative}`);assert(!EXT.has(path.extname(file))&&!/(^|[\\/])(node_modules|test|tests|src)([\\/]|$)/.test(relative),`forbidden output: ${relative}`)}
  const middleware=await fs.readFile(path.join(root,'functions','_middleware.ts'),'utf8');assert(middleware.includes("hostname.endsWith('.pages.dev')")&&middleware.includes('noindex, nofollow')&&middleware.includes('text/markdown'),'preview policy missing');
  return{publicToolCount:expected.length};
}

export async function hashTree(dir){const hash=createHash('sha256');for(const file of await listFiles(dir)){const relative=path.relative(dir,file).split(path.sep).join('/');if(relative==='build-info.json')continue;hash.update(relative);hash.update(await fs.readFile(file))}return hash.digest('hex')}