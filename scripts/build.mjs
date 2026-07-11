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
import { loadRegistry, runtimeRegistry, renderHub, renderTool, renderDiscovery, writeFile, copyRuntime, checkOutput } from './lib/seo-core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.SEO_OUTPUT_DIR?path.resolve(ROOT,process.env.SEO_OUTPUT_DIR):path.join(ROOT,'dist');
const STAGE=path.join(path.dirname(OUT),`.${path.basename(OUT)}-stage-${process.pid}`);
const run=(cwd,args)=>{const r=spawnSync('npm',args,{cwd,stdio:'inherit',env:{...process.env,PUPPETEER_SKIP_DOWNLOAD:'true'}});if(r.status!==0)throw new Error(`npm ${args.join(' ')} failed in ${cwd}: exit=${r.status}`)};
const stable=(v)=>`${JSON.stringify(v,null,2)}\n`;

async function buildTool(tool){
  const packageFile=path.join(tool.sourceDir,'package.json');
  let source=tool.sourceDir;
  if(existsSync(packageFile)){
    const pkg=JSON.parse(readFileSync(packageFile,'utf8'));
    if(typeof pkg.scripts?.build==='string'){
      run(tool.sourceDir,existsSync(path.join(tool.sourceDir,'package-lock.json'))?['ci','--no-audit','--no-fund']:['install','--no-audit','--no-fund']);
      run(tool.sourceDir,['run','build']);
      source=path.join(tool.sourceDir,tool.buildOutputDir||'dist');
    }
  }
  const entry=path.join(source,tool.entry);
  if(!existsSync(entry))throw new Error(`TOOL_ENTRY_MISSING: ${tool.slug}/${tool.entry}`);
  await copyRuntime(source,path.join(STAGE,'tools',tool.slug,'app'));
  await writeFile(STAGE,`tools/${tool.slug}/index.html`,renderTool(registry,tool));
}

const registry=await loadRegistry(ROOT,process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA||null);
await fs.rm(STAGE,{recursive:true,force:true}); await fs.mkdir(STAGE,{recursive:true});
try{
  await Promise.all([fs.copyFile(path.join(ROOT,'src','app.js'),path.join(STAGE,'app.js')),fs.copyFile(path.join(ROOT,'src','styles.css'),path.join(STAGE,'styles.css'))]);
  for(const tool of registry.publicTools)await buildTool(tool);
  await writeFile(STAGE,'index.html',renderHub(registry));
  await writeFile(STAGE,'tools.json',stable(runtimeRegistry(registry)));
  for(const [file,content] of Object.entries(renderDiscovery(registry)))await writeFile(STAGE,file,content);
  await fs.copyFile(path.join(ROOT,'public','_headers'),path.join(STAGE,'_headers'));
  const crc=(buf)=>{let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0};
  const chunk=(type,data)=>{const t=Buffer.from(type);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),8+data.length);return out};
  const w=1200,h=630,row=Buffer.alloc(1+w*3);for(let x=0;x<w;x++){row[1+x*3]=14;row[2+x*3]=17;row[3+x*3]=22}const raw=Buffer.concat(Array.from({length:h},()=>row));const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);await fs.mkdir(path.join(STAGE,'assets'),{recursive:true});await fs.writeFile(path.join(STAGE,'assets','tool-default-1200x630.png'),png);
  await writeFile(STAGE,'build-info.json',stable({schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),sourceRevision:registry.sourceRevision,publicToolCount:registry.publicTools.length}));
  await checkOutput(ROOT,STAGE,registry);
  await fs.rm(OUT,{recursive:true,force:true}); await fs.rename(STAGE,OUT);
  console.log(`Build complete: publicTools=${registry.publicTools.length}`);
}catch(error){await fs.rm(STAGE,{recursive:true,force:true});throw error;}
