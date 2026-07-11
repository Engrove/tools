/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F geometry.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/geometry.js
 * Geometric construction, cross-section validation, and mesh topology.
 * Incorporates C1/G1-continuous spline blending for the Cobra mode.
 */

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smooth01(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
function smoother01(t) { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); }

let GLOBAL_RINGSCache = [];

function getMeshSegments() {
    const raw = (state && Number.isFinite(Number(state.meshSegments))) ? Number(state.meshSegments) : 60;
    return Math.max(12, Math.min(200, Math.round(raw)));
}

function getMeshStepX() {
    const raw = (state && Number.isFinite(Number(state.meshStepX))) ? Number(state.meshStepX) : 1.0;
    return Math.max(0.25, Math.min(5.0, raw));
}

function getMinExportCapWidthMm() {
    const segments = getMeshSegments();
    return 2 * Math.sqrt((0.01 * segments) / Math.PI);
}

function getSolidExportStartRingIndex(minWidthMm) {
    if (!GLOBAL_RINGSCache || GLOBAL_RINGSCache.length === 0) return 0;
    const threshold = Math.max(Number.isFinite(minWidthMm) ? minWidthMm : 0.5, getMinExportCapWidthMm());
    for (let i = 0; i < GLOBAL_RINGSCache.length; i++) {
        const p = GLOBAL_RINGSCache[i].p || {};
        if ((p.width || 0) >= threshold && (p.height || 0) >= threshold) return i;
    }
    return 0;
}

function getSolidExportRings() {
    const startIndex = getSolidExportStartRingIndex(0.5);
    return GLOBAL_RINGSCache.slice(startIndex);
}

function getHollowExportRings() {
    const startIndex = getSolidExportStartRingIndex(3.0);
    return GLOBAL_RINGSCache.slice(startIndex);
}

let LAST_EXPORT_VALIDATION = null;

function getLastExportValidation() {
    return LAST_EXPORT_VALIDATION;
}


const UNIFIED_GEOMETRY_SOURCE_ID = 'td026_full_ring_geometry';

function cloneUnifiedPoint(point, fallbackSource) {
    if (!point) return null;
    const out = {
        x: Number(point.x),
        y: Number(point.y || 0),
        z: Number(point.z)
    };
    if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z)) return null;
    if (fallbackSource) out.source = fallbackSource;
    return out;
}

function getUnifiedRingCache() {
    return Array.isArray(GLOBAL_RINGSCache) ? GLOBAL_RINGSCache : [];
}

function getUnifiedGeometrySource(sourceState, ringsOverride) {
    const rings = Array.isArray(ringsOverride) ? ringsOverride : getUnifiedRingCache();
    const hasFullRingGeometry = rings.length > 0 && !!(rings[rings.length - 1] && rings[rings.length - 1].center);
    return {
        id: UNIFIED_GEOMETRY_SOURCE_ID,
        role: 'primary_runtime_geometry',
        source: hasFullRingGeometry ? 'GLOBAL_RINGSCache' : 'missing',
        available: hasFullRingGeometry,
        ringCount: rings.length,
        supportsFullRearTerminal: hasFullRingGeometry,
        cobraEggshellRuntimeGeometryEnabled: isCobraEggshellRuntimeGeometryDebugEnabled(sourceState || state)
    };
}

function getUnifiedRearTerminal(sourceState, ringsOverride) {
    const rings = Array.isArray(ringsOverride) ? ringsOverride : getUnifiedRingCache();
    for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        const center = cloneUnifiedPoint(ring && ring.center, 'GLOBAL_RINGSCache.lastFiniteRing');
        const hasSection = !!(ring && ring.p &&
            Number.isFinite(Number(ring.p.width)) &&
            Number.isFinite(Number(ring.p.height)) &&
            Number(ring.p.width) > 0 &&
            Number(ring.p.height) > 0);
        if (center && hasSection) {
            return Object.assign(center, {
                available: true,
                geometrySource: UNIFIED_GEOMETRY_SOURCE_ID,
                source: 'GLOBAL_RINGSCache.lastFiniteRing',
                ringIndex: i,
                virtualX: Number.isFinite(Number(ring.virtualX)) ? Number(ring.virtualX) : null,
                widthMm: Number(ring.p.width),
                heightMm: Number(ring.p.height)
            });
        }
    }

    return {
        available: false,
        geometrySource: UNIFIED_GEOMETRY_SOURCE_ID,
        source: 'missing_full_ring_geometry',
        x: null,
        y: null,
        z: null,
        ringIndex: null,
        virtualX: null,
        error: 'Unified rear terminal unavailable because no finite full ring terminal is available.'
    };
}

function isCobraEggshellRuntimeGeometryDebugEnabled(sourceState) {
    const s = sourceState || (typeof state !== 'undefined' ? state : {});
    const arch = s && s.cobraArchitecture ? s.cobraArchitecture : {};
    const armwand = arch && arch.armwand ? arch.armwand : {};
    return !!(
        s.useCobraEggshellWandDebug === true ||
        s.useCobraEggshellExportDebug === true ||
        s.showCobraEggshellWandDebug === true ||
        armwand.debugPreview === true ||
        armwand.debugExport === true ||
        armwand.experimentalRuntimeSource === true
    );
}

function isMechanicalAssemblyDebugEnabled(sourceState) {
    const s = sourceState || (typeof state !== 'undefined' ? state : {});
    const arch = s && s.cobraArchitecture ? s.cobraArchitecture : {};
    const mech = arch && arch.mechanical ? arch.mechanical : {};
    return !!(
        s.showMechanicalAssemblyDebug === true ||
        mech.showDebug === true ||
        mech.debugOverlay === true
    );
}

function exposeUnifiedGeometryApi() {
    if (typeof globalThis === 'undefined') return;
    globalThis.UNIFIED_GEOMETRY_SOURCE_ID = UNIFIED_GEOMETRY_SOURCE_ID;
    globalThis.getUnifiedRingCache = getUnifiedRingCache;
    globalThis.getUnifiedGeometrySource = getUnifiedGeometrySource;
    globalThis.getUnifiedRearTerminal = getUnifiedRearTerminal;
    globalThis.mergeVertices = mergeVertices;
    globalThis.finalizeWeldedGeometry = finalizeWeldedGeometry;
    globalThis.analyzeMeshTopology = analyzeMeshTopology;
    globalThis.validateFinalExportMeshTopology = validateFinalExportMeshTopology;
    globalThis.analyzeProfileContinuity = analyzeProfileContinuity;
    globalThis.isCobraEggshellRuntimeGeometryDebugEnabled = isCobraEggshellRuntimeGeometryDebugEnabled;
    globalThis.isMechanicalAssemblyDebugEnabled = isMechanicalAssemblyDebugEnabled;
    globalThis.GLOBAL_RINGSCache = GLOBAL_RINGSCache;
}

exposeUnifiedGeometryApi();


function getGoldring1042ProfileAtX(x) {
    let zTop = bezierYAtX(GOLDRING1042.side.top, x);
    let zBot = bezierYAtX(GOLDRING1042.side.bottom, x);
    let halfW = bezierYAtX(GOLDRING1042.plan.halfWidth, x);
    return { zTop, zBot, width: halfW * 2 };
}

function getCobraControlsApi() {
    return (typeof globalThis !== 'undefined' && globalThis.CobraControls) ? globalThis.CobraControls : null;
}

function isCobraControlsActiveForState(sourceState) {
    const api = getCobraControlsApi();
    const s = sourceState || state;
    return !!(api && api.isActiveForState && api.isActiveForState(s));
}

