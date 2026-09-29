// Error kinds the spec requires commands to tell apart (spec 18.1). A UI
// toast or HTTP 200 is never enough: every failure names one of these.
export const ERROR_KINDS = [
  "validation",
  "permission_denied",
  "license_restricted",
  "stale_version",
  "insufficient_availability",
  "missing_evidence",
  "provider_failure",
  "schema_incompatible",
  // Same command ID sent again with different data (integration contract).
  "idempotency_conflict",
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

export class DomainError extends Error {
  readonly kind: ErrorKind;
  readonly details: Record<string, unknown> | undefined;

  constructor(kind: ErrorKind, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.kind = kind;
    this.details = details;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
