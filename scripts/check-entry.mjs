#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Execute source, registry, generated-output, and deterministic-build checks.
 * Inputs: command name, repository source, generated dist.
 * Outputs: exit status and precise validation result.
 * Safe edits: Add exact parsed checks.
 * Do not: Convert failures to warnings or use substring-only structured-data parity.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRegistry, checkOutput, hashTree, exists } from './lib/seo-core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIST=path.join(ROOT,'dist');
const mode=process.argv[2]||'seo';
const must=(v,m)=>{if(!v)throw new Error(m)};
const registry=await loadRegistry(ROOT);
if(mode==='source'){
  for(const f of ['AGENTS.md','EIC.md','AI_CODING_DOCTRINE.md','config/site.json','schema/site.schema.json','schema/tool.schema.json','functions/_middleware.ts','public/_headers'])must(await exists(path.join(ROOT,f)),`missing source contract: ${f}`);
  console.log(`Source check passed: tools=${registry.publicTools.length}`);
}else if(mode==='schema'||mode==='registry'){
  console.log(`${mode} check passed: tools=${registry.publicTools.length}`);
}else if(mode==='determinism'){
  const a=path.join(ROOT,'.determinism-a'),b=path.join(ROOT,'.determinism-b');
  for(const out of [a,b]){await fs.rm(out,{recursive:true,force:true});const r=spawnSync(process.execPath,[path.join(ROOT,'scripts','build.mjs')],{cwd:ROOT,stdio:'inherit',env:{...process.env,SEO_OUTPUT_DIR:out}});if(r.status!==0)throw new Error(`determinism build failed: ${r.status}`)}
  const [ha,hb]=await Promise.all([hashTree(a),hashTree(b)]);await fs.rm(a,{recursive:true,force:true});await fs.rm(b,{recursive:true,force:true});must(ha===hb,`determinism mismatch: ${ha} != ${hb}`);console.log(`Deterministic build passed: ${ha}`);
}else{
  must(await exists(DIST),'dist missing; run npm run build');
  const result=await checkOutput(ROOT,DIST,registry);
  console.log(`${mode} check passed: tools=${result.publicToolCount}`);
}
