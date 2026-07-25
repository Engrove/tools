// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Prove the production validator agrees with the merged v1 contract oracle on every committed fixture.
 * Inputs: The canonical schemas plus the contract's golden positive and negative fixtures.
 * Outputs: Assertion failures or a scoped machine-readable summary.
 * Safe edits: Additional matched accept/block pairs and integrity probes.
 * Do not: Copy fixtures into this tool, import the test-only oracle as production code, or soften an expectation.
 * Verification: node test/trace-project-package-validator.test.cjs
 */
'use strict';

const assert = require('node:assert/strict');
const validator = require('../js/trace-project-package-validator.js');
const helpers = require('./trace-project-package-fixtures.cjs');

let assertions = 0;
function check(condition, message) {
    assert.ok(condition, message);
    assertions++;
}

function classesOf(result) {
    return new Set((result.diagnostics || []).map(item => item.contractClass).filter(Boolean));
}
function codesOf(result) {
    return new Set((result.diagnostics || []).map(item => item.code));
}

async function validateFixture(pkg) {
    return validator.validatePackage(helpers.readResultFromFixture(pkg), helpers.schemas, {});
}

/**
 * Validates a locally mutated fixture. Digests are recomputed first so each probe isolates the rule it
 * targets instead of tripping the checksum gate that any content edit would otherwise trigger.
 */
async function validateMutated(pkg) {
    return validateFixture(helpers.refreshDigests(pkg));
}

