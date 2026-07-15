import { describe, expect, it } from "vitest";
import {
  EconomyError,
  TOKEN_SUBUNITS_MAX,
  isWholeTokenAmount,
  parseTokenSubunits,
  serializeTokenSubunits,
  subunitsToWholeTokens,
  sumTokenSubunits,
  wholeTokensToSubunits,
} from "../src/index.js";

describe("TokenSubunit arithmetic", () => {
  it("round-trips exact signed 64-bit integer strings", () => {
    for (const amount of [0n, 1n, -1n, 999n, 50_000n, TOKEN_SUBUNITS_MAX]) {
      expect(parseTokenSubunits(serializeTokenSubunits(amount))).toBe(amount);
    }
  });

  it.each(["", "01", "-0", "+1", "1.0", "1e3", " 1", "1 "])(
    "rejects non-canonical amount %s",
    (value) => {
      expect(() => parseTokenSubunits(value)).toThrow(EconomyError);
    },
  );

  it("rejects signed 64-bit overflow during parse, serialize, and sum", () => {
    expect(() => parseTokenSubunits("9223372036854775808")).toThrowError(
      expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }),
    );
    expect(() => serializeTokenSubunits(2n ** 63n)).toThrowError(
      expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }),
    );
    expect(() =>
      sumTokenSubunits([serializeTokenSubunits(TOKEN_SUBUNITS_MAX), "1"]),
    ).toThrowError(expect.objectContaining({ code: "AMOUNT_OUT_OF_RANGE" }));
  });

  it("converts only exact whole Tokens", () => {
    expect(wholeTokensToSubunits(50n)).toBe(50_000n);
    expect(isWholeTokenAmount(50_000n)).toBe(true);
    expect(isWholeTokenAmount(50_001n)).toBe(false);
    expect(subunitsToWholeTokens(50_000n)).toBe(50n);
    expect(() => subunitsToWholeTokens(50_001n)).toThrowError(
      expect.objectContaining({ code: "AMOUNT_NOT_WHOLE_TOKEN" }),
    );
  });
});