function getCobraControlValue(sourceState, id, fallback) {
    const api = getCobraControlsApi();
    if (!api || !api.get) return fallback;
    const value = api.get(id, sourceState || state);
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cobraPoweredSmoother01(t, power) {
    const p = Math.max(0.1, Number.isFinite(Number(power)) ? Number(power) : 1);
    return smoother01(Math.pow(clamp01(t), p));
}

function getCobraControlProfilePatchForState(sourceState, x, legacyProfile) {
    const s = sourceState || state;
    if (!isCobraControlsActiveForState(s)) return null;

    const bodyMaxX = getCobraControlValue(s, 'bodyMaxX', 130);
    const bodyMaxWidth = getCobraControlValue(s, 'bodyMaxWidth', 32);
    const bodyMaxHeight = getCobraControlValue(s, 'bodyMaxHeight', 18);
    const frontTaperLength = getCobraControlValue(s, 'frontTaperLength', 110);
    const rearTaperLength = getCobraControlValue(s, 'rearTaperLength', 95);
    const frontTaperPower = getCobraControlValue(s, 'frontTaperPower', 1.6);
    const rearTaperPower = getCobraControlValue(s, 'rearTaperPower', 1.4);
    const canopyCrownX = getCobraControlValue(s, 'canopyCrownX', bodyMaxX);
    const canopyRidgeAmount = getCobraControlValue(s, 'canopyRidgeAmount', 0.35);
    const headshellFlatness = getCobraControlValue(s, 'headshellFlatness', 0.85);

    const padEnd = Math.max(0.001, Number.isFinite(Number(s.padL)) ? Number(s.padL) : 31);
    const headWidth = Math.max(0.01, Number.isFinite(Number(s.headW)) ? Number(s.headW) : legacyProfile.width);
    const headHeight = Math.max(0.01, Number.isFinite(Number(s.headH)) ? Number(s.headH) : legacyProfile.height);
    const tailDiameter = Math.max(0.01, Number.isFinite(Number(s.tailD)) ? Number(s.tailD) : 7.5);

    let width = legacyProfile.width;
    let height = legacyProfile.height;
    let flatness = legacyProfile.flatness;
    let zBot = legacyProfile.zBot;
    let zTop = legacyProfile.zTop;

    if (x <= padEnd) {
        flatness = Math.max(flatness, headshellFlatness);
        width = Math.max(width, headWidth * (0.92 + 0.08 * headshellFlatness));
        height = Math.max(0.01, headHeight * (1 - 0.18 * headshellFlatness));
        const center = (zTop + zBot) / 2;
        zBot = center - height / 2;
        zTop = center + height / 2;
    } else if (x <= bodyMaxX) {
        const frontStartX = Math.max(padEnd, bodyMaxX - frontTaperLength);
        const u = clamp01((x - frontStartX) / Math.max(1, bodyMaxX - frontStartX));
        const f = cobraPoweredSmoother01(u, frontTaperPower);
        width = headWidth + (bodyMaxWidth - headWidth) * f;
        height = headHeight + (bodyMaxHeight - headHeight) * f;
        flatness = Math.max(0, headshellFlatness * (1 - f));
        zBot = legacyProfile.zBot;
        zTop = zBot + height;
    } else {
        const u = clamp01((x - bodyMaxX) / Math.max(1, rearTaperLength));
        const f = cobraPoweredSmoother01(u, 1 / Math.max(0.1, rearTaperPower));
        width = bodyMaxWidth + (tailDiameter - bodyMaxWidth) * f;
        height = bodyMaxHeight + (tailDiameter - bodyMaxHeight) * f;
        flatness = 0;
        zBot = legacyProfile.zBot;
        zTop = zBot + height;
    }

    const crownSigma = Math.max(10, Math.min(frontTaperLength, rearTaperLength) * 0.42);
    const crownU = (x - canopyCrownX) / crownSigma;
    const crownShape = Math.exp(-0.5 * crownU * crownU);
    const crownRaise = Math.max(0, canopyRidgeAmount) * Math.max(0.01, bodyMaxHeight) * 0.12 * crownShape;
    zTop += crownRaise;

    return {
        width: Math.max(0.01, width),
        height: Math.max(0.01, zTop - zBot),
        zTop,
        zBot,
        zCenter: (zTop + zBot) / 2,
        flatness
    };
}

function classicDropCurveG1(t, bulge) {
    const b = Math.max(1.01, Number(bulge) || 2);
    const tc = clamp01(t);
    if (tc <= 0) return 1;
    if (tc >= 1) return 0;

    function f(x) {
        return Math.pow(Math.max(0, 1 - Math.pow(x, b)), 1 / b) || 0;
    }
    function fp(x) {
        const inner = Math.max(1e-12, 1 - Math.pow(x, b));
        return -Math.pow(Math.max(0, x), b - 1) * Math.pow(inner, (1 / b) - 1);
    }

    const tBlend = 0.05;
    if (tc >= tBlend) return f(tc);

    const fB = f(tBlend);
    const dB = fp(tBlend) * tBlend; // derivative with respect to normalized blend parameter s
    const D = fB - 1;
    const a3 = 10 * D - 4 * dB;
    const a4 = -15 * D + 7 * dB;
    const a5 = 6 * D - 3 * dB;
    const s = tc / tBlend;
    return 1 + a3 * Math.pow(s, 3) + a4 * Math.pow(s, 4) + a5 * Math.pow(s, 5);
}

function getSculptControl(sourceState, id, fallback) {
    const s = sourceState || state;
    const value = s ? Number(s[id]) : NaN;
    return Number.isFinite(value) ? value : fallback;
}

function getHeadSculptWeightForX(sourceState, x) {
    const enabled = getSculptControl(sourceState, 'sculptHeadFlatEnabled', 0) > 0.5;
    if (!enabled) return 0;
    const startX = getSculptControl(sourceState, 'sculptHeadFlatStartX', 0);
    const endX = Math.max(startX + 0.5, getSculptControl(sourceState, 'sculptHeadFlatEndX', (sourceState || state).padL || 30));
    const blend = Math.max(0, getSculptControl(sourceState, 'sculptHeadBlendLength', 12));
    if (x < startX) return 0;
    if (x <= endX) return 1;
    if (blend <= 0 || x >= endX + blend) return 0;
    return 1 - smoother01((x - endX) / Math.max(1e-6, blend));
}

function getFrontStiffnessRampMinHeightForState(sourceState, x) {
    const s = sourceState || state;
    const enabled = getSculptControl(s, 'sculptFrontStiffnessRampEnabled', 0) > 0.5;
    const autoEnabled = getSculptControl(s, 'sculptStepSuppressor', 0) > 0.85 && getSculptControl(s, 'sculptHeadFlatEnabled', 0) > 0.5;
    if (!enabled && !autoEnabled) return 0;

    const startX = getSculptControl(s, 'sculptFrontRampStartX', 0);
    const endX = Math.max(startX + 1, getSculptControl(s, 'sculptFrontRampEndX', 78));
    if (x < startX) return 0;

    const minHeadH = Math.max(0.5, getSculptControl(s, 'sculptFrontMinHeight', 5.8));
    const targetH = Math.max(minHeadH, getSculptControl(s, 'sculptFrontRampTargetHeight', 10.0));
    const neckL = Math.max(1, getSculptControl(s, 'neckL', 45));
    const headBlend = Math.max(0, getSculptControl(s, 'sculptHeadBlendLength', 12));
    const releaseLength = Math.max(36, headBlend * 1.5, Math.min(90, neckL * 0.75));
    const releaseEndX = endX + releaseLength;

    if (x <= endX) {
        const t = smoother01((x - startX) / Math.max(1e-6, endX - startX));
        return minHeadH + (targetH - minHeadH) * t;
    }
    if (x <= releaseEndX) {
        // TD049: never drop from target height directly back to the base profile.
        // Keep a C2 smootherstep release envelope so rampEnd cannot create a one-ring ledge.
        const u = smoother01((x - endX) / Math.max(1e-6, releaseLength));
        return minHeadH + (targetH - minHeadH) * (1 - u);
    }
    return 0;
}

function applyFrontStiffnessRampForState(sourceState, x, profile, flatWeight) {
    const s = sourceState || state;
    if (!profile) return profile;
    const minHeight = getFrontStiffnessRampMinHeightForState(s, x);
    if (minHeight <= 0 || Number(profile.height) >= minHeight) return profile;

    const currentTop = Number(profile.zTop);
    const currentBot = Number(profile.zBot);
    const currentHeight = Math.max(0.01, currentTop - currentBot);
    const extra = Math.max(0, minHeight - currentHeight);
    const topBias = clamp01(getSculptControl(s, 'sculptFrontTopBias', 0.95));
    const bottomBias = (flatWeight && flatWeight > 0.15) ? 0 : (1 - topBias);
    const growTop = extra * (1 - bottomBias);
    const growBot = extra * bottomBias;
    const targetTop = currentTop + growTop;
    const targetBot = currentBot - growBot;

    return Object.assign({}, profile, {
        zTop: targetTop,
        zBot: targetBot,
        zCenter: (targetTop + targetBot) / 2,
        height: Math.max(0.01, targetTop - targetBot),
        frontStiffnessRampMinHeight: minHeight
    });
}

function applyAISculptProfileForState(sourceState, x, profile) {
    const s = sourceState || state;
    if (!profile) return profile;
    const weightRaw = getHeadSculptWeightForX(s, x);
    const stepSuppressor = clamp01(getSculptControl(s, 'sculptStepSuppressor', 0));
    const weight = clamp01(weightRaw * Math.max(0, stepSuppressor));
    let out = profile;

    if (weight > 0) {
        const planeZ = getSculptControl(s, 'sculptHeadBottomZ', -Math.max(0.01, Number(s.headH) || 6) / 2 + (Number(s.padOffset) || 0));
        const currentBot = Number(out.zBot);
        const currentTop = Number(out.zTop);
        const targetBot = currentBot * (1 - weight) + planeZ * weight;
        const minHeight = Math.max(0.5, Math.min(4, (Number(s.thick) || 1.5) * 2.25));
        const targetTop = Math.max(currentTop, targetBot + minHeight);
        const flatWidth = clamp01(getSculptControl(s, 'sculptHeadFlatWidthFraction', 0.7)) * weight;
        const flatness = Math.max(out.flatness || 0, 0.85 * weight);

        out = Object.assign({}, out, {
            zTop: targetTop,
            zBot: targetBot,
            zCenter: (targetTop + targetBot) / 2,
            height: Math.max(0.01, targetTop - targetBot),
            flatness: flatness,
            flatBottomFraction: Math.max(Number(out.flatBottomFraction) || 0, flatWidth),
            sculptPlaneWeight: weight
        });
    }

    out = applyFrontStiffnessRampForState(s, x, out, weight);
    return out;
}

function getClassicProfileAtXForState(sourceState, x) {
    const s = sourceState || state;
    const { apex, maxH, maxW, headH, headW, neckW, neckL, noseL, bow, bulge, tailD, asym, padL, padOffset } = s;
    let zCenter_curve = 0, h_curve = 0, w = 0, flatness = 0;

    if (x <= padL) zCenter_curve = 0;
    else if (x <= apex) zCenter_curve = bow * smoothStep(padL, apex, x);
    else zCenter_curve = bow * Math.cos(((x - apex) / Math.max(1, LENGTH - apex)) * (Math.PI / 2));

    if (x <= padL) {
        if (x <= noseL) w = Math.max(0.01, headW * Math.sqrt(1 - Math.pow(1 - x / Math.max(0.001, noseL), 2)));
        else w = headW;
        h_curve = headH;
        flatness = 1.0;
    } else if (x <= padL + neckL && x <= apex) {
        let sT = smoothStep(0, 1, (x - padL) / Math.max(1e-6, neckL));
        w = headW - (headW - neckW) * sT;
        h_curve = headH + (maxH - headH) * smoothStep(0, 1, (x - padL) / Math.max(1e-6, (apex - padL)));
        flatness = 1.0 - sT;
    } else if (x <= apex) {
        h_curve = headH + (maxH - headH) * smoothStep(0, 1, (x - padL) / Math.max(1e-6, (apex - padL)));
        w = neckW + (maxW - neckW) * smoothStep(0, 1, (x - (padL + neckL)) / Math.max(1e-6, (apex - (padL + neckL))));
        flatness = 0.0;
    } else {
        let t = clamp01((x - apex) / Math.max(1, LENGTH - apex));
        let dropCurve = classicDropCurveG1(t, bulge);
        h_curve = tailD + (maxH - tailD) * dropCurve;
        w = tailD + (maxW - tailD) * dropCurve;
        flatness = 0.0;
    }

    let zBot_continuous = zCenter_curve - h_curve / 2 - asym * ((h_curve - headH) / 2);
    let zTop_continuous = zCenter_curve + h_curve / 2 - asym * ((h_curve - headH) / 2);
    let targetBot = (x <= padL)
        ? -headH / 2 + padOffset
        : (x <= padL + neckL && x <= apex)
            ? (-headH / 2 + padOffset) * (1 - smoothStep(padL, padL + neckL, x)) + zBot_continuous * smoothStep(padL, padL + neckL, x)
            : zBot_continuous;
    let targetTop = (x <= noseL)
        ? targetBot + Math.max(0.01, (zTop_continuous - targetBot) * Math.sqrt(1 - Math.pow(1 - x / Math.max(0.001, noseL), 2)))
        : Math.max(zTop_continuous, targetBot + 0.1);

    const cobraPatch = getCobraControlProfilePatchForState(s, x, {
        zTop: targetTop,
        zBot: targetBot,
        zCenter: (targetTop + targetBot) / 2,
        height: Math.max(0.01, targetTop - targetBot),
        width: Math.max(0.01, w),
        flatness
    });
    if (cobraPatch) {
        targetTop = cobraPatch.zTop;
        targetBot = cobraPatch.zBot;
        w = cobraPatch.width;
        flatness = cobraPatch.flatness;
    }

    const sculptedProfile = applyAISculptProfileForState(s, x, {
        zTop: targetTop,
        zBot: targetBot,
        zCenter: (targetTop + targetBot) / 2,
        height: Math.max(0.01, targetTop - targetBot),
        width: Math.max(0.01, w),
        flatness,
        flatBottomFraction: 0
    });

    const datumZ = s.armBodyDatumOffsetZ || 0;
    return {
        zCenter: sculptedProfile.zCenter + datumZ,
        height: Math.max(0.01, sculptedProfile.height),
        width: Math.max(0.01, sculptedProfile.width),
        zTop: sculptedProfile.zTop + datumZ,
        zBot: sculptedProfile.zBot + datumZ,
        flatness: sculptedProfile.flatness,
        flatBottomFraction: sculptedProfile.flatBottomFraction || 0,
        sculptPlaneWeight: sculptedProfile.sculptPlaneWeight || 0,
        frontStiffnessRampMinHeight: sculptedProfile.frontStiffnessRampMinHeight || 0
    };
}

function getClassicProfileAtX(x) {
    return getClassicProfileAtXForState(state, x);
}

// TD044: explicit-state variant used by playback-datum solvers.
// The legacy getClassicProfileAtX(x) global-state path remains unchanged for callers.
function getClassicProfileAtX_withState(stateOverride, x) {
    return getClassicProfileAtXForState(stateOverride || state, x);
}

function updateGeometryCache() {
    GLOBAL_RINGSCache = generateAllRings();
    exposeUnifiedGeometryApi();
}

function generateAllRings() {
    let rings = [];
    const stepX = getMeshStepX();
    const isCobra = state.rearMode === REAR_MODES.COBRA_GOOSE;

    const bendStartX = isCobra
        ? Math.max(state.apex + 1, Math.min(state.rearBendStartX, LENGTH - 1))
        : LENGTH;

    const blendLength = isCobra ? Math.max(0, state.rearBlendLength) : 0;
    const blendStartX = isCobra ? Math.max(state.apex + 1, bendStartX - blendLength) : LENGTH;

    let lastStraightProfile = null;
    for (let x = 0; x <= blendStartX; x += stepX) {
        let p = getClassicProfileAtX(x);
        rings.push(buildRing(p, { x: x, y: 0, z: p.zCenter }, { tx: 1, tz: 0 }, x));
        lastStraightProfile = p;
    }

    if (isCobra && lastStraightProfile) {
        const P0x = blendStartX;
        const P0z = lastStraightProfile.zCenter;

        const pPrev = getClassicProfileAtX(Math.max(0, blendStartX - 0.1));
        const dZ = P0z - pPrev.zCenter;
        const dX = blendStartX - Math.max(0, blendStartX - 0.1);
        const lenT = Math.max(1e-9, Math.sqrt(dX * dX + dZ * dZ));
        const T0x = dX / lenT;
        const T0z = dZ / lenT;

        const PBx = bendStartX + state.rearBendLength;
        const PBz = P0z - state.rearBendDropZ;

        const L = PBx - P0x;
        const D = state.rearBendDropZ;

        const CP0 = { x: P0x, z: P0z };
        const w1 = Math.max(L * 0.5, 1);
        const CP1 = { x: P0x + T0x * w1, z: P0z + T0z * w1 };
        const w2 = Math.max(D * 0.5, 1);
        const CP2 = { x: PBx, z: PBz + w2 };
        const CP3 = { x: PBx, z: PBz };

        const approxLen = L + D;
        const steps = Math.max(10, Math.ceil(approxLen / stepX) * 2);

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const t2 = t * t;
            const mt3 = mt2 * mt;
            const t3 = t2 * t;

            const cx = mt3 * CP0.x + 3 * mt2 * t * CP1.x + 3 * mt * t2 * CP2.x + t3 * CP3.x;
            const cz = mt3 * CP0.z + 3 * mt2 * t * CP1.z + 3 * mt * t2 * CP2.z + t3 * CP3.z;

            const dx = 3 * mt2 * (CP1.x - CP0.x) + 6 * mt * t * (CP2.x - CP1.x) + 3 * t2 * (CP3.x - CP2.x);
            const dz = 3 * mt2 * (CP1.z - CP0.z) + 6 * mt * t * (CP2.z - CP1.z) + 3 * t2 * (CP3.z - CP2.z);
            const dLen = Math.max(1e-9, Math.sqrt(dx * dx + dz * dz));
            const tx = dx / dLen;
            const tz = dz / dLen;

            const f = smoother01(t);
            const H = lastStraightProfile.height * (1 - f) + state.rearMouthLength * f;
            const W = lastStraightProfile.width * (1 - f) + state.rearMouthWidth * f;
            const flatness = lastStraightProfile.flatness * (1 - f);
            const flatBottomFraction = (Number(lastStraightProfile.flatBottomFraction) || 0) * (1 - f);

            let p = { width: W, height: H, flatness: flatness, flatBottomFraction: flatBottomFraction, zCenter: 0 };
            rings.push(buildRing(p, { x: cx, y: 0, z: cz }, { tx: tx, tz: tz }, blendStartX + t * approxLen));
        }
    }
    return rings;
}

