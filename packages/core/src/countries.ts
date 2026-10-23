// The profile country sets the tax pack, home currency and date format (concept section 0).
// v13: one server for everyone, so there are no hosting regions.

export const TAX_PACKS = ["au", "us", "uk", "generic"] as const;
export type TaxPack = (typeof TAX_PACKS)[number];

export interface CountryDefaults {
  readonly taxPack: TaxPack;
  readonly homeCurrency: string;
  readonly dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
}

const LAUNCH: Readonly<Record<string, CountryDefaults>> = {
  AU: { taxPack: "au", homeCurrency: "AUD", dateFormat: "DD/MM/YYYY" },
  US: { taxPack: "us", homeCurrency: "USD", dateFormat: "MM/DD/YYYY" },
  GB: { taxPack: "uk", homeCurrency: "GBP", dateFormat: "DD/MM/YYYY" },
};

/** Defaults for a profile country (ISO 3166-1 alpha-2). `homeCurrency` for generic countries is supplied by the caller. */
export function countryDefaults(country: string, homeCurrency?: string): CountryDefaults {
  const code = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Invalid country code: ${country}`);
  const launch = LAUNCH[code];
  if (launch) return launch;
  if (!homeCurrency || !/^[A-Z]{3}$/.test(homeCurrency)) throw new Error(`Home currency required for generic-mode country ${code}`);
  return { taxPack: "generic", homeCurrency, dateFormat: "DD/MM/YYYY" };
}

export interface CountryOption {
  readonly code: string;
  readonly name: string;
  readonly currency: string;
}

/** Launch countries first (their own tax packs), then generic-mode countries. */
export const LAUNCH_COUNTRIES: readonly CountryOption[] = [
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
];

export const OTHER_COUNTRIES: readonly CountryOption[] = [
  { code: "AR", name: "Argentina", currency: "ARS" }, { code: "AT", name: "Austria", currency: "EUR" },
  { code: "BE", name: "Belgium", currency: "EUR" }, { code: "BR", name: "Brazil", currency: "BRL" },
  { code: "CA", name: "Canada", currency: "CAD" }, { code: "CL", name: "Chile", currency: "CLP" },
  { code: "CN", name: "China", currency: "CNY" }, { code: "CO", name: "Colombia", currency: "COP" },
  { code: "DK", name: "Denmark", currency: "DKK" }, { code: "FI", name: "Finland", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" }, { code: "DE", name: "Germany", currency: "EUR" },
  { code: "HK", name: "Hong Kong", currency: "HKD" }, { code: "IN", name: "India", currency: "INR" },
  { code: "ID", name: "Indonesia", currency: "IDR" }, { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "IL", name: "Israel", currency: "ILS" }, { code: "IT", name: "Italy", currency: "EUR" },
  { code: "JP", name: "Japan", currency: "JPY" }, { code: "KE", name: "Kenya", currency: "KES" },
  { code: "KR", name: "South Korea", currency: "KRW" }, { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "MX", name: "Mexico", currency: "MXN" }, { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "NZ", name: "New Zealand", currency: "NZD" }, { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "NO", name: "Norway", currency: "NOK" }, { code: "PE", name: "Peru", currency: "PEN" },
  { code: "PH", name: "Philippines", currency: "PHP" }, { code: "PL", name: "Poland", currency: "PLN" },
  { code: "PT", name: "Portugal", currency: "EUR" }, { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "SG", name: "Singapore", currency: "SGD" }, { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "ES", name: "Spain", currency: "EUR" }, { code: "SE", name: "Sweden", currency: "SEK" },
  { code: "CH", name: "Switzerland", currency: "CHF" }, { code: "TW", name: "Taiwan", currency: "TWD" },
  { code: "TH", name: "Thailand", currency: "THB" }, { code: "TR", name: "Türkiye", currency: "TRY" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" }, { code: "VN", name: "Vietnam", currency: "VND" },
];
