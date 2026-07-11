/**
 * AI-CODING NOTE:
 * Responsibility: Discover and execute declared npm test commands for public registry tools.
 * Inputs: Normalized public tool records, package manifests, filesystem access, and an injected process runner.
 * Outputs: Deterministic per-tool classifications and an aggregate PASS or FAIL summary.
 * Safe edits: Tool-test discovery, deterministic dependency preparation, process-result classification, and summary shaping.
 * Do not: Hardcode tool slugs, reinterpret failing tests as skips, or mutate tool manifests.
 * Verification: node --test test/tool-test-runner.test.mjs && npm run check:tools.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NOT_APPLICABLE = 'NOT_APPLICABLE';
const PASSED = 'PASSED';
const FAILED = 'FAILED';

const hasOwnDependencies = (manifest) =>
  ['dependencies', 'devDependencies', 'optionalDependencies'].some((key) =>
    manifest[key] && typeof manifest[key] === 'object' && Object.keys(manifest[key]).length > 0
  );

export function defaultProcessRunner({ cwd, args, env }) {
  return spawnSync('npm', args, { cwd, env, stdio: 'inherit' });
}

export async function evaluateTool(tool, { processRunner = defaultProcessRunner, environment = process.env } = {}) {
  const sourceDir = tool?.sourceDir;
  const base = {
    slug: tool?.slug ?? null,
    sourceDirectory: sourceDir ?? null,
    classification: FAILED,
    testCommand: null,
    exitStatus: null
  };

  if (typeof tool?.slug !== 'string' || !tool.slug || typeof sourceDir !== 'string' || !sourceDir) {
    return { ...base, error: 'registry tool requires non-empty slug and sourceDir' };
  }

  const packagePath = path.join(sourceDir, 'package.json');
  let packageText;
  try {
    packageText = await fs.readFile(packagePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...base, classification: NOT_APPLICABLE };
    return { ...base, error: `package.json read failed: ${error?.message ?? String(error)}` };
  }

  let manifest;
  try {
    manifest = JSON.parse(packageText);
  } catch (error) {
    return { ...base, error: `package.json parse failed: ${error?.message ?? String(error)}` };
  }

  const testCommand = typeof manifest.scripts?.test === 'string' ? manifest.scripts.test.trim() : '';
  if (!testCommand) return { ...base, classification: NOT_APPLICABLE };

  base.testCommand = testCommand;
  const lockPath = path.join(sourceDir, 'package-lock.json');
  let hasLockfile = false;
  try {
    const stat = await fs.stat(lockPath);
    hasLockfile = stat.isFile();
  } catch (error) {
    if (error?.code !== 'ENOENT') return { ...base, error: `package-lock.json inspection failed: ${error?.message ?? String(error)}` };
  }

  if (hasOwnDependencies(manifest) && !hasLockfile) {
    return { ...base, error: 'testable tool declares dependencies without package-lock.json' };
  }

  const env = { ...environment, PUPPETEER_SKIP_DOWNLOAD: 'true' };
  if (hasLockfile) {
    const install = processRunner({ cwd: sourceDir, args: ['ci', '--no-audit', '--no-fund'], env, phase: 'install', tool });
    if (!install || install.signal || !Number.isInteger(install.status) || install.status !== 0) {
      return {
        ...base,
        error: install?.signal
          ? `npm ci terminated by signal ${install.signal}`
          : `npm ci failed with exit status ${install?.status ?? 'unknown'}`
      };
    }
  }

  const result = processRunner({ cwd: sourceDir, args: ['test'], env, phase: 'test', tool });
  if (!result || result.signal || !Number.isInteger(result.status)) {
    return {
      ...base,
      error: result?.signal
        ? `npm test terminated by signal ${result.signal}`
        : 'npm test returned unknown exit status'
    };
  }

  return {
    ...base,
    classification: result.status === 0 ? PASSED : FAILED,
    exitStatus: result.status,
    ...(result.status === 0 ? {} : { error: `npm test failed with exit status ${result.status}` })
  };
}

export async function runPublicToolTests(publicTools, options = {}) {
  if (!Array.isArray(publicTools)) throw new TypeError('publicTools must be an array');
  const tools = [...publicTools].sort((a, b) => String(a?.slug ?? '').localeCompare(String(b?.slug ?? '')));
  const results = [];
  for (const tool of tools) results.push(await evaluateTool(tool, options));

  const testable = results.filter((result) => result.classification !== NOT_APPLICABLE);
  const passed = results.filter((result) => result.classification === PASSED).length;
  const failed = results.filter((result) => result.classification === FAILED).length;
  const notApplicable = results.filter((result) => result.classification === NOT_APPLICABLE).length;

  return {
    status: failed === 0 ? 'PASS' : 'FAIL',
    publicTools: results.length,
    testableTools: testable.length,
    passed,
    failed,
    notApplicable,
    tools: results
  };
}

export const classifications = Object.freeze({ NOT_APPLICABLE, PASSED, FAILED });