function buildRing(p, C, T, virtualX) {
    let segments = getMeshSegments();
    let nBot = 2.0 + 8.0 * p.flatness;
    let outerRing = [], innerRing = [];
    let a_out = p.width / 2;
    let b_out = p.height / 2;
    const flatBottomFraction = clamp01(Number(p.flatBottomFraction) || 0);

    let localPoints = [];
    for (let i = 0; i < segments; i++) {
        let angle = (i / segments) * Math.PI * 2;
        let isTop = Math.sin(angle) >= 0;
        let pwr = isTop ? 1.0 : (2.0 / nBot);
        let ly = a_out * Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), pwr);
        let lz = b_out * Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), pwr);
        if (!isTop && flatBottomFraction > 0 && Math.abs(ly) <= a_out * flatBottomFraction) {
            lz = -b_out;
        }
        localPoints.push({ y: ly, z: lz });
    }

    let innerLocalPoints = [];
    const a_in = Math.max(0.001, a_out - state.thick);
    const b_in = Math.max(0.001, b_out - state.thick);
    for (let i = 0; i < segments; i++) {
        let angle = (i / segments) * Math.PI * 2;
        let isTop = Math.sin(angle) >= 0;
        let pwr = isTop ? 1.0 : (2.0 / nBot);
        let iy = a_in * Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), pwr);
        let iz = b_in * Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), pwr);
        if (!isTop && flatBottomFraction > 0 && Math.abs(iy) <= a_in * flatBottomFraction) {
            iz = -b_in;
        }
        innerLocalPoints.push({ y: iy, z: iz });
    }

    for (let i = 0; i < segments; i++) {
        let pO = localPoints[i];
        let pI = innerLocalPoints[i];
        outerRing.push(new THREE.Vector3(C.x - pO.z * T.tz, C.y + pO.y, C.z + pO.z * T.tx));
        innerRing.push(new THREE.Vector3(C.x - pI.z * T.tz, C.y + pI.y, C.z + pI.z * T.tx));
    }

    let topRim = new THREE.Vector3(C.x - b_out * T.tz, C.y, C.z + b_out * T.tx);
    let botRim = new THREE.Vector3(C.x + b_out * T.tz, C.y, C.z - b_out * T.tx);
    let leftRim = new THREE.Vector3(C.x, C.y + a_out, C.z);
    let rightRim = new THREE.Vector3(C.x, C.y - a_out, C.z);

    let outGeo = calcPolyPropertiesLocal(localPoints);
    let inGeo = calcPolyPropertiesLocal(innerLocalPoints);
    let isValid = !(outGeo.area > 0.5 && outGeo.area - inGeo.area <= 0.1);

    return {
        virtualX: virtualX, center: C, tangent: T, p: p,
        outerRing: outerRing, innerRing: innerRing,
        topRim: topRim, botRim: botRim, leftRim: leftRim, rightRim: rightRim,
        outGeo: outGeo, inGeo: inGeo, isValid: isValid
    };
}

function calcPolyPropertiesLocal(pts) {
    let area = 0, Iy = 0, Iz = 0, perimeter = 0;
    let n = pts.length;
    for (let i = 0; i < n; i++) {
        let p1 = pts[i];
        let p2 = pts[(i + 1) % n];
        let y1 = p1.y, z1 = p1.z;
        let y2 = p2.y, z2 = p2.z;
        let cross = (y1 * z2 - y2 * z1);
        area += cross;
        Iy += cross * (z1 * z1 + z1 * z2 + z2 * z2);
        Iz += cross * (y1 * y1 + y1 * y2 + y2 * y2);
        perimeter += Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2));
    }
    return { area: Math.abs(area) / 2, Iy: Math.abs(Iy) / 12, Iz: Math.abs(Iz) / 12, perimeter };
}

function validateRearGeometry() {
    if (state.rearMode !== REAR_MODES.COBRA_GOOSE) return { isValid: true, errorMsg: '' };
    if (state.rearBendStartX <= state.apex) return { isValid: false, errorMsg: 'Rear bend start must be after apex.' };
    if (state.rearBendStartX >= LENGTH - 5) return { isValid: false, errorMsg: 'Rear bend start is too far back.' };
    if (state.rearBendLength < 5) return { isValid: false, errorMsg: 'Bend radius (length) is too short.' };
    if (state.rearBlendLength < 0) return { isValid: false, errorMsg: 'Blend zone cannot be negative.' };
    if (state.rearMouthWidth < 2 || state.rearMouthLength < 2) return { isValid: false, errorMsg: 'Mouth is too narrow.' };
    return { isValid: true, errorMsg: '' };
}

