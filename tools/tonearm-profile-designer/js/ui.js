// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove
// AI-CODING NOTE: UI orchestration preserves all TD053F controls while the port blocks geometry, physics, and export work until an explicit design activation.

/**
 * js/ui.js
 * Centralized UI event handling, panel management, and 2D-drag of slider-bound points.
 */

let activeCanvasDrag = null;
let activePanelDrag = null;
let validationBannerCollapsed = true;

const EXTRA_NUMERIC_INPUT_IDS = [
    'meshSegments', 'meshStepX', 'draftMinDeg',
    'rearSupportBridgeLength', 'rearSupportBridgeRadius', 'rearSupportBridgeOverlap',
    'canopyRidgeHeight', 'canopyRidgeWidthFraction', 'canopyRidgeSharpness',
    'wireRouteRadius', 'wireRouteYOffset', 'wireRouteZOffset',
    'aiVibePlugSurfaceOffset', 'aiVibeSandingAllowance', 'aiVibeDraftDeg', 'aiVibeMouldFlangeWidth',
    'aiVibeRegistrationPins', 'aiVibeBoltHoles', 'aiVibeVentChannels', 'aiVibeShrinkagePercent', 'aiVibeMinTriangleHardFailArea',
    'targetEffectiveMass', 'targetLFResonance', 'targetVTF',
    'targetFirstBendingMode', 'targetSlendernessMin', 'targetSlendernessMax'
];

window.addEventListener('resize', () => {
    if (camera && renderer) {
        const container = document.getElementById('container3D');
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
    hideCanvasTooltip();
    clampPhysicalPanelToViewport();
    draw2D();
});

function bindIfExists(id, eventName, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(eventName, handler);
}

function getCanvasTooltipEl() {
    return document.getElementById('canvasTooltip');
}

function hideCanvasTooltip() {
    const el = getCanvasTooltipEl();
    if (!el) return;
    el.style.display = 'none';
}

function renderTooltipPayload(payload) {
    const swatch = payload.color
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${payload.color};margin-right:6px;vertical-align:middle;"></span>`
        : '';
    const lines = (payload.lines || []).map(line => `<div class="muted">${line}</div>`).join('');
    return `<div class="title">${swatch}${payload.label}</div>${lines}`;
}

function showCanvasTooltip(clientX, clientY, payload) {
    const el = getCanvasTooltipEl();
    if (!el) return;
    el.innerHTML = renderTooltipPayload(payload);
    el.style.display = 'block';
    const pad = 14;
    const rect = el.getBoundingClientRect();
    let left = clientX + 16;
    let top = clientY + 16;
    if (left + rect.width > window.innerWidth - pad) left = clientX - rect.width - 16;
    if (top + rect.height > window.innerHeight - pad) top = clientY - rect.height - 16;
    el.style.left = `${Math.max(pad, left)}px`;
    el.style.top = `${Math.max(pad, top)}px`;
}

function get2DInteraction() {
    return window.__tonearm2DInteractivity || { hotspots: {}, draggables: {}, contexts: {} };
}

function getCanvasPointerLocal(evt, canvas) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / Math.max(1, rect.width);
    const sy = canvas.height / Math.max(1, rect.height);
    return {
        x: (evt.clientX - rect.left) * sx,
        y: (evt.clientY - rect.top) * sy,
        rect,
        sx,
        sy
    };
}

function findNearestInteractive(list, point) {
    let hit = null;
    let best = Infinity;
    (list || []).forEach(item => {
        const dx = point.x - item.x;
        const dy = point.y - item.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= item.radius && d < best) {
            best = d;
            hit = item;
        }
    });
    return hit;
}

function canvasLocalToWorld(canvasId, localPoint) {
    const interaction = get2DInteraction();
    const ctx = interaction.contexts[canvasId];
    if (!ctx) return { x: 0, y: 0, z: 0 };

    if (ctx.view === 'side') {
        return {
            x: (localPoint.x - ctx.offsetX) / ctx.scaleX,
            y: 0,
            z: (ctx.offsetY - localPoint.y) / ctx.scaleY
        };
    }

    return {
        x: (localPoint.x - ctx.offsetX) / ctx.scaleX,
        y: (ctx.offsetY - localPoint.y) / ctx.scaleY,
        z: 0
    };
}

function handleCanvasTooltipMove(evt) {
    if (activeCanvasDrag) return;

    const canvas = evt.currentTarget;
    const local = getCanvasPointerLocal(evt, canvas);
    const interaction = get2DInteraction();
    const hotspots = interaction.hotspots[canvas.id] || [];
    const draggables = interaction.draggables[canvas.id] || [];

    const dragHit = findNearestInteractive(draggables, local);
    canvas.style.cursor = dragHit ? 'grab' : 'default';

    const hit = findNearestInteractive(hotspots, local);
    if (hit) showCanvasTooltip(evt.clientX, evt.clientY, hit.payload);
    else hideCanvasTooltip();
}

function bindCanvasTooltipEvents() {
    ['canvasSide', 'canvasTop'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('mousemove', handleCanvasTooltipMove);
        el.addEventListener('mouseleave', () => {
            if (!activeCanvasDrag) el.style.cursor = 'default';
            hideCanvasTooltip();
        });
    });
}

function setSliderNumericValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const step = parseFloat(el.step || '1');
    let clamped = Math.max(min, Math.min(max, value));
    if (step > 0) clamped = Math.round(clamped / step) * step;
    el.value = clamped;
}

function getActiveDragMode() {
    const mode = state.cartMode;
    return mode;
}

function beginCanvasPointDrag(evt) {
    const canvas = evt.currentTarget;
    const local = getCanvasPointerLocal(evt, canvas);
    const interaction = get2DInteraction();
    const draggables = interaction.draggables[canvas.id] || [];
    const hit = findNearestInteractive(draggables, local);
    if (!hit) return;

    evt.preventDefault();
    hideCanvasTooltip();

    const mode = getActiveDragMode();
    activeCanvasDrag = {
        canvas,
        canvasId: canvas.id,
        payload: hit.payload,
        startLocal: local,
        startWorld: canvasLocalToWorld(canvas.id, local),
        startState: {
            cartX: state.cartX,
            nomStylusX: state.nomStylusX,
            apex: state.apex,
            pivotOffsetX: state.pivotOffsetX || 0,
            pivotOffsetY: state.pivotOffsetY || 0,
            pivotOffsetZ: state.pivotOffsetZ || 0,
            verticalPivotHeightAboveLP: state.verticalPivotHeightAboveLP || 0,
            padOffset: state.padOffset,
            customZ: state.customZ,
            mode
        }
    };

    canvas.style.cursor = 'grabbing';
    if (canvas.setPointerCapture) canvas.setPointerCapture(evt.pointerId);
}

function applyCanvasDrag(active, currentWorld) {
    const dx = currentWorld.x - active.startWorld.x;
    const dy = currentWorld.y - active.startWorld.y;
    const dz = currentWorld.z - active.startWorld.z;
    const mode = active.startState.mode;
    const type = active.payload.type;
    const axes = active.payload.axes || '';

    if (type === 'pivot') {
        if (axes.includes('x')) setSliderNumericValue('pivotOffsetX', active.startState.pivotOffsetX + dx);
        if (axes.includes('y')) setSliderNumericValue('pivotOffsetY', active.startState.pivotOffsetY + dy);
        if (axes.includes('z')) setSliderNumericValue('verticalPivotHeightAboveLP', active.startState.verticalPivotHeightAboveLP + dz);
    }

    if (type === 'stylus') {
        if (axes.includes('x')) {
            const sliderId = mode === 'none' ? 'nomStylusX' : 'cartX';
            const startValue = mode === 'none' ? active.startState.nomStylusX : active.startState.cartX;
            setSliderNumericValue(sliderId, startValue + dx);
        }
        if (axes.includes('z') && active.canvasId === 'canvasSide') {
            if (mode === 'custom') {
                setSliderNumericValue('customZ', active.startState.customZ - dz);
            } else {
                setSliderNumericValue('padOffset', active.startState.padOffset + dz);
            }
        }
    }

    updateState();
}

function moveCanvasPointDrag(evt) {
    if (!activeCanvasDrag) return;
    evt.preventDefault();
    const local = getCanvasPointerLocal(evt, activeCanvasDrag.canvas);
    const world = canvasLocalToWorld(activeCanvasDrag.canvasId, local);
    applyCanvasDrag(activeCanvasDrag, world);
}

function endCanvasPointDrag(evt) {
    if (!activeCanvasDrag) return;
    const canvas = activeCanvasDrag.canvas;
    canvas.style.cursor = 'default';
    if (evt && canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(evt.pointerId); } catch (err) { }
    }
    activeCanvasDrag = null;
}

function bindCanvasDragEvents() {
    ['canvasSide', 'canvasTop'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('pointerdown', beginCanvasPointDrag);
        el.addEventListener('pointermove', moveCanvasPointDrag);
        el.addEventListener('pointerup', endCanvasPointDrag);
        el.addEventListener('pointercancel', endCanvasPointDrag);
    });
}

function syncPhysicalPanelButton() {
    const panel = document.getElementById('physicalPanel');
    const fab = document.getElementById('physicalPanelFab');
    if (!panel || !fab) return;
    fab.innerText = panel.classList.contains('open') ? 'Hide physics' : 'Physics Panel';
}

function setPhysicalPanelOpen(isOpen) {
    const panel = document.getElementById('physicalPanel');
    if (!panel) return;
    panel.classList.toggle('open', !!isOpen);
    syncPhysicalPanelButton();
}

function togglePhysicalPanel() {
    const panel = document.getElementById('physicalPanel');
    if (!panel) return;
    setPhysicalPanelOpen(!panel.classList.contains('open'));
}

function clampPhysicalPanelToViewport() {
    const panel = document.getElementById('physicalPanel');
    if (!panel || !panel.classList.contains('open')) return;
    const rect = panel.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    const pad = 10;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - rect.height - pad);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function beginPhysicalPanelDrag(evt) {
    if (evt.target.closest('button, input, select, label')) return;
    const panel = document.getElementById('physicalPanel');
    const header = document.getElementById('physicalPanelHeader');
    if (!panel || !header || !panel.classList.contains('open')) return;
    evt.preventDefault();
    const rect = panel.getBoundingClientRect();
    activePanelDrag = {
        pointerId: evt.pointerId,
        dx: evt.clientX - rect.left,
        dy: evt.clientY - rect.top,
        panel,
        header
    };
    header.classList.add('dragging');
    if (header.setPointerCapture) header.setPointerCapture(evt.pointerId);
}

