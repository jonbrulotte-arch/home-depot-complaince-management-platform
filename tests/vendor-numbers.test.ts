import { describe, expect, it } from "vitest";
import { normalizeVendorNumber, parseVendorNumbers, programOfVendor, vendorConflicts, vendorProgramMap } from "@/lib/vendor-numbers";

describe("vendor numbers", () => {
  it("keeps digits only, without leading zeros", () => {
    expect(normalizeVendorNumber(" 020632 ")).toBe("20632");
    expect(normalizeVendorNumber("0")).toBe("0");
    expect(normalizeVendorNumber("20632A")).toBeNull();
    expect(normalizeVendorNumber(null)).toBeNull();
  });

  it("parses a typed list, dropping repeats and reporting what isn't a number", () => {
    expect(parseVendorNumbers("20632, 28773\n020632;abc")).toEqual({ numbers: ["20632", "28773"], invalid: ["abc"] });
    expect(parseVendorNumbers(["  ", "41562"])).toEqual({ numbers: ["41562"], invalid: [] });
  });

  it("maps a vendor number to its program and finds numbers already on another program", () => {
    const programs = [
      { code: "US_RDC", name: "US Rapid Deployment Center", vendorNumbers: ["20632"] },
      { code: "US_DFC", name: "US Direct Fulfillment Center", vendorNumbers: ["28773"] },
    ];
    const map = vendorProgramMap(programs);
    expect(programOfVendor(map, "0020632")?.code).toBe("US_RDC");
    expect(programOfVendor(map, "1")).toBeNull();
    expect(vendorConflicts(["28773", "5"], [programs[1]])).toEqual([{ vendor: "28773", program: "US Direct Fulfillment Center" }]);
  });
});
