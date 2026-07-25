// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Prove the bounded package reader accepts a well-formed container and blocks hostile ones.
 * Inputs: Contract fixture bytes and hand-crafted ZIP records with unsafe paths, bad limits, and corrupt payloads.
 * Outputs: Assertion failures or a scoped machine-readable summary.
 * Safe edits: Additional matched accept/block pairs for new container rules.
 * Do not: Assert a block without also proving the matching valid case is still accepted.
 * Verification: node test/trace-project-package-reader.test.cjs
 */
'use strict';

const assert = require('node:assert/strict');
const reader = require('../js/trace-project-package-reader.js');
const helpers = require('./trace-project-package-fixtures.cjs');

let assertions = 0;
function check(condition, message) {
    assert.ok(condition, message);
    assertions++;
}
function expectCode(result, code, message) {
    check(!result.ok, message + ' must be rejected');
    check(result.entries.length === 0, message + ' must yield no entries');
    check(result.diagnostics.some(item => item.code === code), message + ' must report ' + code + ' (got ' + result.diagnostics.map(item => item.code).join(',') + ')');
}

// ---- positive: a real deterministic container round-trips ----
const valid = helpers.zipFromFixture(helpers.positiveFixture('minimal-top-side-project').package);
const read = reader.readPackage(valid, {});
check(read.ok, 'a valid deterministic package must be accepted');
check(read.entries[0].path === 'manifest.json', 'manifest.json must be the first entry');
check(read.entries.length === 4, 'the minimal fixture must expose four entries');
check(read.entries.every(entry => entry.bytes instanceof Uint8Array && entry.bytes.byteLength > 0), 'every entry must carry bytes');

// ---- container-level negatives ----
expectCode(reader.readPackage(new Uint8Array(4), {}), 'PACKAGE_ZIP_INVALID', 'a truncated archive');
expectCode(reader.readPackage(valid.slice(0, valid.length - 8), {}), 'PACKAGE_ZIP_INVALID', 'an archive without an end record');
expectCode(reader.readPackage(valid, { limits: { maxArchiveBytes: 32 } }), 'PACKAGE_TOTAL_SIZE_EXCEEDED', 'an archive over the byte limit');
expectCode(reader.readPackage(valid, { limits: { maxFileCount: 1 } }), 'PACKAGE_ENTRY_LIMIT_EXCEEDED', 'an archive over the entry-count limit');
expectCode(reader.readPackage(valid, { limits: { maxIndividualFileBytes: 16 } }), 'PACKAGE_ENTRY_SIZE_EXCEEDED', 'an entry over the individual size limit');
expectCode(reader.readPackage(valid, { limits: { maxTotalUncompressedBytes: 200 } }), 'PACKAGE_TOTAL_SIZE_EXCEEDED', 'a payload over the total size limit');
expectCode(reader.readPackage(valid, { limits: { maxCompressionRatio: -1 } }), 'PACKAGE_LIMIT_INVALID', 'a non-positive limit');

// A corrupted payload byte must fail the CRC gate before any consumer sees content.
const corrupted = Uint8Array.from(valid);
corrupted[120] = corrupted[120] ^ 0xff;
expectCode(reader.readPackage(corrupted, {}), 'PACKAGE_ZIP_CRC_MISMATCH', 'a payload with a flipped byte');

// ---- path safety, asserted directly and through crafted containers ----
const unsafePaths = [
    ['../escape.json', 'parent traversal'],
    ['/absolute.json', 'an absolute path'],
    ['C:/windows.json', 'a drive-letter path'],
    ['nested\\backslash.json', 'a backslash separator'],
    ['https://host/remote.json', 'a URL-shaped path'],
    ['payload.js', 'an executable extension'],
    ['bad\u0000name.json', 'a control character']
];
for (const item of unsafePaths) {
    check(reader.unsafePathReason(item[0]) !== null, item[1] + ' must be reported unsafe');
}
check(reader.unsafePathReason('traces/trace-top.json') === null, 'a canonical trace path must be safe');
check(reader.unsafePathReason('assets/images/top.png') === null, 'a canonical asset path must be safe');

// Crafted containers exercise the rules the production writer refuses to produce.
const payload = Buffer.from('{"ok":true}\n', 'utf8');
const craft = paths => helpers.craftZip(paths.map(item => ({ path: item, bytes: payload })));

check(reader.readPackage(craft(['manifest.json', 'traces/trace-top.json']), {}).ok, 'a crafted container with safe unique paths must be accepted');
expectCode(reader.readPackage(craft(['manifest.json', '../escape.json']), {}), 'PACKAGE_ZIP_PATH_UNSAFE', 'a container entry that traverses upward');
expectCode(reader.readPackage(craft(['manifest.json', '/absolute.json']), {}), 'PACKAGE_ZIP_PATH_UNSAFE', 'a container entry with an absolute path');
expectCode(reader.readPackage(craft(['manifest.json', 'nested\\backslash.json']), {}), 'PACKAGE_ZIP_PATH_UNSAFE', 'a container entry with a backslash');
expectCode(reader.readPackage(craft(['manifest.json', 'payload.js']), {}), 'PACKAGE_ZIP_PATH_UNSAFE', 'a container entry declaring executable content');
expectCode(reader.readPackage(craft(['manifest.json', 'C:/windows.json']), {}), 'PACKAGE_ZIP_PATH_UNSAFE', 'a container entry with a drive letter');
expectCode(reader.readPackage(craft(['manifest.json', 'traces/a.json', 'traces/a.json']), {}), 'PACKAGE_ZIP_DUPLICATE_PATH', 'a container with a repeated exact path');
expectCode(reader.readPackage(craft(['manifest.json', 'traces/Alpha.json', 'traces/alpha.json']), {}), 'PACKAGE_ZIP_DUPLICATE_PATH', 'a container with a case-normalization collision');
expectCode(reader.readPackage(craft(Array.from({ length: 300 }, (unused, index) => 'traces/entry-' + index + '.json')), {}), 'PACKAGE_ENTRY_LIMIT_EXCEEDED', 'a container over the default entry-count limit');
expectCode(
    reader.readPackage(helpers.craftZip([{ path: 'manifest.json', bytes: payload, method: 8 }]), {}),
    'PACKAGE_ZIP_METHOD_UNSUPPORTED',
    'a crafted DEFLATE entry'
);
expectCode(
    reader.readPackage(helpers.craftZip([{ path: 'manifest.json', bytes: payload, method: 8, compressedSize: 4, uncompressedSize: 4000000 }]), {}),
    'PACKAGE_COMPRESSION_RATIO_EXCEEDED',
    'a crafted entry declaring a bomb-like ratio'
);

expectCode(
    reader.readPackage(helpers.craftZip([{ path: 'manifest.json', bytes: payload, compressedSize: payload.length, uncompressedSize: payload.length * 2 }]), {}),
    'PACKAGE_ZIP_INVALID',
    'a STORE entry with unequal declared sizes inside the ratio limit'
);

// The ratio gate must run before the unsupported-method gate so a bomb is rejected by arithmetic
// rather than by first observing the expansion.
const bomb = reader.readPackage(helpers.craftZip([{ path: 'manifest.json', bytes: payload, method: 8, compressedSize: 4, uncompressedSize: 4000000 }]), {});
check(bomb.diagnostics[0].code === 'PACKAGE_COMPRESSION_RATIO_EXCEEDED', 'the ratio gate must precede the method gate');

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'trace-project-package-reader', assertions: assertions }, null, 2));
