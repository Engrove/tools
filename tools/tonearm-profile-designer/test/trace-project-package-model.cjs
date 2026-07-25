// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Build one deterministic Manual Trace project model shared by the Tonearm roundtrip and browser smoke.
 * Inputs: None; every value is a fixed literal so exported bytes stay reproducible.
 * Outputs: A model accepted by EngroveTraceProjectPackageProduction.buildValidatedZipPackage.
 * Safe edits: Geometry and station values that stay inside the documented Freeform dimension limits.
 * Do not: Introduce timestamps, randomness, or values that depend on the host environment.
 * Verification: Consumed by trace-project-package-roundtrip.test.cjs and trace-project-package-browser-smoke.mjs.
 */
'use strict';

const UNIT_PER_PX = 0.5;
const STATION_PIXELS = [80, 160, 240, 320];

function calibration() {
    return {
        unit: 'mm',
        unitPerPx: UNIT_PER_PX,
        referenceMeasurementId: 'measure-reference',
        sourcePixelLength: 200,
        sourceRealLength: 100,
        method: 'operator_reference',
        provenance: { source: 'Manual Trace operator scale reference', notes: ['Deterministic roundtrip fixture.'] },
        toleranceMm: 0.25
    };
}

function stations(prefix, vAxis) {
    return STATION_PIXELS.map((valuePx, index) => ({
        stationId: prefix + '-station-' + index,
        name: prefix + ' station ' + index,
        index: index,
        orientation: vAxis,
        definition: { viewAxis: 'u', valuePx: valuePx },
        engineeringPosition: { xMm: valuePx * UNIT_PER_PX, derived: true, derivation: 'Derived from calibrated engineering X.' },
        references: [],
        usage: 'longitudinal_loft_station',
        geometricUse: 'used_for_geometry'
    }));
}

function trace(viewType, heightPx, vAxis, normalAxis) {
    const traceId = 'trace-' + viewType;
    return {
        schemaVersion: '1.0.0',
        traceId: traceId,
        objectId: 'object-roundtrip',
        view: {
            viewType: viewType,
            projection: 'orthographic',
            geometricUse: 'used_for_geometry',
            viewFrame: {
                originPx: { x: 0, y: 0 },
                uAxis: { engineeringAxis: 'X', direction: 1, meaning: 'object length' },
                vAxis: vAxis,
                normalAxis: normalAxis,
                pixelConvention: 'u_right_v_down',
                engineeringOriginDatumId: 'datum-origin'
            },
            sectionBinding: null
        },
        calibration: calibration(),
        geometry: {
            primaryContourId: traceId + '-outer',
            contours: [{
                contourId: traceId + '-outer',
                name: viewType + ' outer silhouette',
                description: 'Roundtrip silhouette for the ' + viewType + ' view.',
                geometry: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: heightPx }, { x: 0, y: heightPx }] },
                closed: true,
                role: 'outer_contour',
                featureKind: 'silhouette',
                references: [],
                sourceSvgElement: null,
                status: 'primary'
            }],
            stations: stations(traceId, vAxis),
            datums: [],
            relations: []
        },
        assets: { sourceImageAssetId: null, sourceSvgAssetId: null, sidecarAssetIds: [traceId + ':legacy'] },
        provenance: {
            producer: { name: 'Engrove Manual Trace', version: '18.0.0' },
            originalSchema: 'engrove_manual_trace_v16',
            sourceFileName: traceId + '-manual-trace-v18.json',
            imageDimensions: { widthPx: 400, heightPx: 200 },
            sourceViewBox: null,
            sourceSvgBinding: null,
            traceDescriptions: [viewType + ' roundtrip view'],
            semanticNames: [traceId],
            aiHints: [],
            references: [],
            exportedAt: '2026-07-25T00:00:00Z',
            sourceDigest: '0'.repeat(64),
            sourceFields: ['image', 'trace_frame', 'shapes']
        }
    };
}

