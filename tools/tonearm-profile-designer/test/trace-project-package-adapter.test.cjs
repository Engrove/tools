// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Prove package views map deterministically into Tonearm descriptors and that unusable packages block.
 * Inputs: Contract fixture bytes converted into real STORE containers.
 * Outputs: Assertion failures or a scoped machine-readable summary.
 * Safe edits: Additional mapping, disposition and determinism assertions.
 * Do not: Assert geometry without also asserting the matching rejection path.
 * Verification: node test/trace-project-package-adapter.test.cjs
 */
'use strict';

const assert = require('node:assert/strict');
const packageImport = require('../js/trace-project-package-adapter.js');
const legacyAdapter = require('../js/manual-trace-3d-adapter.js');
const helpers = require('./trace-project-package-fixtures.cjs');

let assertions = 0;
function check(condition, message) {
    assert.ok(condition, message);
    assertions++;
}
const codesOf = result => new Set((result.diagnostics || []).map(item => item.code));

async function importFixture(name, options) {
    const pkg = helpers.positiveFixture(name).package;
    return packageImport.importPackageBytes(helpers.zipFromFixture(pkg), Object.assign({ fileName: name + '.engrove-trace-project', schemas: helpers.schemas }, options || {}));
}
async function importMutated(pkg, options) {
    return packageImport.importPackageBytes(
        helpers.zipFromFixture(helpers.refreshDigests(pkg)),
        Object.assign({ fileName: 'mutated.engrove-trace-project', schemas: helpers.schemas }, options || {})
    );
}

