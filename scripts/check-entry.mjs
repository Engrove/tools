#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Execute source, governance, registry, generated-output, and deterministic-build checks.
 * Inputs: Command name, repository source, and generated dist.
 * Outputs: Exit status and precise validation result.
 * Safe edits: Add exact parsed checks and mandatory governance invariants.
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
const read=(relative)=>fs.readFile(path.join(ROOT,relative),'utf8');
const requireContains=(content,needle,label)=>requireValue(content.includes(needle),`${label}: missing ${JSON.stringify(needle)}`);
const registry=await loadRegistry(ROOT);

async function checkGovernance(){
  const canonicalPath='AI_VIBE_CODING_RULES.md';
  const skillPath='.agents/skills/ai-vibe-coding/SKILL.md';
  const metadataPath='.agents/skills/ai-vibe-coding/agents/openai.yaml';
  const bootstrapPaths=['AGENTS.md','EIC.md','AI_CODING_DOCTRINE.md','README.md','CLAUDE.md','GEMINI.md','.github/copilot-instructions.md','.cursor/rules/ai-vibe-coding.mdc','.windsurfrules',skillPath];
  const required=[canonicalPath,...bootstrapPaths,metadataPath];
  for(const file of required)requireValue(await exists(path.join(ROOT,file)),`missing AI governance contract: ${file}`);

  const canonical=await read(canonicalPath);
  requireValue(canonical.length>=30000,`${canonicalPath}: unexpectedly short or truncated`);
  requireContains(canonical,'# AI Vibe Coding – autonomt regelverk för kodande AI',canonicalPath);
  for(let section=1;section<=21;section++)requireContains(canonical,`## ${section}.`,canonicalPath);
  for(const token of ['VERIFIED','SUPPORTED','CANDIDATE','ASSUMPTION','BLOCKER','REJECTED','PASS_WITH_SCOPE','PARTIAL_PASS','NOT_TESTED','NOT_AVAILABLE','LOCAL_ONLY','BOUNDED_IMPACT','PARTIAL_IMPACT','UNKNOWN_IMPACT'])requireContains(canonical,`\`${token}\``,canonicalPath);
  requireContains(canonical,'Snabbhet, tokenanvändning och tokenoptimering är inte självständiga mål.',canonicalPath);
  requireContains(canonical,'Simulera aldrig framgång.',canonicalPath);

  for(const file of bootstrapPaths){
    const content=await read(file);
    requireContains(content,'AI_VIBE_CODING_RULES.md',file);
    requireContains(content,'AGENTS.md',file);
  }

  const agents=await read('AGENTS.md');
  for(const phrase of ['MODE: `AI_VIBE_MANDATORY`','SCOPE: repository root and all descendants','MUST NOT weaken','Never report an unqualified `PASS`'])requireContains(agents,phrase,'AGENTS.md');

  const skill=await read(skillPath);
  requireContains(skill,'name: ai-vibe-coding',skillPath);
  requireContains(skill,'Trigger for every task touching this repository',skillPath);
  requireContains(skill,'Read `AI_VIBE_CODING_RULES.md` completely',skillPath);

  const metadata=await read(metadataPath);
  requireContains(metadata,'display_name: "AI Vibe Coding Governance"',metadataPath);
  requireContains(metadata,'short_description:',metadataPath);
  console.log(`AI governance check passed: bootstraps=${bootstrapPaths.length}`);
}

if(mode==='source'){
  for(const file of ['AGENTS.md','EIC.md','AI_CODING_DOCTRINE.md','AI_VIBE_CODING_RULES.md','config/site.json','schema/site.schema.json','schema/tool.schema.json','functions/_middleware.ts','public/_headers'])requireValue(await exists(path.join(ROOT,file)),`missing source contract: ${file}`);
  await checkGovernance();
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