function analyzeProfileContinuity(rings, options) {
    const list = Array.isArray(rings) ? rings : (GLOBAL_RINGSCache || []);
    const opts = options || {};
    const xMax = Number.isFinite(Number(opts.xMax)) ? Number(opts.xMax) : 120;
    const minX = Number.isFinite(Number(opts.minX)) ? Number(opts.minX) : 1;
    const maxHeightDropPerMm = Number.isFinite(Number(opts.maxHeightDropPerMm)) ? Number(opts.maxHeightDropPerMm) : 0.5;
    const maxTopDropPerMm = Number.isFinite(Number(opts.maxTopDropPerMm)) ? Number(opts.maxTopDropPerMm) : 0.5;
    const maxAreaDropFractionPerMm = Number.isFinite(Number(opts.maxAreaDropFractionPerMm)) ? Number(opts.maxAreaDropFractionPerMm) : 0.18;
    const maxCurvatureDeltaPerMm = Number.isFinite(Number(opts.maxCurvatureDeltaPerMm)) ? Number(opts.maxCurvatureDeltaPerMm) : 0.45;
    const minFrontWidthMm = Number.isFinite(Number(opts.minFrontWidthMm)) ? Number(opts.minFrontWidthMm) : 6.0;
    const failures = [];
    const warnings = [];
    const metrics = {
        checked: true,
        xMin: minX,
        xMax,
        maxHeightDropPerMm: 0,
        maxTopZDropPerMm: 0,
        maxBottomZJumpPerMm: 0,
        maxShellAreaDropFractionPerMm: 0,
        maxHeightSlopeDeltaPerMm: 0,
        minFrontWidthMm: Infinity,
        worstHeightDropAtX: null,
        worstTopDropAtX: null,
        worstAreaDropAtX: null,
        worstCurvatureAtX: null,
        failures,
        warnings
    };
    const eligible = list.filter(r => r && r.p && r.center && Number.isFinite(Number(r.virtualX)) && Number(r.virtualX) >= minX && Number(r.virtualX) <= xMax);
    if (eligible.length < 3) {
        metrics.checked = false;
        metrics.reason = 'not enough rings in front profile audit range';
        return { ok: true, metrics, failures, warnings };
    }
    eligible.forEach(r => {
        const w = Number(r.p.width);
        if (Number.isFinite(w)) metrics.minFrontWidthMm = Math.min(metrics.minFrontWidthMm, w);
    });
    if (metrics.minFrontWidthMm < minFrontWidthMm) {
        failures.push('front profile width below ' + minFrontWidthMm.toFixed(2) + ' mm after cap exclusion: ' + metrics.minFrontWidthMm.toFixed(3) + ' mm');
    }
    let prevSlope = null;
    for (let i = 1; i < eligible.length; i++) {
        const a = eligible[i - 1];
        const b = eligible[i];
        const dx = Math.max(1e-6, Number(b.virtualX) - Number(a.virtualX));
        if (!(dx > 0)) continue;
        const ah = Number(a.p.height);
        const bh = Number(b.p.height);
        const atop = a.center.z + ah / 2;
        const btop = b.center.z + bh / 2;
        const abot = a.center.z - ah / 2;
        const bbot = b.center.z - bh / 2;
        const aArea = a.outGeo && a.inGeo ? Math.max(0, Number(a.outGeo.area) - Number(a.inGeo.area)) : NaN;
        const bArea = b.outGeo && b.inGeo ? Math.max(0, Number(b.outGeo.area) - Number(b.inGeo.area)) : NaN;
        const heightDrop = Math.max(0, ah - bh) / dx;
        const topDrop = Math.max(0, atop - btop) / dx;
        const bottomJump = Math.abs(bbot - abot) / dx;
        metrics.maxHeightDropPerMm = Math.max(metrics.maxHeightDropPerMm, heightDrop);
        metrics.maxTopZDropPerMm = Math.max(metrics.maxTopZDropPerMm, topDrop);
        metrics.maxBottomZJumpPerMm = Math.max(metrics.maxBottomZJumpPerMm, bottomJump);
        if (heightDrop === metrics.maxHeightDropPerMm) metrics.worstHeightDropAtX = Number(b.virtualX);
        if (topDrop === metrics.maxTopZDropPerMm) metrics.worstTopDropAtX = Number(b.virtualX);
        if (Number.isFinite(aArea) && Number.isFinite(bArea) && aArea > 1e-6) {
            const areaDrop = Math.max(0, (aArea - bArea) / aArea) / dx;
            metrics.maxShellAreaDropFractionPerMm = Math.max(metrics.maxShellAreaDropFractionPerMm, areaDrop);
            if (areaDrop === metrics.maxShellAreaDropFractionPerMm) metrics.worstAreaDropAtX = Number(b.virtualX);
        }
        const slope = (bh - ah) / dx;
        if (prevSlope !== null) {
            const curvature = Math.abs(slope - prevSlope) / dx;
            metrics.maxHeightSlopeDeltaPerMm = Math.max(metrics.maxHeightSlopeDeltaPerMm, curvature);
            if (curvature === metrics.maxHeightSlopeDeltaPerMm) metrics.worstCurvatureAtX = Number(b.virtualX);
        }
        prevSlope = slope;
    }
    if (metrics.maxHeightDropPerMm > maxHeightDropPerMm) failures.push('height drop exceeds ' + maxHeightDropPerMm + ' mm/mm in front continuity audit: ' + metrics.maxHeightDropPerMm.toFixed(3) + ' at X' + metrics.worstHeightDropAtX);
    if (metrics.maxTopZDropPerMm > maxTopDropPerMm) failures.push('top profile drop exceeds ' + maxTopDropPerMm + ' mm/mm in front continuity audit: ' + metrics.maxTopZDropPerMm.toFixed(3) + ' at X' + metrics.worstTopDropAtX);
    if (metrics.maxShellAreaDropFractionPerMm > maxAreaDropFractionPerMm) failures.push('shell-area drop exceeds ' + maxAreaDropFractionPerMm + '/mm in front continuity audit: ' + metrics.maxShellAreaDropFractionPerMm.toFixed(3) + ' at X' + metrics.worstAreaDropAtX);
    if (metrics.maxHeightSlopeDeltaPerMm > maxCurvatureDeltaPerMm) warnings.push('height slope delta is high in front continuity audit: ' + metrics.maxHeightSlopeDeltaPerMm.toFixed(3) + ' at X' + metrics.worstCurvatureAtX);
    if (!Number.isFinite(metrics.minFrontWidthMm)) metrics.minFrontWidthMm = 0;
    return { ok: failures.length === 0, metrics, failures, warnings };
}

function validateTonearmGeometry() {
    const rearVal = validateRearGeometry();
    if (!rearVal.isValid) return rearVal;
    if (!GLOBAL_RINGSCache || GLOBAL_RINGSCache.length === 0) return { isValid: true, errorMsg: '' };
    for (let i = 0; i < GLOBAL_RINGSCache.length; i++) {
        if (!GLOBAL_RINGSCache[i].isValid) return { isValid: false, errorMsg: 'Area inversion detected. Solidity cannot be guaranteed.', x: GLOBAL_RINGSCache[i].virtualX };
    }
    const continuity = analyzeProfileContinuity(GLOBAL_RINGSCache, { xMax: Math.min(130, Number(state.apex) || 120) });
    if (!continuity.ok) {
        return {
            isValid: false,
            errorMsg: 'Front profile continuity failed: ' + continuity.failures.join('; '),
            metrics: { profileContinuity: continuity.metrics }
        };
    }
    return { isValid: true, errorMsg: '', metrics: { profileContinuity: continuity.metrics } };
}


function getVertexKeyFromArray(array, index, toleranceMm) {
    const inv = 1 / Math.max(1e-12, toleranceMm || 1e-6);
    const o = index * 3;
    return [
        Math.round(array[o] * inv),
        Math.round(array[o + 1] * inv),
        Math.round(array[o + 2] * inv)
    ].join('|');
}

