#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress the renderer-independent mesh measurements, the export gate and both STL writers.
 * Inputs: Hand-built meshes whose closure, volume and winding are known by construction.
 * Outputs: Process status through behavior assertions.
 * Safe edits: Additional meshes with an independently known expected result.
 * Do not: Assert a serializer's output without decoding it back, or accept an open mesh.
 * Verification: npm test.
 */
'use strict';

const assert = require('node:assert/strict');
const meshTools = require('../js/pattern-mesh.js');

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

/** A unit-ish box of known volume, wound outward. Its volume and area are known without measuring them. */
function box(sx, sy, sz) {
    const vertices = [
        { x: 0, y: 0, z: 0 }, { x: sx, y: 0, z: 0 }, { x: sx, y: sy, z: 0 }, { x: 0, y: sy, z: 0 },
        { x: 0, y: 0, z: sz }, { x: sx, y: 0, z: sz }, { x: sx, y: sy, z: sz }, { x: 0, y: sy, z: sz }
    ];
    const faces = [
        [0, 2, 1], [0, 3, 2],
        [4, 5, 6], [4, 6, 7],
        [0, 1, 5], [0, 5, 4],
        [1, 2, 6], [1, 6, 5],
        [2, 3, 7], [2, 7, 6],
        [3, 0, 4], [3, 4, 7]
    ];
    return { units: 'mm', vertices, faces };
}

// ---- closure is read from the topology, not from a flag a producer may not set ----
const solid = box(10, 4, 2);
const measured = meshTools.metrics(solid);
check(measured.closed === true, 'a box with every edge shared twice must measure as closed');
check(measured.boundaryEdgeCount === 0, 'a closed box must report no boundary edges');
check(measured.triangleCount === 12, 'the box must measure 12 triangles');
check(Math.abs(measured.volumeMm3 - 80) < 1e-9, 'the box volume must be 80 mm³, got ' + measured.volumeMm3);
check(Math.abs(measured.surfaceAreaMm2 - 2 * (10 * 4 + 10 * 2 + 4 * 2)) < 1e-9, 'the box area must match its faces');
check(measured.volumeIsMeaningful === true, 'a closed non-degenerate box must yield a meaningful volume');
check(measured.bbox.lengthX === 10 && measured.bbox.lengthY === 4 && measured.bbox.lengthZ === 2, 'the bounding box must match the built extents');

// A producer that lies about closure must not be believed: the split module emits halves with no flag at
// all, and the loft kernel emits a `validation` block, so neither may be the source of truth here.
const liar = box(10, 4, 2);
liar.faces = liar.faces.slice(0, 11);
liar.validation = { closed: true };
liar.closed = true;
const lied = meshTools.metrics(liar);
check(lied.closed === false, 'a mesh missing a face must measure as open however it labels itself');
check(lied.boundaryEdgeCount === 3, 'removing one triangle must expose exactly three boundary edges, got ' + lied.boundaryEdgeCount);
check(lied.volumeIsMeaningful === false, 'an open mesh must not report a meaningful volume');

// ---- the export gate refuses what a slicer cannot use ----
check(meshTools.exportable(solid).ok === true, 'a closed box must be exportable');
const openGate = meshTools.exportable(liar);
check(openGate.ok === false, 'an open mesh must be refused');
check(openGate.reasons.join(' ').includes('not closed'), 'the refusal must say the mesh is not closed');
check(meshTools.exportable({ vertices: [], faces: [] }).ok === false, 'an empty mesh must be refused');

const inverted = box(10, 4, 2);
inverted.faces = inverted.faces.map(face => [face[0], face[2], face[1]]);
const invertedGate = meshTools.exportable(inverted);
check(meshTools.metrics(inverted).volumeMm3 < 0, 'reversed winding must give a negative signed volume');
check(invertedGate.ok === false, 'an inside-out mesh must be refused');
check(invertedGate.reasons.join(' ').includes('wound inside out'), 'the refusal must name the winding');