function movePhysicalPanelDrag(evt) {
    if (!activePanelDrag || evt.pointerId !== activePanelDrag.pointerId) return;
    evt.preventDefault();
    const panel = activePanelDrag.panel;
    let left = evt.clientX - activePanelDrag.dx;
    let top = evt.clientY - activePanelDrag.dy;
    const pad = 10;
    const rect = panel.getBoundingClientRect();
    left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - rect.height - pad));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function endPhysicalPanelDrag(evt) {
    if (!activePanelDrag) return;
    const header = activePanelDrag.header;
    if (header && header.releasePointerCapture) {
        try { header.releasePointerCapture(evt.pointerId); } catch (err) { }
    }
    if (header) header.classList.remove('dragging');
    activePanelDrag = null;
}

function initPhysicalPanelDrag() {
    const header = document.getElementById('physicalPanelHeader');
    if (!header) return;
    header.addEventListener('pointerdown', beginPhysicalPanelDrag);
    header.addEventListener('pointermove', movePhysicalPanelDrag);
    header.addEventListener('pointerup', endPhysicalPanelDrag);
    header.addEventListener('pointercancel', endPhysicalPanelDrag);
}

bindIfExists('renderMode', 'change', () => {
    updateState();
    update3DMesh();
});
bindIfExists('showForce', 'change', () => {
    updateState();
    draw2D();
});
bindIfExists('showMass', 'change', () => {
    updateState();
    draw2D();
});
bindIfExists('material', 'change', updateState);
bindIfExists('alignmentPreset', 'change', updateState);
bindIfExists('physicalPanelFab', 'click', togglePhysicalPanel);
bindIfExists('physicalPanelClose', 'click', () => setPhysicalPanelOpen(false));

bindIfExists('cartMode', 'change', () => {
    const mode = document.getElementById('cartMode').value;
    document.getElementById('cartProps').style.display = (mode !== 'none') ? 'block' : 'none';
    document.getElementById('customCartProps').style.display = (mode === 'custom' || mode === 'selected') ? 'block' : 'none';
    document.getElementById('armOnlyProps').style.display = (mode === 'none') ? 'block' : 'none';

    if (mode === 'g1042') {
        document.getElementById('massLabel').innerText = 'System Mass (Arm + G1042)';
        document.getElementById('resLabel').innerText = 'System Resonance (10 Hz)';
    } else if (mode === 'selected') {
        document.getElementById('massLabel').innerText = 'System Mass (Arm + Selected Cartridge)';
        document.getElementById('resLabel').innerText = 'System Resonance (10 Hz)';
    } else if (mode === 'custom') {
        document.getElementById('massLabel').innerText = 'System Mass (Arm + Custom)';
        document.getElementById('resLabel').innerText = 'System Resonance (10 Hz)';
    } else {
        document.getElementById('massLabel').innerText = 'Estimated Shell Mass';
        document.getElementById('resLabel').innerText = 'Requires cartridge for system resonance';
    }
    updateState();
});

let isEstimatedC10 = false;
const comp10 = document.getElementById('comp10');
const comp100 = document.getElementById('comp100');
const compK = document.getElementById('compK');
const comp10Label = document.getElementById('comp10_label');

function syncComplianceUI() {
    if (state && state.cartridgeComplianceEstimated) {
        comp10Label.innerText = '[Estimated compliance]';
        comp10Label.style.color = '#f1c40f';
    } else if (isEstimatedC10) {
        comp10Label.innerText = '[Estimated value (C100 * k)]';
        comp10Label.style.color = '#f1c40f';
    } else {
        comp10Label.innerText = '[Explicit measurement]';
        comp10Label.style.color = '#2ecc71';
    }
}

window.Session_isEstimatedC10 = function() { return isEstimatedC10; };
window.Session_setIsEstimatedC10 = function(v) {
    isEstimatedC10 = !!v;
    syncComplianceUI();
};

comp100.addEventListener('input', () => {
    const val100 = parseFloat(comp100.value);
    const k = parseFloat(compK.value);
    comp10.value = Physics.calcEstimatedC10(val100, k).toFixed(1);
    isEstimatedC10 = true;
    state.cartridgeComplianceEstimated = false;
    state.selectedCartridgeComplianceEstimated = false;
    syncComplianceUI();
    updateState();
});

compK.addEventListener('input', () => {
    const k = parseFloat(compK.value);
    state.cartridgeComplianceEstimated = false;
    state.selectedCartridgeComplianceEstimated = false;
    if (isEstimatedC10) {
        const val100 = parseFloat(comp100.value);
        comp10.value = Physics.calcEstimatedC10(val100, k).toFixed(1);
    } else {
        const val10 = parseFloat(comp10.value);
        comp100.value = Physics.calcEstimatedC100(val10, k).toFixed(1);
    }
    syncComplianceUI();
    updateState();
});

