#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Build all tools and generate deterministic SEO/AI public surfaces from the normalized registry.
 * Inputs: config/site.json, per-tool tool.json manifests, tool build outputs, src/app.js, src/styles.css, public/_headers.
 * Outputs: Atomic Cloudflare Pages dist directory.
 * Safe edits: Pipeline ordering and release gates.
 * Do not: Infer metadata, expose source routes, or bypass parity and asset-size checks.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { loadRegistry } from './lib/registry.mjs';
import { runtimeRegistry, renderHub, renderTool, renderDiscovery, renderAnalytics, stableJson } from './lib/render.mjs';
import { writeFile, copyRuntime, listFiles, checkOutput } from './lib/verify.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.SEO_OUTPUT_DIR?path.resolve(ROOT,process.env.SEO_OUTPUT_DIR):path.join(ROOT,'dist');
const STAGE=path.join(path.dirname(OUT),`.${path.basename(OUT)}-stage-${process.pid}`);
const ANALYTICS_TAG='<script data-cfasync="false" defer src="/analytics.js"></script>';
const LEGACY_ANALYTICS_TAG='<script defer src="/analytics.js"></script>';
const run=(cwd,args)=>{const result=spawnSync('npm',args,{cwd,stdio:'inherit',env:{...process.env,PUPPETEER_SKIP_DOWNLOAD:'true'}});if(result.status!==0)throw new Error(`npm ${args.join(' ')} failed in ${cwd}: exit=${result.status}`)};
const injectAnalytics=(html)=>html.includes('/analytics.js')?html.replaceAll(LEGACY_ANALYTICS_TAG,ANALYTICS_TAG):html.includes('</head>')?html.replace('</head>',`${ANALYTICS_TAG}</head>`):`${ANALYTICS_TAG}${html}`;
async function protectGeneratedAnalytics(root){for(const file of (await listFiles(root)).filter((candidate)=>path.extname(candidate).toLowerCase()==='.html'))await fs.writeFile(file,injectAnalytics(await fs.readFile(file,'utf8')))}
async function buildTool(tool,registry){let source=tool.sourceDir;const packageFile=path.join(source,'package.json');if(existsSync(packageFile)){const pkg=JSON.parse(readFileSync(packageFile,'utf8'));if(typeof pkg.scripts?.build==='string'){run(source,existsSync(path.join(source,'package-lock.json'))?['ci','--no-audit','--no-fund']:['install','--no-audit','--no-fund']);run(source,['run','build']);source=path.join(source,tool.buildOutputDir||'dist')}}if(!existsSync(path.join(source,tool.entry)))throw new Error(`TOOL_ENTRY_MISSING: ${tool.slug}/${tool.entry}`);const appRoot=path.join(STAGE,'tools',tool.slug,'app');await copyRuntime(source,appRoot);for(const file of (await listFiles(appRoot)).filter((candidate)=>path.extname(candidate).toLowerCase()==='.html'))await fs.writeFile(file,injectAnalytics(await fs.readFile(file,'utf8')));await writeFile(STAGE,`tools/${tool.slug}/index.html`,renderTool(registry,tool))}
function makePng(){const crc=(buffer)=>{let value=0xffffffff;for(const byte of buffer){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0)}return(value^0xffffffff)>>>0};const chunk=(type,data)=>{const name=Buffer.from(type);const output=Buffer.alloc(12+data.length);output.writeUInt32BE(data.length,0);name.copy(output,4);data.copy(output,8);output.writeUInt32BE(crc(Buffer.concat([name,data])),8+data.length);return output};const width=1200,height=630,row=Buffer.alloc(1+width*3);for(let x=0;x<width;x++){row[1+x*3]=14;row[2+x*3]=17;row[3+x*3]=22}const raw=Buffer.concat(Array.from({length:height},()=>row));const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))])}
const registry=await loadRegistry(ROOT,process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA||null);await fs.rm(STAGE,{recursive:true,force:true});await fs.mkdir(STAGE,{recursive:true});try{await Promise.all([fs.copyFile(path.join(ROOT,'src','app.js'),path.join(STAGE,'app.js')),fs.copyFile(path.join(ROOT,'src','styles.css'),path.join(STAGE,'styles.css'))]);await writeFile(STAGE,'analytics.js',renderAnalytics(registry));for(const tool of registry.publicTools)await buildTool(tool,registry);await writeFile(STAGE,'index.html',renderHub(registry));await writeFile(STAGE,'tools.json',stableJson(runtimeRegistry(registry)));for(const [file,content] of Object.entries(renderDiscovery(registry)))await writeFile(STAGE,file,content);await protectGeneratedAnalytics(STAGE);await fs.copyFile(path.join(ROOT,'public','_headers'),path.join(STAGE,'_headers'));await fs.mkdir(path.join(STAGE,'assets'),{recursive:true});await fs.writeFile(path.join(STAGE,'assets','tool-default-1200x630.png'),makePng());await writeFile(STAGE,'build-info.json',stableJson({schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),sourceRevision:registry.sourceRevision,publicToolCount:registry.publicTools.length}));await checkOutput(ROOT,STAGE,registry);await fs.rm(OUT,{recursive:true,force:true});await fs.rename(STAGE,OUT);console.log(`Build complete: publicTools=${registry.publicTools.length}`)}catch(error){await fs.rm(STAGE,{recursive:true,force:true});throw error}