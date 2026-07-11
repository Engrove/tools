// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * AI-CODING NOTE:
 * Responsibility: Draw orthographic projections and interaction overlays only for an explicitly active design.
 * Inputs: Canonical state, geometry cache, physics results, and canvas interactions.
 * Outputs: Side/top canvases and interaction metadata.
 * Safe edits: Projection math, explicit empty-state clearing, and non-mutating overlays.
 * Do not: Materialize geometry or stale drawings in an empty session.
 * Verification: empty-session contract and desktop browser smoke test.
 *
 * js/render2d.js
 * Exact 2D orthographic projection from GLOBAL_RINGSCache.
 * Includes tooltip hotspots and draggable, slider-bound points in 2D.
 */

let CANVAS_INTERACTION = {
    hotspots: {
        canvasSide: [],
        canvasTop: []
    },
    draggables: {
        canvasSide: [],
        canvasTop: []
    },
    contexts: {}
};

function reset2DInteractivity() {
    CANVAS_INTERACTION = {
        hotspots: {
            canvasSide: [],
            canvasTop: []
        },
        draggables: {
            canvasSide: [],
            canvasTop: []
        },
        contexts: {}
    };
    window.__tonearm2DInteractivity = CANVAS_INTERACTION;
}

function register2DHotspot(targetId, x, y, radius, payload) {
    if (!CANVAS_INTERACTION.hotspots[targetId]) CANVAS_INTERACTION.hotspots[targetId] = [];
    CANVAS_INTERACTION.hotspots[targetId].push({ x, y, radius, payload });
}

function register2DDraggable(targetId, x, y, radius, payload) {
    if (!CANVAS_INTERACTION.draggables[targetId]) CANVAS_INTERACTION.draggables[targetId] = [];
    CANVAS_INTERACTION.draggables[targetId].push({ x, y, radius, payload });
}

function setCanvasContext(targetId, data) {
    CANVAS_INTERACTION.contexts[targetId] = data;
}

