import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { asnRows, detectKind, parseAsnStatus } from "@/lib/logistics/parse";
import { readLogisticsFile } from "@/lib/logistics/read";
import { asnConfirmationWorkbook } from "@/lib/logistics/asn-export";
import { buildLogistics, filterPos, filterShipments, shipmentDate, type Shipment } from "@/lib/logistics/views";

async function sample(asn: { poNumber: string; status: "SHIPPED" | "UNSHIPPED"; confirmedAt: Date | null }[] = []) {
  const [w, s, p] = await Promise.all(["WMS_Line_Data.xlsx", "Shipments.csv", "Purchase_Orders.csv"].map((n) => readLogisticsFile(new Uint8Array(readFileSync(`tests/fixtures/logistics/${n}`)))));
  if (w.kind !== "WMS" || s.kind !== "TMS_SHIPMENTS" || p.kind !== "TMS_POS") throw new Error("wrong kinds");
  const shipments: Shipment[] = s.parsed.rows.map((r) => ({ ...r, pickupAt: r.pickup?.at ?? null, pickupLocal: r.pickup?.local ?? null, deliveryAt: r.delivery?.at ?? null, deliveryLocal: r.delivery?.local ?? null }));
  return buildLogistics({ cartons: w.parsed.rows, shipments, pos: p.parsed.rows, parcels: [], asn }, "2026-11-14");
}

describe("ASN/Shipped Confirmation", () => {
  it("reads the status column, blank as Unshipped", () => {
    expect(parseAsnStatus("Shipped")).toBe("SHIPPED");
    expect(parseAsnStatus(" UNSHIPPED ")).toBe("UNSHIPPED");
    expect(parseAsnStatus("")).toBe("UNSHIPPED");
    expect(parseAsnStatus("maybe")).toBeNull();
    expect(detectKind([["PO Number", "ASN/Ship Status"]])).toEqual({ kind: "ASN", headerIndex: 0 });
    const parsed = asnRows([["PO Number", "ASN/Ship Status"], ["1196036832", "Shipped"], ["1195584084", ""], ["", "Shipped"], ["1190000000", "yes"]], 0);
    expect(parsed.rows).toEqual([{ poNumber: "1196036832", status: "SHIPPED" }, { poNumber: "1195584084", status: "UNSHIPPED" }]);
    expect(parsed.skipped.map((x) => x.row)).toEqual([4, 5]);
  });

  it("round-trips: the export reads back as an ASN file once Shipped is set", async () => {
    const views = await sample();
    const pos = views.pos.slice(0, 3);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await asnConfirmationWorkbook(pos, "Test")) as unknown as ArrayBuffer);
    const ws = book.worksheets[0];
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(["PO Number", "ASN/Ship Status"]));
    expect(ws.getCell(2, 2).value).toBe("Unshipped");
    expect(ws.getCell(2, 2).dataValidation?.formulae).toEqual(['"Unshipped,Shipped"']);
    ws.getCell(2, 2).value = "Shipped";
    const file = await readLogisticsFile(new Uint8Array(await book.xlsx.writeBuffer()));
    expect(file.kind).toBe("ASN");
    if (file.kind === "ASN") expect(file.parsed.rows).toEqual(pos.map((p, i) => ({ poNumber: p.poNumber, status: i === 0 ? "SHIPPED" : "UNSHIPPED" })));
  });

  it("flags confirmed POs and shipments whose POs are all confirmed, and filters by it", async () => {
    const base = await sample();
    const ship = base.shipments.find((s) => s.ourPos.length >= 2)!;
    const [first, ...rest] = ship.ourPos;
    const partial = await sample([{ poNumber: `00${first}`, status: "SHIPPED", confirmedAt: new Date("2026-11-10T15:00:00Z") }]);
    const po = partial.pos.find((p) => p.poNumber === first)!;
    expect(po.asn?.status).toBe("SHIPPED");
    expect(po.flags.find((f) => f.code === "ASN_RECEIVED")?.severity).toBe("info");
    const s1 = partial.shipments.find((s) => s.shipmentNumber === ship.shipmentNumber)!;
    expect(s1.asn).toEqual({ received: 1, total: ship.ourPos.length });
    expect(s1.flags.some((f) => f.code === "ASN_RECEIVED")).toBe(false);
    expect(filterPos(partial.pos, { asn: "received" }).map((p) => p.poNumber)).toEqual([first]);
    expect(filterPos(partial.pos, { asn: "pending" })).toHaveLength(partial.pos.length - 1);

    const all = await sample(ship.ourPos.map((p) => ({ poNumber: p, status: "SHIPPED" as const, confirmedAt: null })));
    const s2 = all.shipments.find((s) => s.shipmentNumber === ship.shipmentNumber)!;
    expect(s2.flags.some((f) => f.code === "ASN_RECEIVED")).toBe(true);
    expect(filterShipments(all.shipments, { asn: "received" }, []).map((s) => s.shipmentNumber)).toContain(ship.shipmentNumber);
    expect(filterShipments(all.shipments, { asn: "pending" }, []).map((s) => s.shipmentNumber)).not.toContain(ship.shipmentNumber);
    // Unshipped is not received
    const back = await sample([{ poNumber: first, status: "UNSHIPPED", confirmedAt: null }]);
    expect(back.pos.find((p) => p.poNumber === first)!.flags.some((f) => f.code === "ASN_RECEIVED")).toBe(false);
    expect(rest.length).toBeGreaterThan(0);
  });
});