(async function run() {
    // ---- minimal top + side maps into the legacy descriptor shape ----
    const minimal = await importFixture('minimal-top-side-project');
    check(minimal.ok, 'the minimal top/side package must import: ' + JSON.stringify(minimal.diagnostics || []).slice(0, 400));
    check(minimal.packageVersion === '1.0.0', 'the import must report the package version');
    check(/^[a-f0-9]{64}$/.test(minimal.packageSha256), 'the import must report a package SHA-256 identity');
    check(minimal.projectId === 'project-minimal-top-side-project', 'the import must report the project identity');
    check(minimal.traceIds.length === 2, 'the import must report both trace identities');

    const views = minimal.normalizedDescriptor.views;
    check(views.length === 2, 'the minimal package must yield two loft views');
    check(views.map(view => view.plane).sort().join(',') === 'side,top', 'the package must yield one top and one side view');
    for (const view of views) {
        check(view.schema === packageImport.DESCRIPTOR_SCHEMA, 'each view must use the descriptor schema the loft builder consumes');
        check(view.planeLocked === true, 'a contract-declared view must not be operator-overridable');
        check(view.planeOverride === null, 'a package view must not carry an operator override');
        check(view.unit === 'mm', 'each view must report millimetres');
        check(view.unitPerPixel === 0.5, 'each view must carry the calibrated scale');
        check(view.contours.length === view.contourCount, 'contourCount must match the mapped contours');
        check(view.contours.every(contour => contour.points.length >= 2), 'each contour must carry at least two points');
    }

    // The fixture top contour is a 100x20 px rectangle at 0.5 mm/px from a datum at the origin.
    const topPoints = views.find(view => view.plane === 'top').contours[0].points;
    assert.deepEqual(topPoints, [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, { x: 50, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }]);
    assertions++;
    const sidePoints = views.find(view => view.plane === 'side').contours[0].points;
    check(sidePoints.every(point => point.y === 0), 'a side view must place its transverse extent on Z, not Y');
    check(sidePoints.some(point => point.z !== 0), 'a side view must carry a non-zero Z extent');

    // ---- determinism: the same bytes import to an identical descriptor ----
    const repeat = await importFixture('minimal-top-side-project');
    assert.deepEqual(repeat.normalizedDescriptor, minimal.normalizedDescriptor);
    assertions++;
    assert.deepEqual(repeat.provenance, minimal.provenance);
    assertions++;
    check(repeat.packageSha256 === minimal.packageSha256, 'repeated imports must report one package identity');

    // ---- the descriptor is accepted by the existing loft builder ----
    const loft = legacyAdapter.buildFreeformState(minimal.normalizedDescriptor.views, { stationCount: 14 });
    check(loft.schema === 'tonearm-designer-freeform-loft-state-v1', 'the package descriptor must build a Freeform loft state');
    check(loft.rings.length >= 4, 'the loft must resolve at least four stations');
    check(loft.centerline.points.length === loft.rings.length, 'centerline and ring counts must agree');

    // ---- provenance is preserved and dispositions are reported ----
    const rich = await importFixture('rich-tonearm-project');
    check(rich.ok, 'the rich package must import: ' + JSON.stringify(rich.diagnostics || []).slice(0, 400));
    check(rich.provenance.packageSha256 === rich.packageSha256, 'provenance must carry the package identity');
    check(rich.provenance.producer !== null, 'provenance must retain the producer record');
    check(rich.provenance.preservedFields.length > 0, 'preserved_as_provenance fields must survive the import');
    check(rich.provenance.traces.length === rich.traceIds.length, 'provenance must describe every trace');
    check(rich.provenance.ignoredFields.length > 0, 'fields outside the loft must be reported, not dropped');
    check(
        rich.warnings.some(item => item.code === 'PACKAGE_SECTION_GEOMETRY_NOT_CONSUMED'),
        'a bound section the v1 kernel cannot consume must raise a stable warning'
    );
    check(rich.ok, 'a preserved-but-unconsumed section must not reject an otherwise usable package');

    // ---- packages without a loft-capable view pair block with stable codes ----
    const frontOnly = await importFixture('front-provenance-only');
    check(!frontOnly.ok, 'a package without top and side views must not produce geometry');
    check(codesOf(frontOnly).has('PACKAGE_REQUIRED_TOP_TRACE_MISSING'), 'a missing top view must be reported');
    check(codesOf(frontOnly).has('PACKAGE_REQUIRED_SIDE_TRACE_MISSING'), 'a missing side view must be reported');
    check(frontOnly.normalizedDescriptor === null, 'a rejected import must expose no descriptor');

    const sideless = helpers.positiveFixture('minimal-top-side-project').package;
    const sideKey = 'traces/trace-side.json';
    sideless.entries[sideKey].content.view.geometricUse = 'preserved_as_provenance';
    sideless.entries['project.json'].content.traceFiles.find(item => item.path === sideKey).geometricUse = 'preserved_as_provenance';
    const sidelessResult = await importMutated(sideless);
    check(codesOf(sidelessResult).has('PACKAGE_REQUIRED_SIDE_TRACE_MISSING'), 'a provenance-only side view must not be used as geometry');

    // ---- mapping failures block instead of guessing ----
    const noOriginPosition = helpers.positiveFixture('minimal-top-side-project').package;
    const datums = noOriginPosition.entries['project.json'].content.object.engineeringFrame.datums;
    delete datums.find(item => item.datumId === 'datum-stylus').positionMm;
    check(
        codesOf(await importMutated(noOriginPosition)).has('PACKAGE_VIEW_ORIGIN_POSITION_MISSING'),
        'a view origin datum without a position must block rather than assume zero'
    );

    const rotatedLongitudinal = helpers.positiveFixture('minimal-top-side-project').package;
    rotatedLongitudinal.entries['project.json'].content.object.engineeringFrame.objectDirection.axis = 'Z';
    check(
        codesOf(await importMutated(rotatedLongitudinal)).has('PACKAGE_VIEW_AXIS_UNMAPPABLE'),
        'a longitudinal axis outside the top view plane must block'
    );

    // ---- a rejected container never reaches the mapping stage ----
    const corrupt = await packageImport.importPackageBytes(new Uint8Array(16), { fileName: 'corrupt.engrove-trace-project', schemas: helpers.schemas });
    check(!corrupt.ok, 'a non-container file must be rejected');
    check(corrupt.normalizedDescriptor === null && corrupt.provenance === null, 'a rejected container must expose neither geometry nor provenance');
    check(codesOf(corrupt).has('PACKAGE_ZIP_INVALID'), 'a non-container file must report a container diagnostic');

    const noSchemas = await packageImport.importPackageBytes(
        helpers.zipFromFixture(helpers.positiveFixture('minimal-top-side-project').package),
        { fileName: 'x.engrove-trace-project', schemaDirectory: '/nonexistent/schema/dir' }
    );
    check(codesOf(noSchemas).has('PACKAGE_SCHEMA_UNAVAILABLE'), 'unavailable contract schemas must block the import');

    // ---- the default Node schema resolution finds the repository contract ----
    const withoutInjectedSchemas = await packageImport.importPackageBytes(
        helpers.zipFromFixture(helpers.positiveFixture('minimal-top-side-project').package),
        { fileName: 'x.engrove-trace-project' }
    );
    check(withoutInjectedSchemas.ok, 'the default schema resolution must locate the repository contract');

    console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'trace-project-package-adapter', assertions: assertions }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
