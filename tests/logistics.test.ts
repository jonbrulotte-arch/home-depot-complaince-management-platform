import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectKind, localDateOf, parseCsv, parseHtmlTable, parseTmsTime, parseWmsTime, splitPos } from "@/lib/logistics/parse";
import { readLogisticsFile } from "@/lib/logistics/read";
import { carrierUrl, cartonRefs, cleanTrackingUrl } from "@/lib/logistics/refs";
import { buildLogistics, editDistance, filterPos, logisticsOverview, type Shipment } from "@/lib/logistics/views";

const fixture = (n: string) => readLogisticsFile(new Uint8Array(readFileSync(`tests/fixtures/logistics/${n}`)));

async function sample() {
  const [w, s, p] = await Promise.all([fixture("WMS_Line_Data.xlsx"), fixture("Shipments.csv"), fixture("Purchase_Orders.csv")]);
  if (w.kind !== "WMS" || s.kind !== "TMS_SHIPMENTS" || p.kind !== "TMS_POS") throw new Error("wrong kinds");
  const shipments: Shipment[] = s.parsed.rows.map((r) => ({
    ...r,
    pickupAt: r.pickup?.at ?? null,
    pickupLocal: r.pickup?.local ?? null,
    deliveryAt: r.delivery?.at ?? null,
    deliveryLocal: r.delivery?.local ?? null,
  }));
  return { w, s, p, views: buildLogistics({ cartons: w.parsed.rows, shipments, pos: p.parsed.rows, parcels: [] }, "2026-11-14") };
}

describe("logistics files", () => {
  it("parses CSV with quoted lists, HTML tables and recognises each file by its headers", () => {
    expect(parseCsv('a,b,c\n1,"x, y",""""\r\n\n')).toEqual([["a", "b", "c"], ["1", "x, y", '"']]);
    expect(parseHtmlTable("<html><table><tr><th>A&amp;B</th><th>C</th></tr><tr><td>1</td><td><b>2</b></td></tr></table>")).toEqual([["A&B", "C"], ["1", "2"]]);
    expect(detectKind([["ORDER_NUM", "TrackingNumber", "CustomerPONumber", "GS128"]])?.kind).toBe("WMS");
    expect(detectKind([["Shipment", "Status", "Assigned Carrier", "Purchase Orders"]])?.kind).toBe("TMS_SHIPMENTS");
    expect(detectKind([["Purchase Order", "Status", "Destination Facility"]])?.kind).toBe("TMS_POS");
    expect(detectKind([["a", "b", "c"]])).toBeNull();
    expect(splitPos("1181331860, 1181351361,1181331860")).toEqual(["1181331860", "1181351361"]);
  });

  it("reads TMS times with their zone and WMS wall-clock times", () => {
    const t = parseTmsTime("9/28/26 21:00", "PDT")!;
    expect(t.at.toISOString()).toBe("2026-09-29T04:00:00.000Z");
    expect(t).toMatchObject({ local: "9/28/26 21:00 PDT", date: "2026-09-28" });
    expect(parseTmsTime("11/3/2026 7:05 PM", "EST")!.at.toISOString()).toBe("2026-11-04T00:05:00.000Z");
    expect(parseTmsTime("13/3/26", "EST")).toBeNull();
    expect(localDateOf("11/9/26 00:01 EST")).toBe("2026-11-09");
    expect(parseWmsTime("2026-11-12 06:24:00")!.toISOString()).toBe("2026-11-12T06:24:00.000Z");
  });

  it("tells TMS shipment IDs, UPS numbers, PROs and mistyped TMS IDs apart", () => {
    expect(cartonRefs("233480675", "233480675")).toEqual({ tms: "233480675", ups: null, pro: null, suspectTms: null });
    expect(cartonRefs("1Z9X0F560308403761", "SHP3435982")).toMatchObject({ ups: "1Z9X0F560308403761", tms: null });
    expect(cartonRefs("411492822706", "233480666")).toMatchObject({ tms: "233480666", pro: "411492822706" });
    expect(cartonRefs("23307363", "23307363")).toMatchObject({ suspectTms: "23307363", tms: null });
  });

  it("links a SCAC to its tracking page, filling in what is known", () => {
    const link = { scac: "FXFE", name: "FedEx Freight", mode: "LTL", trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={pro}" };
    expect(carrierUrl("FXFE", link, { pro: "123" })).toEqual({ url: "https://www.fedex.com/fedextrack/?trknbr=123", known: true });
    expect(carrierUrl("FXFE", link, {})).toEqual({ url: "https://www.fedex.com/fedextrack/", known: true });
    // No tracking page set: no link (never a web search)
    expect(carrierUrl("ZZZZ", null, {})).toEqual({ url: null, known: false });
    expect(carrierUrl("KNIG", { scac: "KNIG", name: "Knight", mode: "TL", trackingUrl: null }, {})).toEqual({ url: null, known: true });
    expect(cleanTrackingUrl("javascript:alert(1)")).toBeNull();
    expect(cleanTrackingUrl(" https://x.example/track?p={pro} ")).toBe("https://x.example/track?p={pro}");
    expect(editDistance("HAGGESTOWN", "HAGERSTOWN")).toBe(2);
    expect(editDistance("PERRIS", "DALLAS")).toBeGreaterThan(2);
  });
});

describe("logistics views of the sample files", () => {
  it("reads all three files without skipping rows", async () => {
    const { w, s, p } = await sample();
    expect([w.parsed.rows.length, s.parsed.rows.length, p.parsed.rows.length]).toEqual([356, 107, 162]);
    expect([w.parsed.skipped, s.parsed.skipped, p.parsed.skipped]).toEqual([[], [], []]);
    const shipment = s.parsed.rows.find((r) => r.shipmentNumber === "233241793")!;
    expect(shipment.poNumbers).toEqual(["1181331860", "1181351361", "1181356263"]);
  });

  it("flags what needs looking at", async () => {
    const { views } = await sample();
    const po = (n: string) => views.pos.find((p) => p.poNumber === n)!;
    const codes = (n: string) => po(n).flags.map((f) => f.code);
    expect(codes("1191142969")).toContain("SUSPECT_TMS_ID");
    // WMS cartons carry 233565631; TMS has the PO on 233586508
    expect(codes("1191515251")).toContain("TMS_ID_MISMATCH");
    expect(codes("1191515132")).toContain("MULTIPLE_SHIPMENTS");
    expect(codes("1191515057")).toContain("PICKUP_PASSED");
    expect(codes("1193766084")).toContain("DELIVERY_OVERDUE");
    expect(codes("1193307282")).toContain("CITY_SPELLING");
    expect(codes("1193307282")).not.toContain("WRONG_DESTINATION");
    expect(codes("1178880969")).toContain("ORIGIN_MISMATCH");
    expect(codes("1191078978")).toContain("DATES_REVERSED");
    // A mixed carton is one carton with a line per product
    expect(new Set(po("1193305572").cartons.map((c) => c.lineKey))).toHaveProperty("size", po("1193305572").cartons.length);
    expect(po("1193305572").cartonCount).toBeLessThan(po("1193305572").cartons.length);
    expect(po("1184673169").status).toBe("Canceled");
    expect(po("1178880969").status).toBe("Delivered");
    // Other suppliers' POs on shared trucks aren't listed as this supplier's POs
    expect(views.pos.some((p) => p.poNumber === "1195611355")).toBe(false);
    expect(views.shipments.find((s) => s.shipmentNumber === "233523374")!.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["NO_CARRIER", "DELIVERY_OVERDUE"]));
    const o = logisticsOverview(views);
    expect(o.pos).toBe(171);
    expect(o.carriers[0]).toMatchObject({ scac: "EXLA", shipments: 53 });
    expect(filterPos(views.pos, { q: "233584383" }).map((p) => p.poNumber)).toEqual(["1191515132"]);
    expect(filterPos(views.pos, { flag: "SUSPECT_TMS_ID" })).toHaveLength(1);
  });
});

