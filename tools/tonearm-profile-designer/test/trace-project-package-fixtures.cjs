// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Shared test-only helpers that turn the committed contract fixtures into real package bytes.
 * Inputs: The merged v1 schemas and the golden positive/negative fixtures owned by the contract directory.
 * Outputs: ZIP bytes, synthetic read results, and patched fixture packages for the Tonearm import tests.
 * Safe edits: Additional fixture derivations that keep the contract directory authoritative.
 * Do not: Copy fixtures into this tool, relax a contract expectation, or use this helper from runtime code.
 * Verification: Consumed by the trace-project-package-*.test.cjs suites.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_DIR = path.join(REPOSITORY_ROOT, 'schema', 'trace-project-package');
const FIXTURE_DIR = path.join(REPOSITORY_ROOT, 'tools', 'manual-trace', 'test', 'trace-project-package');

require(path.join(REPOSITORY_ROOT, 'tools', 'manual-trace', 'trace-project-package.js'));
const packageRuntime = globalThis.EngroveTraceProjectPackage;

const schemas = {
    manifest: JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'manifest.schema.json'), 'utf8')),
    project: JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'project.schema.json'), 'utf8')),
    trace: JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'trace.schema.json'), 'utf8'))
};

// The golden fixtures declare digests over the contract oracle's serialization, which indents but does
// not reorder keys. Fixture bytes must therefore be produced exactly the same way.
function fixtureJsonBytes(value) {
    return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function entryBytes(entry) {
    if (entry.kind === 'json') return fixtureJsonBytes(entry.content);
    return Buffer.from(entry.content, entry.kind === 'base64' ? 'base64' : 'utf8');
}

function positiveFixture(name) {
    return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'positive', name + '.fixture.json'), 'utf8'));
}

function positiveFixtureNames() {
    return fs.readdirSync(path.join(FIXTURE_DIR, 'positive'))
        .filter(name => name.endsWith('.fixture.json'))
        .map(name => name.replace('.fixture.json', ''))
        .sort();
}

function negativeFixtures() {
    const set = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'negative-fixtures.json'), 'utf8'));
    return set.fixtures.map(descriptor => ({
        name: descriptor.name,
        expected: descriptor.expected,
        package: applyPatch(positiveFixture(descriptor.baseFixture).package, descriptor.patch)
    }));
}

function pointerTokens(pointer) {
    return pointer.split('/').slice(1).map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function applyPatch(document, operations) {
    const target = structuredClone(document);
    for (const operation of operations) {
        const tokens = pointerTokens(operation.path);
        const key = tokens.pop();
        const parent = tokens.reduce((value, token) => value[Array.isArray(value) ? Number(token) : token], target);
        const property = Array.isArray(parent) ? Number(key) : key;
        if (operation.op === 'remove') Array.isArray(parent) ? parent.splice(property, 1) : delete parent[property];
        else parent[property] = structuredClone(operation.value);
    }
    return target;
}

/**
 * Recomputes manifest size and digest metadata after a fixture mutation so a probe fails for the reason
 * it targets rather than for a stale checksum.
 */
function refreshDigests(pkg) {
    const { createHash } = require('node:crypto');
    for (const file of pkg.manifest.files) {
        const entry = pkg.entries[file.path];
        if (!entry) continue;
        const bytes = entryBytes(entry);
        file.sizeBytes = bytes.length;
        file.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
    return pkg;
}

/** Real STORE-method container bytes for a virtual fixture package. */
function zipFromFixture(pkg) {
    const ordered = [{ path: 'manifest.json', bytes: fixtureJsonBytes(pkg.manifest) }];
    for (const file of pkg.manifest.files) ordered.push({ path: file.path, bytes: entryBytes(pkg.entries[file.path]) });
    return packageRuntime.createDeterministicZip(ordered);
}

/**
 * Builds the reader-shaped result directly. Fixtures whose declared paths are unsafe cannot be written
 * by the deterministic ZIP writer, so validator-level cases bypass the container layer on purpose.
 */
function readResultFromFixture(pkg) {
    const entries = [{ path: 'manifest.json', bytes: fixtureJsonBytes(pkg.manifest) }];
    for (const entryPath of Object.keys(pkg.entries)) entries.push({ path: entryPath, bytes: entryBytes(pkg.entries[entryPath]) });
    return { ok: true, entries: entries, diagnostics: [] };
}

/**
 * Test-only STORE-method ZIP writer. Unlike the production exporter it enforces no path, uniqueness or
 * size rule, which is exactly what the reader's negative cases need in order to be reachable.
 */
function craftZip(entries) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const entry of entries) {
        const name = encoder.encode(entry.path);
        const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : Buffer.from(String(entry.bytes || ''), 'utf8');
        const crc = packageRuntime.crc32(bytes);
        const declaredCompressed = entry.compressedSize === undefined ? bytes.length : entry.compressedSize;
        const declaredUncompressed = entry.uncompressedSize === undefined ? bytes.length : entry.uncompressedSize;
        const method = entry.method === undefined ? 0 : entry.method;

        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(33, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(declaredCompressed, 18);
        local.writeUInt32LE(declaredUncompressed, 22);
        local.writeUInt16LE(name.length, 26);
        Buffer.from(name).copy(local, 30);
        locals.push(local, Buffer.from(bytes));

        const central = Buffer.alloc(46 + name.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(33, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(declaredCompressed, 20);
        central.writeUInt32LE(declaredUncompressed, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        Buffer.from(name).copy(central, 46);
        centrals.push(central);
        offset += local.length + bytes.length;
    }
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

module.exports = {
    craftZip,
    refreshDigests,
    REPOSITORY_ROOT,
    CONTRACT_DIR,
    FIXTURE_DIR,
    packageRuntime,
    schemas,
    fixtureJsonBytes,
    entryBytes,
    positiveFixture,
    positiveFixtureNames,
    negativeFixtures,
    applyPatch,
    zipFromFixture,
    readResultFromFixture
};