const collinear = { units: 'mm', vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], faces: [[0, 1, 2]] };
check(meshTools.metrics(collinear).degenerateTriangleCount === 1, 'three collinear but distinct vertices must count as degenerate');
check(meshTools.exportable(collinear).ok === false, 'a zero-area triangle must be refused');

// ---- mass estimate ----
check(Math.abs(meshTools.estimatedMassGrams(solid, 1.24) - 0.0992) < 1e-9, 'the mass estimate must follow volume times density');
check(meshTools.estimatedMassGrams(liar, 1.24) === null, 'an open mesh has no volume to weigh');
check(meshTools.estimatedMassGrams(solid, 0) === null, 'a non-positive density must not produce a mass');

// ---- binary STL decodes back to the same triangles ----
const binary = meshTools.binarySTL(solid);
check(binary.length === 84 + 12 * 50, 'the binary STL must be header plus count plus 50 bytes per facet');
const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
check(view.getUint32(80, true) === 12, 'the binary STL must declare 12 facets');
let decodedVolume = 0;
for (let index = 0; index < 12; index++) {
    const offset = 84 + index * 50;
    const corner = position => ({
        x: view.getFloat32(offset + 12 + position * 12, true),
        y: view.getFloat32(offset + 16 + position * 12, true),
        z: view.getFloat32(offset + 20 + position * 12, true)
    });
    const a = corner(0), b = corner(1), c = corner(2);
    decodedVolume += (a.x * (b.y * c.z - c.y * b.z) - a.y * (b.x * c.z - c.x * b.z) + a.z * (b.x * c.y - c.x * b.y)) / 6;
    const nx = view.getFloat32(offset, true), ny = view.getFloat32(offset + 4, true), nz = view.getFloat32(offset + 8, true);
    check(Math.abs(Math.sqrt(nx * nx + ny * ny + nz * nz) - 1) < 1e-5, 'facet ' + index + ' must carry a unit normal');
    check(view.getUint16(offset + 48, true) === 0, 'facet ' + index + ' must carry a zero attribute count');
}
check(Math.abs(decodedVolume - 80) < 1e-4, 'the decoded binary STL must enclose the same volume, got ' + decodedVolume);
check(binary.length >= 80 && Array.from(binary.slice(0, 7)).map(code => String.fromCharCode(code)).join('') === 'Engrove', 'the binary header must identify the producer');

// ---- ASCII STL parses back to the same triangles ----
const ascii = meshTools.asciiSTL(solid);
check(ascii.startsWith('solid engrove_trace_to_plug_pattern\n'), 'the ASCII STL must open with a named solid');
check(ascii.trimEnd().endsWith('endsolid engrove_trace_to_plug_pattern'), 'the ASCII STL must close the solid it opened');
check((ascii.match(/facet normal/g) || []).length === 12, 'the ASCII STL must write 12 facets');
check((ascii.match(/vertex /g) || []).length === 36, 'the ASCII STL must write three vertices per facet');
const asciiPoints = (ascii.match(/vertex ([-0-9.]+) ([-0-9.]+) ([-0-9.]+)/g) || [])
    .map(line => line.split(/\s+/).slice(1).map(Number));
let asciiVolume = 0;
for (let index = 0; index < asciiPoints.length; index += 3) {
    const a = asciiPoints[index], b = asciiPoints[index + 1], c = asciiPoints[index + 2];
    asciiVolume += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
}
check(Math.abs(asciiVolume - 80) < 1e-6, 'the parsed ASCII STL must enclose the same volume, got ' + asciiVolume);

// A degenerate facet gets a zero normal rather than an invented direction, which is the STL convention
// for "derive it from the winding" and keeps the writer from asserting a direction it cannot know.
const degenerateAscii = meshTools.asciiSTL(collinear);
check(/facet normal 0\.000000e\+0*\s+0\.000000e\+0*\s+0\.000000e\+0*/.test(degenerateAscii),
    'a degenerate facet must be written with a zero normal, got ' + degenerateAscii.split('\n')[1]);

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'pattern-mesh', assertions }, null, 2));