function mergeVertices(geometry, toleranceMm) {
    if (!geometry || !geometry.getAttribute || !geometry.getAttribute('position')) return geometry;
    const src = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = src.getAttribute('position').array;
    const map = new Map();
    const positions = [];
    const indices = [];
    const tolerance = Number.isFinite(Number(toleranceMm)) ? Number(toleranceMm) : 1e-5;
    for (let i = 0; i < pos.length / 3; i += 1) {
        const key = getVertexKeyFromArray(pos, i, tolerance);
        let idx = map.get(key);
        if (idx === undefined) {
            idx = positions.length / 3;
            map.set(key, idx);
            const o = i * 3;
            positions.push(pos[o], pos[o + 1], pos[o + 2]);
        }
        indices.push(idx);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setIndex(indices);
    if (Array.isArray(geometry.groups) && geometry.groups.length && typeof out.addGroup === 'function') {
        geometry.groups.forEach(g => out.addGroup(g.start, g.count, g.materialIndex || 0));
    }
    out.userData = Object.assign({}, geometry.userData || {}, {
        vertexWelded: true,
        vertexWeldToleranceMm: tolerance,
        preWeldVertexCount: pos.length / 3,
        postWeldVertexCount: positions.length / 3
    });
    return out;
}

function analyzeMeshTopology(geometry) {
    const result = { componentCount: 0, boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, edgeCount: 0 };
    if (!geometry || !geometry.getAttribute || !geometry.getAttribute('position')) return result;
    const welded = geometry.index ? geometry : mergeVertices(geometry, 1e-5);
    const idx = welded.index ? Array.from(welded.index.array) : Array.from({ length: welded.getAttribute('position').count }, (_, i) => i);
    const edgeUse = new Map();
    const adjacency = new Map();
    function addAdj(a, b) {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
    }
    for (let i = 0; i + 2 < idx.length; i += 3) {
        const tri = [idx[i], idx[i + 1], idx[i + 2]];
        if (tri[0] === tri[1] || tri[1] === tri[2] || tri[2] === tri[0]) continue;
        for (let e = 0; e < 3; e += 1) {
            const a = tri[e];
            const b = tri[(e + 1) % 3];
            const key = a < b ? a + '|' + b : b + '|' + a;
            edgeUse.set(key, (edgeUse.get(key) || 0) + 1);
            addAdj(a, b);
        }
    }
    result.edgeCount = edgeUse.size;
    edgeUse.forEach(count => {
        if (count === 1) result.boundaryEdgeCount += 1;
        if (count > 2) result.nonManifoldEdgeCount += 1;
    });
    const visited = new Set();
    adjacency.forEach((_, start) => {
        if (visited.has(start)) return;
        result.componentCount += 1;
        const stack = [start];
        visited.add(start);
        while (stack.length) {
            const cur = stack.pop();
            (adjacency.get(cur) || []).forEach(next => {
                if (!visited.has(next)) {
                    visited.add(next);
                    stack.push(next);
                }
            });
        }
    });
    return result;
}

function finalizeWeldedGeometry(geometry, options) {
    const opts = options || {};
    let out = mergeVertices(geometry, opts.toleranceMm || 1e-5);
    if (opts.ensurePositiveVolume && typeof ensurePositiveGeometryVolume === 'function') ensurePositiveGeometryVolume(out);
    if (opts.computeNormals !== false) out.computeVertexNormals();
    const topology = analyzeMeshTopology(out);
    out.userData = Object.assign({}, out.userData || {}, {
        topologyComponentCount: topology.componentCount,
        boundaryEdgeCount: topology.boundaryEdgeCount,
        nonManifoldEdgeCount: topology.nonManifoldEdgeCount,
        topologyEdgeCount: topology.edgeCount
    });
    return out;
}

function mergeBufferGeometries(geometries) {
    const valid = (geometries || []).filter(Boolean).map(g => {
        const clone = g.clone();
        if (!clone.getAttribute('normal')) clone.computeVertexNormals();
        return clone.toNonIndexed();
    }).filter(g => g.getAttribute('position') && g.getAttribute('position').count > 0);

    if (!valid.length) return new THREE.BufferGeometry();

    let totalPos = 0;
    let totalNorm = 0;
    for (const g of valid) {
        totalPos += g.getAttribute('position').array.length;
        const norm = g.getAttribute('normal');
        if (norm) totalNorm += norm.array.length;
    }

    const positions = new Float32Array(totalPos);
    const normals = totalNorm === totalPos ? new Float32Array(totalNorm) : null;

    let posOffset = 0;
    let normOffset = 0;
    for (const g of valid) {
        const pos = g.getAttribute('position').array;
        positions.set(pos, posOffset);
        posOffset += pos.length;

        if (normals) {
            const norm = g.getAttribute('normal').array;
            normals.set(norm, normOffset);
            normOffset += norm.length;
        }
    }

    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    else geo.computeVertexNormals();
    geo = finalizeWeldedGeometry(geo, { toleranceMm: 1e-5, computeNormals: true });
    return geo;
}

function flattenGroupToBufferGeometry(group) {
    if (!group) return new THREE.BufferGeometry();
    group.updateMatrixWorld(true);
    const geometries = [];
    group.traverse(obj => {
        if (obj.isMesh && obj.geometry) {
            const g = obj.geometry.clone();
            g.applyMatrix4(obj.matrixWorld);
            geometries.push(g);
        }
    });
    return mergeBufferGeometries(geometries);
}


function calculateSignedVolume(geometry) {
    if (!geometry || !geometry.getAttribute || !geometry.getAttribute('position')) return 0;
    const pos = geometry.getAttribute('position').array;
    const idx = geometry.index ? geometry.index.array : null;
    let volume = 0;

    function addTri(i0, i1, i2) {
        const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
        const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
        const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];
        volume += ax * (by * cz - bz * cy) + bx * (cy * az - cz * ay) + cx * (ay * bz - az * by);
    }

    if (idx) {
        for (let i = 0; i < idx.length; i += 3) addTri(idx[i], idx[i + 1], idx[i + 2]);
    } else {
        for (let i = 0; i < pos.length / 3; i += 3) addTri(i, i + 1, i + 2);
    }
    return volume / 6;
}

function flipGeometryTriangleWinding(geometry) {
    if (!geometry) return geometry;
    if (geometry.index && geometry.index.array) {
        const idx = geometry.index.array;
        for (let i = 0; i < idx.length; i += 3) {
            const tmp = idx[i + 1];
            idx[i + 1] = idx[i + 2];
            idx[i + 2] = tmp;
        }
        geometry.index.needsUpdate = true;
    } else if (geometry.getAttribute && geometry.getAttribute('position')) {
        const attr = geometry.getAttribute('position');
        const pos = attr.array;
        for (let i = 0; i < pos.length; i += 9) {
            for (let j = 0; j < 3; j++) {
                const tmp = pos[i + 3 + j];
                pos[i + 3 + j] = pos[i + 6 + j];
                pos[i + 6 + j] = tmp;
            }
        }
        attr.needsUpdate = true;
    }
    geometry.computeVertexNormals();
    return geometry;
}

function ensurePositiveGeometryVolume(geometry) {
    const signedVolume = calculateSignedVolume(geometry);
    if (signedVolume <= 0) {
        console.warn('[TD042] Source winding produced non-positive signed volume; auto-flipping. This indicates a regression in the winding fix.');
        flipGeometryTriangleWinding(geometry);
        geometry.userData = Object.assign({}, geometry.userData || {}, {
            signedVolumeMm3: Math.abs(signedVolume),
            signedVolume: Math.abs(signedVolume),
            windingCorrected: true
        });
    } else {
        geometry.userData = Object.assign({}, geometry.userData || {}, {
            signedVolumeMm3: signedVolume,
            signedVolume: signedVolume,
            windingCorrected: false
        });
    }
    return geometry;
}

function calculateMeshQuality(geometry) {
    if (!geometry || !geometry.getAttribute || !geometry.getAttribute('position')) return { triangles: 0, sliverCount: 0, minArea: 0, worstAspect: 0 };
    const flatGeo = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = flatGeo.getAttribute('position').array;
    let sliverCount = 0;
    let degenerateTriangleCount = 0;
    let minArea = Infinity;
    let worstAspect = 0;
    const triCount = pos.length / 9;

    for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
        const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
        const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
        const crossX = aby * acz - abz * acy;
        const crossY = abz * acx - abx * acz;
        const crossZ = abx * acy - aby * acx;
        const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
        const ab = Math.sqrt(abx * abx + aby * aby + abz * abz);
        const ac = Math.sqrt(acx * acx + acy * acy + acz * acz);
        const bc = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
        const longest = Math.max(ab, ac, bc);
        const shortest = Math.max(1e-9, Math.min(ab, ac, bc));
        if (area <= 1e-9) degenerateTriangleCount++;
        if (area < 0.01) sliverCount++;
        minArea = Math.min(minArea, area);
        worstAspect = Math.max(worstAspect, longest / shortest);
    }

    return {
        triangles: triCount,
        sliverCount,
        degenerateTriangleCount,
        minArea: Number.isFinite(minArea) ? minArea : 0,
        worstAspect
    };
}

function validateFinalExportMeshTopology(geometry, options) {
    const opts = options || {};
    const mode = opts.mode || 'export';
    if (!geometry || !geometry.getAttribute || !geometry.getAttribute('position')) {
        return { isValid: false, errorMsg: mode + ' produced no final export geometry.', metrics: {} };
    }
    const topology = analyzeMeshTopology(geometry);
    const quality = calculateMeshQuality(geometry);
    const metrics = {
        finalTopologyComponentCount: topology.componentCount,
        finalBoundaryEdgeCount: topology.boundaryEdgeCount,
        finalNonManifoldEdgeCount: topology.nonManifoldEdgeCount,
        finalTopologyEdgeCount: topology.edgeCount,
        finalDegenerateTriangleCount: quality.degenerateTriangleCount || 0,
        finalSliverTriangleCount: quality.sliverCount || 0,
        finalMinTriangleAreaMm2: quality.minArea || 0,
        finalWorstAspectRatio: quality.worstAspect || 0,
        finalMultipleClosedShellsAllowed: opts.allowMultipleClosedShells !== false
    };
    if (metrics.finalBoundaryEdgeCount > 0 || metrics.finalNonManifoldEdgeCount > 0 || metrics.finalDegenerateTriangleCount > 0) {
        return {
            isValid: false,
            errorMsg: mode + ' final export mesh is not manifold: boundary=' +
                metrics.finalBoundaryEdgeCount + ', nonManifold=' + metrics.finalNonManifoldEdgeCount +
                ', degenerateTriangles=' + metrics.finalDegenerateTriangleCount + '.',
            metrics
        };
    }
    if (opts.allowMultipleClosedShells === false && metrics.finalTopologyComponentCount > 1) {
        return {
            isValid: false,
            errorMsg: mode + ' final export mesh is disconnected: components=' + metrics.finalTopologyComponentCount + '.',
            metrics
        };
    }
    return { isValid: true, errorMsg: '', metrics };
}



function trapezoidalReferenceVolumeArcLength(rings, mode) {
    if (!rings || rings.length < 2) return 0;
    let v = 0;
    for (let i = 0; i < rings.length - 1; i++) {
        const a1 = mode === 'hollow'
            ? Math.max(0, rings[i].outGeo.area - rings[i].inGeo.area)
            : rings[i].outGeo.area;
        const a2 = mode === 'hollow'
            ? Math.max(0, rings[i + 1].outGeo.area - rings[i + 1].inGeo.area)
            : rings[i + 1].outGeo.area;
        const c1 = rings[i].center;
        const c2 = rings[i + 1].center;
        const ds = Math.hypot(c2.x - c1.x, c2.z - c1.z);
        v += (a1 + a2) / 2 * ds;
    }
    return v;
}

function getTriangleVerticesFromIndex(geometry, triIndexOffset) {
    const pos = geometry.getAttribute('position').array;
    const idx = geometry.index ? geometry.index.array : null;
    const ia = idx ? idx[triIndexOffset] : triIndexOffset;
    const ib = idx ? idx[triIndexOffset + 1] : triIndexOffset + 1;
    const ic = idx ? idx[triIndexOffset + 2] : triIndexOffset + 2;
    return [
        new THREE.Vector3(pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]),
        new THREE.Vector3(pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]),
        new THREE.Vector3(pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2])
    ];
}

