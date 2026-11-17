import { describe, expect, it } from "vitest";
import { cityLine, destinationName, emptySlip, itemsFromCartons, slipFileName, slipSchema, totalUnits } from "@/lib/packing-slip";

describe("itemsFromCartons", () => {
  it("adds units up per product, in first-shipped order, with THD's SKU and description", () => {
    const catalog = new Map([["JS-100", { thdSku: "1001234567", description: "Shelf bracket" }]]);
    const items = itemsFromCartons(
      [
        { product: "JS-200", quantity: 4 },
        { product: "JS-100", quantity: 6 },
        { product: " JS-200 ", quantity: 2 },
        { product: null, quantity: 9 },
        { product: "JS-100", quantity: null },
      ],
      catalog,
    );
    expect(items).toEqual([
      { vendorSku: "JS-200", thdSku: "", description: "", units: 6 },
      { vendorSku: "JS-100", thdSku: "1001234567", description: "Shelf bracket", units: 6 },
    ]);
    expect(totalUnits(items)).toBe(12);
  });
});

describe("destinationName and cityLine", () => {
  it("names the destination by channel", () => {
    expect(destinationName("6007", "THD.COM-DFDC")).toBe("Home Depot DFC #6007");
    expect(destinationName("5023", "THD")).toBe("Home Depot RDC #5023");
    expect(destinationName("XD5640", null)).toBe("Home Depot Crossdock #XD5640");
    expect(destinationName("1234", null)).toBe("Home Depot #1234");
    expect(destinationName(null, "THD")).toBe("");
  });
  it("writes the city line from what is known", () => {
    expect(cityLine("DALLAS", "TX", "75241")).toBe("DALLAS, TX 75241");
    expect(cityLine(null, "TX", null)).toBe("TX");
    expect(cityLine(null, null, null)).toBe("");
  });
});

describe("slipSchema", () => {
  const slip = { ...emptySlip(), poNumber: " 41562087 ", destFacility: " xd5640 ", poDate: "2026-11-02", items: [{ thdSku: " 100 ", vendorSku: "", description: "", units: "3.4" }, { thdSku: "", vendorSku: "", description: "", units: 0 }] };
  it("trims, upper-cases the facility, rounds units and drops blank rows", () => {
    const parsed = slipSchema.parse(slip);
    expect(parsed.poNumber).toBe("41562087");
    expect(parsed.destFacility).toBe("XD5640");
    expect(parsed.items).toEqual([{ thdSku: "100", vendorSku: "", description: "", units: 3 }]);
  });
  it("needs a PO number and real dates", () => {
    expect(slipSchema.safeParse({ ...slip, poNumber: "  " }).success).toBe(false);
    expect(slipSchema.safeParse({ ...slip, shipDate: "11/02/2026" }).success).toBe(false);
  });
});

it("names files safely", () => {
  expect(slipFileName("4156/2087", "pdf")).toBe("Packing_Slip_4156_2087.pdf");
  expect(slipFileName("", "xlsx")).toBe("Packing_Slip_PO.xlsx");
});