comp10.addEventListener('input', () => {
    const val10 = parseFloat(comp10.value);
    const k = parseFloat(compK.value);
    comp100.value = Physics.calcEstimatedC100(val10, k).toFixed(1);
    isEstimatedC10 = false;
    state.cartridgeComplianceEstimated = false;
    state.selectedCartridgeComplianceEstimated = false;
    syncComplianceUI();
    updateState();
});

function syncAlignmentTarget() {
    const alignKey = state.alignmentPreset;
    const alignData = KINEMATICS_PRESETS[alignKey];
    const targetKin = Kinematics.calculateAlignment(state.pivotSpindle, alignData.n1, alignData.n2);
    const mode = state.cartMode;
    const pivot = Physics.getPivotPoint(state);
    if (mode === 'none') {
        const el = document.getElementById('nomStylusX');
        const targetNomX = pivot.x - targetKin.Leff;
        el.value = Math.max(parseFloat(el.min), Math.min(parseFloat(el.max), targetNomX)).toFixed(1);
    } else {
        const el = document.getElementById('cartX');
        const targetCartX = pivot.x - targetKin.Leff;
        el.value = Math.max(parseFloat(el.min), Math.min(parseFloat(el.max), targetCartX)).toFixed(1);
    }
    updateState();
}

function syncExportUI() {
    const et = state.exportType;
    const splitOptions = document.getElementById('splitOptions');
    if (splitOptions) {
        splitOptions.style.display = (et === EXPORT_TYPES.SPLIT_VERTICAL || et === EXPORT_TYPES.SPLIT_HORIZONTAL) ? 'block' : 'none';
    }
}

function syncRearModeUI() {
    const cobraPanel = document.getElementById('rearCobraProps');
    if (!cobraPanel) return;
    cobraPanel.style.display = state.rearMode === REAR_MODES.COBRA_GOOSE ? 'block' : 'none';
}

function updateRearNeutralUI() {
    const rearCgEl = document.getElementById('calcRearCG');
    const neutralEl = document.getElementById('calcNeutralBalance');
    const scoreEl = document.getElementById('calcNeutralScore');
    if (!rearCgEl || !neutralEl || !scoreEl) return;

    if (state.rearMode !== REAR_MODES.COBRA_GOOSE) {
        rearCgEl.innerText = 'N/A';
        neutralEl.innerText = 'N/A';
        scoreEl.innerText = 'N/A';
        scoreEl.className = '';
        return;
    }

    const cartMode = state.cartMode;
    const phys = Physics.getComprehensiveAnalysis(state, cartMode, GLOBAL_RINGSCache);
    // TD043: Neutral balance is defined by frontArmCOM ↔ pivot ↔ rearArmCOM collinearity.
    // frontRef is the front-arm COM, NOT the stylus.
    const frontRef = phys.c_front || phys.c_cart;
    const rearCG = phys.c_rear;
    const evalData = Physics.evaluateNeutralBalance(state, frontRef, rearCG);

    rearCgEl.innerText = `${rearCG.x.toFixed(1)}, ${rearCG.y.toFixed(1)}, ${rearCG.z.toFixed(1)}`;
    neutralEl.innerText = `${evalData.error_mm.toFixed(2)} mm error`;
    scoreEl.innerText = evalData.score.toUpperCase();
    scoreEl.className = `neutral-${evalData.score}`;
}

function formatPoint(p) {
    return `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
}

function formatMetric(m) {
    return `${m.d.toFixed(1)} / Δx:${m.dx.toFixed(1)}, Δy:${m.dy.toFixed(1)}, Δz:${m.dz.toFixed(1)}`;
}

function buildPhysicsMeterHTML(label, delta, color, range) {
    const clamped = Math.max(-range, Math.min(range, delta));
    const posPct = ((range - clamped) / (2 * range)) * 100;
    const valueText = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} mm`;
    return `
        <div class="physics-meter-card">
            <div class="physics-meter-label">${label}</div>
            <div class="physics-meter-track">
                <div class="physics-meter-centerline"></div>
                <div class="physics-meter-pointer" style="top:${posPct}%;background:${color};"></div>
            </div>
            <div class="physics-meter-value" style="color:${color};">${valueText}</div>
        </div>
    `;
}

function updateStaticImbalanceGauge(trackingForce) {
    const pointer = document.getElementById('trackingForcePointer');
    const textEl = document.getElementById('trackingForceGaugeText');
    const hintEl = document.getElementById('trackingForceGaugeHint');
    if (!pointer || !textEl || !hintEl || !trackingForce) return;

    const minG = 0;
    const maxG = 5;
    const clamped = Math.max(minG, Math.min(maxG, trackingForce.gf));
    const pct = ((clamped - minG) / (maxG - minG)) * 100;
    pointer.style.left = `${pct}%`;

    let text = `${trackingForce.gf.toFixed(2)} g`;
    let color = '#2ecc71';
    let hint = 'Green zone ≈ 1.5–2.5 g equivalent. Static imbalance indicator, not set VTF.';

    if (trackingForce.status === 'lift') {
        color = '#e74c3c';
        text = `${trackingForce.gf.toFixed(2)} g (lifting)`;
        hint = 'Negative value means the current mass distribution tends to lift the stylus tip.';
    } else if (trackingForce.quality === 'ok') {
        color = '#f1c40f';
    } else if (trackingForce.quality === 'poor') {
        color = '#e74c3c';
        if (trackingForce.gf > 3.0) hint = 'High static imbalance. Reduce rear moment or move pivot/COM.';
        else if (trackingForce.gf >= 0) hint = 'Low static imbalance. Move total COM forward or reduce counterweight moment.';
    }

    textEl.innerText = text;
    textEl.style.color = color;
    hintEl.innerText = hint;
}

