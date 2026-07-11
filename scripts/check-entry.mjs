#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Execute source, registry, generated-output, and deterministic-build checks.
 * Inputs: Command name, repository source, and generated dist.
 * Outputs: Exit status and precise validation result.
 * Safe edits: Add exact parsed checks.
 * Do not: Convert failures to warnings or use substring-only structured-data parity.
 * Verification: npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRegistry, exists } from './lib/registry.mjs';
import { checkOutput, hashTree } from './lib/verify.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIST=path.join(ROOT,'dist');
const mode=process.argv[2]||'seo';
const requireValue=(value,message)=>{if(!value)throw new Error(message)};
const registry=await loadRegistry(ROOT);
if(mode==='source'){
  for(const file of ['AGENTS.md','EIC.md','AI_CODING_DOCTRINE.md','config/site.json','schema/site.schema.json','schema/tool.schema.json','functions/_middleware.ts','public/_headers'])requireValue(await exists(path.join(ROOT,file)),`missing source contract: ${file}`);
  console.log(`Source check passed: tools=${registry.publicTools.length}`);
}else if(mode==='schema'||mode==='registry'){
  console.log(`${mode} check passed: tools=${registry.publicTools.length}`);
}else if(mode==='determinism'){
  const outputs=[path.join(ROOT,'.determinism-a'),path.join(ROOT,'.determinism-b')];
  for(const output of outputs){await fs.rm(output,{recursive:true,force:true});const result=spawnSync(process.execPath,[path.join(ROOT,'scripts','build.mjs')],{cwd:ROOT,stdio:'inherit',env:{...process.env,SEO_OUTPUT_DIR:output}});if(result.status!==0)throw new Error(`determinism build failed: ${result.status}`)}
  const hashes=await Promise.all(outputs.map((output)=>hashTree(output)));for(const output of outputs)await fs.rm(output,{recursive:true,force:true});requireValue(hashes[0]===hashes[1],`determinism mismatch: ${hashes.join(' != ')}`);console.log(`Deterministic build passed: ${hashes[0]}`);
}else{
  requireValue(await exists(DIST),'dist missing; run npm run build');const result=await checkOutput(ROOT,DIST,registry);console.log(`${mode} check passed: tools=${result.publicToolCount}`);
}