function triangleNormalAndArea(a, b, c) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const cross = new THREE.Vector3().crossVectors(ab, ac);
    const doubleArea = cross.length();
    const normal = doubleArea > 1e-12 ? cross.clone().multiplyScalar(1 / doubleArea) : new THREE.Vector3(0, 0, 0);
    return { normal, area: doubleArea / 2, cross };
}

function areaWeightedMeanNormalDot(geometry, startIndex, indexCount, direction) {
    const sum = new THREE.Vector3();
    for (let i = startIndex; i < startIndex + indexCount; i += 3) {
        const tri = getTriangleVerticesFromIndex(geometry, i);
        const n = triangleNormalAndArea(tri[0], tri[1], tri[2]);
        sum.add(n.cross);
    }
    if (sum.length() <= 1e-12) return 0;
    sum.normalize();
    return sum.dot(direction);
}

function capIndexRangesForMode(mode, rings, segments) {
    const rCount = rings ? rings.length : 0;
    if (mode === 'solid') {
        const lateralCount = Math.max(0, rCount - 1) * segments * 6;
        return {
            front: { start: lateralCount, count: segments * 3 },
            rear: { start: lateralCount + segments * 3, count: segments * 3 }
        };
    }
    if (mode === 'hollow') {
        const outerCount = Math.max(0, rCount - 1) * segments * 6;
        const innerCount = Math.max(0, rCount - 1) * segments * 6;
        const capStart = outerCount + innerCount;
        return {
            front: { start: capStart, count: segments * 6 },
            rear: { start: capStart + segments * 6, count: segments * 6 }
        };
    }
    return { front: { start: 0, count: 0 }, rear: { start: 0, count: 0 } };
}

function getCapOutwardDirection(rings, capName) {
    const fallback = capName === 'front' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
    if (!rings || rings.length < 1) return fallback;
    const isFront = capName === 'front';
    const idx = isFront ? 0 : rings.length - 1;
    const ring = rings[idx] || {};
    let tx = ring.tangent && Number(ring.tangent.tx);
    let tz = ring.tangent && Number(ring.tangent.tz);

    if (!(Number.isFinite(tx) && Number.isFinite(tz)) || Math.hypot(tx, tz) <= 1e-9) {
        const a = isFront ? rings[0] : rings[Math.max(0, rings.length - 2)];
        const b = isFront ? rings[Math.min(rings.length - 1, 1)] : rings[rings.length - 1];
        if (a && b && a.center && b.center) {
            tx = Number(b.center.x) - Number(a.center.x);
            tz = Number(b.center.z) - Number(a.center.z);
        }
    }

    const len = Math.hypot(tx || 0, tz || 0);
    if (!(len > 1e-9)) return fallback;
    const sign = isFront ? -1 : 1;
    return new THREE.Vector3(sign * tx / len, 0, sign * tz / len);
}

function countDraftViolations(geometry, exportType) {
    const partingNormal = exportType === EXPORT_TYPES.SPLIT_HORIZONTAL
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
    const minDeg = Number.isFinite(Number(state.draftMinDeg)) ? Number(state.draftMinDeg) : 1.0;
    const idx = geometry && geometry.index ? geometry.index.array : null;
    const triIndexCount = idx ? idx.length : (geometry && geometry.getAttribute('position') ? geometry.getAttribute('position').count : 0);
    let violations = 0;
    let lateralTriangles = 0;
    for (let i = 0; i < triIndexCount; i += 3) {
        const tri = getTriangleVerticesFromIndex(geometry, i);
        const n = triangleNormalAndArea(tri[0], tri[1], tri[2]);
        if (n.area <= 1e-9) continue;
        lateralTriangles++;
        const dot = Math.max(-1, Math.min(1, Math.abs(n.normal.dot(partingNormal))));
        const angleFromParting = Math.acos(dot);
        const draftDeg = 90 - angleFromParting * 180 / Math.PI;
        if (draftDeg < minDeg) violations++;
    }
    return {
        draftViolations: violations,
        lateralTriangles,
        draftViolationRatio: lateralTriangles > 0 ? violations / lateralTriangles : 0,
        draftMinDeg: minDeg
    };
}

function countUndercuts(rings) {
    if (!rings || rings.length < 2) return 0;
    const segments = Math.min.apply(null, rings.map(r => r.outerRing ? r.outerRing.length : Infinity));
    if (!Number.isFinite(segments) || segments <= 0) return 0;
    let undercutCount = 0;
    for (let j = 0; j < segments; j++) {
        let rising = false;
        for (let i = 0; i < rings.length - 1; i++) {
            const a = rings[i].outerRing[j];
            const b = rings[i + 1].outerRing[j];
            const dx = rings[i + 1].center.x - rings[i].center.x;
            const dz = b.z - a.z;
            if (dx > 0 && dz > 0) rising = true;
            if (dx > 0 && dz < 0 && rising) {
                undercutCount++;
                rising = false;
            }
        }
    }
    return undercutCount;
}

function validateMeshIntegrity(geo, ringSubset, mode) {
    if (!geo || !geo.getAttribute || !geo.getAttribute('position')) {
        return { isValid: false, errorMsg: mode + ' export produced no geometry.', metrics: {} };
    }
    const segments = getMeshSegments();
    const signedVolume = calculateSignedVolume(geo);
    const referenceVolume = trapezoidalReferenceVolumeArcLength(ringSubset, mode);
    const volumeRatio = referenceVolume > 0 ? signedVolume / referenceVolume : 0;
    const ranges = capIndexRangesForMode(mode, ringSubset, segments);
    const frontCapExpectedDirection = getCapOutwardDirection(ringSubset, 'front');
    const rearCapExpectedDirection = getCapOutwardDirection(ringSubset, 'rear');
    const frontCapDot = areaWeightedMeanNormalDot(geo, ranges.front.start, ranges.front.count, frontCapExpectedDirection);
    const rearCapDot = areaWeightedMeanNormalDot(geo, ranges.rear.start, ranges.rear.count, rearCapExpectedDirection);
    const quality = calculateMeshQuality(geo);
    const sliverCount = quality.sliverCount;
    const minTriangleAreaMm2 = quality.minArea;
    const worstAspectRatio = quality.worstAspect;
    const volRelErr = referenceVolume > 0 ? Math.abs(signedVolume - referenceVolume) / referenceVolume : Infinity;
    const topology = analyzeMeshTopology(geo);
    const continuity = analyzeProfileContinuity(ringSubset || GLOBAL_RINGSCache, { xMax: Math.min(130, Number(state.apex) || 120) });
    const metrics = {
        signedVolume,
        referenceVolume,
        volumeRatio,
        frontCapDot,
        rearCapDot,
        frontCapExpectedDirection: { x: frontCapExpectedDirection.x, y: frontCapExpectedDirection.y, z: frontCapExpectedDirection.z },
        rearCapExpectedDirection: { x: rearCapExpectedDirection.x, y: rearCapExpectedDirection.y, z: rearCapExpectedDirection.z },
        sliverCount,
        minTriangleAreaMm2,
        worstAspectRatio,
        degenerateTriangleCount: quality.degenerateTriangleCount || 0,
        windingCorrected: !!(geo.userData && geo.userData.windingCorrected),
        topologyComponentCount: topology.componentCount,
        boundaryEdgeCount: topology.boundaryEdgeCount,
        nonManifoldEdgeCount: topology.nonManifoldEdgeCount,
        profileContinuity: continuity.metrics
    };

    geo.userData = Object.assign({}, geo.userData || {}, metrics);

    let result = { isValid: true, errorMsg: '', metrics };
    if (!(referenceVolume > 0) || !(signedVolume > 0)) {
        result = { isValid: false, errorMsg: mode + ' export has non-positive signed/reference volume.', metrics };
    } else if (volRelErr > 0.02) {
        result = { isValid: false, errorMsg: mode + ' export signed volume differs from arc-length reference by ' + (volRelErr * 100).toFixed(2) + '%.', metrics };
    } else if (frontCapDot < 0.9 || rearCapDot < 0.9) {
        result = { isValid: false, errorMsg: mode + ' export cap normals failed: front=' + frontCapDot.toFixed(3) + ', rear=' + rearCapDot.toFixed(3) + '.', metrics };
    } else if ((quality.degenerateTriangleCount || 0) > 0) {
        result = { isValid: false, errorMsg: mode + ' export has degenerate triangles: count=' + (quality.degenerateTriangleCount || 0) + '.', metrics };
    } else if (minTriangleAreaMm2 < 0.001) {
        const hardFailArea = (typeof state !== 'undefined' && Number.isFinite(Number(state.aiVibeMinTriangleHardFailArea)))
            ? Math.max(0, Number(state.aiVibeMinTriangleHardFailArea))
            : 0.00001;
        const softSliverPass = !!(typeof state !== 'undefined' && state.aiVibeSoftSliverPass === true &&
            topology.boundaryEdgeCount === 0 && topology.nonManifoldEdgeCount === 0 &&
            (quality.degenerateTriangleCount || 0) === 0 && minTriangleAreaMm2 >= hardFailArea);
        if (softSliverPass) {
            metrics.sliverSoftPassed = true;
            metrics.sliverSoftPassReason = 'manifold mesh with tiny non-degenerate sliver triangles; allowed by AI Vibe 3D manufacturing mode';
            result = { isValid: true, errorMsg: '', metrics };
        } else {
            result = { isValid: false, errorMsg: mode + ' export has degenerate/sliver triangles below minimum area: count=' + sliverCount + ', minArea=' + minTriangleAreaMm2.toExponential(3) + ' mm².', metrics };
        }
    } else if (topology.componentCount > 1) {
        result = { isValid: false, errorMsg: mode + ' export is topologically disconnected: components=' + topology.componentCount + '.', metrics };
    } else if (topology.boundaryEdgeCount > 0 || topology.nonManifoldEdgeCount > 0) {
        result = { isValid: false, errorMsg: mode + ' export has open/non-manifold edges: boundary=' + topology.boundaryEdgeCount + ', nonManifold=' + topology.nonManifoldEdgeCount + '.', metrics };
    } else if (!continuity.ok) {
        result = { isValid: false, errorMsg: mode + ' export front profile continuity failed: ' + continuity.failures.join('; '), metrics };
    } else if (metrics.windingCorrected) {
        result = { isValid: false, errorMsg: mode + ' export required watchdog winding correction; source winding regression.', metrics };
    }
    return result;
}