function updatePhysicsPanel() {
    const mode = state.cartMode;
    const phys = Physics.getComprehensiveAnalysis(state, mode, GLOBAL_RINGSCache);

    const setters = {
        dataPivot: formatPoint(phys.pivot),
        dataStylus: formatPoint(phys.stylus),
        dataTotalCOM: formatPoint(phys.c_total),
        dataRearCOM: formatPoint(phys.c_rear),
        dataCounterCOM: formatPoint(phys.c_rear_weights),
        dataDistSP: formatMetric(phys.distances.stylus_pivot),
        dataDistPT: formatMetric(phys.distances.pivot_totalCOM),
        dataDistPR: formatMetric(phys.distances.pivot_rearCOM),
        dataDistPCW: formatMetric(phys.distances.pivot_counterweightCOM),
        dataDistTCW: formatMetric(phys.distances.totalCOM_counterweightCOM),
        dataDistST: formatMetric(phys.distances.stylus_totalCOM),
        dataTrackingForce: `${phys.trackingForce.gf.toFixed(2)} g / ${phys.trackingForce.milliNewton.toFixed(1)} mN`,
        dataTrackingMoment: `${phys.trackingForce.totalMomentGmm.toFixed(1)} g·mm`,
        dataIzz: phys.inertia.Izz.toFixed(0),
        dataIyy: phys.inertia.Iyy.toFixed(0),
        dataKzz: phys.inertia.kzz.toFixed(1),
        dataEIMin: `${phys.structural.EI_min_Nm2.toFixed(3)} N·m²`,
        dataEIApex: `${phys.structural.EI_apex_Nm2.toFixed(3)} N·m²`,
        dataGJMin: `${phys.structural.GJ_min_Nm2.toFixed(3)} N·m²`,
        dataFirstBending: `${phys.structural.firstBendingHz.toFixed(1)} Hz`,
        dataFirstTorsion: `${phys.structural.firstTorsionHz.toFixed(1)} Hz`,
        dataStructuralStatus: `Bending: ${phys.structural.bendingStatus.toUpperCase()} / Torsion: ${phys.structural.torsionStatus.toUpperCase()}`
    };

    Object.entries(setters).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });

    updateStaticImbalanceGauge(phys.staticImbalance || phys.trackingForce);

    const meterHost = document.getElementById('physicsMeters');
    const meterScale = document.getElementById('physicsMetersScale');
    if (meterHost) {
        const meterDefs = [
            { label: 'Pivot', delta: phys.pivot.z - phys.stylus.z, color: '#e74c3c' },
            { label: 'Total COM', delta: phys.c_total.z - phys.stylus.z, color: '#2ecc71' },
            { label: 'Rear COM', delta: phys.c_rear.z - phys.stylus.z, color: '#9b59b6' },
            { label: 'Counterweight', delta: phys.c_rear_weights.z - phys.stylus.z, color: '#e67e22' },
            { label: 'Cart COM', delta: phys.c_cart.z - phys.stylus.z, color: '#f1c40f' }
        ].filter(item => Number.isFinite(item.delta) && !(item.label === 'Cart COM' && phys.c_cart.mass <= 0) && !(item.label === 'Counterweight' && phys.c_rear_weights.mass <= 0));

        const maxAbs = meterDefs.reduce((m, item) => Math.max(m, Math.abs(item.delta)), 0);
        const range = Math.max(15, Math.min(80, Math.ceil((maxAbs + 5) / 5) * 5));
        meterHost.innerHTML = meterDefs.map(item => buildPhysicsMeterHTML(item.label, item.delta, item.color, range)).join('');
        if (meterScale) meterScale.innerText = `Relative to the stylus tip. Center = 0 mm, scale ±${range} mm.`;
    }
}

function applyStylusLockUiState() {
    const lock = document.getElementById('stylusLockedToLP');
    const datumSlider = document.getElementById('armBodyDatumOffsetZ');
    if (!lock || !datumSlider) return;
    state.stylusLockedToLP = !!lock.checked;
    datumSlider.disabled = state.stylusLockedToLP;
    datumSlider.classList.toggle('locked-readonly', state.stylusLockedToLP);
}

