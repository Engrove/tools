// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Read a hostile `.engrove-trace-project` ZIP container into bounded, path-safe, integrity-checked byte entries.
 * Inputs: Untrusted archive bytes plus optional explicit limits.
 * Outputs: Ordered `{path, bytes}` entries or stable PACKAGE_* diagnostics; never partial entries on failure.
 * Safe edits: Container parsing, path normalization, bound enforcement, and additional fail-closed diagnostics.
 * Do not: Extract to a filesystem, inflate before the ratio gate, accept non-STORE payload bytes, or return entries alongside errors.
 * Verification: test/trace-project-package-reader.test.cjs.
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TraceProjectPackageReader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const LOCAL_SIGNATURE = 0x04034b50;
    const CENTRAL_SIGNATURE = 0x02014b50;
    const END_SIGNATURE = 0x06054b50;
    const END_RECORD_BYTES = 22;
    const METHOD_STORE = 0;
    const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?![A-Za-z]:[\\/])(?!https?:\/\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
    const EXECUTABLE_EXT = /\.(?:js|mjs|cjs|html?|wasm|exe|dll|sh|bat|cmd|ps1)$/i;

    // Mirrors EngroveTraceProjectPackage.DEFAULT_LIMITS so exporter and importer share one bound set.
    const DEFAULT_LIMITS = Object.freeze({
        maxArchiveBytes: 67108864,
        maxFileCount: 256,
        maxTotalUncompressedBytes: 134217728,
        maxIndividualFileBytes: 67108864,
        maxCompressionRatio: 100
    });

    const CRC_TABLE = (function() {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index++) {
            let value = index;
            for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
            table[index] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let value = 0xffffffff;
        for (let index = 0; index < bytes.length; index++) value = CRC_TABLE[(value ^ bytes[index]) & 255] ^ (value >>> 8);
        return (value ^ 0xffffffff) >>> 0;
    }

    function diagnostic(code, message, path) {
        const item = { code: String(code), message: String(message) };
        if (path !== undefined) item.path = String(path);
        return item;
    }

    function toBytes(input) {
        if (input instanceof Uint8Array) return input;
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        return null;
    }

    function limitsFrom(options) {
        const merged = Object.assign({}, DEFAULT_LIMITS, (options && options.limits) || {});
        for (const key of Object.keys(DEFAULT_LIMITS)) {
            if (!Number.isFinite(merged[key]) || merged[key] <= 0) return null;
        }
        return merged;
    }

    function findEndRecord(view, length) {
        const earliest = Math.max(0, length - END_RECORD_BYTES - 0xffff);
        for (let offset = length - END_RECORD_BYTES; offset >= earliest; offset--) {
            if (view.getUint32(offset, true) !== END_SIGNATURE) continue;
            const commentLength = view.getUint16(offset + 20, true);
            if (offset + END_RECORD_BYTES + commentLength === length) return offset;
        }
        return -1;
    }

    /**
     * Decodes a stored name strictly as UTF-8. A ZIP name is attacker-controlled, so lone surrogates
     * and other invalid sequences must fail rather than become replacement characters that could
     * normalize into an already-claimed path.
     */
    function decodeName(bytes) {
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (error) {
            return null;
        }
    }

    function unsafePathReason(path) {
        if (typeof path !== 'string' || !path) return 'path is empty';
        if (path.includes('\\')) return 'path contains a backslash separator';
        if (/[\u0000-\u001f\u007f]/.test(path)) return 'path contains control characters';
        if (path !== path.normalize('NFC')) return 'path is not NFC-normalized';
        if (!SAFE_PATH.test(path)) return 'path is absolute, traversing, or uses unsupported characters';
        if (EXECUTABLE_EXT.test(path)) return 'path declares executable content';
        return null;
    }

    function readCentralDirectory(view, bytes, end, limits, errors) {
        const total = view.getUint16(end + 10, true);
        const size = view.getUint32(end + 12, true);
        const offset = view.getUint32(end + 16, true);
        if (total > limits.maxFileCount) {
            errors.push(diagnostic('PACKAGE_ENTRY_LIMIT_EXCEEDED', 'Package declares ' + total + ' entries; the limit is ' + limits.maxFileCount + '.'));
            return null;
        }
        if (offset + size > bytes.length) {
            errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'Central directory extends past the end of the archive.'));
            return null;
        }
        const records = [];
        let cursor = offset;
        for (let index = 0; index < total; index++) {
            if (cursor + 46 > offset + size || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
                errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'Central directory record ' + index + ' is malformed.'));
                return null;
            }
            const nameLength = view.getUint16(cursor + 28, true);
            const extraLength = view.getUint16(cursor + 30, true);
            const commentLength = view.getUint16(cursor + 32, true);
            const record = {
                method: view.getUint16(cursor + 10, true),
                crc32: view.getUint32(cursor + 16, true),
                compressedSize: view.getUint32(cursor + 20, true),
                uncompressedSize: view.getUint32(cursor + 24, true),
                localOffset: view.getUint32(cursor + 42, true),
                nameBytes: bytes.subarray(cursor + 46, cursor + 46 + nameLength)
            };
            if (cursor + 46 + nameLength + extraLength + commentLength > offset + size) {
                errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'Central directory record ' + index + ' overruns the directory.'));
                return null;
            }
            records.push(record);
            cursor += 46 + nameLength + extraLength + commentLength;
        }
        return records;
    }

    function claimPath(record, index, seenExact, seenNormalized, errors) {
        const path = decodeName(record.nameBytes);
        if (path === null) {
            errors.push(diagnostic('PACKAGE_ZIP_PATH_UNSAFE', 'Entry ' + index + ' has a name that is not valid UTF-8.'));
            return null;
        }
        const reason = unsafePathReason(path);
        if (reason) {
            errors.push(diagnostic('PACKAGE_ZIP_PATH_UNSAFE', 'Rejected package path: ' + reason + '.', path));
            return null;
        }
        if (seenExact.has(path)) {
            errors.push(diagnostic('PACKAGE_ZIP_DUPLICATE_PATH', 'Duplicate package path.', path));
            return null;
        }
        seenExact.add(path);
        const normalized = path.normalize('NFC').toLowerCase();
        if (seenNormalized.has(normalized)) {
            errors.push(diagnostic('PACKAGE_ZIP_DUPLICATE_PATH', 'Normalized path collision with ' + seenNormalized.get(normalized) + '.', path));
            return null;
        }
        seenNormalized.set(normalized, path);
        return path;
    }

    /**
     * The ratio gate runs on declared header sizes before any payload is touched, so a decompression
     * bomb is rejected by arithmetic rather than by observing the expansion.
     */
    function checkDeclaredSizes(record, path, limits, errors) {
        if (record.uncompressedSize > limits.maxIndividualFileBytes) {
            errors.push(diagnostic('PACKAGE_ENTRY_SIZE_EXCEEDED', 'Entry declares ' + record.uncompressedSize + ' bytes; the limit is ' + limits.maxIndividualFileBytes + '.', path));
            return false;
        }
        const ratio = record.compressedSize === 0 ? (record.uncompressedSize ? Infinity : 1) : record.uncompressedSize / record.compressedSize;
        if (ratio > limits.maxCompressionRatio) {
            errors.push(diagnostic('PACKAGE_COMPRESSION_RATIO_EXCEEDED', 'Entry declares compression ratio ' + ratio + '; the limit is ' + limits.maxCompressionRatio + '.', path));
            return false;
        }
        if (record.method !== METHOD_STORE) {
            errors.push(diagnostic('PACKAGE_ZIP_METHOD_UNSUPPORTED', 'Entry uses ZIP method ' + record.method + '; only STORE is accepted.', path));
            return false;
        }
        if (record.compressedSize !== record.uncompressedSize) {
            errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'STORE entry declares unequal compressed and uncompressed sizes.', path));
            return false;
        }
        return true;
    }

    function sliceEntry(view, bytes, record, path, errors) {
        const local = record.localOffset;
        if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL_SIGNATURE) {
            errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'Local header is missing or malformed.', path));
            return null;
        }
        if (view.getUint16(local + 6, true) & 0x0008) {
            errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'Data descriptors are not supported by the deterministic container.', path));
            return null;
        }
        if (view.getUint16(local + 8, true) !== METHOD_STORE) {
            errors.push(diagnostic('PACKAGE_ZIP_METHOD_UNSUPPORTED', 'Local header declares a non-STORE method.', path));
            return null;
        }
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const stop = start + record.uncompressedSize;
        if (stop > bytes.length) {
            errors.push(diagnostic('PACKAGE_ZIP_INVALID', 'Entry payload extends past the end of the archive.', path));
            return null;
        }
        const payload = bytes.subarray(start, stop);
        if (crc32(payload) !== record.crc32) {
            errors.push(diagnostic('PACKAGE_ZIP_CRC_MISMATCH', 'Entry payload does not match its declared CRC-32.', path));
            return null;
        }
        return payload;
    }

    /**
     * Reads the container fail-closed: any diagnostic suppresses every entry so a caller can never
     * consume a partially trusted archive.
     */
    function readPackage(input, options) {
        const errors = [];
        const limits = limitsFrom(options);
        if (!limits) return { ok: false, entries: [], diagnostics: [diagnostic('PACKAGE_LIMIT_INVALID', 'Package reader limits must be finite positive numbers.')] };
        const bytes = toBytes(input);
        if (!bytes || bytes.length < END_RECORD_BYTES) {
            return { ok: false, entries: [], diagnostics: [diagnostic('PACKAGE_ZIP_INVALID', 'Package bytes are missing or too short to be a ZIP container.')] };
        }
        if (bytes.length > limits.maxArchiveBytes) {
            return { ok: false, entries: [], diagnostics: [diagnostic('PACKAGE_TOTAL_SIZE_EXCEEDED', 'Archive is ' + bytes.length + ' bytes; the limit is ' + limits.maxArchiveBytes + '.')] };
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const end = findEndRecord(view, bytes.length);
        if (end < 0) return { ok: false, entries: [], diagnostics: [diagnostic('PACKAGE_ZIP_INVALID', 'End of central directory record was not found.')] };

        const records = readCentralDirectory(view, bytes, end, limits, errors);
        if (!records) return { ok: false, entries: [], diagnostics: errors };

        const seenExact = new Set();
        const seenNormalized = new Map();
        const entries = [];
        let total = 0;
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const path = claimPath(record, index, seenExact, seenNormalized, errors);
            if (path === null) continue;
            if (!checkDeclaredSizes(record, path, limits, errors)) continue;
            total += record.uncompressedSize;
            if (total > limits.maxTotalUncompressedBytes) {
                errors.push(diagnostic('PACKAGE_TOTAL_SIZE_EXCEEDED', 'Total payload exceeds ' + limits.maxTotalUncompressedBytes + ' bytes.', path));
                break;
            }
            const payload = sliceEntry(view, bytes, record, path, errors);
            if (payload === null) continue;
            entries.push({ path: path, bytes: payload });
        }
        if (errors.length) return { ok: false, entries: [], diagnostics: errors };
        return { ok: true, entries: entries, diagnostics: [], totalUncompressedBytes: total };
    }

    return Object.freeze({
        DEFAULT_LIMITS: DEFAULT_LIMITS,
        crc32: crc32,
        unsafePathReason: unsafePathReason,
        readPackage: readPackage
    });
});
