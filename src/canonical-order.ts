/**
 * Compares strings using locale-independent ECMAScript UTF-16 code-unit order.
 *
 * Canonical transaction identifiers and metadata keys use a validated ASCII
 * alphabet, so this ordering is byte-for-byte equivalent to PostgreSQL
 * `COLLATE "C"` for those fields.
 */
export function compareUnicodeCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
