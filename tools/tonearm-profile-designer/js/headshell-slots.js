/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F headshell-slots.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/headshell-slots.js
 * Phase 6 Cobra integrated headshell slot capability.
 *
 * This module implements a real, validated state model for two obround
 * cartridge-mounting slots in the integrated headshell slot-carrier/reference
 * geometry. TD051 separates this slot carrier from the titaniumMountPlate:
 * the titanium mount plate is a structural laminated interface plate and is
 * built by js/titanium-mount-plate.js, never by this module.
 * This module exposes descriptor geometry, reference carrier geometry and report data without claiming
 * local plate-level CSG subtraction for the integrated slots; arbitrary arm-body CAD booleans remain explicitly separate.
 */
(function(root) {
    'use strict';

    const FEATURE_SCHEMA = 'cobra-headshell-slots-v2';
    const MANIFEST_VERSION = 2;
    const TARGET_N1P2_MM = 237.05;
    const N1P2_TOLERANCE_MM = 0.01;

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback) {
        if (value === true || value === false) return value;
        return fallback;
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clamp(value, min, max, fallback) {
        const n = finite(value, fallback);
        return Math.max(min, Math.min(max, n));
    }

    function getDefaultSpec() {
        return {
            enabled: true,
            variant: 'integrated_obround_cartridge_slots',
            screwStandard: 'M2.5',
            throughHole: true,
            slotCount: 2,
            slotCarrierPlate: {
                enabled: true,
                semanticType: 'slot_carrier_reference_geometry',
                description: 'Reference/carrier geometry for half-inch cartridge slots; not the titanium structural mount plate.',
                lengthMm: 24,
                widthMm: 18,
                thicknessMm: 2.6,
                xMm: 10.2,
                yMm: 0,
                zMm: 0
            },
            plate: {
                enabled: true,
                semanticType: 'legacy_slot_carrier_alias_not_titanium',
                description: 'Legacy alias for slotCarrierPlate only; not the TD051 titaniumMountPlate.',
                lengthMm: 24,
                widthMm: 18,
                thicknessMm: 2.6,
                xMm: 10.2,
                yMm: 0,
                zMm: 0
            },
            slots: [
                {
                    id: 'slot_left',
                    lengthMm: 8,
                    widthMm: 2.6,
                    centerXMm: 10.2,
                    centerYMm: -5.4,
                    angleDeg: 0
                },
                {
                    id: 'slot_right',
                    lengthMm: 8,
                    widthMm: 2.6,
                    centerXMm: 10.2,
                    centerYMm: 5.4,
                    angleDeg: 0
                }
            ],
            screwMarkers: {
                enabled: true,
                diameterMm: 2.5,
                headDiameterMm: 5.0
            },
            integration: {
                renderMode: 'csg_slotted_plate',
                exportMode: 'csg_slotted_plate_geometry',
                booleanCutStatus: 'partial_csg'
            }
        };
    }

    function sourceSpec(source) {
        if (!isObject(source)) return {};
        if (isObject(source.cobraArchitecture) && isObject(source.cobraArchitecture.headshellSlots)) {
            return source.cobraArchitecture.headshellSlots;
        }
        if (isObject(source.headshellSlots)) return source.headshellSlots;
        return source;
    }

    function getSlotCarrierPlate(spec) {
        const s = isObject(spec) ? spec : {};
        if (isObject(s.slotCarrierPlate)) return s.slotCarrierPlate;
        if (isObject(s.plate)) return s.plate;
        return getDefaultSpec().slotCarrierPlate;
    }

    function normalizeSlot(raw, fallback, index) {
        const f = fallback || {};
        const s = isObject(raw) ? raw : {};
        return {
            id: String(s.id || f.id || ('slot_' + (index + 1))),
            lengthMm: clamp(s.lengthMm, 0, 80, finite(f.lengthMm, 8)),
            widthMm: clamp(s.widthMm, 0, 30, finite(f.widthMm, 2.6)),
            centerXMm: finite(s.centerXMm !== undefined ? s.centerXMm : s.centerX, finite(f.centerXMm, 10.2)),
            centerYMm: finite(s.centerYMm !== undefined ? s.centerYMm : s.centerY, finite(f.centerYMm, index === 0 ? -5.4 : 5.4)),
            angleDeg: finite(s.angleDeg, finite(f.angleDeg, 0))
        };
    }

    function normalizeSpec(source) {
        const raw = sourceSpec(source);
        const def = getDefaultSpec();
        const out = clone(def);

        out.enabled = bool(raw.enabled, out.enabled);
        out.variant = raw.variant === 'integrated_obround_cartridge_slots'
            ? 'integrated_obround_cartridge_slots'
            : out.variant;
        out.screwStandard = (typeof raw.screwStandard === 'string' && raw.screwStandard.trim())
            ? raw.screwStandard
            : out.screwStandard;
        out.throughHole = bool(raw.throughHole, out.throughHole);
        out.slotCount = Math.max(0, Math.round(finite(raw.slotCount, out.slotCount)));

        const rawCarrier = isObject(raw.slotCarrierPlate) ? raw.slotCarrierPlate : (isObject(raw.plate) ? raw.plate : null);
        if (rawCarrier) {
            out.slotCarrierPlate.enabled = bool(rawCarrier.enabled, out.slotCarrierPlate.enabled);
            out.slotCarrierPlate.lengthMm = clamp(rawCarrier.lengthMm, 0, 100, out.slotCarrierPlate.lengthMm);
            out.slotCarrierPlate.widthMm = clamp(rawCarrier.widthMm, 0, 80, out.slotCarrierPlate.widthMm);
            out.slotCarrierPlate.thicknessMm = clamp(rawCarrier.thicknessMm, 0, 20, out.slotCarrierPlate.thicknessMm);
            out.slotCarrierPlate.xMm = finite(rawCarrier.xMm, out.slotCarrierPlate.xMm);
            out.slotCarrierPlate.yMm = finite(rawCarrier.yMm, out.slotCarrierPlate.yMm);
            out.slotCarrierPlate.zMm = finite(rawCarrier.zMm, out.slotCarrierPlate.zMm);
        }
        out.slotCarrierPlate.semanticType = 'slot_carrier_reference_geometry';
        out.slotCarrierPlate.description = 'Reference/carrier geometry for half-inch cartridge slots; not the titanium structural mount plate.';
        out.plate = clone(out.slotCarrierPlate);
        out.plate.semanticType = 'legacy_slot_carrier_alias_not_titanium';
        out.plate.description = 'Legacy alias for slotCarrierPlate only; not the TD051 titaniumMountPlate.';

        const rawSlots = Array.isArray(raw.slots) ? raw.slots : def.slots;
        out.slots = rawSlots.map((slot, index) => normalizeSlot(slot, def.slots[index] || def.slots[0], index));
        if (out.slots.length === 0) out.slots = def.slots.map((slot, index) => normalizeSlot(slot, slot, index));
        out.slotCount = Math.max(out.slotCount, out.slots.length);

        if (isObject(raw.screwMarkers)) {
            out.screwMarkers.enabled = bool(raw.screwMarkers.enabled, out.screwMarkers.enabled);
            out.screwMarkers.diameterMm = clamp(raw.screwMarkers.diameterMm, 0, 20, out.screwMarkers.diameterMm);
            out.screwMarkers.headDiameterMm = clamp(raw.screwMarkers.headDiameterMm, 0, 30, out.screwMarkers.headDiameterMm);
        }

        if (isObject(raw.integration)) {
            out.integration.renderMode = (typeof raw.integration.renderMode === 'string' && raw.integration.renderMode.trim())
                ? raw.integration.renderMode
                : out.integration.renderMode;
            out.integration.exportMode = (typeof raw.integration.exportMode === 'string' && raw.integration.exportMode.trim())
                ? raw.integration.exportMode
                : out.integration.exportMode;
            out.integration.booleanCutStatus = (raw.integration.booleanCutStatus === 'full_csg' || raw.integration.booleanCutStatus === 'partial_csg')
                ? raw.integration.booleanCutStatus
                : out.integration.booleanCutStatus;
        }

        return out;
    }

    function readInput(source, id, fallback) {
        const s = isObject(source) ? source : {};
        if (Object.prototype.hasOwnProperty.call(s, id)) return s[id];
        if (isObject(s.inputs) && Object.prototype.hasOwnProperty.call(s.inputs, id)) return s.inputs[id];
        return fallback;
    }

    function getN1P2Mm(source) {
        const apex = finite(readInput(source, 'apex', 237), 237);
        const cartX = finite(readInput(source, 'cartX', -0.05), -0.05);
        return apex - cartX;
    }

    function isCanonicalCobraPresetActive(source) {
        const s = isObject(source) ? source : {};
        const arch = isObject(s.cobraArchitecture) ? s.cobraArchitecture : {};
        const rearMode = readInput(s, 'rearMode', (s.selects && s.selects.rearMode) || s.rearMode);
        return arch.enabled === true &&
            arch.specRegime === 'custom_237_05' &&
            rearMode === 'cobra_integrated_tail';
    }

    function symmetryError(slots) {
        if (!Array.isArray(slots) || slots.length < 2) return null;
        const a = slots[0];
        const b = slots[1];
        return Math.abs(finite(a.centerYMm, 0) + finite(b.centerYMm, 0));
    }

    function slotWithinPlate(slot, plate) {
        const halfLength = finite(plate.lengthMm, 0) / 2;
        const halfWidth = finite(plate.widthMm, 0) / 2;
        const sx0 = finite(slot.centerXMm, 0) - finite(slot.lengthMm, 0) / 2;
        const sx1 = finite(slot.centerXMm, 0) + finite(slot.lengthMm, 0) / 2;
        const sy0 = finite(slot.centerYMm, 0) - finite(slot.widthMm, 0) / 2;
        const sy1 = finite(slot.centerYMm, 0) + finite(slot.widthMm, 0) / 2;
        const px0 = finite(plate.xMm, 0) - halfLength;
        const px1 = finite(plate.xMm, 0) + halfLength;
        const py0 = finite(plate.yMm, 0) - halfWidth;
        const py1 = finite(plate.yMm, 0) + halfWidth;
        return sx0 >= px0 - 1e-6 && sx1 <= px1 + 1e-6 &&
            sy0 >= py0 - 1e-6 && sy1 <= py1 + 1e-6;
    }

    function validateSpec(sessionOrState) {
        const s = isObject(sessionOrState) ? sessionOrState : {};
        const spec = normalizeSpec(s);
        const errors = [];
        const warnings = [];
        const slots = spec.slots || [];
        const measured = {
            slotCount: slots.length,
            slotLengthMinMm: slots.length ? Math.min.apply(null, slots.map(slot => finite(slot.lengthMm, 0))) : null,
            slotWidthMinMm: slots.length ? Math.min.apply(null, slots.map(slot => finite(slot.widthMm, 0))) : null,
            slotSymmetryErrorMm: symmetryError(slots),
            plateLengthMm: getSlotCarrierPlate(spec).lengthMm,
            plateWidthMm: getSlotCarrierPlate(spec).widthMm,
            throughHole: spec.throughHole === true,
            n1p2Mm: getN1P2Mm(s),
            booleanCutStatus: spec.integration.booleanCutStatus
        };

        if (spec.enabled !== true) errors.push('headshellSlots.enabled must be true for Cobra integrated slot validation.');
        if (spec.variant !== 'integrated_obround_cartridge_slots') errors.push('headshellSlots.variant must be integrated_obround_cartridge_slots.');
        if (slots.length < 2 || spec.slotCount < 2) errors.push('slot count must be at least 2.');
        if (spec.throughHole !== true) errors.push('throughHole must be true.');
        if (!(typeof spec.screwStandard === 'string' && spec.screwStandard.trim())) errors.push('screwStandard is required.');
        if (getSlotCarrierPlate(spec).lengthMm <= 0) errors.push('plate length must be positive.');
        if (getSlotCarrierPlate(spec).widthMm <= 0) errors.push('plate width must be positive.');
        if (spec.plate.thicknessMm <= 0) errors.push('plate thickness must be positive.');
        if (spec.screwMarkers.enabled && spec.screwMarkers.diameterMm <= 0) errors.push('screw marker diameter must be positive when enabled.');

        slots.forEach(slot => {
            if (slot.lengthMm <= 0) errors.push(slot.id + ' slot length must be positive.');
            if (slot.widthMm <= 0) errors.push(slot.id + ' slot width must be positive.');
            if (slot.lengthMm <= slot.widthMm) errors.push(slot.id + ' slot length must be greater than slot width.');
            if (!slotWithinPlate(slot, getSlotCarrierPlate(spec))) errors.push(slot.id + ' slot is outside plate envelope.');
        });

        if (measured.slotSymmetryErrorMm === null || measured.slotSymmetryErrorMm > 0.25) {
            errors.push('slot symmetry error must be <= 0.25 mm.');
        }

        if (isCanonicalCobraPresetActive(s) && Math.abs(measured.n1p2Mm - TARGET_N1P2_MM) > N1P2_TOLERANCE_MM) {
            errors.push('Canonical Cobra preset requires N1-P2 237.05 ± 0.01 mm; measured ' + measured.n1p2Mm.toFixed(3) + ' mm.');
        } else if (!isCanonicalCobraPresetActive(s) && Math.abs(measured.n1p2Mm - TARGET_N1P2_MM) > N1P2_TOLERANCE_MM) {
            warnings.push('Non-canonical Cobra/session context: N1-P2 is ' + measured.n1p2Mm.toFixed(3) + ' mm. Export must not mutate apex/cartX to canonical values.');
        }

        if (spec.integration.booleanCutStatus !== 'full_csg') {
            warnings.push('Headshell slot boolean cut status is ' + spec.integration.booleanCutStatus + '; do not claim full_csg until slotted export mesh audit verifies it.');
        }

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings,
            measured,
            normalized: spec
        };
    }

    function buildSlotDescriptors(sessionOrState) {
        const spec = normalizeSpec(sessionOrState);
        return spec.slots.map(slot => ({
            id: slot.id,
            semanticType: 'cartridge_mounting_slot',
            geometryType: 'obround_through_slot_void',
            screwStandard: spec.screwStandard,
            throughHole: spec.throughHole === true,
            lengthMm: slot.lengthMm,
            widthMm: slot.widthMm,
            centerXMm: slot.centerXMm,
            centerYMm: slot.centerYMm,
            angleDeg: slot.angleDeg,
            slotCarrierPlate: clone(getSlotCarrierPlate(spec)),
                plate: clone(getSlotCarrierPlate(spec)),
            booleanCutStatus: spec.integration.booleanCutStatus
        }));
    }

    function obroundPoints(lengthMm, widthMm, stepsPerEnd) {
        const pts = [];
        const r = widthMm / 2;
        const halfStraight = Math.max(0, lengthMm / 2 - r);
        const n = Math.max(5, Math.round(stepsPerEnd || 8));
        for (let i = 0; i <= n; i += 1) {
            const a = -Math.PI / 2 + (i / n) * Math.PI;
            pts.push({ x: halfStraight + Math.cos(a) * r, y: Math.sin(a) * r });
        }
        for (let i = 0; i <= n; i += 1) {
            const a = Math.PI / 2 + (i / n) * Math.PI;
            pts.push({ x: -halfStraight + Math.cos(a) * r, y: Math.sin(a) * r });
        }
        return pts;
    }

    function buildSlotVoidGeometry(slot, options) {
        const s = normalizeSlot(slot, getDefaultSpec().slots[0], 0);
        const opts = options || {};
        const thickness = clamp(opts.thicknessMm, 0.2, 20, 3);
        const centerZ = finite(opts.centerZMm !== undefined ? opts.centerZMm : opts.centerZ, 0);
        if (!root.THREE) {
            return {
                type: 'slot_void_descriptor_geometry',
                semanticType: 'cartridge_mounting_slot',
                throughHole: true,
                slot: clone(s),
                thicknessMm: thickness,
                userData: {
                    featureSchema: FEATURE_SCHEMA,
                    featureId: s.id,
                    semanticType: 'cartridge_mounting_slot',
                    geometryRole: 'slot_void_descriptor'
                }
            };
        }

        const pts = obroundPoints(s.lengthMm, s.widthMm, 10);
        const positions = [];
        const indices = [];
        const n = pts.length;
        for (let side = 0; side < 2; side += 1) {
            const z = centerZ + (side === 0 ? -thickness / 2 : thickness / 2);
            pts.forEach(p => positions.push(s.centerXMm + p.x, s.centerYMm + p.y, z));
        }
        const frontCenter = positions.length / 3;
        positions.push(s.centerXMm, s.centerYMm, centerZ - thickness / 2);
        const rearCenter = positions.length / 3;
        positions.push(s.centerXMm, s.centerYMm, centerZ + thickness / 2);
        for (let i = 0; i < n; i += 1) {
            const j = (i + 1) % n;
            indices.push(i, j, n + i, j, n + j, n + i);
            indices.push(frontCenter, i, j);
            indices.push(rearCenter, n + j, n + i);
        }
        const geo = new root.THREE.BufferGeometry();
        geo.setAttribute('position', new root.THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        geo.userData = {
            featureSchema: FEATURE_SCHEMA,
            featureId: s.id,
            semanticType: 'cartridge_mounting_slot',
            geometryRole: 'slot_void',
            throughHole: true
        };
        return geo;
    }

    function addBox(positions, indices, x0, x1, y0, y1, z0, z1) {
        const base = positions.length / 3;
        [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
        ].forEach(p => positions.push(p[0], p[1], p[2]));
        [
            [0, 2, 1], [0, 3, 2],
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [1, 2, 6], [1, 6, 5],
            [2, 3, 7], [2, 7, 6],
            [3, 0, 4], [3, 4, 7]
        ].forEach(t => indices.push(base + t[0], base + t[1], base + t[2]));
    }


    function transformSlotPoint(slot, xLocal, yLocal) {
        const a = (Number(slot.angleDeg) || 0) * Math.PI / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        return {
            x: Number(slot.centerXMm) + xLocal * ca - yLocal * sa,
            y: Number(slot.centerYMm) + xLocal * sa + yLocal * ca
        };
    }

    function makeObroundPath(slot, segments) {
        const path = new root.THREE.Path();
        const length = Math.max(0.01, Number(slot.lengthMm));
        const width = Math.max(0.01, Number(slot.widthMm));
        const r = width / 2;
        const straight = Math.max(0, length - width) / 2;
        const steps = Math.max(8, Math.round(segments || 16));
        const pts = [];
        for (let i = 0; i <= steps; i += 1) {
            const a = Math.PI / 2 - (i / steps) * Math.PI;
            pts.push(transformSlotPoint(slot, straight + Math.cos(a) * r, Math.sin(a) * r));
        }
        for (let i = 0; i <= steps; i += 1) {
            const a = -Math.PI / 2 - (i / steps) * Math.PI;
            pts.push(transformSlotPoint(slot, -straight + Math.cos(a) * r, Math.sin(a) * r));
        }
        pts.forEach((pt, idx) => {
            if (idx === 0) path.moveTo(pt.x, pt.y);
            else path.lineTo(pt.x, pt.y);
        });
        path.closePath();
        return path;
    }

    function buildCSGSlottedPlateGeometry(specOrState, options) {
        if (!root.THREE || !root.THREE.Shape || !root.THREE.ExtrudeGeometry) return null;
        const spec = normalizeSpec(specOrState);
        const opts = options || {};
        const plate = Object.assign({}, getSlotCarrierPlate(spec), opts.slotCarrierPlate || opts.plate || {});
        const thickness = clamp(opts.thicknessMm, 0.2, 20, plate.thicknessMm);
        const shape = new root.THREE.Shape();
        const x0 = plate.xMm - plate.lengthMm / 2;
        const x1 = plate.xMm + plate.lengthMm / 2;
        const y0 = plate.yMm - plate.widthMm / 2;
        const y1 = plate.yMm + plate.widthMm / 2;
        shape.moveTo(x0, y0);
        shape.lineTo(x1, y0);
        shape.lineTo(x1, y1);
        shape.lineTo(x0, y1);
        shape.lineTo(x0, y0);
        spec.slots.forEach(slot => shape.holes.push(makeObroundPath(slot, 18)));
        let geo = new root.THREE.ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: false,
            curveSegments: 18,
            steps: 1
        });
        geo.translate(0, 0, plate.zMm - thickness / 2);
        geo.userData = {
            featureSchema: FEATURE_SCHEMA,
            featureId: 'integrated_headshell_slots_screws',
            semanticType: 'integrated_obround_cartridge_slots',
            geometryRole: 'slot_carrier_reference_geometry',
            slotCount: spec.slots.length,
            throughHole: spec.throughHole,
            booleanCutStatus: 'partial_csg',
            csgEngine: 'local_three_shape_subtraction'
        };
        if (root.finalizeWeldedGeometry && typeof root.finalizeWeldedGeometry === 'function') {
            geo = root.finalizeWeldedGeometry(geo, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });
        } else {
            geo.computeVertexNormals();
        }
        const topology = (root.analyzeMeshTopology && typeof root.analyzeMeshTopology === 'function')
            ? root.analyzeMeshTopology(geo)
            : null;
        const isClosedManifold = topology && topology.boundaryEdgeCount === 0 && topology.nonManifoldEdgeCount === 0;
        geo.userData = Object.assign({}, geo.userData || {}, {
            booleanCutStatus: isClosedManifold ? 'full_csg' : 'partial_csg',
            csgEngine: 'local_three_shape_subtraction',
            slotMeshBoundaryEdgeCount: topology ? topology.boundaryEdgeCount : null,
            slotMeshNonManifoldEdgeCount: topology ? topology.nonManifoldEdgeCount : null
        });
        return geo;
    }

    function buildSlottedReferencePlateGeometry(specOrState, options) {
        const csgGeo = buildCSGSlottedPlateGeometry(specOrState, options);
        if (csgGeo) return csgGeo;
        const spec = normalizeSpec(specOrState);
        const opts = options || {};
        const plate = Object.assign({}, getSlotCarrierPlate(spec), opts.slotCarrierPlate || opts.plate || {});
        const thickness = clamp(opts.thicknessMm, 0.2, 20, plate.thicknessMm);
        const x0 = plate.xMm - plate.lengthMm / 2;
        const x1 = plate.xMm + plate.lengthMm / 2;
        const y0 = plate.yMm - plate.widthMm / 2;
        const y1 = plate.yMm + plate.widthMm / 2;
        const z0 = plate.zMm - thickness / 2;
        const z1 = plate.zMm + thickness / 2;
        const blockers = spec.slots.map(slot => ({
            x0: slot.centerXMm - slot.lengthMm / 2,
            x1: slot.centerXMm + slot.lengthMm / 2,
            y0: slot.centerYMm - slot.widthMm / 2,
            y1: slot.centerYMm + slot.widthMm / 2,
            id: slot.id
        }));

        if (!root.THREE) {
            return {
                type: 'slotted_reference_plate_descriptor_geometry',
                semanticType: 'integrated_obround_cartridge_slots',
                carrierSemanticType: 'slot_carrier_reference_geometry_not_titanium',
                booleanCutStatus: spec.integration.booleanCutStatus,
                slotCount: spec.slots.length,
                throughHole: spec.throughHole,
                plate: clone(plate),
                slots: buildSlotDescriptors({ headshellSlots: spec }),
                userData: {
                    featureSchema: FEATURE_SCHEMA,
                    featureId: 'integrated_headshell_slots',
                    geometryRole: 'slot_carrier_reference_geometry_descriptor',
                    booleanCutStatus: spec.integration.booleanCutStatus
                }
            };
        }

        const xs = [x0, x1];
        const ys = [y0, y1];
        blockers.forEach(b => {
            xs.push(Math.max(x0, Math.min(x1, b.x0)), Math.max(x0, Math.min(x1, b.x1)));
            ys.push(Math.max(y0, Math.min(y1, b.y0)), Math.max(y0, Math.min(y1, b.y1)));
        });
        xs.sort((a, b) => a - b);
        ys.sort((a, b) => a - b);

        const positions = [];
        const indices = [];
        for (let xi = 0; xi < xs.length - 1; xi += 1) {
            for (let yi = 0; yi < ys.length - 1; yi += 1) {
                const cx = (xs[xi] + xs[xi + 1]) / 2;
                const cy = (ys[yi] + ys[yi + 1]) / 2;
                const insideSlot = blockers.some(b => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1);
                if (!insideSlot && xs[xi + 1] > xs[xi] && ys[yi + 1] > ys[yi]) {
                    addBox(positions, indices, xs[xi], xs[xi + 1], ys[yi], ys[yi + 1], z0, z1);
                }
            }
        }

        blockers.forEach(b => {
            const t = 0.22;
            addBox(positions, indices, b.x0, b.x1, b.y0 - t, b.y0, z0, z1);
            addBox(positions, indices, b.x0, b.x1, b.y1, b.y1 + t, z0, z1);
            addBox(positions, indices, b.x0 - t, b.x0, b.y0, b.y1, z0, z1);
            addBox(positions, indices, b.x1, b.x1 + t, b.y0, b.y1, z0, z1);
        });

        const geo = new root.THREE.BufferGeometry();
        geo.setAttribute('position', new root.THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        geo.userData = {
            featureSchema: FEATURE_SCHEMA,
            featureId: 'integrated_headshell_slots',
            semanticType: 'integrated_obround_cartridge_slots',
            slotCount: spec.slots.length,
            throughHole: spec.throughHole,
            booleanCutStatus: spec.integration.booleanCutStatus
        };
        return geo;
    }

    function toReportBlock(sessionOrState) {
        const spec = normalizeSpec(sessionOrState);
        const validation = validateSpec(sessionOrState);
        const measured = validation.measured || {};
        return {
            loaded: true,
            enabled: spec.enabled === true,
            variant: spec.variant,
            screwStandard: spec.screwStandard,
            throughHole: spec.throughHole === true,
            slotCount: spec.slots.length,
            slotLengthMinMm: measured.slotLengthMinMm,
            slotWidthMinMm: measured.slotWidthMinMm,
            slotSymmetryErrorMm: measured.slotSymmetryErrorMm,
            plateLengthMm: getSlotCarrierPlate(spec).lengthMm,
            plateWidthMm: getSlotCarrierPlate(spec).widthMm,
            booleanCutStatus: spec.integration.booleanCutStatus,
            validationStatus: validation.status,
            errors: validation.errors,
            warnings: validation.warnings
        };
    }

    function getFeatureManifest(sourceState) {
        const spec = normalizeSpec(sourceState);
        const validation = validateSpec(sourceState || { cobraArchitecture: { headshellSlots: spec }, apex: 237, cartX: -0.05 });
        return {
            id: 'headshellSlots',
            status: 'loaded',
            schema: FEATURE_SCHEMA,
            exportManifestVersion: MANIFEST_VERSION,
            featureCount: spec.slots.length,
            validationStatus: validation.status,
            booleanCutStatus: spec.integration.booleanCutStatus,
            features: buildSlotDescriptors({ headshellSlots: spec }).map(d => ({
                id: d.id,
                role: 'integrated obround cartridge mounting slot',
                semanticType: d.semanticType,
                lengthMm: d.lengthMm,
                widthMm: d.widthMm,
                centerXMm: d.centerXMm,
                centerYMm: d.centerYMm,
                throughHole: d.throughHole,
                screwStandard: d.screwStandard
            }))
        };
    }

    const api = {
        schema: FEATURE_SCHEMA,
        getFeatureManifest,
        getDefaultSpec,
        normalizeSpec,
        validateSpec,
        buildSlotDescriptors,
        buildSlotVoidGeometry,
        buildCSGSlottedPlateGeometry,
        buildSlottedReferencePlateGeometry,
        toReportBlock,
        // Backward compatibility with TD046 foundation naming.
        sanitizeGeometry: normalizeSpec,
        getGeometryFromState: normalizeSpec
    };

    root.HeadshellSlots = Object.freeze(api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
