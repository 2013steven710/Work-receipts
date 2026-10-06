// Profile country (sets tax rules, can change) vs hosting region (fixed at sign-up).
// Build plan section 4, "Region routing".

export const HOSTING_REGIONS = ["au", "us", "uk"] as const;
export type HostingRegion = (typeof HOSTING_REGIONS)[number];

export const TAX_PACKS = ["au", "us", "uk", "generic"] as const;
export type TaxPack = (typeof TAX_PACKS)[number];

export interface CountryDefaults {
  readonly taxPack: TaxPack;
  readonly hostingRegion: HostingRegion;
  readonly homeCurrency: string;
  readonly dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
}

const LAUNCH: Readonly<Record<string, CountryDefaults>> = {
  AU: { taxPack: "au", hostingRegion: "au", homeCurrency: "AUD", dateFormat: "DD/MM/YYYY" },
  US: { taxPack: "us", hostingRegion: "us", homeCurrency: "USD", dateFormat: "MM/DD/YYYY" },
  GB: { taxPack: "uk", hostingRegion: "uk", homeCurrency: "GBP", dateFormat: "DD/MM/YYYY" },
};

// Generic-mode countries are hosted in the nearest launch region, which the app tells the user.
const NEAREST_REGION: Readonly<Record<string, HostingRegion>> = {
  NZ: "au", SG: "au", JP: "au", KR: "au", IN: "au", ID: "au", MY: "au", PH: "au", TH: "au", VN: "au", HK: "au", CN: "au", TW: "au",
  CA: "us", MX: "us", BR: "us", AR: "us", CL: "us", CO: "us", PE: "us",
  IE: "uk", FR: "uk", DE: "uk", NL: "uk", ES: "uk", IT: "uk", PT: "uk", BE: "uk", CH: "uk", AT: "uk",
  SE: "uk", NO: "uk", DK: "uk", FI: "uk", PL: "uk", ZA: "uk", AE: "uk", SA: "uk", IL: "uk", TR: "uk", NG: "uk", KE: "uk",
};

const DATE_FORMAT_MDY = new Set(["US"]);

/** Defaults for a profile country (ISO 3166-1 alpha-2). `homeCurrency` for generic countries is supplied by the caller. */
export function countryDefaults(country: string, homeCurrency?: string): CountryDefaults {
  const code = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Invalid country code: ${country}`);
  const launch = LAUNCH[code];
  if (launch) return launch;
  if (!homeCurrency) throw new Error(`Home currency required for generic-mode country ${code}`);
  return {
    taxPack: "generic",
    hostingRegion: NEAREST_REGION[code] ?? "us",
    homeCurrency,
    dateFormat: DATE_FORMAT_MDY.has(code) ? "MM/DD/YYYY" : "DD/MM/YYYY",
  };
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
