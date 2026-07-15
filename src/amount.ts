import { EconomyError, economyAssert } from "./errors.js";

/** Number of indivisible subunits in one public Token. */
export const TOKEN_SUBUNITS_PER_TOKEN = 1_000n;

/** PostgreSQL-compatible signed bigint bounds. */
export const TOKEN_SUBUNITS_MIN = -(2n ** 63n);
export const TOKEN_SUBUNITS_MAX = 2n ** 63n - 1n;

declare const tokenSubunitStringBrand: unique symbol;

/** Canonical base-10 representation used at JSON and persistence boundaries. */
export type TokenSubunitString = string & {
  readonly [tokenSubunitStringBrand]: "TokenSubunitString";
};

const CANONICAL_INTEGER = /^(?:0|-?[1-9][0-9]*)$/u;

function assertInRange(amount: bigint): void {
  economyAssert(
    amount >= TOKEN_SUBUNITS_MIN && amount <= TOKEN_SUBUNITS_MAX,
    "AMOUNT_OUT_OF_RANGE",
    "TokenSubunit amount is outside the signed 64-bit range",
  );
}

/** Parses a canonical base-10 TokenSubunit string without floating point. */
export function parseTokenSubunits(value: string): bigint {
  economyAssert(
    CANONICAL_INTEGER.test(value),
    "INVALID_AMOUNT",
    "TokenSubunit amount must be a canonical base-10 integer string",
  );

  try {
    const amount = BigInt(value);
    assertInRange(amount);
    return amount;
  } catch (error) {
    if (error instanceof EconomyError) {
      throw error;
    }
    throw new EconomyError("INVALID_AMOUNT", "TokenSubunit amount is invalid");
  }
}

/** Serializes a signed 64-bit TokenSubunit amount to canonical base-10. */
export function serializeTokenSubunits(amount: bigint): TokenSubunitString {
  assertInRange(amount);
  return amount.toString(10) as TokenSubunitString;
}

/** Converts an exact whole-Token integer into TokenSubunits. */
export function wholeTokensToSubunits(tokens: bigint): bigint {
  const amount = tokens * TOKEN_SUBUNITS_PER_TOKEN;
  assertInRange(amount);
  return amount;
}

/** Returns true when a subunit amount represents an exact whole Token. */
export function isWholeTokenAmount(amount: bigint): boolean {
  return amount % TOKEN_SUBUNITS_PER_TOKEN === 0n;
}

/** Converts TokenSubunits to whole Tokens, rejecting fractional progress. */
export function subunitsToWholeTokens(amount: bigint): bigint {
  economyAssert(
    isWholeTokenAmount(amount),
    "AMOUNT_NOT_WHOLE_TOKEN",
    "Amount must contain whole Tokens",
  );
  return amount / TOKEN_SUBUNITS_PER_TOKEN;
}

/** Sums amount strings with signed 64-bit overflow protection. */
export function sumTokenSubunits(values: readonly string[]): bigint {
  let total = 0n;
  for (const value of values) {
    total += parseTokenSubunits(value);
    assertInRange(total);
  }
  return total;
}

