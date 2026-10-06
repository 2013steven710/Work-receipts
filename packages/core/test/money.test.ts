import { describe, expect, it } from "vitest";
import { addMoney, convertMoney, formatMoney, parseMoney } from "../src/money.js";

describe("money", () => {
  it("parses and formats 2-digit currencies", () => {
    const m = parseMoney("64.2", "AUD");
    expect(m.minor).toBe(6420n);
    expect(formatMoney(m)).toBe("64.20");
    expect(formatMoney(parseMoney("-0.05", "AUD"))).toBe("-0.05");
  });

  it("handles 0- and 3-digit currencies", () => {
    expect(parseMoney("1200", "JPY").minor).toBe(1200n);
    expect(formatMoney(parseMoney("1.234", "KWD"))).toBe("1.234");
    expect(() => parseMoney("1.5", "JPY")).toThrow();
  });

  it("rejects bad input", () => {
    expect(() => parseMoney("1.234", "AUD")).toThrow();
    expect(() => parseMoney("abc", "AUD")).toThrow();
    expect(() => parseMoney("1", "aud")).toThrow();
    expect(() => addMoney(parseMoney("1", "AUD"), parseMoney("1", "USD"))).toThrow();
  });

  it("converts with decimal-string rates and half-up rounding", () => {
    // concept section 4 example: SGD 310.00 at 1.1523 = AUD 357.21 (357.213)
    expect(formatMoney(convertMoney(parseMoney("310.00", "SGD"), "1.1523", "AUD"))).toBe("357.21");
    expect(formatMoney(convertMoney(parseMoney("0.01", "USD"), "0.5", "AUD"))).toBe("0.01");
    expect(formatMoney(convertMoney(parseMoney("1000", "JPY"), "0.0102", "AUD"))).toBe("10.20");
    expect(formatMoney(convertMoney(parseMoney("10.00", "AUD"), "98.5", "JPY"))).toBe("985");
  });
});