function validateSplitGeometryIntegrity(parts, exportType) {
    const geos = [parts.partA, parts.partB].filter(Boolean);
    let minSignedVolume = Infinity;
    let sliverCount = 0;
    let minTriangleAreaMm2 = Infinity;
    let worstAspectRatio = 0;
    let draftViolations = 0;
    let lateralTriangles = 0;
    let windingCorrected = false;
    geos.forEach(geo => {
        ensurePositiveGeometryVolume(geo);
        const sv = calculateSignedVolume(geo);
        minSignedVolume = Math.min(minSignedVolume, sv);
        const quality = calculateMeshQuality(geo);
        sliverCount += quality.sliverCount;
        minTriangleAreaMm2 = Math.min(minTriangleAreaMm2, quality.minArea);
        worstAspectRatio = Math.max(worstAspectRatio, quality.worstAspect);
        const d = countDraftViolations(geo, exportType);
        draftViolations += d.draftViolations;
        lateralTriangles += d.lateralTriangles;
        windingCorrected = windingCorrected || !!(geo.userData && geo.userData.windingCorrected);
        geo.userData = Object.assign({}, geo.userData || {}, {
            signedVolume: sv,
            sliverCount: quality.sliverCount,
            minTriangleAreaMm2: quality.minArea,
            worstAspectRatio: quality.worstAspect,
            draftViolations: d.draftViolations,
            lateralTriangles: d.lateralTriangles
        });
    });
    const undercutCount = countUndercuts(GLOBAL_RINGSCache);
    const draftViolationRatio = lateralTriangles > 0 ? draftViolations / lateralTriangles : 0;
    const metrics = {
        signedVolume: minSignedVolume,
        minSignedVolume,
        sliverCount,
        minTriangleAreaMm2: Number.isFinite(minTriangleAreaMm2) ? minTriangleAreaMm2 : 0,
        worstAspectRatio,
        draftViolations,
        lateralTriangles,
        draftViolationRatio,
        undercutCount,
        windingCorrected
    };
    if (!(minSignedVolume > 0)) return { isValid: false, errorMsg: 'Split export has a non-positive signed-volume half.', metrics };
    if (windingCorrected) return { isValid: false, errorMsg: 'Split export required watchdog winding correction; source winding regression.', metrics };
    if (sliverCount > 4 || metrics.minTriangleAreaMm2 < 0.001) return { isValid: false, errorMsg: 'Split export has excessive sliver triangles.', metrics };
    if (draftViolationRatio > 0.05) return { isValid: false, errorMsg: 'Split export draft violations exceed 5% of checked triangles.', metrics };
    if (undercutCount > 0) return { isValid: false, errorMsg: 'Split export has undercut count ' + undercutCount + '.', metrics };
    return { isValid: true, errorMsg: '', metrics };
}


function generateTonearmGeometry() { return generateHollowGeometry(); }

function generateHollowGeometry(sourceRings) {
    const segments = getMeshSegments();
    const rings = (Array.isArray(sourceRings) && sourceRings.length) ? sourceRings : GLOBAL_RINGSCache;
    const rCount = rings.length;
    if (rCount === 0) return new THREE.BufferGeometry();

    let geometry = new THREE.BufferGeometry();
    const positions = [], indices = [];

    for (let r = 0; r < rCount; r++) {
        for (let i = 0; i < segments; i++) {
            let v = rings[r].outerRing[i];
            positions.push(v.x, v.y, v.z);
        }
    }
    const innerOffset = rCount * segments;
    for (let r = 0; r < rCount; r++) {
        for (let i = 0; i < segments; i++) {
            let v = rings[r].innerRing[i];
            positions.push(v.x, v.y, v.z);
        }
    }

    const frontCapOuterOffset = 2 * rCount * segments;
    for (let i = 0; i < segments; i++) { let v = rings[0].outerRing[i]; positions.push(v.x, v.y, v.z); }
    const frontCapInnerOffset = frontCapOuterOffset + segments;
    for (let i = 0; i < segments; i++) { let v = rings[0].innerRing[i]; positions.push(v.x, v.y, v.z); }

    const rearCapOuterOffset = frontCapInnerOffset + segments;
    for (let i = 0; i < segments; i++) { let v = rings[rCount - 1].outerRing[i]; positions.push(v.x, v.y, v.z); }
    const rearCapInnerOffset = rearCapOuterOffset + segments;
    for (let i = 0; i < segments; i++) { let v = rings[rCount - 1].innerRing[i]; positions.push(v.x, v.y, v.z); }

    geometry.clearGroups();

    let startIndex = indices.length;
    for (let r = 0; r < rCount - 1; r++) {
        for (let i = 0; i < segments; i++) {
            const nI = (i + 1) % segments;
            const r1 = r * segments, r2 = (r + 1) * segments;
            indices.push(r1 + i, r1 + nI, r2 + i, r1 + nI, r2 + nI, r2 + i);
        }
    }
    geometry.addGroup(startIndex, indices.length - startIndex, 0);

    startIndex = indices.length;
    for (let r = 0; r < rCount - 1; r++) {
        for (let i = 0; i < segments; i++) {
            const nI = (i + 1) % segments;
            const r1 = innerOffset + r * segments, r2 = innerOffset + (r + 1) * segments;
            indices.push(r1 + i, r2 + i, r1 + nI, r1 + nI, r2 + i, r2 + nI);
        }
    }
    geometry.addGroup(startIndex, indices.length - startIndex, 1);

    startIndex = indices.length;
    for (let i = 0; i < segments; i++) {
        const nI = (i + 1) % segments;
        indices.push(frontCapOuterOffset + i, frontCapInnerOffset + i, frontCapOuterOffset + nI, frontCapInnerOffset + i, frontCapInnerOffset + nI, frontCapOuterOffset + nI);
    }
    for (let i = 0; i < segments; i++) {
        const nI = (i + 1) % segments;
        indices.push(rearCapOuterOffset + i, rearCapOuterOffset + nI, rearCapInnerOffset + i, rearCapInnerOffset + i, rearCapOuterOffset + nI, rearCapInnerOffset + nI);
    }
    geometry.addGroup(startIndex, indices.length - startIndex, 2);

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry = finalizeWeldedGeometry(geometry, { toleranceMm: 1e-5, computeNormals: true });
    geometry.userData = Object.assign({}, geometry.userData || {}, {
        geometrySource: UNIFIED_GEOMETRY_SOURCE_ID,
        primaryGeometrySource: UNIFIED_GEOMETRY_SOURCE_ID,
        rearTerminal: getUnifiedRearTerminal(state, rings)
    });
    return geometry;
}

function generateOuterShellGeometry() {
    const segments = getMeshSegments();
    const sourceRings = getSolidExportRings();
    const rCount = sourceRings.length;
    if (rCount === 0) return new THREE.BufferGeometry();

    let geometry = new THREE.BufferGeometry();
    const positions = [], indices = [];

    for (let r = 0; r < rCount; r++) {
        for (let i = 0; i < segments; i++) {
            let v = sourceRings[r].outerRing[i];
            positions.push(v.x, v.y, v.z);
        }
    }

    for (let r = 0; r < rCount - 1; r++) {
        for (let i = 0; i < segments; i++) {
            const nI = (i + 1) % segments;
            const r1 = r * segments, r2 = (r + 1) * segments;
            indices.push(r1 + i, r1 + nI, r2 + i, r1 + nI, r2 + nI, r2 + i);
        }
    }

    const frontCenterIdx = positions.length / 3;
    let frontC = sourceRings[0].center;
    positions.push(frontC.x, frontC.y, frontC.z);

    const rearCenterIdx = positions.length / 3;
    let rearC = sourceRings[rCount - 1].center;
    positions.push(rearC.x, rearC.y, rearC.z);

    for (let i = 0; i < segments; i++) {
        const nI = (i + 1) % segments;
        indices.push(frontCenterIdx, nI, i);
    }
    const rearStart = (rCount - 1) * segments;
    for (let i = 0; i < segments; i++) {
        const nI = (i + 1) % segments;
        indices.push(rearCenterIdx, rearStart + i, rearStart + nI);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry = finalizeWeldedGeometry(geometry, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });

    const quality = calculateMeshQuality(geometry);
    geometry.userData = Object.assign({}, geometry.userData || {}, {
        geometrySource: UNIFIED_GEOMETRY_SOURCE_ID,
        primaryGeometrySource: UNIFIED_GEOMETRY_SOURCE_ID,
        rearTerminal: getUnifiedRearTerminal(state, sourceRings),
        solidExportStartRing: getSolidExportStartRingIndex(0.5),
        sliverCount: quality.sliverCount,
        minTriangleAreaMm2: quality.minArea,
        worstAspectRatio: quality.worstAspect
    });

    return geometry;
}

