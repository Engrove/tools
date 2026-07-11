/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F fas16_1b_counterweight_mount_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// Compatibility harness: FAS16.1b was superseded by FAS16.1c after browser export
// showed exact cap-contact created two non-manifold edges. Keep this filename as a
// regression alias so older checklists run the corrected support-bridge acceptance.
require('./fas16_1c_counterweight_support_bridge_acceptance.js');
