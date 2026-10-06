import { describe, expect, it } from "vitest";
import { countryDefaults } from "../src/regions.js";

describe("countryDefaults", () => {
  it("maps launch countries to their own tax pack and region", () => {
    expect(countryDefaults("AU")).toMatchObject({ taxPack: "au", hostingRegion: "au", homeCurrency: "AUD" });
    expect(countryDefaults("us")).toMatchObject({ taxPack: "us", hostingRegion: "us", dateFormat: "MM/DD/YYYY" });
    expect(countryDefaults("GB")).toMatchObject({ taxPack: "uk", hostingRegion: "uk", homeCurrency: "GBP" });
  });

  it("puts generic countries in the nearest region", () => {
    expect(countryDefaults("NZ", "NZD")).toMatchObject({ taxPack: "generic", hostingRegion: "au" });
    expect(countryDefaults("DE", "EUR")).toMatchObject({ taxPack: "generic", hostingRegion: "uk" });
    expect(() => countryDefaults("NZ")).toThrow();
  });
});