function updateReferenceFrameReadouts(currentState, mode) {
    const ids = ['readLpTopZ', 'readPivotAboveLP', 'readStylusZ', 'readPivotStylusDz', 'readBodyEnvelopeZ', 'readStylusToLpDz', 'stylusLpStatus'];
    if (!ids.every(id => document.getElementById(id))) return;
    const pivot = Physics.getPivotPoint(currentState);
    const stylus = Physics.getStylusPoint(currentState, mode);
    const lpTopZ = (currentState.lpTopZ !== undefined) ? currentState.lpTopZ : 0;
    const stylusToLpDz = stylus.z - lpTopZ;
    document.getElementById('readLpTopZ').innerText = lpTopZ.toFixed(2);
    document.getElementById('readPivotAboveLP').innerText = (currentState.verticalPivotHeightAboveLP || 0).toFixed(2);
    document.getElementById('readStylusZ').innerText = stylus.z.toFixed(2);
    document.getElementById('readStylusToLpDz').innerText = stylusToLpDz.toFixed(2);
    document.getElementById('readPivotStylusDz').innerText = (pivot.z - stylus.z).toFixed(2);
    document.getElementById('readBodyEnvelopeZ').innerText = (currentState.armBodyDatumOffsetZ || 0).toFixed(2);

    const badge = document.getElementById('stylusLpStatus');
    if (badge) {
        badge.classList.remove('ok', 'warn', 'bad');
        if (!currentState.stylusLockedToLP) {
            badge.innerText = 'MANUAL';
            badge.classList.add('warn');
        } else if (Math.abs(stylusToLpDz) < 0.05) {
            badge.innerText = 'OK';
            badge.classList.add('ok');
        } else {
            badge.innerText = 'ERROR';
            badge.classList.add('bad');
        }
    }
}

function applyValidationBanner() {
    const warn = document.getElementById('validationWarning');
    const msg = document.getElementById('validationMsg');
    const summary = document.getElementById('validationSummary');
    const toggle = document.getElementById('validationToggle');
    if (!warn || !msg) return;

    const messages = [];
    try {
        updateReferenceFrameReadouts(state, state.cartMode);
    } catch (err) {
        // Non-blocking readout path.
    }

    try {
        const stylus = Physics.getStylusPoint(state, state.cartMode);
        const lpTopZ = (state.lpTopZ !== undefined) ? state.lpTopZ : 0;
        const dz = stylus.z - lpTopZ;
        if (!state.stylusLockedToLP) {
            messages.push('Reference frame: stylus lock MANUAL; Stylus → LP ΔZ ' + dz.toFixed(2) + ' mm.');
        } else if (Math.abs(dz) > 0.05) {
            messages.push('Reference frame ERROR: stylus lock is on but Stylus → LP ΔZ is ' + dz.toFixed(2) + ' mm.');
        }
    } catch (err) {
        // Non-blocking reference-frame banner path.
    }

    try {
        const val = validateTonearmGeometry();
        if (!val.isValid) messages.push('Geometry: ' + val.errorMsg);
    } catch (err) {
        messages.push('Geometry validation unavailable: ' + (err && err.message ? err.message : String(err)));
    }

    try {
        const phys = Physics.getComprehensiveAnalysis(state, state.cartMode, GLOBAL_RINGSCache);
        if (phys && phys.structural && (phys.structural.bendingStatus !== 'ok' || phys.structural.torsionStatus !== 'ok')) {
            messages.push('Structural warning: bending=' + phys.structural.bendingStatus + ', torsion=' + phys.structural.torsionStatus + '.');
        }
        if (state.cartMode === 'g1042' && state.rearMode === REAR_MODES.COBRA_GOOSE && phys && phys.c_rear && phys.c_rear.mass > 0) {
            const nb = Physics.evaluateNeutralBalance(state, phys.c_front || phys.c_cart, phys.c_rear);
            if (nb && nb.score !== 'good' && nb.info_message) messages.push(nb.info_message);
        }
    } catch (err) {
        // Non-blocking UI banner path; export validation remains authoritative.
    }

    try {
        if (state.cartMode === 'g1042' && Math.abs((state.pivotSpindle || 0) - 221.7) > 5.0) {
            messages.push('Geometry reference warning: pivotSpindle ' + state.pivotSpindle.toFixed(1) +
                ' mm differs significantly from Cobra spec 221.7 mm.');
        }
    } catch (err) {
        // Non-blocking Cobra geometry-reference warning.
    }

    try {
        const exportVal = (typeof getLastExportValidation === 'function') ? getLastExportValidation() : null;
        const m = exportVal && exportVal.metrics ? exportVal.metrics : null;
        if (m) {
            if (m.draftViolations > 0) messages.push('Draft warning: ' + m.draftViolations + ' low-draft triangles.');
            if (m.undercutCount > 0) messages.push('Undercut warning: ' + m.undercutCount + ' detected.');
            if (m.sliverCount > 0 && m.sliverCount <= 4 && m.minTriangleAreaMm2 >= 0.001) {
                messages.push('Sliver warning: ' + m.sliverCount + ' small triangles, min area ' + m.minTriangleAreaMm2.toExponential(2) + ' mm².');
            }
        }
    } catch (err) {
        // Non-blocking UI banner path.
    }

    if (messages.length === 0) {
        warn.style.display = 'none';
        warn.classList.remove('collapsed');
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
            toggle.innerText = 'Collapse';
        }
    } else {
        warn.style.display = 'block';
        warn.classList.toggle('collapsed', validationBannerCollapsed);
        if (summary) {
            summary.innerText = '⚠ GEOMETRY / ANALYSIS WARNING (' + messages.length + ')';
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', validationBannerCollapsed ? 'false' : 'true');
            toggle.innerText = validationBannerCollapsed ? 'Expand' : 'Collapse';
        }
        msg.innerText = messages.join(' ');
    }
}

