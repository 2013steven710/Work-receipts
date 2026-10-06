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
