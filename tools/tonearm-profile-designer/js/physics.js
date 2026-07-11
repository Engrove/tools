/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F physics.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/physics.js
 * Fysik- och pickup-logik kopplad till pre-kalkylerad geometri.
 */

const Physics = {
    sanitizeMass(value, fallback = 0) {
        const n = Number(value);
        return Math.max(0, Number.isFinite(n) ? n : fallback);
    },
    getCounterweightZOffset(currentState) {
        const direct = currentState && currentState.counterweightZOffset;
        const nested = currentState && currentState.inputs && currentState.inputs.counterweightZOffset;
        const n = Number(Number.isFinite(Number(direct)) ? direct : nested);
        return Number.isFinite(n) ? n : 0;
    },
    calcEstimatedC10: function(c100, k) { return c100 * k; },
    calcEstimatedC100: function(c10, k) { return k <= 0 ? 0 : c10 / k; },

    getPivotPoint: function(currentState) {
        const lpTopZ = (currentState.lpTopZ !== undefined) ? currentState.lpTopZ : 0;
        const heightAboveLP = (currentState.verticalPivotHeightAboveLP !== undefined)
            ? currentState.verticalPivotHeightAboveLP
            : (currentState.pivotOffsetZ || 0); // legacy fallback
        return {
            x: currentState.apex + (currentState.pivotOffsetX || 0),
            y: currentState.pivotOffsetY || 0,
            z: lpTopZ + heightAboveLP
        };
    },

    getEffectiveLength: function(currentState, mode) {
        const stylus = Physics.getStylusPoint(currentState, mode);
        const pivot = Physics.getPivotPoint(currentState);
        return Math.sqrt(Math.pow(pivot.x - stylus.x, 2) + Math.pow(pivot.y - stylus.y, 2));
    },

    getCartridgeMass: function(currentState, mode) {
        if (mode === 'g1042') return GOLDRING1042.mass_cart + GOLDRING1042.mass_fixings;
        if (mode === 'selected') {
            const selectedMass = Number(currentState.selectedCartridgeMassG);
            return Number.isFinite(selectedMass) && selectedMass > 0 ? selectedMass : currentState.customMass;
        }
        if (mode === 'custom') return currentState.customMass;
        return 0;
    },

    getCartridgeZ: function(currentState, mode) {
        return Physics.getStylusPoint(currentState, mode).z;
    },

    // TD044: Compute the body datum offset required to place stylus tip on the LP plane.
    // Pure function; does not write state.
    solveArmBodyDatumOffsetZ: function(currentState, mode) {
        const lpTopZ = (currentState && currentState.lpTopZ !== undefined) ? currentState.lpTopZ : 0;
        const stateProbe = Object.assign({}, currentState || {}, { armBodyDatumOffsetZ: 0 });
        if (mode === 'g1042') {
            const padX = (currentState.cartX || 0) + GOLDRING1042.anchors.tipToMountX;
            const padZLocal = getClassicProfileAtX_withState(stateProbe, padX).zBot;
            return lpTopZ + GOLDRING1042.anchors.tipToTop - padZLocal;
        }
        if (mode === 'custom' || mode === 'selected') {
            const customLen = 18.0;
            const padX = (currentState.cartX || 0) + customLen / 2;
            const padZLocal = getClassicProfileAtX_withState(stateProbe, padX).zBot;
            return lpTopZ + (currentState.customZ || 0) - padZLocal;
        }
        const padZLocal = getClassicProfileAtX_withState(stateProbe, currentState.nomStylusX || 0).zBot;
        return lpTopZ - padZLocal;
    },

    getStylusPoint: function(currentState, mode) {
        // TD044: When currentState.stylusLockedToLP is true (default), the returned z is
        // guaranteed to equal currentState.lpTopZ. The body envelope is auto-shifted via
        // armBodyDatumOffsetZ to maintain this invariant.
        const effectiveState = currentState && currentState.stylusLockedToLP
            ? Object.assign({}, currentState, {
                armBodyDatumOffsetZ: Physics.solveArmBodyDatumOffsetZ(currentState, mode)
            })
            : (currentState || state);

        if (mode === 'g1042') {
            const padZ = getClassicProfileAtX_withState(effectiveState, effectiveState.cartX + GOLDRING1042.anchors.tipToMountX).zBot;
            return { x: effectiveState.cartX, y: 0, z: padZ - GOLDRING1042.anchors.tipToTop };
        }
        if (mode === 'custom' || mode === 'selected') {
            const customLen = 18.0;
            const padZ = getClassicProfileAtX_withState(effectiveState, effectiveState.cartX + customLen / 2).zBot;
            return { x: effectiveState.cartX, y: 0, z: padZ - effectiveState.customZ };
        }
        return { x: effectiveState.nomStylusX, y: 0, z: getClassicProfileAtX_withState(effectiveState, effectiveState.nomStylusX).zBot };
    },

    getCartridgeCOM: function(currentState, mode) {
        const mass = Physics.getCartridgeMass(currentState, mode);
        if (mass <= 0) return { x: 0, y: 0, z: 0, mass: 0 };

        if (mode === 'g1042') {
            const stylus = Physics.getStylusPoint(currentState, mode);
            return {
                x: currentState.cartX + GOLDRING1042.inferred.bodyLength * 0.55,
                y: 0,
                z: stylus.z + 8.0,
                mass
            };
        }

        if (mode === 'custom' || mode === 'selected') {
            const customLen = 18.0;
            const stylus = Physics.getStylusPoint(currentState, mode);
            return {
                x: currentState.cartX + customLen / 2,
                y: 0,
                z: stylus.z + (currentState.customZ * 0.55),
                mass
            };
        }

        return { x: 0, y: 0, z: 0, mass: 0 };
    },

    calculateEffectiveMass: function(momentOfInertia, effectiveLength) {
        return effectiveLength <= 0 ? 0 : momentOfInertia / (effectiveLength * effectiveLength);
    },

    calculateResonance: function(effectiveMass, compliance10Hz) {
        if (effectiveMass <= 0 || compliance10Hz <= 0) return 0;
        return 1000 / (2 * Math.PI * Math.sqrt(effectiveMass * compliance10Hz));
    },

    getRearWeightStackMass: function(currentState) {
        const count = Number(currentState && currentState.rearWeightDiscCount !== undefined ? currentState.rearWeightDiscCount : 0);
        const massEach = Number(currentState && currentState.rearWeightDiscMass !== undefined ? currentState.rearWeightDiscMass : 0);
        return (Number.isFinite(count) && Number.isFinite(massEach)) ? Math.max(0, Math.round(count)) * massEach : 0;
    },

    getRearFineTrimMass: function(currentState) {
        return Physics.sanitizeMass(currentState && currentState.rearFineTrimScrewMassEquivalent, 0);
    },

    getRearTerminalCenter: function(currentState) {
        if (typeof getUnifiedRearTerminal === 'function') {
            const terminal = getUnifiedRearTerminal(currentState || state);
            if (terminal && terminal.available === true) return terminal;
        }
        return { available: false, source: 'missing_unified_rear_terminal', x: null, y: null, z: null };
    },


    getRearWeightCOM: function(currentState) {
        const api = (typeof window !== 'undefined' && window.CobraDiscCounterweightAssembly)
            ? window.CobraDiscCounterweightAssembly
            : ((typeof globalThis !== 'undefined' && globalThis.CobraDiscCounterweightAssembly) ? globalThis.CobraDiscCounterweightAssembly : null);
        if (api && typeof api.getMassComponent === 'function') {
            const disc = api.getMassComponent(currentState);
            if (disc && disc.enabled && Number(disc.massG || disc.mass || 0) > 0 &&
                disc.com && Number.isFinite(Number(disc.com.x)) && Number.isFinite(Number(disc.com.z))) {
                return {
                    x: Number(disc.com && disc.com.x !== undefined ? disc.com.x : disc.x),
                    y: Number(disc.com && disc.com.y !== undefined ? disc.com.y : disc.y),
                    z: Number(disc.com && disc.com.z !== undefined ? disc.com.z : disc.z),
                    mass: Number(disc.massG || disc.mass || 0),
                    massG: Number(disc.massG || disc.mass || 0),
                    source: 'rearWeightDiscStack',
                    name: 'rearWeightDiscStack',
                    enabled: true,
                    com: {
                        x: Number(disc.com && disc.com.x !== undefined ? disc.com.x : disc.x),
                        y: Number(disc.com && disc.com.y !== undefined ? disc.com.y : disc.y),
                        z: Number(disc.com && disc.com.z !== undefined ? disc.com.z : disc.z)
                    },
                    discCount: disc.discCount,
                    discMassEachG: disc.discMassEachG,
                    discDiameterMm: disc.discDiameterMm,
                    discThicknessMm: disc.discThicknessMm
                };
            }
        }

        const rawCount = Number(currentState && currentState.rearWeightDiscCount !== undefined ? currentState.rearWeightDiscCount : 0);
        const count = Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : 0;
        const thickness = Number(currentState && currentState.rearWeightDiscThickness !== undefined ? currentState.rearWeightDiscThickness : 0);
        const mass = Physics.getRearWeightStackMass(currentState);
        if (count <= 0 || mass <= 0) return { x: 0, y: 0, z: 0, mass: 0, source: 'none', enabled: false };
        const terminal = Physics.getRearTerminalCenter(currentState);
        if (!terminal || terminal.available !== true || !Number.isFinite(Number(terminal.x)) || !Number.isFinite(Number(terminal.z))) {
            return { x: 0, y: 0, z: 0, mass: 0, source: 'missing_unified_rear_terminal', enabled: false };
        }
        if (!Number.isFinite(thickness) || thickness <= 0) {
            return { x: 0, y: 0, z: 0, mass: 0, source: 'invalid_downward_disc_stack_geometry', enabled: false };
        }
        const anchorZ = Number(terminal.z);
        const stackCOMZ = anchorZ - ((count * thickness) / 2);
        return {
            x: terminal.x,
            y: 0,
            z: stackCOMZ,
            mass,
            massG: mass,
            source: 'rearWeightDiscStack',
            name: 'rearWeightDiscStack',
            enabled: true,
            com: { x: terminal.x, y: 0, z: stackCOMZ },
            discMount: terminal,
            stackingMode: 'top_anchored_downward',
            anchorZ: anchorZ,
            stackTopZ: anchorZ,
            stackBottomZ: anchorZ - (count * thickness),
            stackCOMZ: stackCOMZ,
            discCenterZList: Array.from({ length: count }, function(_, i) { return anchorZ - (thickness / 2) - (i * thickness); }),
            discCount: count,
            discThicknessMm: thickness
        };
    },

    getFineTrimCOM: function(currentState) {
        const mass = Physics.getRearFineTrimMass(currentState);
        if (Math.abs(mass) <= 1e-9) return { x: 0, y: 0, z: 0, mass: 0 };

        const terminal = Physics.getRearTerminalCenter(currentState);
        if (!terminal || terminal.available !== true || !Number.isFinite(Number(terminal.x)) || !Number.isFinite(Number(terminal.z))) {
            return { x: 0, y: 0, z: 0, mass: 0, source: 'missing_unified_rear_terminal' };
        }
        const length = Number.isFinite(Number(currentState.rearFineTrimScrewLength)) ? Number(currentState.rearFineTrimScrewLength) : 0;
        return {
            x: terminal.x - Math.max(0, length) / 2,
            y: 0,
            z: terminal.z + Physics.getCounterweightZOffset(currentState),
            mass,
            source: 'rearFineTrimAtUnifiedRearTerminal',
            rearTerminal: terminal
        };
    },


    getDisabledCobraOvalCounterweightCOM: function(currentState) {
        // Phase 13.1: oval/capsule add-on is not part of active Cobra path.
        return { x: 0, y: 0, z: 0, mass: 0, massG: 0, name: 'cobraOvalCounterweight', source: 'disabled', enabled: false, com: { x: 0, y: 0, z: 0 } };
    },

    getCobraMechanicalMassComponents: function(currentState) {
        const api = (typeof window !== 'undefined' && window.CobraMechanicalAssembly)
            ? window.CobraMechanicalAssembly
            : ((typeof globalThis !== 'undefined' && globalThis.CobraMechanicalAssembly) ? globalThis.CobraMechanicalAssembly : null);
        if (api && typeof api.getMassComponents === 'function') {
            const components = api.getMassComponents(currentState);
            if (Array.isArray(components)) return components.map(function(c) {
                const mass = Number(c.massG || c.mass || 0);
                const com = c.com || c;
                return {
                    name: c.name,
                    mass,
                    massG: mass,
                    x: Number(com.x || 0),
                    y: Number(com.y || 0),
                    z: Number(com.z || 0),
                    com: {
                        x: Number(com.x || 0),
                        y: Number(com.y || 0),
                        z: Number(com.z || 0)
                    },
                    source: c.source || 'cobraMechanicalAssembly',
                    enabled: mass > 0
                };
            }).filter(function(c) { return c.mass > 0; });
        }
        return [];
    },



    getNeutralBalanceLine: function(currentState, frontRef) {
        return { p1: frontRef, p2: Physics.getPivotPoint(currentState) };
    },

    evaluateNeutralBalance: function(currentState, frontRef, rearCG) {
        const line = Physics.getNeutralBalanceLine(currentState, frontRef);
        const dx = line.p2.x - line.p1.x;
        const dz = line.p2.z - line.p1.z;
        const len = Math.sqrt(dx * dx + dz * dz);

        if (len === 0) return { error_mm: 0, vertical_offset_mm: 0, horizontal_offset_mm: 0, score: 'good', info_message: 'Neutral balance computed in TD044 stylus-anchored frame; thresholds calibrated for TD043 frame may need review.' };

        const nx = -dz / len;
        const nz = dx / len;
        const vx = rearCG.x - line.p1.x;
        const vz = rearCG.z - line.p1.z;

        const error_mm = Math.abs(vx * nx + vz * nz);
        const termCenter = Physics.getRearTerminalCenter(currentState);
        const horizontal_offset_mm = Math.abs(rearCG.x - termCenter.x);
        const vertical_offset_mm = Math.abs(rearCG.z - termCenter.z);

        let score = 'poor';
        if (error_mm <= 3.0) score = 'good';
        else if (error_mm <= 7.0) score = 'ok';

        return { error_mm, vertical_offset_mm, horizontal_offset_mm, score, info_message: 'Neutral balance computed in TD044 stylus-anchored frame; thresholds calibrated for TD043 frame may need review.' };
    },

    combineMassPoints: function(points) {
        const totalMass = points.reduce((s, p) => s + (p.mass || 0), 0);
        if (totalMass <= 0) return { x: 0, y: 0, z: 0, mass: 0 };
        return {
            x: points.reduce((s, p) => s + p.x * (p.mass || 0), 0) / totalMass,
            y: points.reduce((s, p) => s + p.y * (p.mass || 0), 0) / totalMass,
            z: points.reduce((s, p) => s + p.z * (p.mass || 0), 0) / totalMass,
            mass: totalMass
        };
    },

    integrateShellMass: function(currentState, rings) {
        const matKey = currentState.material;
        const materialData = MATERIAL_LIB[matKey] || MATERIAL_LIB.carbon;
        const matDensity = materialData.density / 1000;
        const pivot = Physics.getPivotPoint(currentState);
        const rearStartX = currentState.rearMode === REAR_MODES.COBRA_GOOSE
            ? Math.max(currentState.apex + 1, currentState.rearBendStartX - currentState.rearBlendLength)
            : Number.POSITIVE_INFINITY;

        let shellMass = 0;
        let rearShellMass = 0;
        let sx = 0, sy = 0, sz = 0;
        let rsx = 0, rsy = 0, rsz = 0;
        let Ixx = 0, Iyy = 0, Izz = 0, Ixz = 0;

        if (rings && rings.length > 0) {
            for (let i = 0; i < rings.length; i++) {
                const r = rings[i];
                let stepL = 1.0;
                if (i > 0) {
                    const prevC = rings[i - 1].center;
                    stepL = Math.sqrt(Math.pow(r.center.x - prevC.x, 2) + Math.pow(r.center.z - prevC.z, 2));
                }

                const a_net = Math.max(0, r.outGeo.area - r.inGeo.area);
                const dm = a_net * matDensity * stepL;
                shellMass += dm;
                sx += r.center.x * dm;
                sy += r.center.y * dm;
                sz += r.center.z * dm;

                if (r.center.x >= rearStartX) {
                    rearShellMass += dm;
                    rsx += r.center.x * dm;
                    rsy += r.center.y * dm;
                    rsz += r.center.z * dm;
                }

                const dx = r.center.x - pivot.x;
                const dy = r.center.y - pivot.y;
                const dz = r.center.z - pivot.z;
                Ixx += dm * (dy * dy + dz * dz);
                Iyy += dm * (dx * dx + dz * dz);
                Izz += dm * (dx * dx + dy * dy);
                Ixz += -dm * dx * dz;
            }
        }

        const shellCOM = shellMass > 0
            ? { x: sx / shellMass, y: sy / shellMass, z: sz / shellMass, mass: shellMass }
            : { x: pivot.x, y: 0, z: 0, mass: 0 };

        const rearShellCOM = rearShellMass > 0
            ? { x: rsx / rearShellMass, y: rsy / rearShellMass, z: rsz / rearShellMass, mass: rearShellMass }
            : { x: 0, y: 0, z: 0, mass: 0 };

        return { shellCOM, rearShellCOM, inertia: { Ixx, Iyy, Izz, Ixz } };
    },

    pointMassInertiaAboutPivot: function(point, pivot) {
        const m = point.mass || 0;
        if (m === 0) return { Ixx: 0, Iyy: 0, Izz: 0, Ixz: 0 };
        const dx = point.x - pivot.x;
        const dy = point.y - pivot.y;
        const dz = point.z - pivot.z;
        return {
            Ixx: m * (dy * dy + dz * dz),
            Iyy: m * (dx * dx + dz * dz),
            Izz: m * (dx * dx + dy * dy),
            Ixz: -m * dx * dz
        };
    },

    principalAxesXZ: function(Ixx, Izz, Ixz, totalMass) {
        const trace = Ixx + Izz;
        const root = Math.sqrt(Math.max(0, (Ixx - Izz) * (Ixx - Izz) + 4 * Ixz * Ixz));
        const lambda1 = 0.5 * (trace + root);
        const lambda2 = 0.5 * (trace - root);

        function eigenVec(lambda) {
            let vx = Ixz;
            let vz = lambda - Ixx;
            if (Math.abs(vx) < 1e-9 && Math.abs(vz) < 1e-9) {
                vx = 1;
                vz = 0;
            }
            const len = Math.max(1e-9, Math.sqrt(vx * vx + vz * vz));
            return { x: vx / len, y: 0, z: vz / len };
        }

        return {
            axis1: {
                dir: eigenVec(lambda1),
                value: lambda1,
                k: totalMass > 0 ? Math.sqrt(lambda1 / totalMass) : 0
            },
            axis2: {
                dir: eigenVec(lambda2),
                value: lambda2,
                k: totalMass > 0 ? Math.sqrt(lambda2 / totalMass) : 0
            }
        };
    },

    distanceMetrics: function(a, b) {
        return {
            dx: b.x - a.x,
            dy: b.y - a.y,
            dz: b.z - a.z,
            d: Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow(b.z - a.z, 2))
        };
    },

    calculateStructuralMetrics: function(currentState, rings) {
        const eggshellApi = (typeof globalThis !== 'undefined' && globalThis.CobraEggshellWand) ? globalThis.CobraEggshellWand : null;
        if (eggshellApi &&
            typeof eggshellApi.isEnabled === 'function' &&
            typeof eggshellApi.buildStations === 'function' &&
            typeof eggshellApi.getStructuralSummary === 'function' &&
            typeof isCobraEggshellRuntimeGeometryDebugEnabled === 'function' &&
            isCobraEggshellRuntimeGeometryDebugEnabled(currentState) &&
            eggshellApi.isEnabled(currentState)) {
            const stations = eggshellApi.buildStations(currentState);
            const summary = eggshellApi.getStructuralSummary(stations);
            const materialForEggshell = MATERIAL_LIB[currentState.material] || MATERIAL_LIB.carbon;
            const eProxy = summary && Number.isFinite(Number(summary.minEIProxy)) ? Number(summary.minEIProxy) : 0;
            const areaProxy = summary && Number.isFinite(Number(summary.minSectionAreaProxyMm2)) ? Number(summary.minSectionAreaProxyMm2) : 0;
            const lengthMProxy = Math.max(0.001, (currentState.cobraArchitecture && currentState.cobraArchitecture.armwand ?
                Number(currentState.cobraArchitecture.armwand.lengthMm || 237.05) : 237.05) / 1000);
            const eiProxyNm2 = eProxy > 0 ? (eProxy * materialForEggshell.E) / 1000000 : 0;
            const gjProxyNm2 = eiProxyNm2 > 0 ? Math.max(eiProxyNm2 * 0.18, 0.001) : 0;
            const densityKgM3 = materialForEggshell.density * 1000;
            const muProxy = areaProxy > 0 ? densityKgM3 * areaProxy * 1e-6 : 0;
            const firstBendingHz = (eiProxyNm2 > 0 && muProxy > 0)
                ? (Math.pow(1.875104, 2) / (2 * Math.PI)) * Math.sqrt(eiProxyNm2 / (muProxy * Math.pow(lengthMProxy, 4)))
                : 0;
            const firstTorsionHz = (gjProxyNm2 > 0 && muProxy > 0)
                ? (1 / (4 * lengthMProxy)) * Math.sqrt(gjProxyNm2 / (muProxy * 1e-6))
                : 0;
            return {
                EI_min_Nm2: eiProxyNm2,
                EI_max_Nm2: eiProxyNm2,
                EI_apex_Nm2: eiProxyNm2,
                GJ_min_Nm2: gjProxyNm2,
                GJ_max_Nm2: gjProxyNm2,
                massPerLength_kgm: muProxy,
                firstBendingHz,
                firstTorsionHz,
                bendingStatus: firstBendingHz >= (currentState.targetFirstBendingMode || 200) ? 'ok' : 'warning',
                torsionStatus: firstTorsionHz > 0 ? 'ok' : 'warning',
                source: 'cobraEggshellWand',
                stationCount: summary.stationCount,
                structuralStationCount: summary.structuralStationCount,
                minStationWidthMm: summary.minStationWidthMm,
                minStationHeightMm: summary.minStationHeightMm,
                minSectionAreaProxyMm2: summary.minSectionAreaProxyMm2,
                minEIProxy: summary.minEIProxy
            };
        }

        const materialData = MATERIAL_LIB[currentState.material] || MATERIAL_LIB.carbon;
        const densityKgM3 = materialData.density * 1000;
        const allRings = Array.isArray(rings) ? rings : [];
        const totalRingCount = allRings.length;
        const widthEpsMm = 0.5;
        const heightEpsMm = 0.5;
        const areaEpsMm2 = 0.001;
        const inertiaEpsMm4 = 1e-6;

        let eiMin = Infinity, eiMax = 0, eiApex = 0;
        let gjMin = Infinity, gjMax = 0;
        let muSum = 0, muWeight = 0, polarMassPerLengthSum = 0, polarWeight = 0;
        const eiSamples = [];
        const structuralRings = [];
        let excludedCapOrSliverCount = 0;

        function ringDimensions(r) {
            const p = (r && r.p) ? r.p : {};
            const outGeo = (r && r.outGeo) ? r.outGeo : {};
            return {
                width: Number.isFinite(Number(p.width)) ? Number(p.width) : 0,
                height: Number.isFinite(Number(p.height)) ? Number(p.height) : 0,
                outerArea: Number.isFinite(Number(outGeo.area)) ? Number(outGeo.area) : 0
            };
        }

        allRings.forEach(function(r, index) {
            if (!r || !r.center || !r.outGeo || !r.inGeo) {
                excludedCapOrSliverCount += 1;
                return;
            }
            const dims = ringDimensions(r);
            const areaNet = Math.max(0, Number(r.outGeo.area || 0) - Number(r.inGeo.area || 0));
            const iyNet = Math.max(0, Number(r.outGeo.Iy || 0) - Number(r.inGeo.Iy || 0));
            const izNet = Math.max(0, Number(r.outGeo.Iz || 0) - Number(r.inGeo.Iz || 0));
            const iMin = Math.min(iyNet, izNet);

            const isCapOrSliver =
                dims.width < widthEpsMm ||
                dims.height < heightEpsMm ||
                areaNet <= areaEpsMm2 ||
                iMin <= inertiaEpsMm4;

            if (isCapOrSliver) {
                excludedCapOrSliverCount += 1;
                return;
            }
            structuralRings.push({ ring: r, index, areaNet, iyNet, izNet, iMin });
        });

        const structuralRingCount = structuralRings.length;
        const lengthMm = structuralRingCount > 1
            ? Math.max(1, structuralRings[structuralRingCount - 1].ring.center.x - structuralRings[0].ring.center.x)
            : ((allRings && allRings.length > 1) ? Math.max(1, allRings[allRings.length - 1].center.x - allRings[0].center.x) : LENGTH);
        const lengthM = lengthMm / 1000;

        structuralRings.forEach(function(sample) {
            const r = sample.ring;
            const iMax = Math.max(sample.iyNet, sample.izNet);
            const ei = (sample.iMin * materialData.E) / 1000000; // N·m²
            const eiStrong = (iMax * materialData.E) / 1000000;
            const perimeter = Math.max(1e-6, r.outGeo.perimeter || 0);
            const enclosedArea = Math.max(0, r.outGeo.area - (perimeter * currentState.thick * 0.5));
            const jClosed = (4 * enclosedArea * enclosedArea * currentState.thick) / perimeter; // mm⁴
            const gj = (jClosed * materialData.G) / 1000000; // N·m²
            const mu = densityKgM3 * sample.areaNet * 1e-6; // kg/m
            const polarMassPerLength = densityKgM3 * (sample.iyNet + sample.izNet) * 1e-12; // kg·m

            if (ei > 0) {
                eiSamples.push({ x: r.center.x, ei });
                eiMin = Math.min(eiMin, ei);
                eiMax = Math.max(eiMax, eiStrong);
            }
            if (gj > 0) {
                gjMin = Math.min(gjMin, gj);
                gjMax = Math.max(gjMax, gj);
            }
            if (mu > 0) {
                muSum += mu;
                muWeight += 1;
            }
            if (polarMassPerLength > 0) {
                polarMassPerLengthSum += polarMassPerLength;
                polarWeight += 1;
            }
        });

        if (eiSamples.length > 0) {
            let prevSample = null;
            for (const sample of eiSamples) {
                if (prevSample && prevSample.x <= currentState.apex && sample.x >= currentState.apex) {
                    const denom = sample.x - prevSample.x;
                    const t = Math.abs(denom) > 1e-9 ? (currentState.apex - prevSample.x) / denom : 0;
                    eiApex = prevSample.ei * (1 - t) + sample.ei * t;
                    break;
                }
                prevSample = sample;
            }
            if (eiApex === 0) {
                let nearest = eiSamples[0];
                eiSamples.forEach(function(sample) {
                    if (Math.abs(sample.x - currentState.apex) < Math.abs(nearest.x - currentState.apex)) nearest = sample;
                });
                eiApex = nearest.ei;
            }
        }

        if (!Number.isFinite(eiMin)) eiMin = 0;
        if (!Number.isFinite(gjMin)) gjMin = 0;
        if (eiApex === 0) eiApex = eiMin;
        const muAvg = muWeight > 0 ? muSum / muWeight : 0;
        const polarAvg = polarWeight > 0 ? polarMassPerLengthSum / polarWeight : 0;
        const firstBendingHz = (structuralRingCount >= 2 && eiMin > 0 && muAvg > 0 && lengthM > 0)
            ? (Math.pow(1.875104, 2) / (2 * Math.PI)) * Math.sqrt(eiMin / (muAvg * Math.pow(lengthM, 4)))
            : 0;
        const firstTorsionHz = (structuralRingCount >= 2 && gjMin > 0 && polarAvg > 0 && lengthM > 0)
            ? (1 / (4 * lengthM)) * Math.sqrt(gjMin / polarAvg)
            : 0;

        const structuralStatus = structuralRingCount < 2
            ? 'fail'
            : (firstBendingHz >= (currentState.targetFirstBendingMode || 200) ? 'ok' : 'warning');
        const torsionStatus = structuralRingCount < 2
            ? 'fail'
            : (firstTorsionHz > 0 ? 'ok' : 'warning');

        return {
            EI_min_Nm2: eiMin,
            EI_max_Nm2: eiMax,
            EI_apex_Nm2: eiApex,
            GJ_min_Nm2: gjMin,
            GJ_max_Nm2: gjMax,
            massPerLength_kgm: muAvg,
            firstBendingHz,
            firstTorsionHz,
            bendingStatus: structuralStatus,
            torsionStatus,
            source: (typeof UNIFIED_GEOMETRY_SOURCE_ID !== 'undefined') ? UNIFIED_GEOMETRY_SOURCE_ID : 'td026_full_ring_geometry',
            totalRingCount,
            structuralRingCount,
            excludedCapOrSliverCount,
            structuralFilter: {
                widthEpsMm,
                heightEpsMm,
                areaEpsMm2,
                inertiaEpsMm4
            }
        };
    },

    solveCounterweightForVTF: function(currentState, mode, rings, targetVTF) {
        const pivot = Physics.getPivotPoint(currentState);
        const stylus = Physics.getStylusPoint(currentState, mode);
        const shellData = Physics.integrateShellMass(currentState, rings || GLOBAL_RINGSCache);
        const c_cart = Physics.getCartridgeCOM(currentState, mode);
        const fineTrimCOM = Physics.getFineTrimCOM(currentState);
        const baseCOM = Physics.combineMassPoints([shellData.shellCOM, c_cart, fineTrimCOM]);
        const terminal = Physics.getRearTerminalCenter(currentState);
        const leverArmX = pivot.x - stylus.x;
        const targetMomentGmm = targetVTF * leverArmX;
        const baseMomentGmm = baseCOM.mass * (pivot.x - baseCOM.x);
        const momentPerGram = pivot.x - terminal.x;
        if (Math.abs(momentPerGram) < 1e-9) return { requiredMass: 0, feasible: false };
        const requiredMass = (targetMomentGmm - baseMomentGmm) / momentPerGram;
        return {
            requiredMass,
            targetMomentGmm,
            baseMomentGmm,
            counterweightX: terminal.x,
            feasible: requiredMass >= 0
        };
    },

    calculateStaticImbalance: function(currentState, mode, pivot, stylus, totalCOM, totalMass) {
        const leverArmX = (pivot.x - stylus.x);
        if (Math.abs(leverArmX) < 1e-9 || totalMass <= 0) {
            return {
                gf: 0,
                milliNewton: 0,
                leverArmX: 0,
                totalMomentGmm: 0,
                status: 'neutral',
                quality: 'poor'
            };
        }

        const totalMomentGmm = totalMass * (pivot.x - totalCOM.x);
        const gf = totalMomentGmm / leverArmX;
        const milliNewton = gf * 9.80665;

        let status = 'downforce';
        if (gf < -0.05) status = 'lift';
        else if (Math.abs(gf) <= 0.05) status = 'neutral';

        const absGf = Math.abs(gf);
        let quality = 'poor';
        if (gf >= 1.5 && gf <= 2.5) quality = 'good';
        else if (gf >= 1.0 && gf <= 3.0) quality = 'ok';

        return {
            gf,
            milliNewton,
            leverArmX,
            totalMomentGmm,
            status,
            quality
        };
    },

    calculateTrackingForce: function(currentState, mode, pivot, stylus, totalCOM, totalMass) {
        return Physics.calculateStaticImbalance(currentState, mode, pivot, stylus, totalCOM, totalMass);
    },

    // TD043: front-arm COM is used for neutral-balance collinearity.
    getFrontArmCOM: function(currentState, mode, rings) {
        const pivot = Physics.getPivotPoint(currentState);
        const stylus = Physics.getStylusPoint(currentState, mode);
        const c_cart = Physics.getCartridgeCOM(currentState, mode);
        let frontMass = c_cart.mass || 0;
        let frontMx = c_cart.x * frontMass;
        let frontMy = c_cart.y * frontMass;
        let frontMz = c_cart.z * frontMass;
        const ringList = rings || GLOBAL_RINGSCache || [];
        for (const r of ringList) {
            if (!r || !r.center) continue;
            if (r.center.x >= stylus.x && r.center.x <= pivot.x) {
                const areaNet = Math.max(0, (r.outGeo ? r.outGeo.area : 0) - (r.inGeo ? r.inGeo.area : 0));
                const matKey = currentState.material;
                const materialData = MATERIAL_LIB[matKey] || MATERIAL_LIB.carbon;
                const matDensity = materialData.density / 1000;
                let stepL = 1.0;
                const idx = ringList.indexOf(r);
                if (idx > 0 && ringList[idx - 1] && ringList[idx - 1].center) {
                    const prevC = ringList[idx - 1].center;
                    stepL = Math.sqrt(Math.pow(r.center.x - prevC.x, 2) + Math.pow(r.center.z - prevC.z, 2));
                }
                const m = areaNet * matDensity * stepL;
                frontMass += m;
                frontMx += r.center.x * m;
                frontMy += r.center.y * m;
                frontMz += r.center.z * m;
            }
        }
        if (frontMass <= 0) return { x: 0, y: 0, z: 0, mass: 0 };
        return {
            x: frontMx / frontMass,
            y: frontMy / frontMass,
            z: frontMz / frontMass,
            mass: frontMass
        };
    },

    getComprehensiveAnalysis: function(currentState, mode, rings) {
        const pivot = Physics.getPivotPoint(currentState);
        const stylus = Physics.getStylusPoint(currentState, mode);
        const c_cart = Physics.getCartridgeCOM(currentState, mode);
        const rearTerminal = Physics.getRearTerminalCenter(currentState);
        const rearWeightCOM = Physics.getRearWeightCOM(currentState);
        const cobraMechanicalMassComponents = Physics.getCobraMechanicalMassComponents(currentState);
        const fineTrimCOM = Physics.getFineTrimCOM(currentState);

        const shellData = Physics.integrateShellMass(currentState, rings);
        const c_shell = shellData.shellCOM;
        const c_front = Physics.getFrontArmCOM(currentState, mode, rings);

        const c_rear_accessories = Physics.combineMassPoints([rearWeightCOM, fineTrimCOM]);
        const c_rear = Physics.combineMassPoints([shellData.rearShellCOM, rearWeightCOM, fineTrimCOM]);
        const c_total = Physics.combineMassPoints([c_shell, c_cart, rearWeightCOM, fineTrimCOM]);

        let Ixx = shellData.inertia.Ixx;
        let Iyy = shellData.inertia.Iyy;
        let Izz = shellData.inertia.Izz;
        let Ixz = shellData.inertia.Ixz;

        [c_cart, rearWeightCOM, fineTrimCOM].forEach(p => {
            const I = Physics.pointMassInertiaAboutPivot(p, pivot);
            Ixx += I.Ixx;
            Iyy += I.Iyy;
            Izz += I.Izz;
            Ixz += I.Ixz;
        });

        const totalMass = c_total.mass;
        const kyy = totalMass > 0 ? Math.sqrt(Iyy / totalMass) : 0;
        const kzz = totalMass > 0 ? Math.sqrt(Izz / totalMass) : 0;
        const principal = Physics.principalAxesXZ(Ixx, Izz, Ixz, totalMass);
        const trackingForce = Physics.calculateStaticImbalance(currentState, mode, pivot, stylus, c_total, totalMass);
        const structural = Physics.calculateStructuralMetrics(currentState, rings);

        return {
            pivot,
            stylus,
            c_cart,
            c_shell,
            c_front,
            c_rear_accessories,
            c_rear_weights: rearWeightCOM,
            rearTerminal,
            unifiedGeometrySource: (typeof UNIFIED_GEOMETRY_SOURCE_ID !== 'undefined') ? UNIFIED_GEOMETRY_SOURCE_ID : 'td026_full_ring_geometry',
            c_cobra_mechanical_components: cobraMechanicalMassComponents,
            c_cobra_mechanical: Physics.combineMassPoints(cobraMechanicalMassComponents),
            mechanicalMassIntegrationStatus: 'reported_separately_not_total_COM',
            counterweightCOMSource: rearWeightCOM && rearWeightCOM.source ? rearWeightCOM.source : 'none',
            rearDiscProxyUsed: false,
            c_rear,
            c_total,
            trackingForce,
            staticImbalance: trackingForce,
            structural,
            inertia: {
                Ixx,
                Iyy,
                Izz,
                Ixz,
                kyy,
                kzz,
                principal,
                axisY: { dir: { x: 0, y: 1, z: 0 }, value: Iyy, k: kyy }
            },
            distances: {
                stylus_pivot: Physics.distanceMetrics(stylus, pivot),
                pivot_totalCOM: Physics.distanceMetrics(pivot, c_total),
                pivot_rearCOM: Physics.distanceMetrics(pivot, c_rear),
                pivot_counterweightCOM: Physics.distanceMetrics(pivot, rearWeightCOM),
                totalCOM_counterweightCOM: Physics.distanceMetrics(c_total, rearWeightCOM),
                stylus_totalCOM: Physics.distanceMetrics(stylus, c_total)
            }
        };
    }
};