describe("ASN missing", () => {
  it("flags POs shipped in the WMS without ASN received, and their shipments, until confirmed", async () => {
    const base = await sample();
    const shipped = base.pos.filter((p) => p.cartonCount && p.status !== "Canceled");
    expect(shipped.length).toBeGreaterThan(0);
    for (const p of shipped) expect(p.flags.find((f) => f.code === "ASN_MISSING")?.severity).toBe("medium");
    // Not shipped in the WMS (or canceled): no flag
    for (const p of base.pos.filter((x) => !x.cartonCount || x.status === "Canceled")) expect(p.flags.some((f) => f.code === "ASN_MISSING")).toBe(false);
    const ship = base.shipments.find((s) => s.ourPos.some((po) => shipped.some((p) => p.poNumber === po)) && s.status !== "Canceled")!;
    expect(ship.flags.some((f) => f.code === "ASN_MISSING")).toBe(true);

    const confirmed = await sample(ship.ourPos.map((po) => ({ poNumber: po, status: "SHIPPED" as const, confirmedAt: null })));
    for (const po of ship.ourPos) expect(confirmed.pos.find((p) => p.poNumber === po)!.flags.some((f) => f.code === "ASN_MISSING")).toBe(false);
    expect(confirmed.shipments.find((s) => s.shipmentNumber === ship.shipmentNumber)!.flags.some((f) => f.code === "ASN_MISSING")).toBe(false);
  });
});

describe("Shipments tab filters", () => {
  it("searches by shipment, PO and city, and filters by status, flag and pickup date", async () => {
    const { shipments } = await sample();
    const s = shipments.find((x) => x.ourPos.length && x.destCity)!;
    expect(filterShipments(shipments, { q: s.shipmentNumber }, []).map((x) => x.shipmentNumber)).toEqual([s.shipmentNumber]);
    expect(filterShipments(shipments, { q: s.ourPos[0] }, []).map((x) => x.shipmentNumber)).toContain(s.shipmentNumber);
    expect(filterShipments(shipments, { q: s.destCity!.toLowerCase() }, []).every((x) => [x.destCity, x.originCity].join(" ").toUpperCase().includes(s.destCity!.toUpperCase()) || x.poNumbers.join(" ").includes(s.destCity!))).toBe(true);
    expect(filterShipments(shipments, { status: s.status }, []).every((x) => x.status === s.status)).toBe(true);
    const flagged = shipments.find((x) => x.flags.length)!;
    const code = flagged.flags[0].code;
    expect(filterShipments(shipments, { flag: code }, []).every((x) => x.flags.some((f) => f.code === code))).toBe(true);
    const d = shipmentDate(s)!;
    const inRange = filterShipments(shipments, { range: "custom", from: d, to: d }, [], "2026-11-14");
    expect(inRange.map((x) => x.shipmentNumber)).toContain(s.shipmentNumber);
    expect(inRange.every((x) => shipmentDate(x) === d)).toBe(true);
  });
});
