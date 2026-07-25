// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate a read `.engrove-trace-project` payload against the merged v1 schemas and the contract's semantic invariants.
 * Inputs: Path-safe byte entries from TraceProjectPackageReader plus the canonical manifest/project/trace schemas.
 * Outputs: Stable PACKAGE_* diagnostics, contract warnings, and parsed documents only when every check passes.
 * Safe edits: Additional contract rules paired with matched positive and negative fixtures.
 * Do not: Weaken a rule to admit a payload, resolve a reference by array order or first match, or treat digest agreement as SVG safety.
 * Verification: test/trace-project-package-validator.test.cjs.
 *
 * ADR-0001 splits the contract between JSON Schema and a semantic validator. This module owns the first
 * half - container integrity, document parsing and structural schema evaluation - and delegates the
 * second to trace-project-package-semantics.js.
 *
 * The JSON Schema subset evaluator below is intentionally local. Tools in this repository are built
 * and deployed in isolation, so the tonearm runtime cannot import the Manual Trace exporter's copy.
 * The canonical schemas in schema/trace-project-package/ remain the single source of contract truth;
 * only the generic evaluation of those documents is restated here.
 */
(function(root, factory) {
    'use strict';
    const api = factory(
        typeof require === 'function' && typeof module === 'object' ? require('./trace-project-package-semantics.js') : root.TraceProjectPackageSemantics
    );
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TraceProjectPackageValidator = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function(semantics) {
    'use strict';

    const MANIFEST_PATH = 'manifest.json';
    const SUPPORTED_MAJOR = '1';
    const SHA256_HEX = /^[a-f0-9]{64}$/;
    // Manifest declarations are untrusted independently of the container, so path safety is asserted
    // here as well as in the reader. A manifest may name a path that never appears as an entry.
    const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?![A-Za-z]:[\\/])(?!https?:\/\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
    const EXECUTABLE_EXT = /\.(?:js|mjs|cjs|html?|wasm|exe|dll|sh|bat|cmd|ps1)$/i;
    const SVG_ACTIVE = /<\s*(?:script|foreignObject|iframe|object|embed|use|set|animate[A-Za-z]*)\b/i;
    const SVG_HANDLER = /\son[a-z]+\s*=/i;
    const SVG_ENTITY = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
    const SVG_EXTERNAL_REF = /(?:xlink:)?href\s*=\s*(["'])\s*(?!#)(?!data:image\/)[^"']*\1/i;
    const SVG_EXTERNAL_URL = /url\s*\(\s*(?!#)/i;
    const SVG_SCRIPT_URL = /(?:javascript|vbscript)\s*:/i;

    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const diagnostic = semantics.diagnostic;
    const compareCodeUnits = semantics.compareCodeUnits;

    // ---- JSON Schema subset -------------------------------------------------

    function resolvePointer(rootSchema, reference) {
        if (!String(reference).startsWith('#/')) return null;
        return String(reference).slice(2).split('/').reduce(
            (node, token) => (node ? node[token.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined),
            rootSchema
        );
    }

    function typeMatches(value, type) {
        if (type === 'null') return value === null;
        if (type === 'array') return Array.isArray(value);
        if (type === 'object') return isRecord(value);
        if (type === 'integer') return Number.isInteger(value);
        if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
        return typeof value === type;
    }

    function schemaErrors(value, schema, rootSchema, path) {
        if (!schema || typeof schema !== 'object') return [];
        if (schema.$ref) {
            const resolved = resolvePointer(rootSchema, schema.$ref);
            return resolved ? schemaErrors(value, resolved, rootSchema, path) : [path + ': unresolved $ref'];
        }
        const errors = [];
        const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        if (schema.allOf) schema.allOf.forEach(item => errors.push(...schemaErrors(value, item, rootSchema, path)));
        if (schema.anyOf && !schema.anyOf.some(item => schemaErrors(value, item, rootSchema, path).length === 0)) errors.push(path + ': anyOf');
        if (schema.oneOf) {
            const matched = schema.oneOf.filter(item => schemaErrors(value, item, rootSchema, path).length === 0).length;
            if (matched !== 1) errors.push(path + ': oneOf matched ' + matched);
        }
        if (schema.not && schemaErrors(value, schema.not, rootSchema, path).length === 0) errors.push(path + ': not');
        if (schema.const !== undefined && !equal(value, schema.const)) errors.push(path + ': const');
        if (schema.enum && !schema.enum.some(item => equal(item, value))) errors.push(path + ': enum');
        if (schema.type) {
            const types = Array.isArray(schema.type) ? schema.type : [schema.type];
            if (!types.some(type => typeMatches(value, type))) return errors.concat([path + ': expected ' + types.join('|')]);
        }
        if (typeof value === 'string') {
            if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(path + ': minLength');
            if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(path + ': maxLength');
            if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(path + ': pattern');
            if (schema.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value)))) errors.push(path + ': date-time');
        }
        if (typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum) errors.push(path + ': minimum');
            if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(path + ': exclusiveMinimum');
        }
        if (Array.isArray(value)) {
            if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(path + ': minItems');
            if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(path + ': maxItems');
            if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) errors.push(path + ': uniqueItems');
            if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, rootSchema, path + '[' + index + ']')));
            if (schema.contains) {
                const count = value.filter(item => schemaErrors(item, schema.contains, rootSchema, path).length === 0).length;
                if (count < (schema.minContains === undefined ? 1 : schema.minContains) || count > (schema.maxContains === undefined ? Infinity : schema.maxContains)) errors.push(path + ': contains ' + count);
            }
        }
        if (isRecord(value)) {
            (schema.required || []).forEach(key => { if (!(key in value)) errors.push(path + '.' + key + ': required'); });
            const properties = schema.properties || {};
            if (schema.additionalProperties === false) Object.keys(value).forEach(key => { if (!(key in properties)) errors.push(path + '.' + key + ': additional'); });
            Object.keys(properties).forEach(key => { if (key in value) errors.push(...schemaErrors(value[key], properties[key], rootSchema, path + '.' + key)); });
        }
        return errors;
    }

    // ---- integrity ----------------------------------------------------------

    async function sha256Hex(bytes) {
        const subtle = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
        if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
        const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const copy = new Uint8Array(view.byteLength);
        copy.set(view);
        const digest = await subtle.digest('SHA-256', copy);
        return Array.from(new Uint8Array(digest)).map(item => item.toString(16).padStart(2, '0')).join('');
    }

    function parseJsonEntry(entry, errors) {
        let text;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
        } catch (error) {
            errors.push(diagnostic('PACKAGE_JSON_INVALID', 'Entry is not valid UTF-8 text.', entry.path));
            return undefined;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            errors.push(diagnostic('PACKAGE_JSON_INVALID', 'Entry is not parseable JSON: ' + error.message, entry.path));
            return undefined;
        }
    }

    async function checkInventory(entries, manifest, errors) {
        const byPath = new Map(entries.map(entry => [entry.path, entry]));
        const declared = Array.isArray(manifest.files) ? manifest.files : [];
        const claimed = new Set();
        for (let index = 0; index < declared.length; index++) {
            const file = declared[index];
            const at = 'manifest.files[' + index + ']';
            if (!isRecord(file) || typeof file.path !== 'string' || !file.path) {
                errors.push(diagnostic('PACKAGE_SCHEMA_INVALID', 'Manifest file record is malformed.', at, 'MALFORMED_RECORD'));
                continue;
            }
            if (file.path === MANIFEST_PATH) {
                errors.push(diagnostic('PACKAGE_MANIFEST_SELF_INVENTORY', 'manifest.json must not appear in manifest.files[].', at, 'MANIFEST_SELF_INVENTORY'));
                continue;
            }
            if (!SAFE_PATH.test(file.path) || file.path.includes('\\') || EXECUTABLE_EXT.test(file.path)) {
                errors.push(diagnostic('PACKAGE_ZIP_PATH_UNSAFE', 'Manifest declares an unsafe package path.', at, 'UNSAFE_PATH'));
                continue;
            }
            if (claimed.has(file.path)) {
                errors.push(diagnostic('PACKAGE_ZIP_DUPLICATE_PATH', 'Manifest declares the same path twice.', at, 'DUPLICATE_PATH'));
                continue;
            }
            claimed.add(file.path);
            const entry = byPath.get(file.path);
            if (!entry) {
                errors.push(diagnostic('PACKAGE_ENTRY_MISSING', 'Declared file is absent from the container.', file.path, 'DECLARED_FILE_MISSING'));
                continue;
            }
            if (entry.bytes.byteLength !== file.sizeBytes) {
                errors.push(diagnostic('PACKAGE_SIZE_MISMATCH', 'Entry is ' + entry.bytes.byteLength + ' bytes; the manifest declares ' + file.sizeBytes + '.', file.path, 'SIZE_MISMATCH'));
                continue;
            }
            if (!SHA256_HEX.test(String(file.sha256 || ''))) {
                errors.push(diagnostic('PACKAGE_DIGEST_MISMATCH', 'Manifest declares a malformed SHA-256 digest.', file.path, 'CHECKSUM_FORMAT'));
                continue;
            }
            if (await sha256Hex(entry.bytes) !== file.sha256) {
                errors.push(diagnostic('PACKAGE_DIGEST_MISMATCH', 'Entry content does not match its declared SHA-256 digest.', file.path, 'CHECKSUM_MISMATCH'));
            }
        }
        for (const entry of entries) {
            if (entry.path === MANIFEST_PATH || claimed.has(entry.path)) continue;
            errors.push(diagnostic('PACKAGE_ENTRY_UNDECLARED', 'Container entry is absent from the manifest inventory.', entry.path, 'UNDECLARED_FILE'));
        }
        return byPath;
    }

    function checkSvgAssets(entries, manifest, errors) {
        const svgPaths = new Set((manifest.files || [])
            .filter(file => isRecord(file) && file.mediaType === 'image/svg+xml')
            .map(file => file.path));
        for (const entry of entries) {
            if (!svgPaths.has(entry.path)) continue;
            let text;
            try {
                text = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
            } catch (error) {
                errors.push(diagnostic('PACKAGE_SVG_UNSAFE', 'SVG asset is not valid UTF-8 text.', entry.path));
                continue;
            }
            const checks = [
                [SVG_ACTIVE, 'active or scripting element'],
                [SVG_HANDLER, 'event-handler attribute'],
                [SVG_ENTITY, 'DOCTYPE or entity declaration'],
                [SVG_EXTERNAL_REF, 'external href reference'],
                [SVG_EXTERNAL_URL, 'non-fragment url() reference'],
                [SVG_SCRIPT_URL, 'script URL scheme']
            ];
            for (const check of checks) {
                if (check[0].test(text)) {
                    errors.push(diagnostic('PACKAGE_SVG_UNSAFE', 'SVG asset contains a ' + check[1] + '.', entry.path));
                    break;
                }
            }
        }
    }

    /**
     * Validates one already-read container. Documents are returned only when `ok` is true so a caller
     * cannot act on partially validated geometry.
     */
    async function validatePackage(readResult, schemas, options) {
        const errors = [];
        const warnings = [];
        if (!readResult || !readResult.ok || !Array.isArray(readResult.entries)) {
            return { ok: false, diagnostics: [diagnostic('PACKAGE_IMPORT_REJECTED', 'Package bytes were not read successfully.')], warnings: warnings };
        }
        if (!isRecord(schemas) || !isRecord(schemas.manifest) || !isRecord(schemas.project) || !isRecord(schemas.trace)) {
            return { ok: false, diagnostics: [diagnostic('PACKAGE_SCHEMA_UNAVAILABLE', 'The merged v1 manifest, project and trace schemas were not supplied.')], warnings: warnings };
        }
        const entries = readResult.entries;
        const manifestEntry = entries.find(entry => entry.path === MANIFEST_PATH);
        if (!manifestEntry) {
            return { ok: false, diagnostics: [diagnostic('PACKAGE_MANIFEST_MISSING', 'The container does not contain manifest.json.')], warnings: warnings };
        }
        const manifest = parseJsonEntry(manifestEntry, errors);
        if (!isRecord(manifest)) {
            return { ok: false, diagnostics: errors.length ? errors : [diagnostic('PACKAGE_MANIFEST_MISSING', 'manifest.json is not a JSON object.')], warnings: warnings };
        }
        const major = String(manifest.packageVersion || '').split('.')[0];
        if (major !== SUPPORTED_MAJOR) {
            return { ok: false, diagnostics: [diagnostic('PACKAGE_UNSUPPORTED_MAJOR', 'Unsupported package major version: ' + String(manifest.packageVersion) + '.', 'manifest.packageVersion', 'UNSUPPORTED_PACKAGE_MAJOR')], warnings: warnings };
        }

        await checkInventory(entries, manifest, errors);
        checkSvgAssets(entries, manifest, errors);

        const projectPath = typeof manifest.projectFile === 'string' ? manifest.projectFile : '';
        const projectEntry = entries.find(entry => entry.path === projectPath);
        if (!projectEntry) {
            errors.push(diagnostic('PACKAGE_PROJECT_MISSING', 'The manifest does not declare an available project file.', 'manifest.projectFile', 'PROJECT_FILE_MISSING'));
            return { ok: false, diagnostics: errors, warnings: warnings };
        }
        const project = parseJsonEntry(projectEntry, errors);
        if (!isRecord(project)) {
            errors.push(diagnostic('PACKAGE_PROJECT_MISSING', 'The project file is not a JSON object.', projectPath, 'PROJECT_FILE_INVALID'));
            return { ok: false, diagnostics: errors, warnings: warnings };
        }

        const documents = new Map();
        for (const entry of entries) {
            if (entry.path === MANIFEST_PATH || entry.path === projectPath) continue;
            if (entry.path.indexOf('traces/') !== 0 || !/\.json$/.test(entry.path)) continue;
            documents.set(entry.path, { document: parseJsonEntry(entry, errors) });
        }

        const semantic = semantics.validateSemantics(manifest, project, documents, errors, warnings);
        const resolvedTraces = semantic.resolvedTraces;

        const structural = schemaErrors(manifest, schemas.manifest, schemas.manifest, 'manifest')
            .concat(schemaErrors(project, schemas.project, schemas.project, 'project'))
            .concat(resolvedTraces.flatMap(trace => schemaErrors(trace.document, schemas.trace, schemas.trace, 'traces.' + trace.document.traceId)))
            .sort(compareCodeUnits);
        if (structural.length) {
            errors.push(diagnostic('PACKAGE_SCHEMA_INVALID', 'Merged v1 schema validation failed: ' + structural.join('; '), '$', 'SCHEMA_VALIDATION'));
        }

        const ordered = errors.slice().sort((a, b) => compareCodeUnits(a.code + '|' + (a.path || '') + '|' + a.message, b.code + '|' + (b.path || '') + '|' + b.message));
        if (ordered.length) return { ok: false, diagnostics: ordered, warnings: warnings };
        return {
            ok: true,
            diagnostics: [],
            warnings: warnings,
            manifest: manifest,
            project: project,
            traces: resolvedTraces.map(trace => trace.document),
            fieldDisposition: semantic.dispositions,
            options: options || null
        };
    }

    return Object.freeze({
        SUPPORTED_MAJOR: SUPPORTED_MAJOR,
        schemaErrors: schemaErrors,
        sha256Hex: sha256Hex,
        validatePackage: validatePackage
    });
});
