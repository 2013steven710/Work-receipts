import { describe, expect, it } from "vitest";
import { countryDefaults, LAUNCH_COUNTRIES, OTHER_COUNTRIES } from "../src/countries.js";

describe("countryDefaults", () => {
  it("gives launch countries their own tax pack", () => {
    expect(countryDefaults("AU")).toEqual({ taxPack: "au", homeCurrency: "AUD", dateFormat: "DD/MM/YYYY" });
    expect(countryDefaults("us")).toMatchObject({ taxPack: "us", dateFormat: "MM/DD/YYYY" });
    expect(countryDefaults("GB")).toMatchObject({ taxPack: "uk", homeCurrency: "GBP" });
  });

  it("puts other countries in generic mode with their currency", () => {
    expect(countryDefaults("NZ", "NZD")).toEqual({ taxPack: "generic", homeCurrency: "NZD", dateFormat: "DD/MM/YYYY" });
    expect(() => countryDefaults("NZ")).toThrow();
    expect(() => countryDefaults("NZL", "NZD")).toThrow();
  });

  it("lists every other country with a valid currency", () => {
    for (const c of [...LAUNCH_COUNTRIES, ...OTHER_COUNTRIES]) expect(c.currency).toMatch(/^[A-Z]{3}$/);
  });
});
