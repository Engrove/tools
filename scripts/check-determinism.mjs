#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: build identical source twice and compare generated output byte-for-byte.
 * Inputs: committed repository source and package build command.
 * Outputs: exit 0 only when both generated dist trees are identical, excluding build-info.json.
 * Safe edits: exclusion list and deterministic hashing mechanics.
 * Do not: normalize differing bytes, ignore semantic files, or accept route-set drift.
 * Verification: npm run check:determinism.
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const excluded = new Set(['build-info.json']);

function runBuild() {
  const result = spawnSync('npm', ['run', 'build'], {cwd: root, stdio: 'inherit', env: process.env});
  if (result.status !== 0) throw new Error(`DETERMINISM_BUILD_FAILED: exit ${result.status}`);
}
async function files(dir, base=dir) {
  const output=[];
  for (const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const absolute=path.join(dir,entry.name);
    const relative=path.relative(base,absolute).split(path.sep).join('/');
    if (entry.isDirectory()) output.push(...await files(absolute,base));
    else if (entry.isFile() && !excluded.has(relative)) output.push(relative);
  }
  return output;
}
async function snapshot(dir) {
  const map=new Map();
  for (const relative of await files(dir)) {
    const bytes=await fs.readFile(path.join(dir,relative));
    map.set(relative,{size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return map;
}
function compare(a,b) {
  const names=[...new Set([...a.keys(),...b.keys()])].sort();
  const differences=[];
  for (const name of names) {
    const left=a.get(name); const right=b.get(name);
    if (!left || !right || left.size!==right.size || left.sha256!==right.sha256) differences.push({name,left,right});
  }
  return differences;
}

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'engrove-tools-determinism-'));
try {
  runBuild();
  const first=await snapshot(dist);
  await fs.cp(dist,path.join(temp,'first'),{recursive:true});
  runBuild();
  const second=await snapshot(dist);
  const differences=compare(first,second);
  if (differences.length) throw new Error(`DETERMINISTIC_BUILD_FAILED:\n${JSON.stringify(differences,null,2)}`);
  console.log(`DETERMINISTIC BUILD PASS: ${first.size} files are byte-identical.`);
} finally {
  await fs.rm(temp,{recursive:true,force:true});
}
