/**
 * AI-CODING NOTE:
 * Responsibility: Deterministic browser-local construction, validation, hashing, and ZIP serialization of Engrove Trace Project Package v1 exports.
 * Inputs: Explicit stable project/object identities, normalized trace documents, and local asset bytes.
 * Outputs: Contract-shaped virtual packages and deterministic STORE-method ZIP bytes; no network activity or product-state mutation.
 * Safe edits: Preserve canonical JSON, package ordering, path safety, exact hashes/sizes, and fail-closed limits.
 * Do not: Add import behavior, fetch remote assets, weaken the merged v1 contract, or use ambient timestamps during package generation.
 */
(function installEngroveTraceProjectPackage(globalScope) {
  "use strict";

  const