describe("UPS tracking answers", () => {
  it("keeps the status, delivery and last activity", async () => {
    const { parseUpsTrack } = await import("@/lib/logistics/ups-parse");
    const delivered = parseUpsTrack({
      trackResponse: {
        shipment: [
          {
            package: [
              {
                currentStatus: { description: "Delivered", code: "011" },
                deliveryDate: [{ type: "DEL", date: "20261105" }],
                deliveryTime: { type: "DEL", endTime: "134500" },
                activity: [{ date: "20261105", time: "134500", status: { type: "D", description: "DELIVERED", code: "FS" }, location: { address: { city: "JOLIET", stateProvince: "IL", country: "US" } } }],
              },
            ],
          },
        ],
      },
    });
    expect(delivered).toMatchObject({ delivered: true, status: "Delivered", statusType: "D", lastLocation: "JOLIET, IL, US", error: null });
    expect(delivered.deliveredAt!.toISOString()).toBe("2026-11-05T13:45:00.000Z");
    const moving = parseUpsTrack({ trackResponse: { shipment: [{ package: [{ currentStatus: { description: "In Transit" }, deliveryDate: [{ type: "SDD", date: "20261118" }], activity: [{ date: "20261114", status: { type: "I", description: "Departed from Facility" } }] }] }] } });
    expect(moving).toMatchObject({ delivered: false, statusType: "I", lastActivity: "Departed from Facility" });
    expect(moving.expectedAt!.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(parseUpsTrack({ trackResponse: { shipment: [{ warnings: [{ message: "Tracking Information Not Found" }] }] } }).error).toBe("Tracking Information Not Found");
  });
});