(async function run() {
    // ---- every committed positive fixture must be accepted ----
    const positiveNames = helpers.positiveFixtureNames();
    check(positiveNames.length === 5, 'the contract must still publish five positive fixtures');
    for (const name of positiveNames) {
        const fixture = helpers.positiveFixture(name);
        const result = await validateFixture(fixture.package);
        check(result.ok, 'positive fixture ' + name + ' must validate (' + JSON.stringify(result.diagnostics || []).slice(0, 400) + ')');
        check(fixture.expected.valid === true, 'fixture ' + name + ' must declare itself valid');
        const expectedWarnings = new Set(fixture.expected.warningClasses || []);
        const actualWarnings = new Set((result.warnings || []).flatMap(item => [item.code, item.contractClass]).filter(Boolean));
        for (const warning of expectedWarnings) {
            check(actualWarnings.has(warning), 'fixture ' + name + ' must raise contract warning ' + warning);
        }
    }

    // ---- every committed negative fixture must block with its declared contract class ----
    const negatives = helpers.negativeFixtures();
    check(negatives.length === 14, 'the contract must still publish fourteen negative fixtures');
    for (const negative of negatives) {
        const result = await validateFixture(negative.package);
        check(!result.ok, 'negative fixture ' + negative.name + ' must be blocked');
        check(result.project === undefined, 'negative fixture ' + negative.name + ' must not expose documents');
        check(
            classesOf(result).has(negative.expected.errorClass),
            'negative fixture ' + negative.name + ' must report ' + negative.expected.errorClass + ' (got ' + Array.from(classesOf(result)).join(',') + ')'
        );
    }

    // ---- integrity probes derived from the minimal positive fixture ----
    const base = () => structuredClone(helpers.positiveFixture('minimal-top-side-project').package);

    const missingManifest = await validator.validatePackage({ ok: true, entries: [{ path: 'project.json', bytes: Buffer.from('{}') }], diagnostics: [] }, helpers.schemas, {});
    check(codesOf(missingManifest).has('PACKAGE_MANIFEST_MISSING'), 'a container without manifest.json must block');

    const noSchemas = await validator.validatePackage(helpers.readResultFromFixture(base()), null, {});
    check(codesOf(noSchemas).has('PACKAGE_SCHEMA_UNAVAILABLE'), 'a missing schema set must block rather than skip validation');

    const badMajor = base();
    badMajor.manifest.packageVersion = '2.0.0';
    check(codesOf(await validateMutated(badMajor)).has('PACKAGE_UNSUPPORTED_MAJOR'), 'an unknown major version must block');

    const wrongSize = base();
    wrongSize.manifest.files[0].sizeBytes = wrongSize.manifest.files[0].sizeBytes + 1;
    check(codesOf(await validateFixture(wrongSize)).has('PACKAGE_SIZE_MISMATCH'), 'a declared size mismatch must block');

    const wrongDigest = base();
    wrongDigest.manifest.files[0].sha256 = 'a'.repeat(64);
    check(codesOf(await validateFixture(wrongDigest)).has('PACKAGE_DIGEST_MISMATCH'), 'a digest mismatch must block');

    const undeclared = base();
    undeclared.entries['assets/sidecars/extra.json'] = { kind: 'json', content: { stray: true } };
    check(codesOf(await validateMutated(undeclared)).has('PACKAGE_ENTRY_UNDECLARED'), 'an undeclared container entry must block');

    const missingEntry = base();
    delete missingEntry.entries['traces/trace-top.json'];
    check(codesOf(await validateMutated(missingEntry)).has('PACKAGE_ENTRY_MISSING'), 'a declared but absent entry must block');

    const duplicateId = base();
    duplicateId.entries['project.json'].content.projectId = duplicateId.entries['project.json'].content.object.objectId;
    check(codesOf(await validateMutated(duplicateId)).has('PACKAGE_ID_DUPLICATE'), 'a package-global identity collision must block');

    const unknownDatum = base();
    unknownDatum.entries['traces/trace-top.json'].content.view.viewFrame.engineeringOriginDatumId = 'datum-absent';
    const unknownDatumResult = await validateMutated(unknownDatum);
    check(codesOf(unknownDatumResult).has('PACKAGE_REFERENCE_UNRESOLVED'), 'an unresolved view-origin datum must block');
    check(classesOf(unknownDatumResult).has('VIEW_ORIGIN_DATUM_UNKNOWN'), 'the unresolved datum must carry its contract class');

    // ---- engineering frame arithmetic ----
    const frameCases = [
        ['non-unit', frame => { frame.axes.x.unitVector = { x: 2, y: 0, z: 0 }; }, 'ENGINEERING_FRAME_NON_UNIT'],
        ['non-orthogonal', frame => { frame.axes.y.unitVector = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }; }, 'ENGINEERING_FRAME_NON_ORTHOGONAL'],
        ['left-handed', frame => { frame.axes.z.unitVector = { x: 0, y: 0, z: -1 }; }, 'ENGINEERING_FRAME_HANDEDNESS'],
        ['degenerate', frame => { frame.axes.z.unitVector = { x: 0, y: 0, z: 0 }; }, 'ENGINEERING_FRAME_DEGENERATE'],
        ['non-finite', frame => { frame.axes.x.unitVector = { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }; }, 'ENGINEERING_COORDINATE_INVALID']
    ];
    for (const item of frameCases) {
        const broken = base();
        item[1](broken.entries['project.json'].content.object.engineeringFrame);
        const result = await validateMutated(broken);
        check(!result.ok, 'a ' + item[0] + ' engineering basis must block');
        check(codesOf(result).has('PACKAGE_FRAME_INVALID'), 'a ' + item[0] + ' basis must report PACKAGE_FRAME_INVALID');
        check(classesOf(result).has(item[2]), 'a ' + item[0] + ' basis must report ' + item[2]);
    }
    // The canonical right-handed basis in the fixture is the matching accept case for the probes above.
    check((await validateFixture(base())).ok, 'the canonical right-handed basis must remain accepted');

    // ---- section binding union ----
    const derivedStation = base();
    derivedStation.entries['traces/trace-top.json'].content.view.sectionBinding = { bindingMethod: 'derived_station', stationId: 'station-a' };
    check(codesOf(await validateMutated(derivedStation)).has('PACKAGE_STATION_BINDING_INVALID'), 'derived_station must be rejected in v1');

    const ambiguousBinding = base();
    ambiguousBinding.entries['traces/trace-top.json'].content.view.sectionBinding = { bindingMethod: 'explicit_x', xMm: 10, stationId: 'station-a' };
    check(codesOf(await validateMutated(ambiguousBinding)).has('PACKAGE_STATION_BINDING_INVALID'), 'explicit_x with a stationId must be rejected');

    const boundFixture = helpers.positiveFixture('section-bound-to-station');
    check((await validateFixture(boundFixture.package)).ok, 'a valid explicit_station binding must remain accepted');

    // ---- station consistency is order independent ----
    const rich = helpers.positiveFixture('rich-tonearm-project');
    const forward = await validateFixture(rich.package);
    const reversed = structuredClone(rich.package);
    reversed.entries['project.json'].content.traceFiles.reverse();
    for (const key of Object.keys(reversed.entries)) {
        const stations = reversed.entries[key].content && reversed.entries[key].content.geometry && reversed.entries[key].content.geometry.stations;
        if (Array.isArray(stations)) stations.reverse();
    }
    const reversedResult = await validateMutated(reversed);
    check(forward.ok && reversedResult.ok, 'station verdicts must not depend on manifest or array order');

    const conflicting = structuredClone(rich.package);
    const richTraceKey = Object.keys(conflicting.entries).find(key => key.startsWith('traces/') && (conflicting.entries[key].content.geometry.stations || []).length);
    conflicting.entries[richTraceKey].content.geometry.stations[0].engineeringPosition.xMm += 25;
    const conflictResult = await validateMutated(conflicting);
    check(classesOf(conflictResult).has('STATION_ID_CONFLICT'), 'a station position disagreement must block');

    // ---- unsupported field dispositions ----
    const unsupported = base();
    unsupported.entries['project.json'].content.fieldDisposition.push({ sourcePath: 'traces.trace-top.unsupported', status: 'unsupported_error', reason: 'Not representable in v1.' });
    check(codesOf(await validateMutated(unsupported)).has('PACKAGE_FIELD_UNSUPPORTED'), 'an unsupported_error disposition must block the import');

    const warned = base();
    warned.entries['project.json'].content.fieldDisposition.push({ sourcePath: 'traces.trace-top.hint', status: 'unsupported_warning', reason: 'Advisory only.', warningCode: 'TRACE_HINT_IGNORED' });
    const warnedResult = await validateMutated(warned);
    check(warnedResult.ok, 'an unsupported_warning disposition must not block the import');
    check(warnedResult.warnings.some(item => item.code === 'TRACE_HINT_IGNORED'), 'an unsupported_warning must surface its stable warning code');

    const undisposed = base();
    undisposed.entries['project.json'].content.provenance.sourceFields.push('project.newly.added.field');
    check(codesOf(await validateMutated(undisposed)).has('PACKAGE_FIELD_UNSUPPORTED'), 'a source field without a disposition must block');

    // ---- SVG payloads remain hostile input even when the digest agrees ----
    const svgCases = [
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>', 'a script element'],
        ['<svg xmlns="http://www.w3.org/2000/svg"><rect onload="x()"/></svg>', 'an event handler'],
        ['<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.example/x"/></svg>', 'an external href'],
        ['<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://evil.example/x)"/></svg>', 'a non-fragment url()'],
        ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>', 'an entity declaration'],
        ['<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/></svg>', 'a use element']
    ];
    const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0" fill="url(#gradient)"/></svg>';
    async function validateSvgPayload(text) {
        const entries = [
            { path: 'manifest.json', bytes: helpers.fixtureJsonBytes({ packageVersion: '1.0.0', files: [{ path: 'assets/svg/source.svg', mediaType: 'image/svg+xml' }] }) },
            { path: 'assets/svg/source.svg', bytes: Buffer.from(text, 'utf8') }
        ];
        return validator.validatePackage({ ok: true, entries: entries, diagnostics: [] }, helpers.schemas, {});
    }
    for (const item of svgCases) {
        check(codesOf(await validateSvgPayload(item[0])).has('PACKAGE_SVG_UNSAFE'), 'an SVG asset with ' + item[1] + ' must be rejected');
    }
    check(!codesOf(await validateSvgPayload(safeSvg)).has('PACKAGE_SVG_UNSAFE'), 'an inert SVG with a local fragment reference must not be reported unsafe');

    console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'trace-project-package-validator', assertions: assertions }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
