// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Prove a package produced by the Manual Trace production exporter imports into Tonearm and reaches a mesh.
 * Inputs: The merged v1 schemas, the Manual Trace production export runtime, and the Freeform kernel modules.
 * Outputs: Assertion failures or a scoped machine-readable summary.
 * Safe edits: Additional roundtrip, determinism and no-mutation assertions.
 * Do not: Hand-write container bytes for the positive path or bypass the production export gate.
 * Verification: node test/trace-project-package-roundtrip.test.cjs
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const packageImport = require('../js/trace-project-package-adapter.js');
const legacyAdapter = require('../js/manual-trace-3d-adapter.js');
const helpers = require('./trace-project-package-fixtures.cjs');

require(path.join(helpers.REPOSITORY_ROOT, 'tools', 'manual-trace', 'trace-project-package-production.js'));
const production = globalThis.EngroveTraceProjectPackageProduction;

let assertions = 0;
function check(condition, message) {
    assert.ok(condition, message);
    assertions++;
}

const { UNIT_PER_PX, STATION_PIXELS, packageModel: model } = require('./trace-project-package-model.cjs');

(async function run() {
    // ---- the package is produced by the merged production export path ----
    const built = await production.buildValidatedZipPackage(model(), { schemas: helpers.schemas });
    check(built.zipBytes instanceof Uint8Array && built.zipBytes.byteLength > 0, 'the production exporter must emit ZIP bytes');
    check(built.orderedPaths[0] === 'manifest.json', 'manifest.json must lead the deterministic entry order');

    const rebuilt = await production.buildValidatedZipPackage(model(), { schemas: helpers.schemas });
    assert.deepEqual(Array.from(rebuilt.zipBytes), Array.from(built.zipBytes));
    assertions++;

    // ---- Tonearm imports the exported bytes ----
    const imported = await packageImport.importPackageBytes(built.zipBytes, { fileName: 'roundtrip.engrove-trace-project', schemas: helpers.schemas });
    check(imported.ok, 'the exported package must import: ' + JSON.stringify(imported.diagnostics || []).slice(0, 600));
    check(imported.projectId === 'project-roundtrip', 'the import must report the exported project identity');
    check(imported.traceIds.join(',') === 'trace-side,trace-top', 'the import must report both exported traces');
    check(imported.normalizedDescriptor.longitudinalAxis === 'X', 'the import must adopt the declared longitudinal axis');

    const views = imported.normalizedDescriptor.views;
    check(views.length === 2, 'the exported package must yield two loft views');
    const top = views.find(view => view.plane === 'top');
    const side = views.find(view => view.plane === 'side');
    check(top.stationX.length === STATION_PIXELS.length, 'exported top stations must survive the import');
    assert.deepEqual(top.stationX, STATION_PIXELS.map(value => value * UNIT_PER_PX));
    assertions++;
    assert.deepEqual(side.stationX, STATION_PIXELS.map(value => value * UNIT_PER_PX));
    assertions++;

    // 400 px at 0.5 mm/px is a 200 mm object; the top view is 40 px (20 mm) wide, the side 20 px (10 mm) tall.
    const extent = (points, axis) => ({ min: Math.min(...points.map(point => point[axis])), max: Math.max(...points.map(point => point[axis])) });
    const topExtent = extent(top.contours[0].points, 'x');
    check(topExtent.min === 0 && topExtent.max === 200, 'the imported top view must span the calibrated object length');
    const widthExtent = extent(top.contours[0].points, 'y');
    check(widthExtent.max - widthExtent.min === 20, 'the imported top view must carry the calibrated width');
    const heightExtent = extent(side.contours[0].points, 'z');
    check(heightExtent.max - heightExtent.min === 10, 'the imported side view must carry the calibrated height');

    // ---- repeated import of identical bytes is deterministic ----
    const again = await packageImport.importPackageBytes(built.zipBytes, { fileName: 'roundtrip.engrove-trace-project', schemas: helpers.schemas });
    assert.deepEqual(again.normalizedDescriptor, imported.normalizedDescriptor);
    assertions++;
    assert.deepEqual(again.provenance, imported.provenance);
    assertions++;

    // ---- the descriptors reach a real mesh through the existing kernel ----
    const context = { console, Math, Number, Object, Array, JSON, Set, Map, Date, globalThis: null, window: null };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    for (const file of ['freeform-centerline.js', 'freeform-rings.js', 'freeform-features.js', 'freeform-schema.js', 'freeform-loft-kernel.js']) {
        vm.runInContext(fs.readFileSync(path.join(helpers.REPOSITORY_ROOT, 'tools', 'tonearm-profile-designer', 'js', file), 'utf8'), context, { filename: file });
    }
    const proposed = legacyAdapter.buildFreeformState(views, {
        baseState: context.FreeformLoftKernel.defaultState('straight_low_mass_lt_arm'),
        stationCount: 14
    });
    const sanitized = context.FreeformLoftKernel.sanitizeState(proposed);
    check(sanitized.rings.length >= 4, 'the sanitized loft must retain at least four rings');
    check(sanitized.rings.every(ring => ring.widthMm === 20), 'every sanitized ring must carry the calibrated width');
    check(sanitized.rings.every(ring => ring.heightMm === 10), 'every sanitized ring must carry the calibrated height');

    const geometry = context.FreeformLoftKernel.buildFreeformGeometry(sanitized, { stationCount: 12, segmentCount: 24 });
    check(geometry.mesh.vertices.length > 100, 'the imported package must produce mesh vertices');
    check(geometry.mesh.faces.length > 100, 'the imported package must produce mesh faces');
    check(geometry.bbox.length === 200, 'the mesh must span the calibrated object length');

    // ---- an invalidated package blocks and yields nothing to apply ----
    const tampered = Uint8Array.from(built.zipBytes);
    const marker = Buffer.from(tampered).indexOf(Buffer.from('"packageVersion": "1.0.0"', 'utf8'));
    check(marker > 0, 'the manifest version must be locatable for the tamper probe');
    tampered[marker + 20] = '9'.charCodeAt(0);
    const tamperedResult = await packageImport.importPackageBytes(tampered, { fileName: 'tampered.engrove-trace-project', schemas: helpers.schemas });
    check(!tamperedResult.ok, 'a tampered package must be rejected');
    check(tamperedResult.normalizedDescriptor === null, 'a tampered package must not expose geometry');
    check(
        tamperedResult.diagnostics.some(item => item.code === 'PACKAGE_ZIP_CRC_MISMATCH' || item.code === 'PACKAGE_DIGEST_MISMATCH'),
        'a tampered package must report an integrity diagnostic'
    );

    console.log(JSON.stringify({
        status: 'PASS_WITH_SCOPE',
        test: 'trace-project-package-roundtrip',
        assertions: assertions,
        packageBytes: built.zipBytes.byteLength,
        vertices: geometry.mesh.vertices.length,
        faces: geometry.mesh.faces.length
    }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