function updateState() {
    if (!state || state.designLoaded !== true) {
        if (typeof update3DMesh === 'function') update3DMesh();
        if (typeof draw2D === 'function') draw2D();
        const mass = document.getElementById('calcMass');
        const resonance = document.getElementById('calcResonance');
        const effective = document.getElementById('calcEffMass');
        if (mass) mass.innerText = '—';
        if (resonance) resonance.innerText = '—';
        if (effective) effective.innerText = 'No active design';
        if (window.DesignSession && typeof window.DesignSession.syncUi === 'function') window.DesignSession.syncUi();
        return;
    }
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            state[id] = sanitizeInputValue(id, parseFloat(el.value), state[id]);
            if (String(el.value) !== String(state[id]) && isNonNegativeMassInput(id)) el.value = state[id];
            const valEl = document.getElementById('val_' + id);
            if (valEl) valEl.innerText = state[id].toString();
        }
    });

    // TD043: pivotOffsetZ is a legacy alias. Keep the DOM/state alias synchronized
    // from the LP-referenced vertical pivot control, but do not persist it.
    if (!Number.isFinite(state.verticalPivotHeightAboveLP)) state.verticalPivotHeightAboveLP = state.pivotOffsetZ || 0;
    state.pivotOffsetZ = state.verticalPivotHeightAboveLP;
    const legacyPivotZEl = document.getElementById('pivotOffsetZ');
    if (legacyPivotZEl) legacyPivotZEl.value = state.verticalPivotHeightAboveLP;
    const legacyPivotZVal = document.getElementById('val_pivotOffsetZ');
    if (legacyPivotZVal) legacyPivotZVal.innerText = state.verticalPivotHeightAboveLP.toString();

    if (document.getElementById('exportType')) state.exportType = document.getElementById('exportType').value;
    if (document.getElementById('exportFormat')) state.exportFormat = document.getElementById('exportFormat').value;
    if (document.getElementById('splitClearance')) state.splitClearance = parseFloat(document.getElementById('splitClearance').value);
    if (document.getElementById('rearMode')) state.rearMode = document.getElementById('rearMode').value;
    if (document.getElementById('material')) state.material = document.getElementById('material').value;
    if (document.getElementById('cartMode')) state.cartMode = document.getElementById('cartMode').value;
    if (document.getElementById('alignmentPreset')) state.alignmentPreset = document.getElementById('alignmentPreset').value;
    if (document.getElementById('renderMode')) state.renderMode = document.getElementById('renderMode').value;
    if (document.getElementById('manufacturingMode')) state.manufacturingMode = document.getElementById('manufacturingMode').value;

    EXTRA_NUMERIC_INPUT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = parseFloat(el.value);
        if (!Number.isFinite(val)) return;
        state[id] = sanitizeInputValue(id, val, state[id]);
        const valEl = document.getElementById('val_' + id);
        if (valEl) valEl.innerText = (Math.round(val * 100) / 100).toString();
    });

    [
        'showRearCG', 'showNeutralLine', 'showTowerClearance', 'includeRearWeightDiscsInExport',
        'showRearWeights', 'showFineTrimScrew', 'showVerticalPivot', 'showTotalCOM', 'showRearCOM',
        'showCounterweightCOM', 'showCartridgeCOM', 'showInertiaAxes', 'showMeasureLines', 'showForce', 'showMass', 'showLpTopPlane', 'stylusLockedToLP',
        'aiVibeSoftSliverPass', 'showInternalWireRoute', 'cobraArchitectureEnabled', 'enableCobraArchitecture', 'titaniumPlateEnabled', 'onshapeMetadataSidecar', 'onshapeStrictOneToOne'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) state[id] = el.checked;
    });

    if (state.padL < state.noseL) {
        state.padL = state.noseL;
        document.getElementById('padL').value = state.noseL;
        document.getElementById('val_padL').innerText = state.noseL;
    }
    if (state.headW < state.neckW) {
        state.neckW = state.headW;
        document.getElementById('neckW').value = state.headW;
        document.getElementById('val_neckW').innerText = state.headW;
    }
    if (state.rearMode === REAR_MODES.COBRA_GOOSE && state.rearBendStartX <= state.apex) {
        state.rearBendStartX = state.apex + 1;
        document.getElementById('rearBendStartX').value = state.rearBendStartX;
        document.getElementById('val_rearBendStartX').innerText = state.rearBendStartX;
    }

    const mode = state.cartMode;
    if (mode === 'selected') {
        const name = state.selectedCartridgeName || 'Selected Cartridge';
        const massLabel = document.getElementById('massLabel');
        const resLabel = document.getElementById('resLabel');
        if (massLabel) massLabel.innerText = 'System Mass (Arm + ' + name + ')';
        if (resLabel) resLabel.innerText = 'System Resonance (10 Hz)';
    }
    const bodyLen = (mode === 'g1042') ? GOLDRING1042.inferred.bodyLength : 18.0;
    const cartSlider = document.getElementById('cartX');
    let maxCartX = Math.max(-10, state.padL - bodyLen + 5);
    cartSlider.max = maxCartX;
    if (state.cartX > maxCartX) {
        state.cartX = maxCartX;
        cartSlider.value = maxCartX;
        document.getElementById('val_cartX').innerText = maxCartX;
    } else if (state.cartX < -10) {
        state.cartX = -10;
        cartSlider.value = -10;
        document.getElementById('val_cartX').innerText = -10;
    }

    applyStylusLockUiState();
    // TD044: Auto-solve body datum so stylus tip stays on LP plane before physics/rendering.
    if (state.stylusLockedToLP) {
        state.armBodyDatumOffsetZ = Physics.solveArmBodyDatumOffsetZ(state, mode);
        const datumEl = document.getElementById('armBodyDatumOffsetZ');
        if (datumEl) {
            datumEl.value = state.armBodyDatumOffsetZ.toFixed(2);
            const valEl = document.getElementById('val_armBodyDatumOffsetZ');
            if (valEl) valEl.innerText = state.armBodyDatumOffsetZ.toFixed(2);
        }
    }

    const alignKey = state.alignmentPreset;
    const alignData = KINEMATICS_PRESETS[alignKey];
    const targetKin = Kinematics.calculateAlignment(state.pivotSpindle, alignData.n1, alignData.n2);
    document.getElementById('kinTargetLeff').innerText = targetKin.Leff.toFixed(1);
    document.getElementById('kinTargetOverhang').innerText = targetKin.overhang.toFixed(1);
    document.getElementById('kinTargetOffset').innerText = targetKin.offsetDeg.toFixed(1);

    const actualLeff = Physics.getEffectiveLength(state, mode);
    document.getElementById('kinActualLeff').innerText = actualLeff.toFixed(1);
    const errorLeff = actualLeff - targetKin.Leff;
    const kinDeltaEl = document.getElementById('kinDelta');
    kinDeltaEl.innerText = `Δ ${errorLeff > 0 ? '+' : ''}${errorLeff.toFixed(1)} mm`;
    kinDeltaEl.style.color = Math.abs(errorLeff) <= 0.5 ? '#2ecc71' : '#e74c3c';

    syncExportUI();
    syncRearModeUI();

    if (typeof sanitizeMassFieldsOnObject === 'function') sanitizeMassFieldsOnObject(state);
    if (typeof updateGeometryCache === 'function') updateGeometryCache();

    applyValidationBanner();
    updateRearNeutralUI();
    if (window.CartridgePicker && typeof window.CartridgePicker.syncSelectedSummary === 'function') window.CartridgePicker.syncSelectedSummary(state);
    draw2D();
    update3DMesh();
    updatePhysicsPanel();
    if (typeof window.refreshLTSolverPreview === 'function') {
        window.refreshLTSolverPreview(false);
    }
    if (typeof window.refreshLTMechanismModal === 'function') {
        window.refreshLTMechanismModal();
    }
}


