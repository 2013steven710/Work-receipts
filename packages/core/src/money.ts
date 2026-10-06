// Money is always integer minor units plus an ISO 4217 code (build plan section 5).
// Floats never hold money; FX rates are decimal strings.

export interface Money {
  readonly minor: bigint;
  readonly currency: string;
}

// Currencies whose minor unit is not 2 digits. Everything else uses 2.
const MINOR_DIGITS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};

const CURRENCY_RE = /^[A-Z]{3}$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function minorDigits(currency: string): number {
  assertCurrency(currency);
  return MINOR_DIGITS[currency] ?? 2;
}

function assertCurrency(currency: string): void {
  if (!CURRENCY_RE.test(currency)) throw new Error(`Invalid currency code: ${currency}`);
}

/** Parse a decimal string such as "64.20" into minor units. Rejects excess precision. */
export function parseMoney(amount: string, currency: string): Money {
  const digits = minorDigits(currency);
  const trimmed = amount.trim();
  if (!DECIMAL_RE.test(trimmed)) throw new Error(`Invalid amount: ${amount}`);
  const negative = trimmed.startsWith("-");
  const [whole = "0", frac = ""] = trimmed.replace("-", "").split(".");
  if (frac.length > digits) throw new Error(`Too many decimal places for ${currency}: ${amount}`);
  const minor = BigInt(whole + frac.padEnd(digits, "0"));
  return { minor: negative ? -minor : minor, currency };
}

export function formatMoney(money: Money): string {
  const digits = minorDigits(money.currency);
  const negative = money.minor < 0n;
  const abs = (negative ? -money.minor : money.minor).toString().padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const frac = abs.slice(abs.length - digits);
  return `${negative ? "-" : ""}${whole}${digits > 0 ? `.${frac}` : ""}`;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  return { minor: a.minor + b.minor, currency: a.currency };
}

/**
 * Convert with a decimal-string rate (home units per one unit of `from`),
 * rounding half away from zero to the target currency's minor unit.
 */
export function convertMoney(from: Money, rate: string, to: string): Money {
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new Error(`Invalid FX rate: ${rate}`);
  const [rw = "0", rf = ""] = rate.split(".");
  const rateScaled = BigInt(rw + rf);
  const rateScale = 10n ** BigInt(rf.length);
  const shift = minorDigits(to) - minorDigits(from.currency);
  let numerator = from.minor * rateScaled;
  let denominator = rateScale;
  if (shift >= 0) numerator *= 10n ** BigInt(shift);
  else denominator *= 10n ** BigInt(-shift);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return { minor: negative ? -rounded : rounded, currency: to };
}
