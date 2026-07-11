/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F cobra-eggshell-wand.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/cobra-eggshell-wand.js
 * Phase 3 station-based Cobra/Copperhead-like eggshell/compound-curve armwand module.
 *
 * This module deliberately implements only the station-based armwand capability.
 * It does not implement headshell slots, bearing/tower mechanics, FEA, or a final
 * production Cobra tonearm. It provides a real station model, structural station
 * validation, and an optional render/export mesh path for Cobra architecture sessions.
 */
(function(root) {
    'use strict';

    const FEATURE_ID = 'stationBasedEggshellWand';
    const FILTER_ID = 'structuralStationFilter';
    const DEFAULT_LENGTH_MM = 237.05;

    function finiteNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback) {
        if (value === true || value === false) return value;
        return fallback;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function smooth01(t) {
        const x = Math.max(0, Math.min(1, t));
        return x * x * (3 - 2 * x);
    }

    function smoother01(t) {
        const x = Math.max(0, Math.min(1, t));
        return x * x * x * (x * (x * 6 - 15) + 10);
    }

    function getDefaultSpec() {
        return {
            variant: 'station_based_eggshell',
            enabled: true,
            lengthMm: DEFAULT_LENGTH_MM,
            stationCount: 9,
            profile: {
                pivotWidthMm: 24,
                midWidthMm: 13,
                headWidthMm: 7,
                pivotHeightMm: 18,
                midHeightMm: 8,
                headHeightMm: 3.2,
                topCrownMm: 2.5,
                undersideBellyMm: 4.5,
                asymmetryMm: 1.5,
                wallThicknessMm: 1.2,
                canopyRidgeEnabled: true,
                canopyRidgeHeightMm: 1.4,
                canopyRidgeWidthFraction: 0.22,
                canopyRidgeSharpness: 3.0
            },
            constraints: {
                minStationWidthMm: 3.0,
                minStationHeightMm: 2.0,
                minWallThicknessMm: 0.8,
                forbidCircularTube: true,
                forbidConstantSection: true,
                requireMonotonicForwardTaper: true,
                requirePositiveSectionArea: true,
                requirePositiveEIProxy: true
            }
        };
    }

    function normalizeArmwandBlock(value) {
        const incoming = (value && typeof value === 'object') ? value : {};
        const spec = getDefaultSpec();
        spec.variant = incoming.variant === 'station_based_eggshell' ? 'station_based_eggshell' : spec.variant;
        spec.enabled = incoming.enabled === false ? false : true;
        spec.lengthMm = Math.max(1, finiteNumber(incoming.lengthMm, spec.lengthMm));
        spec.stationCount = Math.max(7, Math.min(33, Math.round(finiteNumber(incoming.stationCount, spec.stationCount))));

        if (incoming.profile && typeof incoming.profile === 'object') {
            const p = incoming.profile;
            spec.profile.pivotWidthMm = Math.max(0.1, finiteNumber(p.pivotWidthMm, spec.profile.pivotWidthMm));
            spec.profile.midWidthMm = Math.max(0.1, finiteNumber(p.midWidthMm, spec.profile.midWidthMm));
            spec.profile.headWidthMm = Math.max(0.1, finiteNumber(p.headWidthMm, spec.profile.headWidthMm));
            spec.profile.pivotHeightMm = Math.max(0.1, finiteNumber(p.pivotHeightMm, spec.profile.pivotHeightMm));
            spec.profile.midHeightMm = Math.max(0.1, finiteNumber(p.midHeightMm, spec.profile.midHeightMm));
            spec.profile.headHeightMm = Math.max(0.1, finiteNumber(p.headHeightMm, spec.profile.headHeightMm));
            spec.profile.topCrownMm = Math.max(0, finiteNumber(p.topCrownMm, spec.profile.topCrownMm));
            spec.profile.undersideBellyMm = Math.max(0, finiteNumber(p.undersideBellyMm, spec.profile.undersideBellyMm));
            spec.profile.asymmetryMm = finiteNumber(p.asymmetryMm, spec.profile.asymmetryMm);
            spec.profile.wallThicknessMm = Math.max(0.01, finiteNumber(p.wallThicknessMm, spec.profile.wallThicknessMm));
            spec.profile.canopyRidgeEnabled = bool(p.canopyRidgeEnabled, spec.profile.canopyRidgeEnabled);
            spec.profile.canopyRidgeHeightMm = Math.max(0, finiteNumber(p.canopyRidgeHeightMm, spec.profile.canopyRidgeHeightMm));
            spec.profile.canopyRidgeWidthFraction = Math.max(0.05, Math.min(0.8, finiteNumber(p.canopyRidgeWidthFraction, spec.profile.canopyRidgeWidthFraction)));
            spec.profile.canopyRidgeSharpness = Math.max(0.5, Math.min(12, finiteNumber(p.canopyRidgeSharpness, spec.profile.canopyRidgeSharpness)));
        }

        if (incoming.constraints && typeof incoming.constraints === 'object') {
            const c = incoming.constraints;
            spec.constraints.minStationWidthMm = Math.max(0.1, finiteNumber(c.minStationWidthMm, spec.constraints.minStationWidthMm));
            spec.constraints.minStationHeightMm = Math.max(0.1, finiteNumber(c.minStationHeightMm, spec.constraints.minStationHeightMm));
            spec.constraints.minWallThicknessMm = Math.max(0.01, finiteNumber(c.minWallThicknessMm, spec.constraints.minWallThicknessMm));
            spec.constraints.forbidCircularTube = bool(c.forbidCircularTube, spec.constraints.forbidCircularTube);
            spec.constraints.forbidConstantSection = bool(c.forbidConstantSection, spec.constraints.forbidConstantSection);
            spec.constraints.requireMonotonicForwardTaper = bool(c.requireMonotonicForwardTaper, spec.constraints.requireMonotonicForwardTaper);
            spec.constraints.requirePositiveSectionArea = bool(c.requirePositiveSectionArea, spec.constraints.requirePositiveSectionArea);
            spec.constraints.requirePositiveEIProxy = bool(c.requirePositiveEIProxy, spec.constraints.requirePositiveEIProxy);
        }

        return spec;
    }

    function getArmwandSpec(sessionOrState) {
        const s = (sessionOrState && typeof sessionOrState === 'object') ? sessionOrState : {};
        if (s.variant === 'station_based_eggshell') return normalizeArmwandBlock(s);
        if (s.cobraArchitecture && s.cobraArchitecture.armwand) {
            return normalizeArmwandBlock(s.cobraArchitecture.armwand);
        }
        return getDefaultSpec();
    }

    function isEnabled(sessionOrState) {
        const s = (sessionOrState && typeof sessionOrState === 'object') ? sessionOrState : {};
        const arch = (root.CobraArchitecture && typeof root.CobraArchitecture.getCobraArchitecture === 'function')
            ? root.CobraArchitecture.getCobraArchitecture(s)
            : (s.cobraArchitecture || {});
        const runtimeArchitectureEnabled = !!(arch && arch.enabled === true) || s.cobraArchitectureEnabled === true || s.enableCobraArchitecture === true;
        const spec = getArmwandSpec(s);
        return !!(runtimeArchitectureEnabled && spec.enabled !== false && spec.variant === 'station_based_eggshell');
    }

    function interpolateProfile(front, mid, rear, t) {
        if (t <= 0.5) {
            const u = smoother01(t / 0.5);
            return front * (1 - u) + mid * u;
        }
        const u = smoother01((t - 0.5) / 0.5);
        return mid * (1 - u) + rear * u;
    }

    function makeStation(spec, index, count) {
        const p = spec.profile;
        const t = count <= 1 ? 0 : index / (count - 1); // 0=stylus/head, 1=pivot
        const width = interpolateProfile(p.headWidthMm, p.midWidthMm, p.pivotWidthMm, t);
        const height = interpolateProfile(p.headHeightMm, p.midHeightMm, p.pivotHeightMm, t);
        const asym = p.asymmetryMm * Math.sin(Math.PI * t) * (0.35 + 0.65 * t);

        // Low monocoque datum: the N1-P2 line remains the x-axis. The underside belly
        // approaches Z0 at the front and dips lower toward the structural/pivot zone.
        const undersideDip = p.undersideBellyMm * smoother01(t);
        const topCrown = p.topCrownMm * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))));
        const ridgeLongitudinal = Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t)));
        const ridgeHeight = p.canopyRidgeEnabled ? Math.max(0, p.canopyRidgeHeightMm * ridgeLongitudinal) : 0;
        const bottomZ = -0.35 * undersideDip;
        const topZ = bottomZ + height + topCrown + ridgeHeight;

        const outerArea = Math.PI * width * height / 4;
        const innerWidth = Math.max(0, width - 2 * p.wallThicknessMm);
        const innerHeight = Math.max(0, height - 2 * p.wallThicknessMm);
        const innerArea = Math.PI * innerWidth * innerHeight / 4;
        const sectionArea = Math.max(0, outerArea - innerArea);

        // EI proxy based on the weaker bending axis of an elliptical thin shell.
        const iyOuter = Math.PI * width * Math.pow(height, 3) / 64;
        const izOuter = Math.PI * height * Math.pow(width, 3) / 64;
        const iyInner = innerWidth > 0 && innerHeight > 0 ? Math.PI * innerWidth * Math.pow(innerHeight, 3) / 64 : 0;
        const izInner = innerWidth > 0 && innerHeight > 0 ? Math.PI * innerHeight * Math.pow(innerWidth, 3) / 64 : 0;
        const eiProxy = Math.max(0, Math.min(iyOuter - iyInner, izOuter - izInner));

        return {
            index,
            structural: true,
            xMm: spec.lengthMm * t,
            widthMm: width,
            heightMm: height,
            topZMm: topZ,
            bottomZMm: bottomZ,
            leftYMm: -width / 2 + asym,
            rightYMm: width / 2 + asym,
            asymmetryMm: asym,
            sectionAreaProxyMm2: sectionArea + ridgeHeight * width * 0.08,
            eiProxy: eiProxy * (1 + ridgeHeight / Math.max(1, height) * 0.18),
            ridgeHeightMm: ridgeHeight,
            ridgeWidthFraction: p.canopyRidgeWidthFraction,
            ridgeSharpness: p.canopyRidgeSharpness,
            stationT: t
        };
    }

    function buildStations(sessionOrState) {
        const spec = getArmwandSpec(sessionOrState);
        const count = Math.max(7, Math.round(spec.stationCount || 9));
        const stations = [];
        for (let i = 0; i < count; i++) {
            stations.push(makeStation(spec, i, count));
        }
        return stations;
    }

    function validateStations(stations, options) {
        const list = Array.isArray(stations) ? stations : [];
        const opts = options || {};
        const spec = opts.spec ? normalizeArmwandBlock(opts.spec) : getDefaultSpec();
        const c = spec.constraints || getDefaultSpec().constraints;
        const structural = list.filter(s => s && s.structural !== false);
        const errors = [];
        const warnings = [];

        const nums = (arr, field) => arr.map(s => Number(s[field])).filter(Number.isFinite);
        function min(field, arr) {
            const values = nums(arr || structural, field);
            return values.length ? Math.min.apply(null, values) : null;
        }
        function max(field, arr) {
            const values = nums(arr || structural, field);
            return values.length ? Math.max.apply(null, values) : null;
        }

        structural.forEach((s, idx) => {
            if (!Number.isFinite(Number(s.widthMm)) || s.widthMm <= 0) errors.push('station ' + idx + ' width <= 0');
            if (!Number.isFinite(Number(s.heightMm)) || s.heightMm <= 0) errors.push('station ' + idx + ' height <= 0');
            if (!Number.isFinite(Number(s.sectionAreaProxyMm2)) || s.sectionAreaProxyMm2 <= 0) errors.push('station ' + idx + ' sectionAreaProxy <= 0');
            if (!Number.isFinite(Number(s.eiProxy)) || s.eiProxy <= 0) errors.push('station ' + idx + ' eiProxy <= 0');
        });

        const minWidth = min('widthMm');
        const minHeight = min('heightMm');
        const minArea = min('sectionAreaProxyMm2');
        const minEi = min('eiProxy');
        const maxWidth = max('widthMm');
        const maxHeight = max('heightMm');

        if (minWidth !== null && minWidth < c.minStationWidthMm) errors.push('min station width below constraint: ' + minWidth.toFixed(3));
        if (minHeight !== null && minHeight < c.minStationHeightMm) errors.push('min station height below constraint: ' + minHeight.toFixed(3));
        if (c.requirePositiveSectionArea && !(minArea > 0)) errors.push('min section area proxy must be > 0');
        if (c.requirePositiveEIProxy && !(minEi > 0)) errors.push('min EI proxy must be > 0');

        let constantSectionDetected = false;
        if (structural.length >= 2 && minWidth !== null && maxWidth !== null && minHeight !== null && maxHeight !== null) {
            constantSectionDetected = Math.abs(maxWidth - minWidth) < 0.25 && Math.abs(maxHeight - minHeight) < 0.25;
            if (c.forbidConstantSection && constantSectionDetected) errors.push('constant section detected');
        }

        let circularTubeDetected = false;
        if (structural.length) {
            const ratios = structural.map(s => Math.abs(Number(s.widthMm) - Number(s.heightMm)) / Math.max(Number(s.widthMm), Number(s.heightMm), 1));
            circularTubeDetected = ratios.every(r => r < 0.08);
            if (c.forbidCircularTube && circularTubeDetected) errors.push('circular tube detected');
        }

        let monotonicTaperValid = true;
        for (let i = 1; i < structural.length; i++) {
            // x increases from stylus/head toward pivot. Width and height should not shrink toward pivot.
            if (Number(structural[i].widthMm) + 1e-6 < Number(structural[i - 1].widthMm) ||
                Number(structural[i].heightMm) + 1e-6 < Number(structural[i - 1].heightMm)) {
                monotonicTaperValid = false;
                break;
            }
        }
        if (c.requireMonotonicForwardTaper && !monotonicTaperValid) errors.push('monotonic forward taper invalid');

        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings,
            stationCount: list.length,
            structuralStationCount: structural.length,
            minStationWidthMm: minWidth,
            minStationHeightMm: minHeight,
            minSectionAreaProxyMm2: minArea,
            minEIProxy: minEi,
            constantSectionDetected,
            circularTubeDetected,
            monotonicTaperValid
        };
    }


    function cubicBezier(a, b, c, d, t) {
        const u = 1 - t;
        return (u * u * u * a) + (3 * u * u * t * b) + (3 * u * t * t * c) + (t * t * t * d);
    }

    function buildRidgeSplinePoint(st, angle) {
        const width = Math.max(0.01, Number(st.widthMm));
        const height = Math.max(0.01, Number(st.heightMm));
        const centerZ = (Number(st.topZMm) + Number(st.bottomZMm)) / 2;
        const centerY = (Number(st.leftYMm) + Number(st.rightYMm)) / 2;
        const asym = Number(st.asymmetryMm) || 0;
        const ridgeHeight = Math.max(0, Number(st.ridgeHeightMm) || 0);
        const ridgeWidth = Math.max(0.05, Math.min(0.8, Number(st.ridgeWidthFraction) || 0.22));
        const sharpness = Math.max(0.5, Number(st.ridgeSharpness) || 3.0);
        const yBase = Math.cos(angle) * width * 0.5;
        const sinA = Math.sin(angle);
        const yNorm = Math.abs(yBase) / Math.max(0.001, width * 0.5);
        const ridgeInfluence = Math.max(0, 1 - Math.pow(yNorm / ridgeWidth, sharpness));
        if (sinA >= 0) {
            const sideZ = centerZ + sinA * height * 0.5;
            const ridgeZ = centerZ + height * 0.5 + ridgeHeight;
            const blend = Math.pow(Math.max(0, sinA), 1.35) * ridgeInfluence;
            const z = cubicBezier(sideZ, sideZ + ridgeHeight * 0.25, ridgeZ - ridgeHeight * 0.18, ridgeZ, blend);
            const y = centerY + yBase * (0.94 + 0.06 * Math.cos(2 * angle)) + asym * Math.max(0, sinA) * 0.25;
            return { y, z };
        }
        const bellyScale = 1.0 + 0.20 * -sinA;
        return {
            y: centerY + yBase * (0.92 + 0.08 * Math.cos(2 * angle)),
            z: centerZ + sinA * height * 0.5 * bellyScale
        };
    }

    function buildMesh(stations, options) {
        const list = Array.isArray(stations) ? stations : [];
        const opts = options || {};
        const segments = Math.max(12, Math.min(48, Math.round(finiteNumber(opts.segments, 24))));
        if (!root.THREE || !root.THREE.BufferGeometry || !root.THREE.Float32BufferAttribute) {
            return {
                type: 'cobra-eggshell-mesh-data',
                stations: clone(list),
                segments
            };
        }
        const positions = [];
        const indices = [];
        list.forEach(st => {
            const width = Math.max(0.01, Number(st.widthMm));
            const height = Math.max(0.01, Number(st.heightMm));
            const centerZ = (Number(st.topZMm) + Number(st.bottomZMm)) / 2;
            const centerY = (Number(st.leftYMm) + Number(st.rightYMm)) / 2;
            const asym = Number(st.asymmetryMm) || 0;
            for (let i = 0; i < segments; i++) {
                const a = (i / segments) * Math.PI * 2;
                const p = buildRidgeSplinePoint(st, a);
                positions.push(Number(st.xMm), p.y, p.z);
            }
        });

        for (let r = 0; r < list.length - 1; r++) {
            const r1 = r * segments;
            const r2 = (r + 1) * segments;
            for (let i = 0; i < segments; i++) {
                const n = (i + 1) % segments;
                indices.push(r1 + i, r1 + n, r2 + i, r1 + n, r2 + n, r2 + i);
            }
        }

        if (list.length > 0) {
            const frontCenter = positions.length / 3;
            const first = list[0];
            positions.push(Number(first.xMm), (Number(first.leftYMm) + Number(first.rightYMm)) / 2, (Number(first.topZMm) + Number(first.bottomZMm)) / 2);
            for (let i = 0; i < segments; i++) {
                const n = (i + 1) % segments;
                indices.push(frontCenter, n, i);
            }

            const rearCenter = positions.length / 3;
            const last = list[list.length - 1];
            positions.push(Number(last.xMm), (Number(last.leftYMm) + Number(last.rightYMm)) / 2, (Number(last.topZMm) + Number(last.bottomZMm)) / 2);
            const rearStart = (list.length - 1) * segments;
            for (let i = 0; i < segments; i++) {
                const n = (i + 1) % segments;
                indices.push(rearCenter, rearStart + i, rearStart + n);
            }
        }

        let geometry = new root.THREE.BufferGeometry();
        geometry.setAttribute('position', new root.THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        if (typeof geometry.clearGroups === 'function') geometry.clearGroups();
        if (typeof geometry.addGroup === 'function' && indices.length > 0) {
            geometry.addGroup(0, indices.length, 0);
        }
        if (root.finalizeWeldedGeometry && typeof root.finalizeWeldedGeometry === 'function') {
            geometry = root.finalizeWeldedGeometry(geometry, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });
        } else {
            geometry.computeVertexNormals();
        }
        geometry.userData = Object.assign({}, geometry.userData || {}, {
            cobraEggshellWand: true,
            cobraEggshellRenderPath: true,
            renderable: positions.length > 0 && indices.length > 0,
            vertexCount: positions.length / 3,
            indexCount: indices.length,
            groupCount: Array.isArray(geometry.groups) ? geometry.groups.length : (indices.length > 0 ? 1 : 0),
            stationCount: list.length,
            structuralStationCount: validateStations(list).structuralStationCount
        });
        return geometry;
    }

    function getGeometryIndexCount(geometry) {
        if (!geometry) return 0;
        if (geometry.index && Number.isFinite(Number(geometry.index.count))) return Number(geometry.index.count);
        if (geometry.index && Array.isArray(geometry.index.array)) return geometry.index.array.length;
        return 0;
    }

    function getGeometryVertexCount(geometry) {
        if (!geometry || !geometry.attributes || !geometry.attributes.position) return 0;
        if (Number.isFinite(Number(geometry.attributes.position.count))) return Number(geometry.attributes.position.count);
        if (Array.isArray(geometry.attributes.position.array)) return geometry.attributes.position.array.length / 3;
        return 0;
    }

    function validateRenderableGeometry(geometry) {
        const vertexCount = getGeometryVertexCount(geometry);
        const indexCount = getGeometryIndexCount(geometry);
        const groupCount = geometry && Array.isArray(geometry.groups) ? geometry.groups.length : 0;
        const errors = [];
        if (!(vertexCount > 0)) errors.push('Cobra eggshell render geometry has no vertices.');
        if (!(indexCount > 0)) errors.push('Cobra eggshell render geometry has no indices.');
        if (!(groupCount >= 1)) errors.push('Cobra eggshell render geometry has no material groups.');
        if (!geometry || !geometry.userData || geometry.userData.cobraEggshellWand !== true) {
            errors.push('Cobra eggshell render geometry is missing cobraEggshellWand userData.');
        }
        return {
            status: errors.length ? 'FAIL' : 'PASS',
            errors,
            warnings: [],
            vertexCount,
            indexCount,
            groupCount,
            renderable: errors.length === 0
        };
    }

    function buildExportGeometry(sessionOrState, options) {
        const stations = buildStations(sessionOrState || {});
        const stationValidation = validateStations(stations);
        if (stationValidation.status !== 'PASS') {
            return {
                geometry: null,
                validation: {
                    status: 'FAIL',
                    errors: stationValidation.errors.slice(),
                    warnings: stationValidation.warnings.slice(),
                    stationValidation
                }
            };
        }
        const geometry = buildMesh(stations, options || {});
        if (geometry && geometry.userData) {
            geometry.userData.cobraEggshellExportPath = true;
            geometry.userData.exportGeometrySource = 'cobraEggshellWand';
        }
        const renderValidation = validateRenderableGeometry(geometry);
        return {
            geometry,
            validation: Object.assign({}, renderValidation, {
                stationValidation,
                exportGeometrySource: 'cobraEggshellWand'
            })
        };
    }

    function getStructuralSummary(stationsOrState) {
        const stations = Array.isArray(stationsOrState) ? stationsOrState : buildStations(stationsOrState || {});
        return validateStations(stations, { spec: Array.isArray(stationsOrState) ? getDefaultSpec() : getArmwandSpec(stationsOrState || {}) });
    }

    function getFeatureManifest() {
        return {
            featureCount: 8,
            features: [
                { id: 'station_generator', role: 'builds non-constant tapered Cobra/Copperhead eggshell stations' },
                { id: 'mesh_builder', role: 'builds a separate procedural station-ring mesh when enabled' },
                { id: 'structural_summary', role: 'reports positive area/EI proxy without cap stations forcing EI_min to zero' },
                { id: 'non_tube_guard', role: 'detects constant or circular tube-like section errors' },
                { id: 'n1p2_locked_length', role: 'defaults station length to 237.05 mm' },
                { id: 'renderable_geometry_guard', role: 'requires vertices, indices and material group for 3D renderability' },
                { id: 'export_geometry_builder', role: 'builds Cobra eggshell geometry for export validation path' },
                { id: 'cobra_canopy_ridge', role: 'spline-based upper-quadrant ridge in station cross-sections' }
            ]
        };
    }

    const api = Object.freeze({
        getDefaultSpec,
        normalizeArmwandBlock,
        getArmwandSpec,
        isEnabled,
        buildStations,
        validateStations,
        buildMesh,
        buildExportGeometry,
        validateRenderableGeometry,
        getStructuralSummary,
        getFeatureManifest
    });

    root.CobraEggshellWand = api;
    root.StationBasedEggshellWand = api;

    root.StructuralStationFilter = Object.freeze({
        validateStations,
        getStructuralSummary,
        getFeatureManifest: function() {
            return {
                featureCount: 3,
                features: [
                    { id: 'positive_area_filter', role: 'rejects structural stations with non-positive area proxy' },
                    { id: 'positive_ei_filter', role: 'rejects structural stations with non-positive EI proxy' },
                    { id: 'tube_constant_section_filter', role: 'rejects circular-tube and constant-section regressions' }
                ]
            };
        }
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
