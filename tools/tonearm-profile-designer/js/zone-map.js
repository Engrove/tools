/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F zone-map.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * Static semantic zone map for the AI Modal v1.
 *
 * This file intentionally does not change the TonearmDesigner session schema,
 * global state model, geometry or render pipeline. It only provides stable
 * user/AI vocabulary for prompt construction and clickable SVG tags.
 */
(function() {
    const COMMON_ZONES = [
        {
            tag: '@stylus',
            label: 'Stylus',
            description: 'Stylus tip / nominal tracing point.',
            svg: { shape: 'circle', cx: 64, cy: 128, r: 10 }
        },
        {
            tag: '@cartridge',
            label: 'Cartridge',
            description: 'Cartridge body and mounting envelope.',
            svg: { shape: 'rect', x: 76, y: 102, w: 58, h: 52 }
        },
        {
            tag: '@headshell_pad',
            label: 'Headshell pad',
            description: 'Mounting pad and local front support around cartridge screws.',
            svg: { shape: 'rect', x: 132, y: 94, w: 74, h: 68 }
        },
        {
            tag: '@nose',
            label: 'Nose',
            description: 'Forward transition from stylus/cartridge area into the arm body.',
            svg: { shape: 'path', d: 'M206 128 L248 92 L248 164 Z' }
        },
        {
            tag: '@neck',
            label: 'Neck',
            description: 'Narrow transition section between headshell and main body.',
            svg: { shape: 'rect', x: 248, y: 102, w: 64, h: 52 }
        },
        {
            tag: '@main_body',
            label: 'Main body',
            description: 'Primary structural arm body / monocoque canopy.',
            svg: { shape: 'rect', x: 312, y: 72, w: 150, h: 112 }
        },
        {
            tag: '@apex',
            label: 'Apex',
            description: 'Highest or widest main-body design point.',
            svg: { shape: 'circle', cx: 386, cy: 70, r: 11 }
        },
        {
            tag: '@neutral_line',
            label: 'Neutral line',
            description: 'Longitudinal neutral/stiffness reference line.',
            svg: { shape: 'line', x1: 72, y1: 128, x2: 604, y2: 128 }
        },
        {
            tag: '@pivot_axis',
            label: 'Pivot axis',
            description: 'Vertical pivot axis and pivot-relative coordinate reference.',
            svg: { shape: 'line', x1: 466, y1: 46, x2: 466, y2: 210 }
        },
        {
            tag: '@rear_bend',
            label: 'Rear bend',
            description: 'Rear downward bend and blend region.',
            svg: { shape: 'path', d: 'M462 96 C500 96 526 116 540 154' }
        },
        {
            tag: '@rear_mouth',
            label: 'Rear mouth',
            description: 'Rear opening / mouth section at the tail end.',
            svg: { shape: 'rect', x: 540, y: 134, w: 58, h: 52 }
        },
        {
            tag: '@counterweight_stack',
            label: 'Counterweight stack',
            description: 'Rear counterweight disc stack and its mass distribution.',
            svg: { shape: 'rect', x: 604, y: 112, w: 54, h: 84 }
        },
        {
            tag: '@trim_screw',
            label: 'Trim screw',
            description: 'Fine trim screw / equivalent rear tuning mass.',
            svg: { shape: 'line', x1: 622, y1: 96, x2: 660, y2: 70 }
        }
    ];

    const COBRA_ZONES = [
        {
            tag: '@integrated_headshell',
            label: 'Integrated headshell',
            description: 'One-piece flattened headshell / cartridge end. Cobra target: sleek purposeful front, not a random nose bulb.',
            svg: { shape: 'path', d: 'M58 150 C92 126 142 120 194 130 L222 146 L208 166 C146 170 92 166 58 150 Z' }
        },

        {
            tag: '@neck_transition',
            label: 'Neck transition',
            description: 'Transition from integrated headshell into the long low monocoque armwand; overlay is positioned from current profile x-range.',
            svg: { shape: 'rect', x: 176, y: 124, w: 58, h: 48 }
        },
        {
            tag: '@monocoque_armwand',
            label: 'Monocoque armwand',
            description: 'Long low continuous armwand body; target is sleek monocoque, not worm-like or inflated.',
            svg: { shape: 'path', d: 'M194 130 C266 112 358 118 462 142 L490 158 C384 166 286 164 206 154 Z' }
        },
        {
            tag: '@cobra_canopy',
            label: 'Cobra canopy',
            description: 'Smooth upper canopy curve / disciplined organic arch; reduce excessive mid-body swelling.',
            svg: { shape: 'path', d: 'M220 122 C306 102 410 112 506 146 C410 136 308 134 220 142 Z' }
        },
        {
            tag: '@rear_transition_to_pivot',
            label: 'Rear transition to pivot',
            description: 'Rear armwand transition toward the bearing reference region. It must look mechanically connected, not a decorative detached hook; this is not counterweight guidance.',
            svg: { shape: 'path', d: 'M492 144 C532 150 556 176 550 204 C546 226 526 236 506 226 L508 198 C526 202 536 194 532 178 C528 160 508 154 492 154 Z' }
        },
        {
            tag: '@pivot_bearing_area',
            label: 'Pivot / bearing area',
            description: 'Read-only pivot, tower and bearing reference region. It is not a counterweight mount, not @counterweight_stack guidance, and not LT Mechanism.',
            semanticStatus: 'reference_only',
            canonicalCounterweightGuidance: false,
            svg: { shape: 'circle', cx: 548, cy: 198, r: 14 }
        },
        {
            tag: '@heart_counterweight',
            label: 'Legacy heart reference',
            description: 'Legacy, reference-only, non-canonical heart-shaped styling marker. It is not the active Cobra counterweight and must not replace the rear-terminal disc stack.',
            semanticStatus: 'legacy_reference_only_non_canonical',
            canonicalCounterweightGuidance: false,
            svg: { shape: 'path', d: 'M570 194 C592 166 632 178 632 216 C632 246 598 272 570 250 C542 272 506 246 506 216 C506 178 548 166 570 194 Z' }
        },
        {
            tag: '@counterweight_underweights',
            label: 'Legacy underside-detail reference',
            description: 'Legacy, reference-only, non-canonical underside-detail marker. It is not the canonical Cobra rear-terminal disc-stack counterweight.',
            semanticStatus: 'legacy_reference_only_non_canonical',
            canonicalCounterweightGuidance: false,
            svg: { shape: 'circle', cx: 570, cy: 246, r: 12 }
        },
        {
            tag: '@fine_tracking_force_screw',
            label: 'Fine rear trim reference',
            description: 'Reference-only fine rear-trim marker. Active Cobra trim is rear-terminal and controlled by rearFineTrim* alongside rearWeightDisc*.',
            semanticStatus: 'reference_only',
            canonicalCounterweightGuidance: false,
            svg: { shape: 'line', x1: 610, y1: 194, x2: 656, y2: 176 }
        },
        {
            tag: '@counterweight_stack',
            label: 'Canonical rear-terminal counterweight stack',
            description: 'Canonical Cobra counterweight: rear-terminal disc stack, top-anchored, growing downward along negative Z, controlled by rearWeightDisc* and rearFineTrim*, mounted from the unified rear terminal structural vector.',
            semanticStatus: 'active_canonical',
            canonicalCounterweightGuidance: true,
            svg: { shape: 'rect', x: 604, y: 112, w: 54, h: 84 }
        }
    ];

    const LT_ZONES = [
        {
            tag: '@P1_primary_pivot',
            label: 'P1 primary pivot',
            description: 'Engrove LT primary pivot point.',
            svg: { shape: 'circle', cx: 110, cy: 224, r: 9 }
        },
        {
            tag: '@P2_secondary_pivot',
            label: 'P2 secondary pivot',
            description: 'Engrove LT secondary/link pivot point.',
            svg: { shape: 'circle', cx: 242, cy: 224, r: 9 }
        },
        {
            tag: '@N1_stylus',
            label: 'N1 stylus',
            description: 'Engrove LT stylus/tracing node.',
            svg: { shape: 'circle', cx: 382, cy: 224, r: 9 }
        },
        {
            tag: '@P3_magnet_mount',
            label: 'P3 magnet mount',
            description: 'Engrove LT magnet mount / magnetic follower point.',
            svg: { shape: 'circle', cx: 520, cy: 224, r: 9 }
        },
        {
            tag: '@STATOR_TRACK',
            label: 'STATOR_TRACK',
            description: 'Engrove LT magnetic stator track reference curve.',
            svg: { shape: 'path', d: 'M96 268 C210 238 358 292 548 252' }
        },
        {
            tag: '@link_arm_P1_P2',
            label: 'Link arm P1-P2',
            description: 'Engrove LT link arm between P1 and P2.',
            svg: { shape: 'line', x1: 110, y1: 224, x2: 242, y2: 224 }
        },
        {
            tag: '@armtube_P2_N1',
            label: 'Armtube P2-N1',
            description: 'Engrove LT arm tube from P2 to N1/stylus node.',
            svg: { shape: 'line', x1: 242, y1: 224, x2: 382, y2: 224 }
        }
    ];

    const ZONE_MAP = Object.freeze({
        version: 1,
        common: COMMON_ZONES,
        lt: LT_ZONES,
        families: Object.freeze({
            classic_pivot: COMMON_ZONES,
            shape_designer: COMMON_ZONES,
            tonearm_3d_form: COMMON_ZONES,
            cobra_tonearm: COBRA_ZONES,
            engrove_lt: COMMON_ZONES.concat(LT_ZONES),
            custom: COMMON_ZONES
        })
    });

    window.ZONE_MAP = ZONE_MAP;
})();