function initValidationBannerToggle() {
    const toggle = document.getElementById('validationToggle');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        validationBannerCollapsed = !validationBannerCollapsed;
        applyValidationBanner();
    });
}

inputs.forEach(id => bindIfExists(id, 'input', updateState));
EXTRA_NUMERIC_INPUT_IDS.forEach(id => bindIfExists(id, 'input', updateState));
bindIfExists('syncAlignment', 'click', syncAlignmentTarget);
bindIfExists('exportType', 'change', updateState);
bindIfExists('exportFormat', 'change', () => { state.exportFormat = document.getElementById('exportFormat').value; });
bindIfExists('splitClearance', 'input', () => {
    state.splitClearance = parseFloat(document.getElementById('splitClearance').value);
    document.getElementById('val_splitClearance').innerText = state.splitClearance.toFixed(2);
    updateState();
});
bindIfExists('rearMode', 'change', updateState);
bindIfExists('stylusLockedToLP', 'change', () => { applyStylusLockUiState(); updateState(); });

[
    'showRearCG', 'showNeutralLine', 'showTowerClearance', 'includeRearWeightDiscsInExport',
    'showRearWeights', 'showFineTrimScrew', 'showVerticalPivot', 'showTotalCOM', 'showRearCOM',
    'showCounterweightCOM', 'showCartridgeCOM', 'showInertiaAxes', 'showMeasureLines', 'showLpTopPlane', 'stylusLockedToLP'
].forEach(id => {
    bindIfExists(id, 'change', e => { state[id] = e.target.checked; updateState(); });
});

bindIfExists('exportModelBtn', 'click', exportSelectedGeometry);
bindIfExists('export3dPngBtn', 'click', () => {
    if (typeof download3dPng800x600 === 'function') {
        download3dPng800x600();
    }
});

inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        state[id] = sanitizeInputValue(id, parseFloat(el.value), state[id]);
        if (String(el.value) !== String(state[id]) && isNonNegativeMassInput(id)) el.value = state[id];
    }
});

EXTRA_NUMERIC_INPUT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        state[id] = sanitizeInputValue(id, parseFloat(el.value), state[id]);
        if (String(el.value) !== String(state[id]) && isNonNegativeMassInput(id)) el.value = state[id];
    }
});
if (typeof sanitizeMassFieldsOnObject === 'function') sanitizeMassFieldsOnObject(state);

bindCanvasTooltipEvents();
bindCanvasDragEvents();
initPhysicalPanelDrag();
initValidationBannerToggle();
clampPhysicalPanelToViewport();
syncPhysicalPanelButton();
syncComplianceUI();
syncExportUI();
syncRearModeUI();
applyStylusLockUiState();
updateRearNeutralUI();
init3D();
updateState();
