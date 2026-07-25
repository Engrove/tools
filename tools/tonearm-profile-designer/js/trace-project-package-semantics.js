// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Own the semantic half of the merged v1 contract - identity, bidirectional inventory, engineering frame, stations and field disposition.
 * Inputs: Parsed manifest, project and trace documents that already passed container and integrity checks.
 * Outputs: Stable PACKAGE_* diagnostics carrying the contract's own error classes, plus contract warnings.
 * Safe edits: Additional contract invariants paired with matched positive and negative fixtures.
 * Do not: Resolve a reference by array order, first match or last write, or let a station verdict depend on package order.
 * Verification: test/trace-project-package-validator.test.cjs
 *
 * ADR-0001 assigns structural discrimination to JSON Schema and uniqueness, reverse inventory joins,
 * exact reference resolution, station consistency and coordinate arithmetic to the semantic validator.
 * This module is that second owner; trace-project-package-validator.js owns the first.
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TraceProjectPackageSemantics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const FRAME_EPSILON = 1e-9;
    const STATION_EPSILON_MM = 1e-9;
    const ASSET_ROLES = Object.freeze(['source_image', 'source_svg', 'sidecar']);
    const PLACEABLE_VIEWS = Object.freeze(['front', 'section']);

    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const norm = a => Math.sqrt(dot(a, a));
    const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
    const finiteVector = v => isRecord(v) && [v.x, v.y, v.z].every(Number.isFinite);
    const compareCodeUnits = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

    function diagnostic(code, message, path, contractClass) {
        const item = { code: String(code), message: String(message) };
        if (path !== undefined) item.path = String(path);
        if (contractClass !== undefined) item.contractClass = String(contractClass);
        return item;
    }

    // ---- identity helpers ---------------------------------------------------

    function records(value, basePath, requiredFields) {
        if (!Array.isArray(value)) return [];
        const output = [];
        value.forEach((record, index) => {
            if (!isRecord(record)) return;
            if (requiredFields.some(field => typeof record[field] !== 'string' || !record[field])) return;
            output.push({ record: record, path: basePath + '[' + index + ']' });
        });
        return output;
    }

    function groupBy(items, key) {
        const map = new Map();
        for (const item of items) {
            const id = key(item.record);
            if (typeof id !== 'string' || !id) continue;
            if (!map.has(id)) map.set(id, []);
            map.get(id).push(item);
        }
        return map;
    }

    function reportDuplicates(map, label, errors, contractClass) {
        for (const id of Array.from(map.keys()).sort(compareCodeUnits)) {
            const items = map.get(id).slice().sort((a, b) => compareCodeUnits(a.path, b.path));
            for (let index = 1; index < items.length; index++) {
                errors.push(diagnostic('PACKAGE_ID_DUPLICATE', label + ' ' + id + ' duplicates ' + items[0].path + '.', items[index].path, contractClass));
            }
        }
    }

    function resolveOne(map, id, at, label, errors, contractClass) {
        const matches = typeof id === 'string' ? map.get(id) || [] : [];
        if (matches.length === 1) return matches[0];
        const reason = matches.length ? 'resolves ' + matches.length + ' times' : 'does not resolve';
        errors.push(diagnostic('PACKAGE_REFERENCE_UNRESOLVED', label + ' ' + String(id) + ' ' + reason + '.', at, contractClass));
        return null;
    }

    function checkGlobalIdentities(project, traces, assets, datums, references, errors) {
        const registry = new Map();
        const claim = (id, kind, at) => {
            if (typeof id !== 'string' || !id) return;
            const found = registry.get(id) || [];
            if (found.length && !found.some(item => item.kind === kind)) {
                errors.push(diagnostic('PACKAGE_ID_DUPLICATE', kind + ' ' + id + ' collides with ' + found[0].kind + ' at ' + found[0].at + '.', at, 'PACKAGE_ID_DUPLICATE'));
            }
            found.push({ kind: kind, at: at });
            registry.set(id, found);
        };
        claim(project.projectId, 'projectId', 'project.projectId');
        claim(project.object && project.object.objectId, 'objectId', 'project.object.objectId');
        traces.forEach(item => claim(item.record.traceId, 'traceId', item.path + '.traceId'));
        assets.forEach(item => claim(item.record.assetId, 'assetId', item.path + '.assetId'));
        datums.forEach(item => claim(item.record.datumId, 'project datumId', item.path + '.datumId'));
        references.forEach(item => claim(item.record.referenceId, 'project referenceId', item.path + '.referenceId'));
    }

    function checkEngineeringFrame(frame, datumIds, errors) {
        if (!isRecord(frame) || !isRecord(frame.axes)) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Project engineering frame is missing.', 'project.object.engineeringFrame', 'ENGINEERING_FRAME_INVALID'));
            return;
        }
        const at = 'project.object.engineeringFrame';
        const origin = frame.origin || {};
        if (![origin.xMm, origin.yMm, origin.zMm].every(Number.isFinite)) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Engineering origin coordinates must be finite.', at + '.origin', 'ENGINEERING_COORDINATE_INVALID'));
        }
        const vectors = {};
        for (const axis of ['x', 'y', 'z']) {
            const vector = frame.axes[axis] && frame.axes[axis].unitVector;
            if (!finiteVector(vector)) {
                errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Engineering ' + axis.toUpperCase() + ' axis components must be finite.', at + '.axes.' + axis, 'ENGINEERING_COORDINATE_INVALID'));
                continue;
            }
            const length = norm(vector);
            if (length <= FRAME_EPSILON) {
                errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Engineering ' + axis.toUpperCase() + ' axis has zero length.', at + '.axes.' + axis, 'ENGINEERING_FRAME_DEGENERATE'));
                continue;
            }
            if (Math.abs(length - 1) > FRAME_EPSILON) {
                errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Engineering ' + axis.toUpperCase() + ' axis is not a unit vector.', at + '.axes.' + axis, 'ENGINEERING_FRAME_NON_UNIT'));
            }
            vectors[axis] = vector;
        }
        if (!vectors.x || !vectors.y || !vectors.z) return;
        for (const pair of [['x', 'y'], ['x', 'z'], ['y', 'z']]) {
            if (Math.abs(dot(vectors[pair[0]], vectors[pair[1]])) > FRAME_EPSILON) {
                errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Engineering ' + pair[0].toUpperCase() + ' and ' + pair[1].toUpperCase() + ' axes are not orthogonal.', at + '.axes', 'ENGINEERING_FRAME_NON_ORTHOGONAL'));
            }
        }
        const product = cross(vectors.x, vectors.y);
        if (Math.abs(dot(product, vectors.z)) <= FRAME_EPSILON) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Engineering basis determinant is zero within tolerance.', at + '.axes', 'ENGINEERING_FRAME_DEGENERATE'));
        }
        if (frame.handedness === 'right' && norm({ x: product.x - vectors.z.x, y: product.y - vectors.z.y, z: product.z - vectors.z.z }) > FRAME_EPSILON) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'cross(X, Y) does not equal Z for the declared right-handed basis.', at + '.handedness', 'ENGINEERING_FRAME_HANDEDNESS'));
        }
        const direction = frame.objectDirection || {};
        if (!vectors[String(direction.axis || '').toLowerCase()]) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Object direction axis ' + String(direction.axis) + ' does not resolve to an engineering axis.', at + '.objectDirection.axis', 'OBJECT_DIRECTION_INVALID'));
        }
        resolveOne(datumIds, frame.origin && frame.origin.datumId, at + '.origin.datumId', 'engineering origin datum', errors, 'DATUM_REFERENCE_UNKNOWN');
        resolveOne(datumIds, direction.fromDatum, at + '.objectDirection.fromDatum', 'object direction datum', errors, 'DATUM_REFERENCE_UNKNOWN');
        resolveOne(datumIds, direction.toDatum, at + '.objectDirection.toDatum', 'object direction datum', errors, 'DATUM_REFERENCE_UNKNOWN');
        if (direction.fromDatum && direction.fromDatum === direction.toDatum) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'Object direction endpoints must differ.', at + '.objectDirection', 'OBJECT_DIRECTION_INVALID'));
        }
    }

    function checkTraceInventory(project, entries, manifestFiles, traceRecords, errors) {
        const manifestTraces = manifestFiles.filter(item => item.record.role === 'trace');
        const manifestByPath = groupBy(manifestTraces, record => record.path);
        const projectByPath = groupBy(traceRecords, record => record.path);
        const resolved = [];
        for (const item of traceRecords) {
            const record = item.record;
            const expected = 'traces/' + record.traceId + '.json';
            if (record.path !== expected) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Trace ' + record.traceId + ' must use the canonical path ' + expected + '.', item.path + '.path', 'TRACE_PATH_NONCANONICAL'));
            }
            const manifestEntry = resolveOne(manifestByPath, record.path, item.path + '.path', 'manifest trace entry for', errors, 'TRACE_MANIFEST_ENTRY_MISSING');
            if (manifestEntry && manifestEntry.record.traceId !== record.traceId) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Manifest traceId ' + String(manifestEntry.record.traceId) + ' differs from project traceId ' + record.traceId + '.', manifestEntry.path, 'MANIFEST_TRACE_ID_MISMATCH'));
            }
            const document = entries.get(record.path) ? entries.get(record.path).document : undefined;
            if (!isRecord(document)) {
                errors.push(diagnostic('PACKAGE_ENTRY_MISSING', 'Trace ' + record.traceId + ' has no readable JSON document.', item.path, 'TRACE_FILE_INVALID'));
                continue;
            }
            const objectId = project.object && project.object.objectId;
            if (document.traceId !== record.traceId) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Trace document identity differs from the project inventory.', item.path + '.traceId', 'TRACE_ID_MISMATCH'));
            }
            if (record.objectId !== objectId || document.objectId !== objectId) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Trace ' + record.traceId + ' does not reference the shared object.', item.path, 'TRACE_OBJECT_MISMATCH'));
            }
            if (record.geometricUse !== (document.view && document.view.geometricUse)) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Trace ' + record.traceId + ' geometric use differs between project and document.', item.path + '.geometricUse', 'TRACE_GEOMETRIC_USE_MISMATCH'));
            }
            resolved.push({ record: record, path: item.path, document: document });
        }
        for (const item of manifestTraces) {
            const claims = projectByPath.get(item.record.path) || [];
            if (!claims.length) errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Manifest trace has no project.traceFiles[] record.', item.path, 'ORPHAN_MANIFEST_TRACE'));
            else if (claims.length > 1) errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Manifest trace is claimed ' + claims.length + ' times.', item.path, 'TRACE_INVENTORY_MISMATCH'));
        }
        for (const path of Array.from(entries.keys()).filter(value => value.indexOf('traces/') === 0).sort(compareCodeUnits)) {
            if (!(manifestByPath.get(path) || []).length) errors.push(diagnostic('PACKAGE_ENTRY_UNDECLARED', 'Trace entry is not declared with role trace.', path, 'TRACE_DOCUMENT_UNDECLARED'));
            if (!(projectByPath.get(path) || []).length) errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Trace entry is absent from project.traceFiles[].', path, 'ORPHAN_TRACE_ENTRY'));
        }
        return resolved;
    }

    function traceAssetIds(document) {
        const ids = new Set();
        const add = id => { if (typeof id === 'string' && id) ids.add(id); };
        const assets = document.assets || {};
        add(assets.sourceImageAssetId);
        add(assets.sourceSvgAssetId);
        (Array.isArray(assets.sidecarAssetIds) ? assets.sidecarAssetIds : []).forEach(add);
        const contours = (document.geometry && document.geometry.contours) || [];
        (Array.isArray(contours) ? contours : []).forEach(contour => add(contour && contour.sourceSvgElement && contour.sourceSvgElement.assetId));
        return ids;
    }

    function checkAssetInventory(manifestFiles, assetRecords, resolvedTraces, traceIds, errors) {
        const manifestAssets = manifestFiles.filter(item => ASSET_ROLES.indexOf(item.record.role) >= 0);
        const manifestByPath = groupBy(manifestAssets, record => record.path);
        const projectByPath = groupBy(assetRecords, record => record.path);
        const metadataAgrees = (file, asset) => file.role === asset.role && file.mediaType === asset.mediaType && file.sha256 === asset.sha256 && file.sizeBytes === asset.sizeBytes;
        for (const item of assetRecords) {
            const asset = item.record;
            const match = resolveOne(manifestByPath, asset.path, item.path + '.path', 'manifest asset entry for', errors, 'ASSET_NOT_DECLARED');
            if (match) {
                if (match.record.assetId !== asset.assetId) {
                    errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Manifest assetId differs from the project asset identity.', match.path, 'MANIFEST_ASSET_ID_MISMATCH'));
                }
                if (!metadataAgrees(match.record, asset)) {
                    errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Asset ' + asset.assetId + ' metadata differs from the manifest entry.', item.path, 'ASSET_INVENTORY_MISMATCH'));
                }
            }
            const owners = Array.isArray(asset.traceIds) ? asset.traceIds : [];
            if (!owners.length) errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Asset ' + asset.assetId + ' must name at least one owning trace.', item.path + '.traceIds', 'ASSET_TRACE_OWNER_REQUIRED'));
            owners.forEach((traceId, index) => {
                const owner = resolveOne(traceIds, traceId, item.path + '.traceIds[' + index + ']', 'asset owning trace', errors, 'ASSET_TRACE_UNKNOWN');
                if (!owner) return;
                const trace = resolvedTraces.find(candidate => candidate.record === owner.record);
                if (trace && !traceAssetIds(trace.document).has(asset.assetId)) {
                    errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Asset ' + asset.assetId + ' names trace ' + traceId + ', which carries no reverse reference.', item.path + '.traceIds[' + index + ']', 'ASSET_TRACE_ASSOCIATION_MISMATCH'));
                }
            });
        }
        for (const item of manifestAssets) {
            const claims = projectByPath.get(item.record.path) || [];
            if (!claims.length) errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Manifest asset has no project.assets[] record.', item.path, 'ORPHAN_MANIFEST_ASSET'));
            else if (claims.length > 1) errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Manifest asset is claimed ' + claims.length + ' times.', item.path, 'ASSET_INVENTORY_MISMATCH'));
        }
        for (const item of manifestFiles.filter(file => file.record.role === 'readme')) {
            if (item.record.traceId || item.record.assetId) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'A readme entry must not carry traceId or assetId.', item.path, 'README_IDENTITY_FORBIDDEN'));
            }
            if ((projectByPath.get(item.record.path) || []).length) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'A readme entry must remain manifest-only.', item.path, 'README_PROJECT_ASSET_FORBIDDEN'));
            }
        }
    }

    function checkTraceGeometry(trace, datumIds, assetIds, errors, warnings) {
        const document = trace.document;
        const at = 'traces.' + document.traceId;
        const view = document.view || {};
        const frame = view.viewFrame || {};
        const mapped = [frame.uAxis, frame.vAxis, frame.normalAxis].map(item => item && item.engineeringAxis);
        if (mapped.some(axis => ['X', 'Y', 'Z'].indexOf(axis) < 0) || new Set(mapped).size !== 3) {
            errors.push(diagnostic('PACKAGE_FRAME_INVALID', 'View frame does not map X, Y and Z exactly once.', at + '.view.viewFrame', 'VIEW_FRAME_MAPPING'));
        }
        resolveOne(datumIds, frame.engineeringOriginDatumId, at + '.view.viewFrame.engineeringOriginDatumId', 'view engineering origin datum', errors, 'VIEW_ORIGIN_DATUM_UNKNOWN');

        const calibration = document.calibration || {};
        const ratio = calibration.sourceRealLength / calibration.sourcePixelLength;
        const allowed = Math.max(1e-9 * Math.max(1, Math.abs(ratio)), Number(calibration.toleranceMm || 0) / Math.max(1, Number(calibration.sourcePixelLength || 1)));
        if (![calibration.unitPerPx, calibration.sourcePixelLength, calibration.sourceRealLength].every(Number.isFinite) || Math.abs(calibration.unitPerPx - ratio) > allowed) {
            errors.push(diagnostic('PACKAGE_CALIBRATION_INVALID', 'Calibration values disagree with sourceRealLength / sourcePixelLength.', at + '.calibration', 'CALIBRATION_CONFLICT'));
        }

        const geometry = document.geometry || {};
        const contours = records(geometry.contours, at + '.geometry.contours', ['contourId']);
        const stations = records(geometry.stations, at + '.geometry.stations', ['stationId']);
        const localDatums = records(geometry.datums, at + '.geometry.datums', ['datumId']);
        const relations = records(geometry.relations, at + '.geometry.relations', ['relationId']);
        const contourIds = groupBy(contours, record => record.contourId);
        reportDuplicates(contourIds, 'contourId', errors, 'CONTOUR_ID_DUPLICATE');
        reportDuplicates(groupBy(stations, record => record.stationId), 'stationId', errors, 'STATION_ID_DUPLICATE');
        reportDuplicates(groupBy(localDatums, record => record.datumId), 'trace datumId', errors, 'TRACE_DATUM_ID_DUPLICATE');
        reportDuplicates(groupBy(relations, record => record.relationId), 'relationId', errors, 'RELATION_ID_DUPLICATE');
        if (typeof geometry.primaryContourId === 'string') {
            resolveOne(contourIds, geometry.primaryContourId, at + '.geometry.primaryContourId', 'primary contour', errors, 'PRIMARY_CONTOUR_UNKNOWN');
        }
        if (view.geometricUse === 'used_for_geometry') {
            const primary = contours.map(item => item.record).filter(contour => contour.role === 'outer_contour' && contour.status === 'primary' && contour.closed === true);
            if (primary.length !== 1 || geometry.primaryContourId !== primary[0].contourId) {
                errors.push(diagnostic('PACKAGE_PRIMARY_CONTOUR_INVALID', 'A geometric trace must select exactly one primary closed outer contour.', at + '.geometry.primaryContourId', 'PRIMARY_CONTOUR_AMBIGUOUS'));
            }
        }
        const planeAxes = new Set([frame.uAxis && frame.uAxis.engineeringAxis, frame.vAxis && frame.vAxis.engineeringAxis]);
        for (const item of stations) {
            if (!planeAxes.has(item.record.orientation && item.record.orientation.engineeringAxis)) {
                errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'Station ' + item.record.stationId + ' orientation is not in the view plane.', item.path, 'STATION_ORIENTATION_UNMAPPABLE'));
            }
        }
        for (const id of Array.from(traceAssetIds(document)).sort(compareCodeUnits)) {
            const asset = resolveOne(assetIds, id, at + '.assets', 'trace asset', errors, 'ASSET_REFERENCE_UNKNOWN');
            if (asset && (asset.record.traceIds || []).indexOf(document.traceId) < 0) {
                errors.push(diagnostic('PACKAGE_INVENTORY_MISMATCH', 'Asset ' + id + ' is not associated with trace ' + document.traceId + '.', at + '.assets', 'ASSET_TRACE_ASSOCIATION_MISMATCH'));
            }
        }
        if (PLACEABLE_VIEWS.indexOf(view.viewType) >= 0 && view.geometricUse !== 'used_for_geometry' && !isRecord(view.sectionBinding)) {
            warnings.push(diagnostic('UNPLACED_VIEW_PRESERVED', 'Unbound ' + view.viewType + ' view retained as provenance only.', at + '.view', 'UNPLACED_VIEW_PRESERVED'));
        }
        return stations;
    }

    function checkStationGroups(traceStations, errors) {
        const groups = new Map();
        for (const entry of traceStations) {
            for (const item of entry.stations) {
                const id = item.record.stationId;
                if (!groups.has(id)) groups.set(id, []);
                groups.get(id).push({ record: item.record, path: item.path, traceId: entry.traceId, tolerance: entry.tolerance });
            }
        }
        const conflicting = new Set();
        const difference = (a, b, allowed) => {
            if ((a.orientation || {}).engineeringAxis !== (b.orientation || {}).engineeringAxis) return 'engineering axis';
            const positionA = (a.engineeringPosition || {}).xMm;
            const positionB = (b.engineeringPosition || {}).xMm;
            if (!Number.isFinite(positionA) || !Number.isFinite(positionB) || Math.abs(positionA - positionB) > allowed) return 'engineering position';
            if (a.usage !== b.usage) return 'usage';
            if (a.geometricUse !== b.geometricUse) return 'geometric disposition';
            return null;
        };
        for (const id of Array.from(groups.keys()).sort(compareCodeUnits)) {
            const occurrences = groups.get(id).slice().sort((a, b) => compareCodeUnits(a.traceId + '|' + a.path, b.traceId + '|' + b.path));
            for (let i = 0; i < occurrences.length; i++) {
                for (let j = i + 1; j < occurrences.length; j++) {
                    const allowed = Math.max(occurrences[i].tolerance, occurrences[j].tolerance, STATION_EPSILON_MM);
                    const reason = difference(occurrences[i].record, occurrences[j].record, allowed);
                    if (!reason) continue;
                    conflicting.add(id);
                    errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'Station ' + id + ' conflicts on ' + reason + ' between ' + occurrences[i].traceId + ' and ' + occurrences[j].traceId + '.', occurrences[j].path, 'STATION_ID_CONFLICT'));
                }
            }
        }
        return { groups: groups, conflicting: conflicting };
    }

    function checkSectionBindings(resolvedTraces, stationState, errors) {
        for (const trace of resolvedTraces) {
            const binding = trace.document.view && trace.document.view.sectionBinding;
            const viewType = trace.document.view && trace.document.view.viewType;
            const at = 'traces.' + trace.document.traceId + '.view.sectionBinding';
            if (!isRecord(binding)) {
                if (PLACEABLE_VIEWS.indexOf(viewType) >= 0 && (trace.document.view || {}).geometricUse === 'used_for_geometry') {
                    errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'A geometric ' + viewType + ' view requires a section binding.', at, 'SECTION_BINDING_REQUIRED'));
                }
                continue;
            }
            if (binding.bindingMethod === 'explicit_x') {
                if (!Number.isFinite(binding.xMm) || binding.stationId !== undefined) {
                    errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'explicit_x requires a finite xMm and forbids stationId.', at, 'SECTION_BINDING_METHOD_INVALID'));
                }
                continue;
            }
            if (binding.bindingMethod !== 'explicit_station') {
                errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'Unsupported section binding method ' + String(binding.bindingMethod) + '.', at + '.bindingMethod', 'SECTION_BINDING_METHOD_INVALID'));
                continue;
            }
            if (typeof binding.stationId !== 'string' || !binding.stationId) {
                errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'explicit_station requires stationId.', at, 'SECTION_BINDING_METHOD_INVALID'));
                continue;
            }
            const group = stationState.groups.get(binding.stationId) || [];
            if (!group.length) {
                errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'Section station ' + binding.stationId + ' does not resolve.', at + '.stationId', 'SECTION_STATION_UNKNOWN'));
                continue;
            }
            if (stationState.conflicting.has(binding.stationId)) {
                errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'Section station ' + binding.stationId + ' is not a consistent package station.', at + '.stationId', 'STATION_ID_CONFLICT'));
                continue;
            }
            if (!Number.isFinite(binding.xMm)) continue;
            for (const occurrence of group) {
                const stationX = (occurrence.record.engineeringPosition || {}).xMm;
                const allowed = Math.max(occurrence.tolerance, Number.isFinite(binding.toleranceMm) ? Math.max(0, binding.toleranceMm) : 0, STATION_EPSILON_MM);
                if (!Number.isFinite(stationX) || Math.abs(binding.xMm - stationX) > allowed) {
                    errors.push(diagnostic('PACKAGE_STATION_BINDING_INVALID', 'Binding position disagrees with station occurrence in ' + occurrence.traceId + '.', at + '.xMm', 'STATION_ID_CONFLICT'));
                }
            }
        }
    }

    function checkFieldDisposition(project, resolvedTraces, errors, warnings) {
        const declared = records(project.fieldDisposition, 'project.fieldDisposition', ['sourcePath', 'status']);
        const byPath = new Map();
        for (const item of declared) {
            const sourcePath = item.record.sourcePath;
            if (byPath.has(sourcePath)) {
                errors.push(diagnostic('PACKAGE_FIELD_UNSUPPORTED', 'Source field ' + sourcePath + ' carries more than one disposition.', item.path, 'FIELD_DISPOSITION_DUPLICATE'));
                continue;
            }
            byPath.set(sourcePath, item.record);
            if (item.record.status === 'unsupported_error') {
                errors.push(diagnostic('PACKAGE_FIELD_UNSUPPORTED', 'Source field ' + sourcePath + ' is declared unsupported: ' + String(item.record.reason), item.path, 'UNSUPPORTED_SOURCE_FIELD'));
            }
            if (item.record.status === 'unsupported_warning') {
                warnings.push(diagnostic(item.record.warningCode || 'UNSUPPORTED_SOURCE_FIELD', String(item.record.reason), item.path, 'UNSUPPORTED_SOURCE_FIELD'));
            }
        }
        const sourceFields = new Set();
        const collect = list => (Array.isArray(list) ? list : []).forEach(value => { if (typeof value === 'string' && value) sourceFields.add(value); });
        collect(project.provenance && project.provenance.sourceFields);
        resolvedTraces.forEach(trace => collect(trace.document.provenance && trace.document.provenance.sourceFields));
        for (const sourcePath of Array.from(sourceFields).sort(compareCodeUnits)) {
            if (!byPath.has(sourcePath)) {
                errors.push(diagnostic('PACKAGE_FIELD_UNSUPPORTED', 'Source field ' + sourcePath + ' has no declared disposition.', 'project.fieldDisposition', 'FIELD_DISPOSITION_MISSING'));
            }
        }
        return byPath;
    }

    /**
     * Runs every semantic contract rule over one already-parsed package. Diagnostics accumulate into the
     * caller's arrays so structural and semantic findings are reported together.
     */
    function validateSemantics(manifest, project, documents, errors, warnings) {
        const manifestFiles = records(manifest.files, 'manifest.files', ['path']);
        const traceRecords = records(project.traceFiles, 'project.traceFiles', ['traceId', 'objectId', 'path']);
        const assetRecords = records(project.assets, 'project.assets', ['assetId', 'path']);
        const frame = (project.object && project.object.engineeringFrame) || {};
        const datumRecords = records(frame.datums, 'project.object.engineeringFrame.datums', ['datumId']);
        const referenceRecords = records(frame.references, 'project.object.engineeringFrame.references', ['referenceId', 'sourceId', 'targetId']);
        const datumIds = groupBy(datumRecords, record => record.datumId);
        const traceIds = groupBy(traceRecords, record => record.traceId);
        const assetIds = groupBy(assetRecords, record => record.assetId);

        reportDuplicates(traceIds, 'traceId', errors, 'TRACE_ID_DUPLICATE');
        reportDuplicates(assetIds, 'assetId', errors, 'ASSET_ID_DUPLICATE');
        reportDuplicates(datumIds, 'project datumId', errors, 'DATUM_ID_DUPLICATE');
        reportDuplicates(groupBy(referenceRecords, record => record.referenceId), 'project referenceId', errors, 'REFERENCE_ID_DUPLICATE');
        checkGlobalIdentities(project, traceRecords, assetRecords, datumRecords, referenceRecords, errors);
        checkEngineeringFrame(frame, datumIds, errors);

        const resolvedTraces = checkTraceInventory(project, documents, manifestFiles, traceRecords, errors);
        checkAssetInventory(manifestFiles, assetRecords, resolvedTraces, traceIds, errors);

        const traceStations = [];
        for (const trace of resolvedTraces) {
            const stations = checkTraceGeometry(trace, datumIds, assetIds, errors, warnings);
            const tolerance = Number.isFinite(trace.document.calibration && trace.document.calibration.toleranceMm)
                ? Math.max(0, trace.document.calibration.toleranceMm)
                : STATION_EPSILON_MM;
            traceStations.push({ traceId: trace.document.traceId, stations: stations, tolerance: tolerance });
        }
        checkSectionBindings(resolvedTraces, checkStationGroups(traceStations, errors), errors);
        const dispositions = checkFieldDisposition(project, resolvedTraces, errors, warnings);
        return { resolvedTraces: resolvedTraces, dispositions: dispositions };
    }

    return Object.freeze({
        FRAME_EPSILON: FRAME_EPSILON,
        STATION_EPSILON_MM: STATION_EPSILON_MM,
        diagnostic: diagnostic,
        compareCodeUnits: compareCodeUnits,
        validateSemantics: validateSemantics
    });
});
