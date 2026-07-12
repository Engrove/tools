/**
 * AI-CODING NOTE:
 * Responsibility: Compose structural package validation with deterministic identity/reference validation.
 * Inputs: Canonical schemas and virtual package fixtures.
 * Outputs: One ordered diagnostic result; no product mutation.
 * Do not: Use as a production package API or bypass either validation layer.
 */
import * as core from './contract-validator-core.mjs';
import { validateIdentityReferences } from './identity-reference-validator.mjs';

export const canonicalJsonBytes = core.canonicalJsonBytes;
export const collectSchemaFields = core.collectSchemaFields;
export const loadSchemas = core.loadSchemas;
export const validateSchemaValue = core.validateSchemaValue;

export function validatePackage(pkg, schemas) {
  const base = core.validatePackage(pkg, schemas);
  const identityErrors = validateIdentityReferences(pkg);
  const errors = [...base.errors, ...identityErrors];
  return { ...base, ok: errors.length === 0, errors };
}
