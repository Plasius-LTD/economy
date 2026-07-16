import { compareUnicodeCodeUnits } from "./canonical-order.js";
import { economyAssert } from "./errors.js";

export const ECONOMY_CONTRACT_VERSION = "1" as const;
export type EconomyContractVersion = typeof ECONOMY_CONTRACT_VERSION;

export type AccountId = string;
export type AllocationId = string;
export type HouseholdId = string;
export type LotId = string;
export type PostingId = string;
export type ProviderEventId = string;
export type TransactionId = string;
export type WalletId = string;
export type IsoTimestamp = string;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/** Validates opaque pseudonymous domain identifiers. */
export function assertEconomyIdentifier(
  value: string,
  label = "identifier",
): void {
  economyAssert(
    typeof value === "string" && IDENTIFIER.test(value),
    "INVALID_CONTRACT",
    `${label} must be a non-empty opaque identifier`,
  );
}

/** Parses a bounded ISO timestamp and returns milliseconds since epoch. */
export function parseIsoTimestamp(value: IsoTimestamp): number {
  economyAssert(
    typeof value === "string",
    "INVALID_CONTRACT",
    "Timestamp must be an ISO-8601 UTC value",
  );
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/u.exec(
    value,
  );
  economyAssert(
    match !== null,
    "INVALID_CONTRACT",
    "Timestamp must be an ISO-8601 UTC value",
  );
  const milliseconds = Date.parse(value);
  const base = match[1];
  const fraction = match[2] ?? "000";
  economyAssert(
    Number.isFinite(milliseconds) &&
      base !== undefined &&
      new Date(milliseconds).toISOString() === `${base}.${fraction}Z`,
    "INVALID_CONTRACT",
    "Timestamp must be valid",
  );
  return milliseconds;
}

/** Returns a new record with keys sorted by locale-independent code units. */
export function sortStringRecord(
  value: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      compareUnicodeCodeUnits(left, right),
    ),
  );
}