function generateSplitGeometry(options) {
    const { splitMode, clearance } = options;
    const cHalf = clearance / 2.0;
    let partAPoints = [], partBPoints = [];

    GLOBAL_RINGSCache.forEach(ringData => {
        let ring = ringData.outerRing;
        let C = ringData.center;
        let ringA = [], ringB = [];

        if (splitMode === 'vertical') {
            ring.forEach(v => {
                if (v.y >= 0) ringA.push(new THREE.Vector3(v.x, Math.max(cHalf, v.y), v.z));
                if (v.y <= 0) ringB.push(new THREE.Vector3(v.x, Math.min(-cHalf, v.y), v.z));
            });
            if (ringA.length > 0) {
                let first = ringA[0], last = ringA[ringA.length - 1];
                ringA.push(new THREE.Vector3(first.x, cHalf, last.z));
                ringA.push(new THREE.Vector3(first.x, cHalf, first.z));
            }
            if (ringB.length > 0) {
                let first = ringB[0], last = ringB[ringB.length - 1];
                ringB.push(new THREE.Vector3(first.x, -cHalf, last.z));
                ringB.push(new THREE.Vector3(first.x, -cHalf, first.z));
            }
        } else {
            ring.forEach(v => {
                if (v.z >= C.z) ringA.push(new THREE.Vector3(v.x, v.y, Math.max(C.z + cHalf, v.z)));
                if (v.z <= C.z) ringB.push(new THREE.Vector3(v.x, v.y, Math.min(C.z - cHalf, v.z)));
            });
            if (ringA.length > 0) {
                let first = ringA[0], last = ringA[ringA.length - 1];
                ringA.push(new THREE.Vector3(first.x, last.y, C.z + cHalf));
                ringA.push(new THREE.Vector3(first.x, first.y, C.z + cHalf));
            }
            if (ringB.length > 0) {
                let first = ringB[0], last = ringB[ringB.length - 1];
                ringB.push(new THREE.Vector3(first.x, last.y, C.z - cHalf));
                ringB.push(new THREE.Vector3(first.x, first.y, C.z - cHalf));
            }
        }
        partAPoints.push(ringA);
        partBPoints.push(ringB);
    });

    function buildMeshFromArcs(arcs, flipCaps) {
        const geo = new THREE.BufferGeometry();
        const positions = [], indices = [];
        let offsets = [], offset = 0;

        arcs.forEach(arc => {
            offsets.push(offset);
            arc.forEach(v => positions.push(v.x, v.y, v.z));
            offset += arc.length;
        });

        for (let r = 0; r < arcs.length - 1; r++) {
            let steps = Math.min(arcs[r].length, arcs[r + 1].length) - 1;
            let start1 = offsets[r], start2 = offsets[r + 1];
            for (let i = 0; i < steps; i++) {
                let r1i = start1 + i, r2i = start2 + i;
                indices.push(r1i, r1i + 1, r2i, r1i + 1, r2i + 1, r2i);
            }
        }

        if (arcs[0] && arcs[0].length >= 3) {
            const front = arcs[0];
            const frontCenterIdx = positions.length / 3;
            let fy = 0, fz = 0;
            front.forEach(v => { fy += v.y; fz += v.z; });
            positions.push(front[0].x, fy / front.length, fz / front.length);
            const frontStart = offsets[0];
            for (let i = 0; i < front.length - 1; i++) {
                if (flipCaps) indices.push(frontCenterIdx, frontStart + i, frontStart + i + 1);
                else indices.push(frontCenterIdx, frontStart + i + 1, frontStart + i);
            }
        }

        if (arcs[arcs.length - 1] && arcs[arcs.length - 1].length >= 3) {
            const rear = arcs[arcs.length - 1];
            const rearCenterIdx = positions.length / 3;
            let ry = 0, rz = 0;
            rear.forEach(v => { ry += v.y; rz += v.z; });
            positions.push(rear[0].x, ry / rear.length, rz / rear.length);
            const rearStart = offsets[arcs.length - 1];
            for (let i = 0; i < rear.length - 1; i++) {
                if (flipCaps) indices.push(rearCenterIdx, rearStart + i + 1, rearStart + i);
                else indices.push(rearCenterIdx, rearStart + i, rearStart + i + 1);
            }
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo = finalizeWeldedGeometry(geo, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });
        return geo;
    }

    return { partA: buildMeshFromArcs(partAPoints, false), partB: buildMeshFromArcs(partBPoints, true) };
}


function isCobraEggshellExportActive(options) {
    const source = options || (typeof state !== 'undefined' ? state : null);
    return !!(source &&
        isCobraEggshellRuntimeGeometryDebugEnabled(source) &&
        source.cobraArchitecture &&
        source.cobraArchitecture.enabled === true &&
        source.cobraArchitecture.armwand &&
        source.cobraArchitecture.armwand.enabled !== false &&
        source.cobraArchitecture.armwand.variant === 'station_based_eggshell' &&
        typeof window !== 'undefined' &&
        window.CobraEggshellWand &&
        typeof window.CobraEggshellWand.buildStations === 'function' &&
        typeof window.CobraEggshellWand.buildExportGeometry === 'function');
}

function validateCobraEggshellExportGeometry(options) {
    const source = options || (typeof state !== 'undefined' ? state : null);
    if (!isCobraEggshellExportActive(source)) return null;
    try {
        const result = window.CobraEggshellWand.buildExportGeometry(source, {
            segments: Math.min(36, Math.max(18, typeof getMeshSegments === 'function' ? getMeshSegments() : 24))
        });
        const geometry = result && result.geometry;
        const validation = result && result.validation ? result.validation : { status: 'FAIL', errors: ['Cobra eggshell export validation unavailable.'] };
        const metrics = {
            exportGeometrySource: 'cobraEggshellWand',
            renderVertexCount: validation.vertexCount || 0,
            renderIndexCount: validation.indexCount || 0,
            renderGroupCount: validation.groupCount || 0,
            stationCount: validation.stationValidation ? validation.stationValidation.stationCount : null,
            structuralStationCount: validation.stationValidation ? validation.stationValidation.structuralStationCount : null
        };
        if (geometry && geometry.userData) {
            geometry.userData.exportGeometrySource = 'cobraEggshellWand';
            geometry.userData.cobraEggshellExportPath = true;
            geometry.userData.renderVertexCount = metrics.renderVertexCount;
            geometry.userData.renderIndexCount = metrics.renderIndexCount;
            geometry.userData.renderGroupCount = metrics.renderGroupCount;
        }
        if (validation.status !== 'PASS') {
            return {
                isValid: false,
                errorMsg: 'cobraEggshellWand export geometry failed: ' + ((validation.errors || []).join('; ') || 'unknown error'),
                metrics
            };
        }
        return {
            isValid: true,
            errorMsg: '',
            metrics
        };
    } catch (err) {
        return {
            isValid: false,
            errorMsg: 'cobraEggshellWand export geometry exception: ' + (err && err.message ? err.message : String(err)),
            metrics: { exportGeometrySource: 'cobraEggshellWand' }
        };
    }
}

function validateExportGeometry(exportType, options) {
    const sourceOptions = options || (typeof state !== 'undefined' ? state : null);
    const cobraExportValidation = validateCobraEggshellExportGeometry(sourceOptions);
    if (cobraExportValidation) {
        LAST_EXPORT_VALIDATION = Object.assign({ exportType, exportGeometrySource: 'cobraEggshellWand' }, cobraExportValidation);
        return LAST_EXPORT_VALIDATION;
    }

    const val = validateTonearmGeometry();
    if (!val.isValid) {
        LAST_EXPORT_VALIDATION = Object.assign({ exportGeometrySource: UNIFIED_GEOMETRY_SOURCE_ID }, val);
        return LAST_EXPORT_VALIDATION;
    }
    try {
        let result = { isValid: true, errorMsg: '', metrics: {} };
        let exportGeo = null;
        if (exportType === EXPORT_TYPES.SOLID || exportType === EXPORT_TYPES.ONSHAPE_1TO1 || exportType === 'onshape_1to1') {
            const rings = getSolidExportRings();
            exportGeo = generateOuterShellGeometry();
            result = validateMeshIntegrity(exportGeo, rings, 'solid');
            if (exportType === EXPORT_TYPES.ONSHAPE_1TO1 || exportType === 'onshape_1to1') {
                result.metrics = Object.assign({}, result.metrics || {}, { onshapeOneToOne: true, units: 'mm', scale: 1, noMouldOffset: true, noShrinkageCompensation: true, noDraftModification: true });
            }
        } else if (exportType === EXPORT_TYPES.HOLLOW) {
            const rings = getHollowExportRings();
            exportGeo = generateHollowGeometry(rings);
            result = validateMeshIntegrity(exportGeo, rings, 'hollow');
        } else if (exportType === EXPORT_TYPES.SPLIT_VERTICAL) {
            const parts = generateSplitGeometry({ splitMode: 'vertical', clearance: (sourceOptions && sourceOptions.splitClearance) || 0 });
            result = validateSplitGeometryIntegrity(parts, EXPORT_TYPES.SPLIT_VERTICAL);
        } else if (exportType === EXPORT_TYPES.SPLIT_HORIZONTAL) {
            const parts = generateSplitGeometry({ splitMode: 'horizontal', clearance: (sourceOptions && sourceOptions.splitClearance) || 0 });
            result = validateSplitGeometryIntegrity(parts, EXPORT_TYPES.SPLIT_HORIZONTAL);
        }
        if (result && result.isValid && exportGeo && typeof getExportGeometryWithAccessories === 'function' && typeof validateFinalExportMeshTopology === 'function') {
            const finalGeo = getExportGeometryWithAccessories(exportGeo);
            const finalAudit = validateFinalExportMeshTopology(finalGeo, {
                mode: exportType,
                allowMultipleClosedShells: true
            });
            result.metrics = Object.assign({}, result.metrics || {}, finalAudit.metrics || {});
            if (!finalAudit.isValid) {
                result = {
                    isValid: false,
                    errorMsg: finalAudit.errorMsg,
                    metrics: result.metrics
                };
            }
        }
        LAST_EXPORT_VALIDATION = Object.assign({ exportType, exportGeometrySource: UNIFIED_GEOMETRY_SOURCE_ID }, result);
        if (LAST_EXPORT_VALIDATION.metrics) LAST_EXPORT_VALIDATION.metrics.exportGeometrySource = UNIFIED_GEOMETRY_SOURCE_ID;
        return LAST_EXPORT_VALIDATION;
    } catch (err) {
        const result = { isValid: false, errorMsg: err && err.message ? err.message : 'Unknown export error.', metrics: {} };
        if (result && result.isValid && exportGeo && typeof getExportGeometryWithAccessories === 'function' && typeof validateFinalExportMeshTopology === 'function') {
            const finalGeo = getExportGeometryWithAccessories(exportGeo);
            const finalAudit = validateFinalExportMeshTopology(finalGeo, {
                mode: exportType,
                allowMultipleClosedShells: true
            });
            result.metrics = Object.assign({}, result.metrics || {}, finalAudit.metrics || {});
            if (!finalAudit.isValid) {
                result = {
                    isValid: false,
                    errorMsg: finalAudit.errorMsg,
                    metrics: result.metrics
                };
            }
        }
        LAST_EXPORT_VALIDATION = Object.assign({ exportType, exportGeometrySource: UNIFIED_GEOMETRY_SOURCE_ID }, result);
        if (LAST_EXPORT_VALIDATION.metrics) LAST_EXPORT_VALIDATION.metrics.exportGeometrySource = UNIFIED_GEOMETRY_SOURCE_ID;
        return LAST_EXPORT_VALIDATION;
    }
}