function signedDeltaText(delta) {
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)} mm`;
}

function relationText(delta) {
    if (Math.abs(delta) <= 0.05) return '0.0 mm';
    return delta > 0 ? `${Math.abs(delta).toFixed(1)} mm above` : `${Math.abs(delta).toFixed(1)} mm below`;
}

function buildPointTooltipPayload(label, point, stylus, pivot, color, dragHint, extraLines) {
    const lines = [
        `X: ${point.x.toFixed(1)} mm`,
        `Y: ${point.y.toFixed(1)} mm`,
        `Z: ${point.z.toFixed(1)} mm`,
        `To stylus (ΔZ): ${signedDeltaText(point.z - stylus.z)}`,
        `To pivot (ΔZ): ${signedDeltaText(point.z - pivot.z)}`
    ];
    if (extraLines && extraLines.length) lines.push(...extraLines);
    if (dragHint) lines.push(`Drag: ${dragHint}`);
    return { label, point, color, lines };
}

function draw2D() {
    const cSide = document.getElementById('canvasSide');
    const cTop = document.getElementById('canvasTop');
    const ctxS = cSide.getContext('2d');
    const ctxT = cTop.getContext('2d');
    if (!state || state.designLoaded !== true) {
        ctxS.clearRect(0, 0, cSide.width, cSide.height);
        ctxT.clearRect(0, 0, cTop.width, cTop.height);
        reset2DInteractivity();
        return;
    }
    const showForce = state.showForce;
    const showMass = state.showMass;

    const mode = state.cartMode;
    const isMounted = (mode !== 'none');
    const cartMass = Physics.getCartridgeMass(state, mode);

    const matKey = state.material;
    const materialData = MATERIAL_LIB[matKey] || MATERIAL_LIB.carbon;
    const matDensity = materialData.density / 1000;

    if (!GLOBAL_RINGSCache || GLOBAL_RINGSCache.length === 0) return;
    const renderLen = GLOBAL_RINGSCache[GLOBAL_RINGSCache.length - 1].center.x;

    reset2DInteractivity();

    document.getElementById('legSide').style.display = showForce ? 'inline' : 'none';
    document.getElementById('legTop').style.display = showForce ? 'inline' : 'none';
    document.getElementById('legMass').style.display = showMass ? 'inline' : 'none';

    cSide.width = cSide.clientWidth * window.devicePixelRatio;
    cSide.height = cSide.clientHeight * window.devicePixelRatio;
    cTop.width = cTop.clientWidth * window.devicePixelRatio;
    cTop.height = cTop.clientHeight * window.devicePixelRatio;

    const scaleX = cSide.width / (renderLen + 20);
    const scaleYSide = cSide.height / 120;
    const scaleYTop = cTop.height / 120;

    const offsetX = 10 * scaleX;
    const offsetYSide = cSide.height * 0.45;
    const offsetYTop = cTop.height * 0.5;

    setCanvasContext('canvasSide', {
        view: 'side',
        offsetX,
        offsetY: offsetYSide,
        scaleX,
        scaleY: scaleYSide,
        width: cSide.width,
        height: cSide.height
    });
    setCanvasContext('canvasTop', {
        view: 'top',
        offsetX,
        offsetY: offsetYTop,
        scaleX,
        scaleY: scaleYTop,
        width: cTop.width,
        height: cTop.height
    });

    ctxS.clearRect(0, 0, cSide.width, cSide.height);
    ctxT.clearRect(0, 0, cTop.width, cTop.height);

    ctxS.strokeStyle = '#333';
    ctxS.beginPath();
    ctxS.moveTo(0, offsetYSide);
    ctxS.lineTo(cSide.width, offsetYSide);
    ctxS.stroke();

    ctxT.strokeStyle = '#333';
    ctxT.beginPath();
    ctxT.moveTo(0, offsetYTop);
    ctxT.lineTo(cTop.width, offsetYTop);
    ctxT.stroke();

    const ptsSideTop = [], ptsSideBot = [], ptsTopTop = [], ptsTopBot = [], ptsCenter = [];
    const forceZTop = [], forceZBot = [], forceYTop = [], forceYBot = [], massProfile = [];
    const profiles = [];

    let maxEI_z = 0, maxEI_y = 0, maxMassPerMm = 0, shellMass = 0;

    GLOBAL_RINGSCache.forEach((ringData, i) => {
        let stepL = 1.0;
        if (i > 0) {
            const prevC = GLOBAL_RINGSCache[i - 1].center;
            stepL = Math.sqrt(Math.pow(ringData.center.x - prevC.x, 2) + Math.pow(ringData.center.z - prevC.z, 2));
        }

        const a_net = Math.max(0, ringData.outGeo.area - ringData.inGeo.area);
        const Iy_net = Math.max(0, ringData.outGeo.Iy - ringData.inGeo.Iy);
        const Iz_net = Math.max(0, ringData.outGeo.Iz - ringData.inGeo.Iz);

        const EIy = (Iy_net * materialData.E) / 1000000;
        const EIz = (Iz_net * materialData.E) / 1000000;
        const massPerMm = a_net * matDensity;
        shellMass += massPerMm * stepL;

        if (EIz > maxEI_z) maxEI_z = EIz;
        if (EIy > maxEI_y) maxEI_y = EIy;
        if (massPerMm > maxMassPerMm) maxMassPerMm = massPerMm;

        profiles.push({
            ring: ringData,
            EIy,
            EIz,
            massPerMm,
            stepL,
            pxCenter: offsetX + ringData.center.x * scaleX,
            pxTop: offsetX + ringData.topRim.x * scaleX,
            pxBot: offsetX + ringData.botRim.x * scaleX,
            pxLeft: offsetX + ringData.leftRim.x * scaleX,
            pxRight: offsetX + ringData.rightRim.x * scaleX
        });
    });

    if (isMounted) {
        const bodyLength = (mode === 'g1042') ? GOLDRING1042.inferred.bodyLength : 18;
        const hardwareMassPerMm = cartMass / bodyLength;
        profiles.forEach(data => {
            if (data.ring.virtualX >= state.cartX && data.ring.virtualX <= state.cartX + bodyLength) {
                data.massPerMm += hardwareMassPerMm;
            }
            if (data.massPerMm > maxMassPerMm) maxMassPerMm = data.massPerMm;
        });
    }

    const totalMass = shellMass + cartMass + Physics.getRearWeightStackMass(state) + Physics.getRearFineTrimMass(state);
    document.getElementById('calcMass').innerText = totalMass.toFixed(1) + ' g';
    document.getElementById('calcMass').style.color = isMounted ? '#e1b12c' : '#9b59b6';

    const physicalPivot = Physics.getPivotPoint(state);
    let momentOfInertia = 0;
    profiles.forEach(data => {
        const r = data.ring.center.x - physicalPivot.x;
        momentOfInertia += data.massPerMm * data.stepL * (r * r);
    });

    const phys = Physics.getComprehensiveAnalysis(state, mode, GLOBAL_RINGSCache);
    [phys.c_cart, phys.c_rear_accessories].forEach(point => {
        if (point.mass > 0) {
            const r = point.x - physicalPivot.x;
            momentOfInertia += point.mass * r * r;
        }
    });

    const effLength = Physics.getEffectiveLength(state, mode);
    const effMass = Physics.calculateEffectiveMass(momentOfInertia, effLength);

    if (isMounted) {
        const f_res = Physics.calculateResonance(effMass, state.comp10);
        document.getElementById('calcEffMass').innerText = `System Effective Mass: ${effMass.toFixed(2)} g`;
        document.getElementById('calcResonance').innerText = `${f_res.toFixed(1)} Hz`;

        let resColor = '#e74c3c';
        if (f_res >= 7 && f_res <= 12) resColor = '#2ecc71';
        else if ((f_res >= 6 && f_res < 7) || (f_res > 12 && f_res <= 14)) resColor = '#f1c40f';
        document.getElementById('calcResonance').style.color = resColor;

        const f_clamp = Math.max(5, Math.min(15, f_res));
        const resPercent = ((f_clamp - 5) / 10) * 100;
        document.getElementById('resMarker').style.left = `${resPercent}%`;
        document.getElementById('resMarker').style.display = 'block';
    } else {
        document.getElementById('calcEffMass').innerText = `Arm Effective Mass: ${effMass.toFixed(2)} g`;
        document.getElementById('calcResonance').innerText = 'N/A';
        document.getElementById('calcResonance').style.color = '#777';
        document.getElementById('resMarker').style.display = 'none';
    }

    profiles.forEach(data => {
        ptsCenter.push({ x: data.pxCenter, y: offsetYSide - data.ring.center.z * scaleYSide });
        ptsSideTop.push({ x: data.pxTop, y: offsetYSide - data.ring.topRim.z * scaleYSide });
        ptsSideBot.push({ x: data.pxBot, y: offsetYSide - data.ring.botRim.z * scaleYSide });
        ptsTopTop.push({ x: data.pxLeft, y: offsetYTop - data.ring.leftRim.y * scaleYTop });
        ptsTopBot.push({ x: data.pxRight, y: offsetYTop - data.ring.rightRim.y * scaleYTop });

        if (showForce) {
            const normY = maxEI_y > 0 ? (data.EIy / maxEI_y) * (state.maxH / 2) : 0;
            const normZ = maxEI_z > 0 ? (data.EIz / maxEI_z) * (state.maxW / 2) : 0;
            forceYTop.push({ x: data.pxCenter, y: offsetYSide - (data.ring.center.z + normY) * scaleYSide });
            forceYBot.push({ x: data.pxCenter, y: offsetYSide - (data.ring.center.z - normY) * scaleYSide });
            forceZTop.push({ x: data.pxCenter, y: offsetYTop - normZ * scaleYTop });
            forceZBot.push({ x: data.pxCenter, y: offsetYTop + normZ * scaleYTop });
        }

        if (showMass && maxMassPerMm > 0) {
            massProfile.push({ x: data.pxCenter, y: cSide.height - (data.massPerMm / maxMassPerMm) * (cSide.height * 0.25) });
        }
    });

    function drawShape(ctx, topPts, botPts, fillColor, strokeColor) {
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        topPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        botPts.slice().reverse().forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    if (showMass && massProfile.length > 0) {
        ctxS.fillStyle = 'rgba(155, 89, 182, 0.2)';
        ctxS.strokeStyle = 'rgba(155, 89, 182, 0.5)';
        ctxS.lineWidth = 1;
        ctxS.beginPath();
        ctxS.moveTo(massProfile[0].x, cSide.height);
        massProfile.forEach(p => ctxS.lineTo(p.x, p.y));
        ctxS.lineTo(massProfile[massProfile.length - 1].x, cSide.height);
        ctxS.closePath();
        ctxS.fill();
        ctxS.stroke();
    }

    drawShape(ctxS, ptsSideTop, ptsSideBot, 'rgba(41, 128, 185, 0.25)', '#3498db');

    if (mode === 'g1042') {
        const offsetZ = getClassicProfileAtX(state.cartX + GOLDRING1042.anchors.tipToMountX).zBot - GOLDRING1042.anchors.tipToTop;
        ctxS.fillStyle = 'rgba(20, 20, 20, 0.8)';
        ctxS.strokeStyle = '#e1b12c';
        ctxS.lineWidth = 1;
        ctxS.beginPath();
        for (let lx = 0; lx <= GOLDRING1042.inferred.bodyLength; lx += 0.5) {
            const px = offsetX + (state.cartX + lx) * scaleX;
            const py = offsetYSide - (offsetZ + getGoldring1042ProfileAtX(lx).zTop) * scaleYSide;
            lx === 0 ? ctxS.moveTo(px, py) : ctxS.lineTo(px, py);
        }
        for (let lx = GOLDRING1042.inferred.bodyLength; lx >= 0; lx -= 0.5) {
            const px = offsetX + (state.cartX + lx) * scaleX;
            const py = offsetYSide - (offsetZ + getGoldring1042ProfileAtX(lx).zBot) * scaleYSide;
            ctxS.lineTo(px, py);
        }
        ctxS.closePath();
        ctxS.fill();
        ctxS.stroke();

        const stylus = Physics.getStylusPoint(state, mode);
        ctxS.fillStyle = 'red';
        ctxS.beginPath();
        ctxS.arc(offsetX + stylus.x * scaleX, offsetYSide - stylus.z * scaleYSide, 2.5, 0, Math.PI * 2);
        ctxS.fill();

        ctxT.fillStyle = 'rgba(225, 177, 44, 0.2)';
        ctxT.strokeStyle = '#e1b12c';
        ctxT.setLineDash([2, 2]);
        ctxT.beginPath();
        for (let lx = 0; lx <= GOLDRING1042.inferred.bodyLength; lx += 0.5) {
            const px = offsetX + (state.cartX + lx) * scaleX;
            const py = offsetYTop - getGoldring1042ProfileAtX(lx).width / 2 * scaleYTop;
            lx === 0 ? ctxT.moveTo(px, py) : ctxT.lineTo(px, py);
        }
        for (let lx = GOLDRING1042.inferred.bodyLength; lx >= 0; lx -= 0.5) {
            const px = offsetX + (state.cartX + lx) * scaleX;
            const py = offsetYTop + getGoldring1042ProfileAtX(lx).width / 2 * scaleYTop;
            ctxT.lineTo(px, py);
        }
        ctxT.closePath();
        ctxT.fill();
        ctxT.stroke();
        ctxT.setLineDash([]);
    } else if (mode === 'custom' || mode === 'selected') {
        const customLen = 18;
        const customHalfW = 8;
        const offsetZ = getClassicProfileAtX(state.cartX + customLen / 2).zBot - state.customZ;
        const bw = customLen * scaleX;
        const bh = (state.customZ - 2) * scaleYSide;
        const bx = offsetX + state.cartX * scaleX;
        const by = offsetYSide - (offsetZ + state.customZ) * scaleYSide;

        ctxS.fillStyle = 'rgba(80, 80, 80, 0.8)';
        ctxS.strokeStyle = '#999';
        ctxS.fillRect(bx, by, bw, bh);
        ctxS.strokeRect(bx, by, bw, bh);

        const stylus = Physics.getStylusPoint(state, mode);
        ctxS.fillStyle = 'red';
        ctxS.beginPath();
        ctxS.arc(offsetX + stylus.x * scaleX, offsetYSide - stylus.z * scaleYSide, 2.5, 0, Math.PI * 2);
        ctxS.fill();

        ctxT.fillStyle = 'rgba(153, 153, 153, 0.18)';
        ctxT.strokeStyle = '#999';
        ctxT.setLineDash([2, 2]);
        ctxT.beginPath();
        ctxT.rect(offsetX + state.cartX * scaleX, offsetYTop - customHalfW * scaleYTop, customLen * scaleX, customHalfW * 2 * scaleYTop);
        ctxT.fill();
        ctxT.stroke();
        ctxT.setLineDash([]);
    } else {
        const stylus = Physics.getStylusPoint(state, mode);
        ctxS.strokeStyle = '#9b59b6';
        ctxS.beginPath();
        ctxS.arc(offsetX + stylus.x * scaleX, offsetYSide - stylus.z * scaleYSide, 4, 0, Math.PI * 2);
        ctxS.stroke();
    }

    if (showForce) {
        drawShape(ctxS, forceYTop, forceYBot, 'rgba(211, 84, 0, 0.15)', 'rgba(211, 84, 0, 0.3)');
        drawShape(ctxT, forceZTop, forceZBot, 'rgba(211, 84, 0, 0.15)', 'rgba(211, 84, 0, 0.3)');
    }

    ctxS.strokeStyle = 'rgba(255,255,255,0.5)';
    ctxS.lineWidth = 1;
    ctxS.setLineDash([2, 4]);
    ctxS.beginPath();
    ptsCenter.forEach((p, i) => i === 0 ? ctxS.moveTo(p.x, p.y) : ctxS.lineTo(p.x, p.y));
    ctxS.stroke();
    ctxS.setLineDash([]);

    drawShape(ctxT, ptsTopTop, ptsTopBot, 'rgba(39, 174, 96, 0.25)', '#2ecc71');

    const toSide = p => ({ x: offsetX + p.x * scaleX, y: offsetYSide - p.z * scaleYSide });
    const toTop = p => ({ x: offsetX + p.x * scaleX, y: offsetYTop - p.y * scaleYTop });

    if (state.showLpTopPlane) {
        const lpZ = (state.lpTopZ !== undefined) ? state.lpTopZ : 0;
        const lpA = toSide({ x: (state.nomStylusX || 0) - 30, y: 0, z: lpZ });
        const lpB = toSide({ x: (state.fullLength || LENGTH) + 20, y: 0, z: lpZ });
        ctxS.save();
        ctxS.strokeStyle = 'rgba(180,180,180,0.45)';
        ctxS.fillStyle = 'rgba(200,200,200,0.7)';
        ctxS.lineWidth = 1;
        ctxS.setLineDash([4, 5]);
        ctxS.beginPath();
        ctxS.moveTo(lpA.x, lpA.y);
        ctxS.lineTo(lpB.x, lpB.y);
        ctxS.stroke();
        ctxS.setLineDash([]);
        ctxS.font = `${Math.max(10, Math.round(10 * window.devicePixelRatio))}px Segoe UI, sans-serif`;
        ctxS.fillText('LP top', lpA.x + 6 * window.devicePixelRatio, lpA.y - 5 * window.devicePixelRatio);

        const stylusLP = toSide({ x: phys.stylus.x, y: 0, z: lpZ });
        const stylusPt = toSide(phys.stylus);
        ctxS.strokeStyle = '#ff4d4d';
        ctxS.lineWidth = 1.2 * window.devicePixelRatio;
        ctxS.setLineDash([]);
        ctxS.beginPath();
        ctxS.moveTo(stylusLP.x, stylusLP.y - 6 * window.devicePixelRatio);
        ctxS.lineTo(stylusLP.x, stylusLP.y + 6 * window.devicePixelRatio);
        ctxS.stroke();
        if (state.stylusLockedToLP) {
            ctxS.fillStyle = 'rgba(255, 77, 77, 0.85)';
            ctxS.fillText('stylus on LP', stylusLP.x + 8 * window.devicePixelRatio, stylusLP.y + 12 * window.devicePixelRatio);
        } else if (Math.abs(phys.stylus.z - lpZ) > 0.05) {
            ctxS.strokeStyle = '#ff3333';
            ctxS.setLineDash([3, 3]);
            ctxS.beginPath();
            ctxS.moveTo(stylusLP.x, stylusLP.y);
            ctxS.lineTo(stylusPt.x, stylusPt.y);
            ctxS.stroke();
            ctxS.setLineDash([]);
        }
        ctxS.restore();
    }

    function drawMarker(ctx, p, color, radius) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawDraggableHalo(ctx, p, radius) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawMeasure(ctx, a, b, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    const tf = phys.staticImbalance || phys.trackingForce;
    const trackingText = (() => {
        if (!tf) return 'Static imbalance: N/A';
        if (tf.status === 'lift') return `Static imbalance: ${tf.gf.toFixed(2)} g-eq (lifting)`;
        if (tf.status === 'neutral') return `Static imbalance: ${tf.gf.toFixed(2)} g-eq (neutral)`;
        return `Static imbalance: ${tf.gf.toFixed(2)} g-eq`;
    })();

    function drawStaticImbalanceStatusLabel(ctx) {
        const textValue = trackingText;
        ctx.save();
        ctx.font = `${Math.max(11, Math.round(11 * window.devicePixelRatio))}px Segoe UI, sans-serif`;
        const padX = 8 * window.devicePixelRatio;
        const metrics = ctx.measureText(textValue);
        const boxW = metrics.width + padX * 2;
        const boxH = 22 * window.devicePixelRatio;

        // TD045: keep the status badge away from the stylus/headshell envelope.
        // The previous stylus-anchored label could cover the cartridge and front arm.
        const boxX = 10 * window.devicePixelRatio;
        const boxY = 10 * window.devicePixelRatio;

        let accent = '#2ecc71';
        if (tf && tf.quality === 'ok') accent = '#f1c40f';
        else if (tf && tf.quality === 'poor') accent = '#e74c3c';

        ctx.fillStyle = 'rgba(6, 6, 6, 0.92)';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.2 * window.devicePixelRatio;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8 * window.devicePixelRatio);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f5f5f5';
        ctx.textBaseline = 'middle';
        ctx.fillText(textValue, boxX + padX, boxY + boxH / 2);
        ctx.restore();
    }

    function drawAndRegisterPoint(targetId, ctx, point2D, label, worldPoint, color, radius, dragConfig, extraLines) {
        drawMarker(ctx, point2D, color, radius);
        const dragHint = dragConfig ? dragConfig.hint : '';
        register2DHotspot(targetId, point2D.x, point2D.y, Math.max(8, radius + 4), buildPointTooltipPayload(label, worldPoint, phys.stylus, phys.pivot, color, dragHint, extraLines));
        if (dragConfig) {
            drawDraggableHalo(ctx, point2D, radius);
            register2DDraggable(targetId, point2D.x, point2D.y, Math.max(10, radius + 6), {
                type: dragConfig.type,
                axes: dragConfig.axes,
                hint: dragConfig.hint,
                label,
                point: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
                color
            });
        }
    }

    if (state.showVerticalPivot) {
        const pS = toSide(phys.pivot);
        const pT = toTop(phys.pivot);
        ctxS.strokeStyle = '#e74c3c';
        ctxS.setLineDash([5, 5]);
        ctxS.beginPath();
        ctxS.moveTo(pS.x, 0);
        ctxS.lineTo(pS.x, cSide.height);
        ctxS.stroke();
        ctxS.setLineDash([]);
        ctxT.strokeStyle = '#e74c3c';
        ctxT.setLineDash([5, 5]);
        ctxT.beginPath();
        ctxT.moveTo(pT.x, 0);
        ctxT.lineTo(pT.x, cTop.height);
        ctxT.stroke();
        ctxT.setLineDash([]);
        drawAndRegisterPoint('canvasSide', ctxS, pS, 'Vertical pivot', phys.pivot, '#e74c3c', 4, {
            type: 'pivot',
            axes: 'xz',
            hint: 'X via pivot offset; Z via pivot above LP'
        });
        drawAndRegisterPoint('canvasTop', ctxT, pT, 'Vertical pivot', phys.pivot, '#e74c3c', 4, {
            type: 'pivot',
            axes: 'xy',
            hint: 'X/Y via pivot offset'
        });
    }

    if (state.showMeasureLines) {
        drawMeasure(ctxS, toSide(phys.stylus), toSide(phys.pivot), 'rgba(255,255,255,0.55)');
        drawMeasure(ctxS, toSide(phys.pivot), toSide(phys.c_total), 'rgba(46,204,113,0.65)');
        if (phys.c_rear.mass > 0) drawMeasure(ctxS, toSide(phys.pivot), toSide(phys.c_rear), 'rgba(155,89,182,0.65)');
        if (phys.c_rear_weights.mass > 0) drawMeasure(ctxS, toSide(phys.pivot), toSide(phys.c_rear_weights), 'rgba(230,126,34,0.65)');
        drawMeasure(ctxT, toTop(phys.stylus), toTop(phys.pivot), 'rgba(255,255,255,0.55)');
        drawMeasure(ctxT, toTop(phys.pivot), toTop(phys.c_total), 'rgba(46,204,113,0.65)');
    }

    drawAndRegisterPoint('canvasSide', ctxS, toSide(phys.stylus), 'Stylus tip', phys.stylus, '#ff4d4d', 4, {
        type: 'stylus',
        axes: 'xz',
        hint: 'X via setback; Z locked to LP plane unless manual body datum override is enabled'
    }, [trackingText, `Moment about pivot: ${tf.totalMomentGmm.toFixed(1)} g·mm`]);
    drawAndRegisterPoint('canvasTop', ctxT, toTop(phys.stylus), 'Stylus tip', phys.stylus, '#ff4d4d', 4, {
        type: 'stylus',
        axes: 'x',
        hint: 'X via setback'
    }, [trackingText, `Moment about pivot: ${tf.totalMomentGmm.toFixed(1)} g·mm`]);

    drawStaticImbalanceStatusLabel(ctxS);

    if (state.showTotalCOM) {
        drawAndRegisterPoint('canvasSide', ctxS, toSide(phys.c_total), 'Total COM', phys.c_total, '#2ecc71', 5);
        drawAndRegisterPoint('canvasTop', ctxT, toTop(phys.c_total), 'Total COM', phys.c_total, '#2ecc71', 5);
    }
    if (state.showRearCOM && phys.c_rear.mass > 0) {
        drawAndRegisterPoint('canvasSide', ctxS, toSide(phys.c_rear), 'Rear COM', phys.c_rear, '#9b59b6', 4);
        drawAndRegisterPoint('canvasTop', ctxT, toTop(phys.c_rear), 'Rear COM', phys.c_rear, '#9b59b6', 4);
    }
    if (state.showCounterweightCOM && phys.c_rear_weights.mass > 0) {
        drawAndRegisterPoint('canvasSide', ctxS, toSide(phys.c_rear_weights), 'Counterweight COM', phys.c_rear_weights, '#e67e22', 4);
        drawAndRegisterPoint('canvasTop', ctxT, toTop(phys.c_rear_weights), 'Counterweight COM', phys.c_rear_weights, '#e67e22', 4);
    }
    if (state.showCartridgeCOM && phys.c_cart.mass > 0) {
        drawAndRegisterPoint('canvasSide', ctxS, toSide(phys.c_cart), 'Cartridge COM', phys.c_cart, '#f1c40f', 3);
        drawAndRegisterPoint('canvasTop', ctxT, toTop(phys.c_cart), 'Cartridge COM', phys.c_cart, '#f1c40f', 3);
    }

    if (state.rearMode === REAR_MODES.COBRA_GOOSE) {
        const frontRef = phys.c_front || phys.c_cart;
        const rearCG = phys.c_rear;

        if (state.showRearCG) {
            drawMarker(ctxS, toSide(rearCG), '#9b59b6', 4);
        }

        if (state.showNeutralLine) {
            const a = toSide(frontRef);
            const b = toSide(Physics.getPivotPoint(state));
            const c = toSide(rearCG);
            ctxS.strokeStyle = 'rgba(241, 196, 15, 0.8)';
            ctxS.lineWidth = 1.5;
            ctxS.setLineDash([6, 4]);
            ctxS.beginPath();
            ctxS.moveTo(a.x, a.y);
            ctxS.lineTo(b.x, b.y);
            ctxS.lineTo(c.x, c.y);
            ctxS.stroke();
            ctxS.setLineDash([]);
        }

        if (state.showTowerClearance) {
            const xMin = offsetX + (state.apex - 12) * scaleX;
            const xMax = offsetX + (state.apex + 20) * scaleX;
            ctxS.fillStyle = 'rgba(231, 76, 60, 0.08)';
            ctxS.fillRect(xMin, 0, xMax - xMin, cSide.height);
        }
    }
}
