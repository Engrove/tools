/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F lt-mechanism-modal.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * js/lt-mechanism-modal.js
 * TD028 Engrove LT mechanism prototype integration.
 *
 * Scope:
 * - preview-only LT Mechanism modal
 * - no core geometry/render2d/render3d/exporter/session-schema writes
 * - Option C / hybrid top-view model from the working HTML prototype is the
 *   authoritative source for drawing, animation and live readouts
 */
(function() {
    'use strict';

    const LP1 = Object.freeze({ x: 300.0, y: 300.0 });
    const P1 = Object.freeze({ x: 542.5, y: 413.8 });
    const L12 = 42.3;
    const L2N = 237.1;
    const DEFAULT_L23 = 50.0;

    const KEYFRAMES = Object.freeze([
        Object.freeze({ f: 0.00, theta: 105.1, phi: 77.0 }),
        Object.freeze({ f: 0.25, theta: 119.5, phi: 66.8 }),
        Object.freeze({ f: 0.50, theta: 132.4, phi: 58.3 }),
        Object.freeze({ f: 0.75, theta: 143.2, phi: 51.5 }),
        Object.freeze({ f: 1.00, theta: 152.4, phi: 46.4 })
    ]);

    const STATOR_SRC = Object.freeze({
        p0: Object.freeze({ x: 581.5, y: 456.4 }),
        ctrl: Object.freeze({ x: 563.1, y: 454.3 }),
        p1: Object.freeze({ x: 552.3, y: 449.5 })
    });

    const GROOVE = Object.freeze({ outer: 146, mid: 103, inner: 60 });

    const state = {
        frame: 0,
        playing: false,
        direction: 1,
        durationSec: 12,
        speed: 1.0,
        L23: DEFAULT_L23,
        showHelpers: true,
        showLabels: true,
        showGhost: true,
        showSpin: true,
        showLocus: true,
        lastFrameTimeMs: null,
        rafId: null,
        p3LocusPts: [],
        n1LocusPts: []
    };

    function $(id) {
        return document.getElementById(id);
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function deg(d) {
        return d * Math.PI / 180.0;
    }

    function rad(r) {
        return r * 180.0 / Math.PI;
    }

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    }

    function fmt(value, digits) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(digits == null ? 2 : digits) : 'n/a';
    }

    function pointText(pt, digits) {
        return '(' + fmt(pt.x, digits == null ? 2 : digits) + ', ' + fmt(pt.y, digits == null ? 2 : digits) + ')';
    }

    function easeInOut(t) {
        return t * t * (3 - 2 * t);
    }

    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    function interpAngles(frame) {
        const ks = KEYFRAMES;
        if (frame <= ks[0].f) return { theta: ks[0].theta, phi: ks[0].phi };
        if (frame >= ks[ks.length - 1].f) return { theta: ks[ks.length - 1].theta, phi: ks[ks.length - 1].phi };

        let i = 0;
        while (i < ks.length - 1 && ks[i + 1].f < frame) i++;

        const k0 = ks[Math.max(0, i - 1)];
        const k1 = ks[i];
        const k2 = ks[i + 1];
        const k3 = ks[Math.min(ks.length - 1, i + 2)];
        const t = (frame - k1.f) / (k2.f - k1.f);

        return {
            theta: catmullRom(k0.theta, k1.theta, k2.theta, k3.theta, t),
            phi: catmullRom(k0.phi, k1.phi, k2.phi, k3.phi, t)
        };
    }

    function worldGeom(theta, phi, l23) {
        const th = deg(theta);
        const ph = deg(phi);
        const p2 = {
            x: P1.x + L12 * Math.cos(th),
            y: P1.y + L12 * Math.sin(th)
        };
        const totalAngle = th + ph;
        const n1 = {
            x: p2.x + L2N * Math.cos(totalAngle),
            y: p2.y + L2N * Math.sin(totalAngle)
        };
        const p3 = {
            x: p2.x - l23 * Math.cos(totalAngle),
            y: p2.y - l23 * Math.sin(totalAngle)
        };
        return { p2, n1, p3, totalAngleDeg: theta + phi };
    }

    function tangencyErrorDeg(p2, n1) {
        const rv = { x: n1.x - LP1.x, y: n1.y - LP1.y };
        const av = { x: n1.x - p2.x, y: n1.y - p2.y };
        const rmag = Math.hypot(rv.x, rv.y);
        const amag = Math.hypot(av.x, av.y);
        if (rmag < 1e-9 || amag < 1e-9) return 0;
        const cosA = Math.max(-1, Math.min(1, (rv.x * av.x + rv.y * av.y) / (rmag * amag)));
        return Math.abs(90 - rad(Math.acos(cosA)));
    }

    function bezierAt(b, t) {
        const u = 1 - t;
        return {
            x: u * u * b.p0.x + 2 * u * t * b.ctrl.x + t * t * b.p1.x,
            y: u * u * b.p0.y + 2 * u * t * b.ctrl.y + t * t * b.p1.y
        };
    }

    function distPointToBezier(pt, b) {
        let minD = Infinity;
        for (let i = 0; i <= 100; i++) {
            const bp = bezierAt(b, i / 100);
            const d = Math.hypot(pt.x - bp.x, pt.y - bp.y);
            if (d < minD) minD = d;
        }
        return minD;
    }

    function distPointToPolyline(pt, pts) {
        if (!pts || pts.length < 2) return 0;
        let minD = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const apx = pt.x - a.x;
            const apy = pt.y - a.y;
            const ab2 = abx * abx + aby * aby;
            const t = ab2 < 1e-9 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
            const cx = a.x + t * abx;
            const cy = a.y + t * aby;
            const d = Math.hypot(pt.x - cx, pt.y - cy);
            if (d < minD) minD = d;
        }
        return minD;
    }

    function pathFromPoints(pts) {
        if (!pts || !pts.length) return '';
        let d = 'M ' + pts[0].x.toFixed(3) + ' ' + pts[0].y.toFixed(3);
        for (let i = 1; i < pts.length; i++) {
            d += ' L ' + pts[i].x.toFixed(3) + ' ' + pts[i].y.toFixed(3);
        }
        return d;
    }

    function frameGeom(frame) {
        const a = interpAngles(frame);
        const g = worldGeom(a.theta, a.phi, state.L23);
        const r = Math.hypot(g.n1.x - LP1.x, g.n1.y - LP1.y);
        const tang = tangencyErrorDeg(g.p2, g.n1);
        return {
            frame,
            theta: a.theta,
            phi: a.phi,
            p2: g.p2,
            n1: g.n1,
            p3: g.p3,
            totalAngleDeg: g.totalAngleDeg,
            radius: r,
            tangencyErrorDeg: tang,
            p3GapToLocus: distPointToPolyline(g.p3, state.p3LocusPts),
            p3GapToSource: distPointToBezier(g.p3, STATOR_SRC)
        };
    }

    function renderPrototypeSVG() {
        return String.raw`
<svg id="ltProtoMech" class="lt-proto-mech-svg" viewBox="0 0 850 650" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
     data-mechanism-model="Option C / hybrid" data-core-mesh-affected="no">
  <defs>
    <radialGradient id="ltProtoBg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#12161f"/>
      <stop offset="100%" stop-color="#06080a"/>
    </radialGradient>
    <radialGradient id="ltProtoVinyl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0a0b0c"/>
      <stop offset="40%" stop-color="#16181b"/>
      <stop offset="80%" stop-color="#0a0b0c"/>
      <stop offset="100%" stop-color="#1c1f24"/>
    </radialGradient>
    <linearGradient id="ltProtoArmwand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#b0b8c2"/>
      <stop offset="100%" stop-color="#6a7585"/>
    </linearGradient>
    <style>
      #ltProtoMech .label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; pointer-events: none; user-select: none; }
      #ltProtoMech .grid-line { stroke: #00ffcc; stroke-opacity: 0.08; stroke-dasharray: 2 2; }
      #ltProtoMech .laser-pulse { stroke-dasharray: 6 6; animation: ltProtoLaserPulse 1s linear infinite; }
      @keyframes ltProtoLaserPulse { to { stroke-dashoffset: -12; } }
      #ltProtoMech .record-spin { transform-origin: 300px 300px; transform-box: view-box; animation: ltProtoRecordSpin 6s linear infinite; }
      @keyframes ltProtoRecordSpin { to { transform: rotate(360deg); } }
      #ltProtoMech .hidden { display: none; }
    </style>
  </defs>

  <rect width="100%" height="100%" fill="url(#ltProtoBg)"/>

  <g id="g-grid">
    <line x1="300" y1="0" x2="300" y2="650" class="grid-line"/>
    <line x1="0" y1="300" x2="850" y2="300" class="grid-line"/>
    <g id="g-groove-helpers">
      <circle cx="300" cy="300" r="146" fill="none" stroke="#2a3a3a" stroke-width="0.5" stroke-dasharray="3 4"/>
      <circle cx="300" cy="300" r="103" fill="none" stroke="#2a3a3a" stroke-width="0.5" stroke-dasharray="3 4"/>
      <circle cx="300" cy="300" r="60" fill="none" stroke="#2a3a3a" stroke-width="0.5" stroke-dasharray="3 4"/>
    </g>
  </g>

  <g id="g-lp1-fixed">
    <circle cx="300" cy="300" r="155.75" fill="#111317" stroke="#2a2e36" stroke-width="2"/>
  </g>

  <g id="g-record" class="record-spin">
    <circle cx="300" cy="300" r="146" fill="url(#ltProtoVinyl)"/>
    <circle cx="300" cy="300" r="146" fill="none" stroke="#222" stroke-width="1"/>
    <circle cx="300" cy="300" r="103" fill="none" stroke="#1c1c1c" stroke-width="1"/>
    <circle cx="300" cy="300" r="60" fill="none" stroke="#222" stroke-width="1"/>
    <circle cx="300" cy="300" r="53.2" fill="#80152b"/>
    <circle cx="300" cy="300" r="48" fill="none" stroke="#a31a37" stroke-width="1"/>
    <text x="300" y="295" fill="#fff" font-size="8" text-anchor="middle" letter-spacing="2" class="label">ENGROVE</text>
    <line x1="300" y1="160" x2="300" y2="170" stroke="#a31a37" stroke-width="1.5"/>
  </g>

  <g id="g-lp1-marker">
    <circle cx="300" cy="300" r="4" fill="#00ffcc" stroke="#fff" stroke-width="1"/>
    <circle cx="300" cy="300" r="1" fill="#fff"/>
    <text x="270" y="285" fill="#00ffcc" font-size="11" font-weight="bold" class="label lbl">LP1</text>
  </g>

  <g id="g-stator-source">
    <path d="M 581.5 456.4 Q 563.1 454.3 552.3 449.5" fill="none" stroke="#5a4a52" stroke-width="14" stroke-linecap="round" opacity="0.55"/>
    <path d="M 581.5 456.4 Q 563.1 454.3 552.3 449.5" fill="none" stroke="#9a5560" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.7"/>
    <text x="595" y="483" fill="#9a5560" font-size="9" class="label lbl">STATOR_TRACK (source-SVG ghost)</text>
  </g>

  <g id="g-stator-locus">
    <path id="stator-locus-fill" d="" fill="none" stroke="#0a0c11" stroke-width="16" stroke-linecap="round"/>
    <path id="stator-locus-line" d="" fill="none" stroke="#ff3366" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round"/>
    <text x="595" y="500" fill="#ff3366" font-size="9" class="label lbl">FB / STATOR_TRACK (P3 locus-derived)</text>
  </g>

  <g id="g-p1" transform="translate(542.5, 413.8)">
    <circle r="8" fill="#0c2a58" stroke="#00ff38" stroke-width="2"/>
    <circle r="3" fill="#00ff38"/>
    <text x="14" y="-10" fill="#00ff38" font-size="11" font-weight="bold" class="label lbl">P1</text>
    <text x="14" y="3" fill="#5a8a6a" font-size="9" class="label lbl">fixed</text>
  </g>

  <g id="g-swing" transform="translate(542.5,413.8) rotate(105.1)">
    <rect x="0" y="-4" width="42.3" height="8" rx="2" fill="#1c2230" stroke="#3a4255" stroke-width="1"/>
    <text x="21" y="-7" fill="#6bb6ff" font-size="8" text-anchor="middle" class="label lbl">L12</text>

    <g id="g-p2-assembly" transform="translate(42.3, 0)">
      <circle r="14" fill="#101923" stroke="#1aa7ff" stroke-width="1.5" opacity="0.6"/>
      <circle r="9" fill="#0a0a0a" stroke="#ffcc00" stroke-width="1.5"/>
      <circle r="2.5" fill="#ffcc00"/>
      <text x="-12" y="22" fill="#ffcc00" font-size="10" font-weight="bold" class="label lbl">P2</text>
      <text x="-30" y="34" fill="#7a8a99" font-size="8" class="label lbl">P2H/P2V coaxial (top-view)</text>

      <g id="g-tonearm" transform="rotate(77.0)" data-p3-placement="local-minus-L23" data-top-view-p3-rotates-with="theta-plus-phi">
        <rect x="0" y="-2.5" width="237.1" height="5" fill="url(#ltProtoArmwand)"/>
        <rect x="0" y="-2.5" width="237.1" height="5" fill="none" stroke="#fff" stroke-width="0.5" opacity="0.3"/>
        <rect x="220" y="-7" width="18" height="14" fill="#111" stroke="#666" stroke-width="0.8"/>
        <circle cx="237.1" cy="0" r="3.5" fill="#00ffcc" stroke="#fff" stroke-width="0.8"/>
        <g class="helpers">
          <path d="M 222.1,0 L 222.1,15 L 237.1,15" fill="none" stroke="#00ffcc" stroke-width="1" opacity="0.7"/>
        </g>
        <text id="n1-label" x="245" y="-8" fill="#00ffcc" font-size="10" font-weight="bold" transform="rotate(0)" class="label lbl">N1</text>
        <g class="helpers">
          <line class="laser-pulse" x1="237.1" y1="0" x2="237.1" y2="320" stroke="#00ffcc" stroke-width="1.2" opacity="0.6"/>
        </g>

        <g id="g-magplatform">
          <line id="lt-p3-link-main" x1="0" y1="0" x2="-50.0" y2="0" stroke="#ff9f1a" stroke-width="5" stroke-linecap="round"/>
          <line id="lt-p3-link-highlight" x1="0" y1="0" x2="-50.0" y2="0" stroke="#ffe0a3" stroke-width="1.5" stroke-linecap="round"/>
          <text id="lt-l23-label" x="-25" y="-7" fill="#ff9f1a" font-size="8" text-anchor="middle" class="label lbl">L23 (mag.platform 25)</text>
          <g id="g-p3" data-local-position="-L23,0">
            <circle id="lt-p3-circle" cx="-50" cy="0" r="6" fill="#ff3366" stroke="#fff" stroke-width="2"/>
            <circle id="lt-p3-dot" cx="-50" cy="0" r="2" fill="#fff"/>
            <text id="p3-label" x="-58" y="-8" fill="#ff3366" font-size="10" font-weight="bold" text-anchor="end" class="label lbl">P3</text>
          </g>
        </g>
      </g>
    </g>
  </g>

  <path id="n1-locus" d="" fill="none" stroke="#445566" stroke-width="0.8" stroke-dasharray="2 3"/>

  <g id="hud" transform="translate(595, 18)">
    <rect x="0" y="0" width="240" height="268" rx="4" fill="#0a0c11" stroke="#2a2e36" stroke-width="1.5" opacity="0.96"/>
    <text x="12" y="20" fill="#fff" font-weight="bold" font-size="11" letter-spacing="1.5" class="label">LIVE TELEMETRY</text>
    <text x="155" y="20" fill="#7a8a99" font-size="9" class="label">computed/frame</text>
    <line x1="12" y1="28" x2="228" y2="28" stroke="#2a2e36"/>

    <text x="12" y="46" fill="#7a8a99" font-size="10" class="label">frame</text>
    <text id="hud-frame" x="228" y="46" fill="#fff" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">0.000</text>

    <text x="12" y="64" fill="#7a8a99" font-size="10" class="label">r at N1 (mm)</text>
    <text id="hud-radius" x="228" y="64" fill="#00ffcc" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">146.05</text>
    <rect x="12" y="70" width="216" height="4" fill="#1a1f28"/>
    <rect id="hud-radius-bar" x="12" y="70" width="216" height="4" fill="#00ffcc"/>

    <text x="12" y="94" fill="#7a8a99" font-size="10" class="label">θ link arm (deg)</text>
    <text id="hud-theta" x="228" y="94" fill="#fff" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">105.10</text>
    <rect x="12" y="100" width="216" height="3" fill="#1a1f28"/>
    <rect id="hud-theta-bar" x="12" y="100" width="0" height="3" fill="#ffcc00"/>

    <text x="12" y="120" fill="#7a8a99" font-size="10" class="label">φ tonearm (deg)</text>
    <text id="hud-phi" x="228" y="120" fill="#fff" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">77.00</text>
    <rect x="12" y="126" width="216" height="3" fill="#1a1f28"/>
    <rect id="hud-phi-bar" x="12" y="126" width="216" height="3" fill="#ffcc00"/>

    <text x="12" y="148" fill="#7a8a99" font-size="10" class="label">tangency err |90°−∠| (deg)</text>
    <text id="hud-tang" x="180" y="148" fill="#00ff38" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">0.0425</text>
    <text x="228" y="148" fill="#7a8a99" font-size="9" text-anchor="end" class="label">live</text>
    <rect x="12" y="154" width="216" height="3" fill="#1a1f28"/>
    <rect id="hud-tang-bar" x="12" y="154" width="3" height="3" fill="#00ff38"/>

    <text x="12" y="176" fill="#7a8a99" font-size="10" class="label">P3 → locus path (px)</text>
    <text id="hud-p3-locus" x="228" y="176" fill="#fff" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">0.00</text>

    <text x="12" y="194" fill="#7a8a99" font-size="10" class="label">P3 → source-SVG path (px)</text>
    <text id="hud-p3-src" x="228" y="194" fill="#ff3366" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">0.00</text>

    <text x="12" y="212" fill="#7a8a99" font-size="10" class="label">L23 P2→P3 (mm)</text>
    <text id="hud-l23" x="228" y="212" fill="#ff9f1a" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums" class="label">50.0</text>

    <line x1="12" y1="226" x2="228" y2="226" stroke="#2a2e36"/>
    <text x="12" y="240" fill="#7a8a99" font-size="9" class="label">mechanism prototype preview</text>
    <text x="12" y="254" fill="#7a8a99" font-size="9" class="label">core mesh affected: no</text>
  </g>
</svg>`;
    }

    function ensureSvg() {
        const host = $('ltMechanismSvgHost');
        if (!host) return false;
        if (!host.querySelector('#ltProtoMech')) {
            host.innerHTML = renderPrototypeSVG();
            setRecordSpinPaused(true);
            recomputeLocus();
            applyDisplayToggles();
            updateL23Svg();
            applyFrame(state.frame);
        }
        return true;
    }

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = String(value);
    }

    function setAttr(id, name, value) {
        const el = $(id);
        if (el) el.setAttribute(name, String(value));
    }

    function recomputeLocus() {
        const N = 60;
        state.p3LocusPts = [];
        state.n1LocusPts = [];
        for (let i = 0; i <= N; i++) {
            const f = i / N;
            const a = interpAngles(f);
            const g = worldGeom(a.theta, a.phi, state.L23);
            state.p3LocusPts.push(g.p3);
            state.n1LocusPts.push(g.n1);
        }
        setAttr('stator-locus-fill', 'd', pathFromPoints(state.p3LocusPts));
        setAttr('stator-locus-line', 'd', pathFromPoints(state.p3LocusPts));
        setAttr('n1-locus', 'd', pathFromPoints(state.n1LocusPts));
    }

    function updateL23Svg() {
        const l23 = state.L23;
        setAttr('lt-p3-link-main', 'x2', -l23);
        setAttr('lt-p3-link-highlight', 'x2', -l23);
        setAttr('lt-p3-circle', 'cx', -l23);
        setAttr('lt-p3-dot', 'cx', -l23);
        setAttr('lt-l23-label', 'x', -l23 / 2);
        const p3Label = $('p3-label');
        if (p3Label) {
            p3Label.setAttribute('x', String(-l23 - 8));
        }
    }

    function updateValueControls() {
        const slider = $('ltMechFrameSlider');
        if (slider) slider.value = String(state.frame);
        const speed = $('ltMechSpeedSlider');
        if (speed) speed.value = String(state.speed);
        const l23Number = $('ltMechL23Input');
        if (l23Number) l23Number.value = state.L23.toFixed(1);
        const l23Range = $('ltMechL23Range');
        if (l23Range) l23Range.value = String(state.L23);
        setText('ltMechFrameLabel', state.frame.toFixed(3));
        setText('ltMechSpeedLabel', state.speed.toFixed(2) + '×');
        setText('ltMechL23Label', state.L23.toFixed(1) + ' mm');
    }

    function updateDataPanel(fg) {
        const data = $('ltMechanismDataPanel');
        if (!data) return;
        const rows = [
            ['display status', 'working prototype mechanism geometry'],
            ['geometry status', 'live-computed from displayed prototype geometry'],
            ['core mesh affected', 'no'],
            ['kinematic model', 'Option C / hybrid'],
            ['frame', fg.frame.toFixed(3)],
            ['r at N1', fmt(fg.radius, 2) + ' mm'],
            ['theta', fmt(fg.theta, 2) + '°'],
            ['phi', fmt(fg.phi, 2) + '°'],
            ['theta + phi', fmt(fg.totalAngleDeg, 2) + '°'],
            ['tangency error', fmt(fg.tangencyErrorDeg, 4) + '° live'],
            ['P2', pointText(fg.p2, 2)],
            ['N1', pointText(fg.n1, 2)],
            ['P3', pointText(fg.p3, 2)],
            ['P3 placement', 'local (-L23, 0) inside g-tonearm'],
            ['P3 rotation', 'co-rotates with theta + phi'],
            ['P3 → source-SVG path', fmt(fg.p3GapToSource, 3) + ' px'],
            ['P3 → locus path', fmt(fg.p3GapToLocus, 3) + ' px'],
            ['L23', fmt(state.L23, 1) + ' mm'],
            ['STATOR_TRACK', 'stationary; source ghost + P3 locus'],
            ['record spin', 'cosmetic only; does not drive mechanism'],
            ['Auto Fix', 'not part of prototype integration']
        ];

        data.innerHTML =
            '<table class="lt-mechanism-data-table" data-state-source="td028-prototype-live-geometry"><tbody>' +
            rows.map(row => '<tr><th>' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td></tr>').join('') +
            '</tbody></table>';
    }

    function fillValidationTable() {
        const tbody = $('ltMechValidationTbody');
        if (!tbody) return;
        let maxTang = 0;
        let maxGap = 0;
        tbody.innerHTML = '';
        KEYFRAMES.forEach(k => {
            const g = worldGeom(k.theta, k.phi, state.L23);
            const r = Math.hypot(g.n1.x - LP1.x, g.n1.y - LP1.y);
            const err = tangencyErrorDeg(g.p2, g.n1);
            const gap = distPointToBezier(g.p3, STATOR_SRC);
            maxTang = Math.max(maxTang, err);
            maxGap = Math.max(maxGap, gap);
            const tr = document.createElement('tr');
            const gapClass = gap <= 1.2 ? 'ok' : (gap < 30 ? 'warn' : 'bad');
            const tangClass = err < 0.5 ? 'ok' : 'bad';
            tr.innerHTML =
                '<td>' + k.f.toFixed(2) + '</td>' +
                '<td>' + k.theta.toFixed(2) + '</td>' +
                '<td>' + k.phi.toFixed(2) + '</td>' +
                '<td>' + r.toFixed(3) + '</td>' +
                '<td><span class="lt-badge ' + tangClass + '">' + err.toFixed(4) + '</span></td>' +
                '<td>' + g.p3.x.toFixed(2) + '</td>' +
                '<td>' + g.p3.y.toFixed(2) + '</td>' +
                '<td><span class="lt-badge ' + gapClass + '">' + gap.toFixed(2) + '</span></td>';
            tbody.appendChild(tr);
        });
        setText('ltMechValidationSummary', 'keyframe max tangency ' + maxTang.toFixed(4) + '° · max P3/source gap ' + maxGap.toFixed(2) + ' px');
    }

    function applyFrame(frame) {
        state.frame = clamp(frame, 0, 1);
        const fg = frameGeom(state.frame);

        setAttr('g-swing', 'transform', 'translate(' + P1.x + ',' + P1.y + ') rotate(' + fg.theta.toFixed(4) + ')');
        setAttr('g-tonearm', 'transform', 'rotate(' + fg.phi.toFixed(4) + ')');

        setAttr('n1-label', 'transform', 'rotate(' + (-fg.totalAngleDeg).toFixed(2) + ' 245 -8)');
        const p3Label = $('p3-label');
        if (p3Label) {
            const x = -state.L23 - 8;
            p3Label.setAttribute('x', String(x));
            p3Label.setAttribute('transform', 'rotate(' + (-fg.totalAngleDeg).toFixed(2) + ' ' + x + ' -8)');
        }

        setText('hud-frame', state.frame.toFixed(3));
        setText('hud-radius', fg.radius.toFixed(2));
        setText('hud-theta', fg.theta.toFixed(2));
        setText('hud-phi', fg.phi.toFixed(2));
        setText('hud-tang', fg.tangencyErrorDeg.toFixed(4));
        setText('hud-p3-locus', fg.p3GapToLocus.toFixed(3));
        setText('hud-p3-src', fg.p3GapToSource.toFixed(3));
        setText('hud-l23', state.L23.toFixed(1));

        const bar = frac => Math.max(0, Math.min(216, 216 * frac));
        const rFrac = (fg.radius - GROOVE.inner) / (GROOVE.outer - GROOVE.inner);
        setAttr('hud-radius-bar', 'width', bar(rFrac));
        setAttr('hud-theta-bar', 'width', bar((fg.theta - 105.1) / (152.4 - 105.1)));
        setAttr('hud-phi-bar', 'width', bar((fg.phi - 46.4) / (77.0 - 46.4)));
        setAttr('hud-tang-bar', 'width', bar(fg.tangencyErrorDeg / 0.5));
        setAttr('hud-tang-bar', 'fill', fg.tangencyErrorDeg < 0.5 ? '#00ff38' : '#ff5c5c');

        updateValueControls();
        updateDataPanel(fg);
    }

    function applyDisplayToggles() {
        const svg = $('ltProtoMech');
        if (!svg) return;
        svg.querySelectorAll('.helpers').forEach(el => el.classList.toggle('hidden', !state.showHelpers));
        svg.querySelectorAll('.lbl').forEach(el => el.classList.toggle('hidden', !state.showLabels));
        const ghost = $('g-stator-source');
        if (ghost) ghost.classList.toggle('hidden', !state.showGhost);
        const locus = $('n1-locus');
        if (locus) locus.classList.toggle('hidden', !state.showLocus);
        const record = $('g-record');
        if (record) {
            record.style.animation = state.showSpin ? 'ltProtoRecordSpin 6s linear infinite' : 'none';
            record.style.animationPlayState = (state.playing && state.showSpin) ? 'running' : 'paused';
        }

        const cbs = [
            ['ltMechShowHelpers', state.showHelpers],
            ['ltMechShowLabels', state.showLabels],
            ['ltMechShowGhost', state.showGhost],
            ['ltMechShowSpin', state.showSpin],
            ['ltMechShowLocus', state.showLocus]
        ];
        cbs.forEach(pair => {
            const el = $(pair[0]);
            if (el) el.checked = !!pair[1];
        });
    }

    function setRecordSpinPaused(resetToZero) {
        const record = $('g-record');
        if (!record) return;
        if (resetToZero) {
            record.style.animation = 'none';
            record.style.transform = 'rotate(0deg)';
            // Force style application before restoring the paused animation.
            if (typeof record.getBoundingClientRect === 'function') record.getBoundingClientRect();
            record.style.animation = state.showSpin ? 'ltProtoRecordSpin 6s linear infinite' : 'none';
            record.style.transform = '';
        }
        record.style.animationPlayState = 'paused';
    }

    function render() {
        if (!state.open) return;
        ensureSvg();
        recomputeLocus();
        updateL23Svg();
        fillValidationTable();
        applyDisplayToggles();
        applyFrame(state.frame);
        updatePlayPauseButtons();
    }

    function openModal() {
        const backdrop = $('ltMechanismModalBackdrop');
        if (!backdrop) return;
        state.open = true;
        backdrop.hidden = false;
        backdrop.setAttribute('aria-hidden', 'false');
        document.body.classList.add('lt-mechanism-modal-open');
        render();
    }

    function closeModal() {
        pause();
        const backdrop = $('ltMechanismModalBackdrop');
        if (!backdrop) return;
        state.open = false;
        backdrop.hidden = true;
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('lt-mechanism-modal-open');
    }

    function play() {
        ensureSvg();
        if (state.playing) return;
        state.playing = true;
        state.lastFrameTimeMs = null;
        const record = $('g-record');
        if (record) record.style.animationPlayState = state.showSpin ? 'running' : 'paused';
        updatePlayPauseButtons();
        state.rafId = requestAnimationFrame(tick);
    }

    function pause() {
        state.playing = false;
        if (state.rafId) cancelAnimationFrame(state.rafId);
        state.rafId = null;
        setRecordSpinPaused(false);
        updatePlayPauseButtons();
    }

    function reset() {
        pause();
        state.frame = 0;
        state.direction = 1;
        state.speed = 1.0;
        state.L23 = DEFAULT_L23;
        state.showHelpers = true;
        state.showLabels = true;
        state.showGhost = true;
        state.showSpin = true;
        state.showLocus = true;
        state.lastFrameTimeMs = null;
        ensureSvg();
        recomputeLocus();
        updateL23Svg();
        fillValidationTable();
        applyDisplayToggles();
        setRecordSpinPaused(true);
        applyFrame(0);
        updatePlayPauseButtons();
    }

    function step(delta) {
        pause();
        ensureSvg();
        applyFrame(clamp(state.frame + delta, 0, 1));
    }

    function setL23(value) {
        state.L23 = clamp(value, 10, 200);
        ensureSvg();
        updateL23Svg();
        recomputeLocus();
        fillValidationTable();
        applyFrame(state.frame);
    }

    function updatePlayPauseButtons() {
        const playBtn = $('ltMechPlayBtn');
        const pauseBtn = $('ltMechPauseBtn');
        if (playBtn) {
            playBtn.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
            playBtn.classList.toggle('is-playing', state.playing);
        }
        if (pauseBtn) {
            pauseBtn.setAttribute('aria-pressed', state.playing ? 'false' : 'true');
        }
    }

    function tick(tMs) {
        if (!state.playing) return;
        if (state.lastFrameTimeMs == null) state.lastFrameTimeMs = tMs;
        const dt = Math.max(0, Math.min(0.05, (tMs - state.lastFrameTimeMs) / 1000.0));
        state.lastFrameTimeMs = tMs;

        const dFrame = (dt * state.speed) / state.durationSec;
        state.frame += state.direction * dFrame;
        if (state.frame >= 1.0) {
            state.frame = 1.0;
            state.direction = -1;
        }
        if (state.frame <= 0.0) {
            state.frame = 0.0;
            state.direction = 1;
        }

        // Kept for parity with the prototype animation function. The displayed
        // model is still driven by the canonical frame and Catmull-Rom angles.
        easeInOut(state.frame);
        applyFrame(state.frame);
        state.rafId = requestAnimationFrame(tick);
    }

    function bindCheckbox(id, key) {
        const el = $(id);
        if (!el) return;
        el.addEventListener('change', () => {
            state[key] = !!el.checked;
            applyDisplayToggles();
        });
    }

    function bindUI() {
        const openBtn = $('ltMechanismOpenBtn');
        if (openBtn) openBtn.addEventListener('click', openModal);

        const closeBtn = $('ltMechanismCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        const backdrop = $('ltMechanismModalBackdrop');
        if (backdrop) {
            backdrop.addEventListener('click', event => {
                if (event.target === backdrop) closeModal();
            });
        }

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.open) closeModal();
        });

        const playBtn = $('ltMechPlayBtn');
        if (playBtn) playBtn.addEventListener('click', play);

        const pauseBtn = $('ltMechPauseBtn');
        if (pauseBtn) pauseBtn.addEventListener('click', pause);

        const resetBtn = $('ltMechResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', reset);

        const backBtn = $('ltMechBackBtn');
        if (backBtn) backBtn.addEventListener('click', () => step(-0.01));

        const fwdBtn = $('ltMechFwdBtn');
        if (fwdBtn) fwdBtn.addEventListener('click', () => step(0.01));

        const frame = $('ltMechFrameSlider');
        if (frame) {
            frame.addEventListener('input', () => {
                pause();
                ensureSvg();
                applyFrame(clamp(frame.value, 0, 1));
            });
        }

        const speed = $('ltMechSpeedSlider');
        if (speed) {
            speed.addEventListener('input', () => {
                state.speed = clamp(speed.value, 0.25, 4);
                updateValueControls();
            });
        }

        const l23Input = $('ltMechL23Input');
        if (l23Input) {
            l23Input.addEventListener('input', () => setL23(l23Input.value));
        }

        const l23Range = $('ltMechL23Range');
        if (l23Range) {
            l23Range.addEventListener('input', () => setL23(l23Range.value));
        }

        bindCheckbox('ltMechShowHelpers', 'showHelpers');
        bindCheckbox('ltMechShowLabels', 'showLabels');
        bindCheckbox('ltMechShowGhost', 'showGhost');
        bindCheckbox('ltMechShowSpin', 'showSpin');
        bindCheckbox('ltMechShowLocus', 'showLocus');

        updateValueControls();
    }

    window.LTMechanismModal = Object.freeze({
        open: openModal,
        close: closeModal,
        render,
        play,
        pause,
        reset,
        stepFrame: step,
        setL23,
        getState: function() {
            const fg = frameGeom(state.frame);
            return {
                open: !!state.open,
                playing: !!state.playing,
                frame: state.frame,
                speed: state.speed,
                L23: state.L23,
                model: 'Option C / hybrid',
                previewOnly: true,
                coreMeshAffected: false,
                sourceSvgStatorTrackStationary: true,
                p3Placement: 'g-tonearm local (-L23, 0)',
                p3RotatesWith: 'theta + phi',
                current: {
                    theta: fg.theta,
                    phi: fg.phi,
                    tangencyErrorDeg: fg.tangencyErrorDeg,
                    p3GapToSource: fg.p3GapToSource,
                    p3GapToLocus: fg.p3GapToLocus
                },
                keyframes: KEYFRAMES.map(k => ({ f: k.f, theta: k.theta, phi: k.phi }))
            };
        },
        _test: Object.freeze({
            LP1,
            P1,
            L12,
            L2N,
            KEYFRAMES,
            interpAngles,
            worldGeom: function(theta, phi, l23) { return worldGeom(theta, phi, l23 == null ? state.L23 : l23); },
            tangencyErrorDeg,
            distPointToBezier
        })
    });
    window.refreshLTMechanismModal = render;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUI);
    } else {
        bindUI();
    }
})();
