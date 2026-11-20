import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wmsRows } from "@/lib/logistics/parse";
import { readLogisticsFile } from "@/lib/logistics/read";
import { addressLines, facilityFromName, facilityIndex, facilityKey, genericName, poShipTo, shipToOf } from "@/lib/logistics/ship-to";
import { buildLogistics, type Shipment } from "@/lib/logistics/views";

const line = (o: Record<string, string | null>) => ({ shipCity: null, shipState: null, shipZip: null, ...o });

describe("WMS ship-to", () => {
  it("reads the Store/DC number from ship_to, else the name, else another line at the same address", () => {
    expect(facilityFromName("The Home Depot-5023")).toBe("5023");
    expect(facilityFromName("DFC - DALLAS DFC #5823")).toBe("5823");
    expect(facilityFromName("HomeDepot.com")).toBeNull();
    expect(facilityKey("005851")).toBe("5851");
    expect(facilityKey(" xd5640 ")).toBe("XD5640");
    const lines = [
      line({ shipTo: "5832", shipName: "HomeDepot.com", shipAddress1: "7808 HAWKS PRAIRIE RD NE", shipCity: "LACEY", shipState: "WA", shipZip: "98516" }),
      line({ shipTo: null, shipName: "HomeDepot.com", shipAddress1: "7808 Hawks Prairie Rd NE", shipCity: "LACEY", shipState: "WA", shipZip: "98516-1234" }),
    ];
    expect(shipToOf(lines[1], facilityIndex(lines)).facility).toBe("5832");
    expect(shipToOf(lines[1]).facility).toBeNull();
  });

  it("gives a PO the address most of its lines have, as lines for a label", () => {
    const t = poShipTo([
      line({ shipTo: null, shipName: "The Home Depot-5023", shipAddress1: "2300 BECKLEYMEADE AVE", shipCity: "DALLAS", shipState: "TX", shipZip: "75232" }),
      line({ shipTo: "5023", shipName: "The Home Depot", shipAddress1: "2300 BECKLEYMEADE AVE", shipAddress2: "DOCK 4", shipCity: "DALLAS", shipState: "TX", shipZip: "75232" }),
      line({ shipCity: "DALLAS", shipState: "TX", shipZip: "75232" }),
    ])!;
    expect(t.facility).toBe("5023");
    expect(addressLines(t)).toEqual(["2300 BECKLEYMEADE AVE", "DOCK 4", "DALLAS, TX 75232"]);
    expect(addressLines(shipToOf(line({ shipAddress1: "11333 N GESSNER RD,", shipCity: "HOUSTON", shipState: "TX", shipZip: "77064" })))[0]).toBe("11333 N GESSNER RD");
    expect(poShipTo([])).toBeNull();
    expect(genericName("The Home Depot")).toBe(true);
    expect(genericName("HomeDepot.com")).toBe(true);
    expect(genericName("DFC - DALLAS DFC #5823")).toBe(false);
  });

  it("parses the ship-to columns of the newer WMS report", () => {
    const header = ["ORDER_NUM", "OrderNumber", "CUST_NUM", "TrackingNumber", "secondtrack", "TOTLABEL", "Product", "Quantity", "CustomerPONumber", "ShipDate", "GS128", "ship_to", "ship_name", "ship_add1", "ship_add2", "ship_add3", "ship_city", "ship_prov", "ship_zip"];
    const row = ["S-ORD1015774S", "3-S-ORD1015774", "THD", "233606273", "233606273", "103503177", "41562", "24", "1196036832", "2026-11-18 08:47:00", "00000991981035031777", "5851", "The Home Depot", "2950 CENTERPOINT WAY", "", "", "JOLIET", "IL", "60436"];
    const parsed = wmsRows([header, row], 0);
    expect(parsed.rows[0]).toMatchObject({ shipTo: "5851", shipName: "The Home Depot", shipAddress1: "2950 CENTERPOINT WAY", shipAddress2: null, shipCity: "JOLIET", shipState: "IL", shipZip: "60436" });
  });

  it("flags a PO the WMS shipped to a different Store/DC than TMS has", async () => {
    const [w, s, p] = await Promise.all(["WMS_Line_Data.xlsx", "Shipments.csv", "Purchase_Orders.csv"].map((n) => readLogisticsFile(new Uint8Array(readFileSync(`tests/fixtures/logistics/${n}`)))));
    if (w.kind !== "WMS" || s.kind !== "TMS_SHIPMENTS" || p.kind !== "TMS_POS") throw new Error("wrong kinds");
    const shipments: Shipment[] = s.parsed.rows.map((r) => ({ ...r, pickupAt: r.pickup?.at ?? null, pickupLocal: r.pickup?.local ?? null, deliveryAt: r.delivery?.at ?? null, deliveryLocal: r.delivery?.local ?? null }));
    const tmsPo = p.parsed.rows.find((r) => r.destFacility && !/^XD/i.test(r.destFacility) && w.parsed.rows.some((c) => c.poNumber === r.poNumber))!;
    const build = (shipTo: string) =>
      buildLogistics({ cartons: w.parsed.rows.map((c) => (c.poNumber === tmsPo.poNumber ? { ...c, shipTo, shipName: "The Home Depot", shipAddress1: "1 TEST WAY" } : c)), shipments, pos: p.parsed.rows, parcels: [] }, "2026-11-14").pos.find((x) => x.poNumber === tmsPo.poNumber)!;
    const wrong = build("9999");
    expect(wrong.flags.map((f) => f.code)).toContain("SHIP_TO_MISMATCH");
    expect(wrong.shipTo).toMatchObject({ facility: "9999", street: ["1 TEST WAY"] });
    expect(build(`00${tmsPo.destFacility}`).flags.map((f) => f.code)).not.toContain("SHIP_TO_MISMATCH");
  });
});
