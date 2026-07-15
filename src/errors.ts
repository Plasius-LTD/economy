/** Stable machine-readable failures exposed by the economy domain. */
export type EconomyErrorCode =
  | "INVALID_AMOUNT"
  | "AMOUNT_OUT_OF_RANGE"
  | "AMOUNT_NOT_WHOLE_TOKEN"
  | "INVALID_CONTRACT"
  | "UNBALANCED_TRANSACTION"
  | "DUPLICATE_IDENTIFIER"
  | "DUPLICATE_TRANSACTION"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_ELIGIBLE_LOTS"
  | "SOURCE_LOT_RESTRICTED"
  | "REVERSAL_ALREADY_EXISTS"
  | "NEGATIVE_PROJECTION"
  | "INVALID_TIME_WINDOW";

export interface EconomyErrorEnvelopeV1 {
  readonly schemaVersion: "1";
  readonly error: {
    readonly code: EconomyErrorCode;
    readonly message: string;
    readonly requestId?: string;
  };
}

/**
 * Domain error with a stable code and deliberately non-sensitive message.
 * Provider evidence, identities, and payment details must not be included.
 */
export class EconomyError extends Error {
  readonly code: EconomyErrorCode;

  constructor(code: EconomyErrorCode, message: string) {
    super(message);
    this.name = "EconomyError";
    this.code = code;
  }
}

/** Throws a stable economy error when a domain assertion fails. */
export function economyAssert(
  condition: unknown,
  code: EconomyErrorCode,
  message: string,
): asserts condition {
  if (!condition) {
    throw new EconomyError(code, message);
  }
}

/** Creates a bounded, non-sensitive error contract for an HTTP adapter. */
export function toEconomyErrorEnvelope(
  error: EconomyError,
  requestId?: string,
): EconomyErrorEnvelopeV1 {
  return {
    schemaVersion: "1",
    error: {
      code: error.code,
      message: error.message.slice(0, 256),
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
}
