// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Turn a validated `.engrove-trace-project` package into normalized Tonearm view descriptors and import provenance.
 * Inputs: Archive bytes, the merged v1 schemas, and the reader/validator results derived from them.
 * Outputs: A fail-closed import result whose descriptors match the shape ManualTrace3DAdapter.buildFreeformState already consumes.
 * Safe edits: Contract-declared axis mapping, deterministic contour sampling, and additional reported dispositions.
 * Do not: Infer a missing view origin, scale, or plane; consume a section without a valid binding; or drop a source field silently.
 * Verification: test/trace-project-package-adapter.test.cjs and test/trace-project-package-roundtrip.test.cjs.
 */
(function(root, factory) {
    'use strict';
    const api = factory(
        typeof require === 'function' && typeof module === 'object' ? require('./trace-project-package-reader.js') : root.TraceProjectPackageReader,
        typeof require === 'function' && typeof module === 'object' ? require('./trace-project-package-validator.js') : root.TraceProjectPackageValidator
    );
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TraceProjectPackageImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function(reader, validator) {
    'use strict';

    const DESCRIPTOR_SCHEMA = 'engrove-manual-trace-3d-input-v1';
    const PACKAGE_DESCRIPTOR_SCHEMA = 'engrove-trace-project-package-3d-input-v1';
    const SOURCE_KIND = 'engrove_trace_project_package';
    const LOFT_VIEWS = Object.freeze(['top', 'side']);
    const PLACEABLE_VIEWS = Object.freeze(['front', 'section']);
    // Mirrors the legacy adapter's contour selection: silhouette-bearing roles participate, annotation
    // roles do not. Excluded contours are reported as intentionally_ignored rather than dropped.
    const GEOMETRY_ROLES = Object.freeze(['outer_contour', 'inner_contour', 'centerline', 'slot', 'hole']);
    const BEZIER_SAMPLES = 64;
    const CIRCLE_SAMPLES = 64;

    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const round = (value, digits) => {
        const factor = Math.pow(10, digits === undefined ? 6 : digits);
        return Math.round(Number(value) * factor) / factor;
    };
    const compareCodeUnits = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

    function diagnostic(code, message, path) {
        const item = { code: String(code), message: String(message) };
        if (path !== undefined) item.path = String(path);
        return item;
    }

    function point2(value) {
        return isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
    }

    function cubic(a, controlA, controlB, b, t) {
        const m = 1 - t;
        return {
            x: m * m * m * a.x + 3 * m * m * t * controlA.x + 3 * m * t * t * controlB.x + t * t * t * b.x,
            y: m * m * m * a.y + 3 * m * m * t * controlA.y + 3 * m * t * t * controlB.y + t * t * t * b.y
        };
    }

    function sampleBezier(nodes, closed) {
        const points = [];
        for (const node of nodes) {
            const center = point2(node && node.point);
            if (!center) return null;
            points.push({ center: center, in: point2(node.in) || center, out: point2(node.out) || center });
        }
        if (points.length < 2) return null;
        const segments = points.length - 1 + (closed ? 1 : 0);
        const output = [];
        for (let index = 0; index < BEZIER_SAMPLES; index++) {
            const denominator = closed ? BEZIER_SAMPLES : BEZIER_SAMPLES - 1;
            const position = index * segments / denominator;
            const segment = Math.min(segments - 1, Math.floor(position));
            const t = Math.min(1, position - segment);
            const a = points[segment];
            const b = points[(segment + 1) % points.length];
            output.push(cubic(a.center, a.out, b.in, b.center, t));
        }
        return output;
    }

    /**
     * Converts one contract geometry payload into pixel points. Returns null when the payload cannot be
     * expressed deterministically, which the caller turns into a blocking diagnostic.
     */
    function payloadPoints(payload) {
        if (!isRecord(payload)) return null;
        if (payload.type === 'polyline' || payload.type === 'polygon' || payload.type === 'line') {
            if (!Array.isArray(payload.points)) return null;
            const points = payload.points.map(point2);
            return points.every(Boolean) && points.length >= 2 ? points : null;
        }
        if (payload.type === 'bezier_path') return Array.isArray(payload.nodes) ? sampleBezier(payload.nodes, true) : null;
        if (payload.type === 'circle') {
            const center = point2(payload.center);
            if (!center || !Number.isFinite(payload.radius) || payload.radius <= 0) return null;
            return Array.from({ length: CIRCLE_SAMPLES }, (unused, index) => {
                const angle = index * Math.PI * 2 / CIRCLE_SAMPLES;
                return { x: center.x + Math.cos(angle) * payload.radius, y: center.y + Math.sin(angle) * payload.radius };
            });
        }
        if (payload.type === 'rectangle') {
            if (![payload.x, payload.y, payload.width, payload.height].every(Number.isFinite)) return null;
            return [
                { x: payload.x, y: payload.y },
                { x: payload.x + payload.width, y: payload.y },
                { x: payload.x + payload.width, y: payload.y + payload.height },
                { x: payload.x, y: payload.y + payload.height }
            ];
        }
        return null;
    }

    function datumPosition(project, datumId) {
        const datums = ((project.object || {}).engineeringFrame || {}).datums;
        const matches = (Array.isArray(datums) ? datums : []).filter(item => isRecord(item) && item.datumId === datumId);
        if (matches.length !== 1) return null;
        const position = matches[0].positionMm;
        if (!isRecord(position) || ![position.x, position.y, position.z].every(Number.isFinite)) return null;
        return position;
    }

    /**
     * Resolves the contract-declared axis roles for one view. The longitudinal axis is the project's
     * declared object direction; the remaining in-plane axis carries the silhouette extent.
     */
    function viewAxes(document, longitudinalAxis) {
        const frame = (document.view || {}).viewFrame || {};
        const u = frame.uAxis || {};
        const v = frame.vAxis || {};
        if (u.engineeringAxis === longitudinalAxis) return { longitudinal: u, longitudinalPixel: 'x', transverse: v, transversePixel: 'y' };
        if (v.engineeringAxis === longitudinalAxis) return { longitudinal: v, longitudinalPixel: 'y', transverse: u, transversePixel: 'x' };
        return null;
    }

    function buildViewDescriptor(document, project, longitudinalAxis, fileName, ignored, errors) {
        const at = 'traces.' + document.traceId;
        const view = document.view || {};
        const frame = view.viewFrame || {};
        const axes = viewAxes(document, longitudinalAxis);
        if (!axes) {
            errors.push(diagnostic('PACKAGE_VIEW_AXIS_UNMAPPABLE', 'View ' + view.viewType + ' does not place the longitudinal axis ' + longitudinalAxis + ' in its plane.', at + '.view.viewFrame'));
            return null;
        }
        const origin = datumPosition(project, frame.engineeringOriginDatumId);
        if (!origin) {
            errors.push(diagnostic('PACKAGE_VIEW_ORIGIN_POSITION_MISSING', 'View origin datum ' + String(frame.engineeringOriginDatumId) + ' has no finite positionMm; the engineering offset cannot be inferred.', at + '.view.viewFrame.engineeringOriginDatumId'));
            return null;
        }
        const unitPerPx = (document.calibration || {}).unitPerPx;
        const originPx = frame.originPx || {};
        if (!Number.isFinite(unitPerPx) || unitPerPx <= 0 || !Number.isFinite(originPx.x) || !Number.isFinite(originPx.y)) {
            errors.push(diagnostic('PACKAGE_CALIBRATION_INVALID', 'View requires a finite positive scale and a finite pixel origin.', at));
            return null;
        }
        const longitudinalBase = origin[longitudinalAxis.toLowerCase()];
        const transverseBase = origin[String(axes.transverse.engineeringAxis).toLowerCase()];
        const toLogical = point => {
            const longitudinal = longitudinalBase + (point[axes.longitudinalPixel] - originPx[axes.longitudinalPixel]) * axes.longitudinal.direction * unitPerPx;
            const transverse = transverseBase + (point[axes.transversePixel] - originPx[axes.transversePixel]) * axes.transverse.direction * unitPerPx;
            return view.viewType === 'top'
                ? { x: round(longitudinal), y: round(transverse), z: 0 }
                : { x: round(longitudinal), y: 0, z: round(transverse) };
        };

        const contours = [];
        for (const contour of ((document.geometry || {}).contours || [])) {
            if (!isRecord(contour)) continue;
            if (GEOMETRY_ROLES.indexOf(contour.role) < 0) {
                ignored.push({ sourcePath: at + '.geometry.contours.' + contour.contourId, status: 'intentionally_ignored', reason: 'Contour role ' + String(contour.role) + ' does not contribute to the orthographic silhouette.' });
                continue;
            }
            const pixels = payloadPoints(contour.geometry);
            if (!pixels) {
                errors.push(diagnostic('PACKAGE_GEOMETRY_UNSUPPORTED', 'Contour ' + String(contour.contourId) + ' geometry cannot be converted deterministically.', at + '.geometry.contours.' + String(contour.contourId)));
                continue;
            }
            contours.push({
                id: String(contour.contourId),
                name: String(contour.name || contour.contourId),
                kind: String(contour.featureKind || ''),
                closed: contour.closed === true,
                points: pixels.map(toLogical)
            });
        }
        if (!contours.length) {
            errors.push(diagnostic('PACKAGE_GEOMETRY_UNSUPPORTED', 'View ' + view.viewType + ' contains no silhouette-bearing contour.', at + '.geometry.contours'));
            return null;
        }

        const stationX = ((document.geometry || {}).stations || [])
            .filter(station => isRecord(station) && station.geometricUse === 'used_for_geometry' && station.usage === 'longitudinal_loft_station')
            .map(station => (station.engineeringPosition || {}).xMm)
            .filter(Number.isFinite)
            .map(value => round(value));

        return {
            schema: DESCRIPTOR_SCHEMA,
            sourceKind: SOURCE_KIND,
            fileName: String(fileName || 'package') + '#' + document.traceId,
            packageType: SOURCE_KIND,
            geometrySchema: 'engrove_trace_project_package_v' + String(document.schemaVersion || '1.0.0').split('.')[0],
            projectName: String(project.name || ''),
            traceId: String(document.traceId),
            detectedPlane: view.viewType,
            plane: view.viewType,
            planeOverride: null,
            planeLocked: true,
            axes: {
                u: { engineeringAxis: axes.longitudinal.engineeringAxis, direction: axes.longitudinal.direction },
                v: { engineeringAxis: axes.transverse.engineeringAxis, direction: axes.transverse.direction }
            },
            origin: { x: originPx.x, y: originPx.y },
            originRole: 'engineering_datum:' + String(frame.engineeringOriginDatumId),
            unit: 'mm',
            unitPerPixel: round(unitPerPx, 9),
            contourCount: contours.length,
            contours: contours,
            stationX: stationX,
            image: (document.provenance || {}).imageDimensions
                ? { name: String((document.provenance || {}).sourceFileName || ''), width: document.provenance.imageDimensions.widthPx, height: document.provenance.imageDimensions.heightPx }
                : null
        };
    }

    function collectProvenance(manifest, project, traces, packageSha256, warnings, ignored) {
        return {
            schema: 'engrove-trace-project-package-import-provenance-v1',
            sourceKind: SOURCE_KIND,
            packageFormat: String(manifest.packageFormat || ''),
            packageVersion: String(manifest.packageVersion || ''),
            packageSha256: packageSha256,
            packageCreatedAt: String(manifest.createdAt || ''),
            producer: isRecord(manifest.producer) ? { name: String(manifest.producer.name || ''), version: String(manifest.producer.version || '') } : null,
            projectId: String(project.projectId || ''),
            objectId: String((project.object || {}).objectId || ''),
            objectType: String((project.object || {}).objectType || ''),
            traces: traces.map(document => ({
                traceId: String(document.traceId),
                viewType: String((document.view || {}).viewType || ''),
                geometricUse: String((document.view || {}).geometricUse || ''),
                calibrationMethod: String((document.calibration || {}).method || ''),
                sourceDigest: String((document.provenance || {}).sourceDigest || '')
            })).sort((a, b) => compareCodeUnits(a.traceId, b.traceId)),
            preservedFields: (Array.isArray(project.fieldDisposition) ? project.fieldDisposition : [])
                .filter(item => isRecord(item) && item.status === 'preserved_as_provenance')
                .map(item => String(item.sourcePath))
                .sort(compareCodeUnits),
            ignoredFields: ignored.map(item => item.sourcePath).sort(compareCodeUnits),
            contractWarnings: warnings.map(item => ({ code: item.code, message: item.message, path: item.path || null }))
        };
    }

    function rejected(diagnostics, packageSha256) {
        return {
            ok: false,
            packageVersion: null,
            packageSha256: packageSha256 || null,
            projectId: null,
            traceIds: [],
            normalizedDescriptor: null,
            diagnostics: diagnostics.slice().sort((a, b) => compareCodeUnits(a.code + '|' + (a.path || ''), b.code + '|' + (b.path || ''))),
            provenance: null
        };
    }

    /**
     * Loads the canonical merged schemas. Node reads the repository contract directory; the browser reads
     * the copy the tool build publishes beside its runtime. A missing schema blocks the import.
     */
    async function loadSchemas(options) {
        const settings = options || {};
        if (isRecord(settings.schemas)) return settings.schemas;
        const names = ['manifest', 'project', 'trace'];
        if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function') {
            const fs = require('node:fs/promises');
            const path = require('node:path');
            const directory = settings.schemaDirectory || path.resolve(__dirname, '..', '..', '..', 'schema', 'trace-project-package');
            const loaded = {};
            for (const name of names) loaded[name] = JSON.parse(await fs.readFile(path.join(directory, name + '.schema.json'), 'utf8'));
            return loaded;
        }
        const base = settings.schemaBaseUrl || new URL('schema/trace-project-package/', document.baseURI).href;
        const loaded = {};
        for (const name of names) {
            const response = await fetch(new URL(name + '.schema.json', base), { cache: 'no-cache', credentials: 'same-origin' });
            if (!response.ok) throw new Error('Could not load the ' + name + ' contract schema (' + response.status + ').');
            loaded[name] = await response.json();
        }
        return loaded;
    }

    /**
     * Reads, validates and normalizes one package. Geometry is produced only when every container,
     * schema, semantic and mapping check passes, so an invalid file can never mutate an active design.
     */
    async function importPackageBytes(bytes, options) {
        const settings = options || {};
        const fileName = String(settings.fileName || 'project.engrove-trace-project');
        let packageSha256 = null;
        try {
            packageSha256 = await validator.sha256Hex(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        } catch (error) {
            return rejected([diagnostic('PACKAGE_IMPORT_REJECTED', 'Package identity could not be computed: ' + error.message)], null);
        }

        const read = reader.readPackage(bytes, settings);
        if (!read.ok) return rejected(read.diagnostics, packageSha256);

        let schemas;
        try {
            schemas = await loadSchemas(settings);
        } catch (error) {
            return rejected([diagnostic('PACKAGE_SCHEMA_UNAVAILABLE', 'The merged v1 contract schemas are unavailable: ' + error.message)], packageSha256);
        }

        const validated = await validator.validatePackage(read, schemas, settings);
        if (!validated.ok) return rejected(validated.diagnostics, packageSha256);

        const project = validated.project;
        const longitudinalAxis = (((project.object || {}).engineeringFrame || {}).objectDirection || {}).axis;
        const errors = [];
        const sectionWarnings = [];
        const ignored = [];
        const views = [];
        for (const document of validated.traces.slice().sort((a, b) => compareCodeUnits(a.traceId, b.traceId))) {
            const view = document.view || {};
            if (view.geometricUse !== 'used_for_geometry') {
                ignored.push({ sourcePath: 'traces.' + document.traceId, status: 'preserved_as_provenance', reason: 'View ' + String(view.viewType) + ' is declared provenance-only.' });
                continue;
            }
            if (LOFT_VIEWS.indexOf(view.viewType) >= 0) {
                const descriptor = buildViewDescriptor(document, project, longitudinalAxis, fileName, ignored, errors);
                if (descriptor) views.push(descriptor);
                continue;
            }
            if (PLACEABLE_VIEWS.indexOf(view.viewType) >= 0) {
                // The binding is contract-valid, but the v1 loft kernel accepts only top and side
                // silhouettes. Report the placement as a stable warning and keep it in provenance so the
                // section is neither silently dropped nor allowed to reject an otherwise usable package.
                ignored.push({
                    sourcePath: 'traces.' + document.traceId,
                    status: 'unsupported_warning',
                    reason: 'Bound ' + String(view.viewType) + ' section is preserved; the v1 loft kernel consumes top and side silhouettes only.'
                });
                sectionWarnings.push(diagnostic('PACKAGE_SECTION_GEOMETRY_NOT_CONSUMED', 'Trace ' + document.traceId + ' declares a geometric ' + String(view.viewType) + ' section, which this version preserves but cannot apply to the loft.', 'traces.' + document.traceId));
                continue;
            }
            ignored.push({ sourcePath: 'traces.' + document.traceId, status: 'intentionally_ignored', reason: 'View type ' + String(view.viewType) + ' does not participate in the v1 loft.' });
        }
        if (!views.some(view => view.plane === 'top')) errors.push(diagnostic('PACKAGE_REQUIRED_TOP_TRACE_MISSING', 'The package contains no geometric top view.', 'project.traceFiles'));
        if (!views.some(view => view.plane === 'side')) errors.push(diagnostic('PACKAGE_REQUIRED_SIDE_TRACE_MISSING', 'The package contains no geometric side view.', 'project.traceFiles'));
        if (errors.length) return rejected(errors, packageSha256);

        const traceIds = validated.traces.map(document => String(document.traceId)).sort(compareCodeUnits);
        const warnings = validated.warnings.concat(sectionWarnings);
        return {
            ok: true,
            packageVersion: String(validated.manifest.packageVersion),
            packageSha256: packageSha256,
            projectId: String(project.projectId),
            traceIds: traceIds,
            normalizedDescriptor: {
                schema: PACKAGE_DESCRIPTOR_SCHEMA,
                sourceKind: SOURCE_KIND,
                fileName: fileName,
                packageSha256: packageSha256,
                projectId: String(project.projectId),
                objectId: String((project.object || {}).objectId || ''),
                longitudinalAxis: String(longitudinalAxis),
                views: views
            },
            diagnostics: [],
            warnings: warnings,
            provenance: collectProvenance(validated.manifest, project, validated.traces, packageSha256, warnings, ignored)
        };
    }

    return Object.freeze({
        DESCRIPTOR_SCHEMA: DESCRIPTOR_SCHEMA,
        PACKAGE_DESCRIPTOR_SCHEMA: PACKAGE_DESCRIPTOR_SCHEMA,
        SOURCE_KIND: SOURCE_KIND,
        GEOMETRY_ROLES: GEOMETRY_ROLES,
        loadSchemas: loadSchemas,
        importPackageBytes: importPackageBytes
    });
});