function sidecar(traceId) {
    return {
        assetId: traceId + ':legacy',
        role: 'sidecar',
        mediaType: 'application/json',
        path: 'assets/sidecars/' + traceId + '-manual-trace-v18.json',
        text: JSON.stringify({ schema_version: 'engrove_manual_trace_v16', trace: traceId }, null, 2) + '\n',
        traceIds: [traceId],
        originalFileName: traceId + '-manual-trace-v18.json'
    };
}

function model() {
    const top = trace('top', 40, { engineeringAxis: 'Y', direction: 1, meaning: 'lateral' }, { engineeringAxis: 'Z', direction: 1, meaning: 'vertical normal' });
    const side = trace('side', 20, { engineeringAxis: 'Z', direction: -1, meaning: 'vertical' }, { engineeringAxis: 'Y', direction: 1, meaning: 'lateral normal' });
    return {
        projectId: 'project-roundtrip',
        objectId: 'object-roundtrip',
        name: 'Roundtrip tonearm',
        description: 'Deterministic roundtrip package for the Tonearm importer.',
        objectType: 'tonearm',
        objectName: 'Roundtrip tonearm',
        objectDescription: 'One shared physical object represented by orthographic Manual Trace views.',
        createdAt: '2026-07-25T00:00:00Z',
        producer: { name: 'Engrove Manual Trace', version: '18.0.0' },
        engineeringFrame: {
            origin: { xMm: 0, yMm: 0, zMm: 0, datumId: 'datum-origin' },
            axes: {
                x: { meaning: 'longitudinal', unitVector: { x: 1, y: 0, z: 0 } },
                y: { meaning: 'lateral', unitVector: { x: 0, y: 1, z: 0 } },
                z: { meaning: 'vertical', unitVector: { x: 0, y: 0, z: 1 } }
            },
            handedness: 'right',
            lengthUnit: 'mm',
            objectDirection: { axis: 'X', positiveMeaning: 'positive longitudinal direction', fromDatum: 'datum-origin', toDatum: 'datum-positive-x' },
            datums: [
                { datumId: 'datum-origin', name: 'Engineering origin', kind: 'point', positionMm: { x: 0, y: 0, z: 0 }, description: 'Manual Trace engineering origin.', references: [] },
                { datumId: 'datum-positive-x', name: 'Positive X reference', kind: 'point', positionMm: { x: 200, y: 0, z: 0 }, description: 'Positive longitudinal reference.', references: [] }
            ],
            references: []
        },
        traces: [top, side],
        assets: [sidecar('trace-top'), sidecar('trace-side')],
        provenance: {
            producer: { name: 'Engrove Manual Trace', version: '18.0.0' },
            originalSchema: 'engrove_trace_project_v2',
            sourceFileName: 'roundtrip.engrove-trace',
            exportedAt: '2026-07-25T00:00:00Z',
            sourceFields: ['project_meta', 'package_views', 'workspace'],
            notes: ['Generated locally; no project data was uploaded.']
        },
        fieldDisposition: [
            { sourcePath: 'shapes', status: 'used_for_geometry', reason: 'Mapped to package contours and stations.', targetPath: 'traces.*.geometry' },
            { sourcePath: 'trace_frame', status: 'used_for_geometry', reason: 'Mapped to view frames and calibration.', targetPath: 'traces.*.view' },
            { sourcePath: 'image', status: 'preserved_as_provenance', reason: 'Source raster retained as provenance.', targetPath: 'traces.*.provenance' },
            { sourcePath: 'package_views', status: 'used_for_geometry', reason: 'Mapped to the package trace inventory.', targetPath: 'project.traceFiles' },
            { sourcePath: 'project_meta', status: 'preserved_as_provenance', reason: 'Project naming retained as provenance.', targetPath: 'project.provenance' },
            { sourcePath: 'workspace', status: 'preserved_as_provenance', reason: 'Complete workspace retained as a sidecar.', targetPath: 'assets.sidecars' }
        ]
    };
}


module.exports = { UNIT_PER_PX, STATION_PIXELS, packageModel: model };
