/**
 * AI-CODING NOTE:
 * Responsibility: Write and copy generated files and verify route, claim, sanitation, and deterministic parity.
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
const assert=(value,message)=>{if(!value)throw new Error(message)};
const sorted=(items)=>[...new Set(items)].sort();
export async function writeFile(root,relative,content){const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content)}
export async function copyRuntime(from,to){for(const entry of await fs.readdir(from,{withFileTypes:true})){if(SKIP.has(entry.name)||EXT.has(path.extname(entry.name)))continue;const source=path.join(from,entry.name),target=path.join(to,entry.name);if(entry.isDirectory())await copyRuntime(source,target);else if(entry.isFile()){await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target)}}}
export async function listFiles(dir){const result=[];if(!(await exists(dir)))return result;for(const entry of await fs.readdir(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await listFiles(target));else if(entry.isFile())result.push(target)}return result.sort()}
export async function checkOutput(root,out,registry){
  const required=['index.html','tools.json','robots.txt','sitemap.xml','sitemap.json','sitemap.txt','llms.txt','llms-full.txt','for-agents.md','for-agents/index.html','ai.json','agent-capabilities.json','public-info.json','.well-known/engrove-tools.json','.well-known/agent-skills/index.json','.well-known/agent-skills/engrove-tools/SKILL.md','_headers'];
  for(const file of required)assert(await exists(path.join(out,file)),`missing generated surface: ${file}`);
  const expected=sorted(registry.publicTools.map((tool)=>tool.slug));
  for(const file of ['tools.json','ai.json','agent-capabilities.json']){const value=JSON.parse(await fs.readFile(path.join(out,file),'utf8'));assert(JSON.stringify(sorted(value.tools.map((tool)=>tool.slug)))===JSON.stringify(expected),`${file} parity failure`)}
  const hub=await fs.readFile(path.join(out,'index.html'),'utf8');assert((hub.match(/<h1[ >]/g)||[]).length===1,'hub H1 failure');
  for(const tool of registry.publicTools){assert(hub.includes(`href="${tool.canonicalPath}"`),`hub route missing: ${tool.slug}`);const page=await fs.readFile(path.join(out,'tools',tool.slug,'index.html'),'utf8');assert(page.includes(`<link rel="canonical" href="${tool.canonicalUrl}">`),`canonical missing: ${tool.slug}`);const scripts=[...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];assert(scripts.length===1,`JSON-LD missing: ${tool.slug}`);JSON.parse(scripts[0][1]);for(const faq of tool.faq)assert(page.includes(faq.question)&&page.includes(faq.answer),`FAQ parity failure: ${tool.slug}`)}
  const sitemap=JSON.parse(await fs.readFile(path.join(out,'sitemap.json'),'utf8'));const urls=[`${registry.site.canonicalOrigin}/`,...registry.publicTools.map((tool)=>tool.canonicalUrl)].sort();assert(JSON.stringify([...sitemap.urls].sort())===JSON.stringify(urls),'sitemap parity failure');
  const robots=await fs.readFile(path.join(out,'robots.txt'),'utf8');assert(robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'),'robots policy missing');
  for(const file of await listFiles(out)){const relative=path.relative(out,file);const stat=await fs.stat(file);assert(stat.size<=25*1024*1024,`asset too large: ${relative}`);assert(!EXT.has(path.extname(file))&&!/(^|[\\/])(node_modules|test|tests|src)([\\/]|$)/.test(relative),`forbidden output: ${relative}`)}
  const middleware=await fs.readFile(path.join(root,'functions','_middleware.ts'),'utf8');assert(middleware.includes("hostname.endsWith('.pages.dev')")&&middleware.includes('noindex, nofollow')&&middleware.includes('text/markdown'),'preview policy missing');
  return{publicToolCount:expected.length};
}
export async function hashTree(dir){const hash=createHash('sha256');for(const file of await listFiles(dir)){const relative=path.relative(dir,file).split(path.sep).join('/');if(relative==='build-info.json')continue;hash.update(relative);hash.update(await fs.readFile(file))}return hash.digest('hex')}
