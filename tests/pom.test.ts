import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pomDate, pomNumber } from "@/lib/logistics/parse";
import { readLogisticsFile } from "@/lib/logistics/read";
import { asnReceived, buildLogistics, type PomPo, type Shipment } from "@/lib/logistics/views";

const fixture = (n: string) => readLogisticsFile(new Uint8Array(readFileSync(`tests/fixtures/logistics/${n}`)));

async function views(pom: PomPo[], today = "2026-11-14") {
  const [w, s, p] = await Promise.all([fixture("WMS_Line_Data.xlsx"), fixture("Shipments.csv"), fixture("Purchase_Orders.csv")]);
  if (w.kind !== "WMS" || s.kind !== "TMS_SHIPMENTS" || p.kind !== "TMS_POS") throw new Error("wrong kinds");
  const shipments: Shipment[] = s.parsed.rows.map((r) => ({ ...r, pickupAt: r.pickup?.at ?? null, pickupLocal: r.pickup?.local ?? null, deliveryAt: r.delivery?.at ?? null, deliveryLocal: r.delivery?.local ?? null }));
  return { wms: w.parsed.rows, ...buildLogistics({ cartons: w.parsed.rows, shipments, pos: p.parsed.rows, parcels: [], pom }, today) };
}

const pomPo = (o: Partial<PomPo> & { poNumber: string }): PomPo => ({
  status: "Open",
  poCreateDate: "2026-11-01",
  dcDueDate: null,
  destinationDc: null,
  crossDock: null,
  finalRecvLocation: null,
  buyer: null,
  reasonCode: null,
  totalQty: null,
  totalCost: null,
  updatedAt: new Date("2026-11-13T12:00:00Z"),
  lines: [],
  ...o,
});
const codes = (p: { flags: { code: string }[] } | undefined) => p?.flags.map((f) => f.code) ?? [];

describe("POM PO search export", () => {
  it("is recognised and read as-is: a row per PO and SKU", async () => {
    expect(pomDate("11/24/2026")).toBe("2026-11-24");
    expect(pomDate("2026-11-24 00:00:00")).toBe("2026-11-24");
    expect(pomDate("")).toBeNull();
    expect(pomNumber("$1134.72")).toBe(1134.72);
    expect(pomNumber("")).toBeNull();
    const f = await fixture("POM_PO_Search.xlsx");
    expect(f.kind).toBe("POM");
    if (f.kind !== "POM") return;
    expect(f.parsed.rows).toHaveLength(49);
    expect(new Set(f.parsed.rows.map((r) => r.poNumber)).size).toBe(29);
    expect(f.parsed.rows[0]).toMatchObject({ poNumber: "1200119813", status: "Open", poCreateDate: "2026-11-24", dcDueDate: "2026-12-10", destinationDc: "6006", totalQty: 19, totalCost: 1134.72, thdSku: "1003043946", partNumber: "56829", skuStatus: "Cancelled", orderQty: 7, adjOrderQty: 7, shippedQty: 0, unitCost: 278.5 });
    const ifc = f.parsed.rows.find((r) => r.poNumber === "1196036832")!;
    expect(ifc).toMatchObject({ status: "Shipped", crossDock: "IFC", destinationDc: "5084", finalRecvLocation: "5851" });
  });
});

describe("POM in Logistics", () => {
  it("marks POM-shipped POs ASN received, cancels POM-cancelled ones and lists POM-only POs", async () => {
    const base = await views([]);
    const [a, b] = base.pos.filter((p) => p.cartonCount && p.status !== "Canceled");
    const v = await views([pomPo({ poNumber: a.poNumber, status: "Shipped" }), pomPo({ poNumber: b.poNumber, status: "Cancelled" }), pomPo({ poNumber: "1299999999", status: "Open", poCreateDate: "2026-11-10" })]);
    const pa = v.pos.find((p) => p.poNumber === a.poNumber)!;
    expect(asnReceived(pa.asn)).toBe(true);
    expect(pa.asn?.source).toBe("POM");
    expect(codes(pa)).toContain("ASN_RECEIVED");
    expect(codes(pa)).not.toContain("ASN_MISSING");
    const pb = v.pos.find((p) => p.poNumber === b.poNumber)!;
    expect(pb.status).toBe("Canceled");
    expect(codes(pb)).toEqual(expect.arrayContaining(["CANCELED_IN_POM", "CANCELED_SHIPPED"]));
    const open = v.pos.find((p) => p.poNumber === "1299999999")!;
    expect(open.status).toBe("Open");
    expect(open.createdAt?.toISOString().slice(0, 10)).toBe("2026-11-10");
    // POM's ESD is never used: no ESD flag from POM
    expect(codes(open)).not.toContain("PAST_ESD");
  });

  it("treats Closed POs as neutral: no ASN received, no POM flags, not listed on their own", async () => {
    const base = await views([]);
    const shipped = base.pos.find((p) => p.cartonCount && p.status !== "Canceled" && p.tms?.destFacility && !/^XD/i.test(p.tms.destFacility))!;
    const v = await views([
      pomPo({ poNumber: shipped.poNumber, status: "Closed", destinationDc: "9999", lines: [{ thdSku: "1", description: null, partNumber: "NOPE", status: "Cancelled", orderQty: 5, adjOrderQty: 5, shippedQty: 0, receivedQty: null, unitCost: 1 }] }),
      pomPo({ poNumber: "1288888888", status: "Closed" }),
      pomPo({ poNumber: "1277777777", status: "Cancelled" }),
    ]);
    const p = v.pos.find((x) => x.poNumber === shipped.poNumber)!;
    expect(p.pom?.status).toBe("Closed");
    expect(p.asn?.source).not.toBe("POM");
    expect(codes(p).filter((c) => ["SKU_CANCELLED", "QTY_MISMATCH", "POM_DEST_MISMATCH", "CANCELED_IN_POM"].includes(c))).toEqual([]);
    expect(codes(p)).toContain("ASN_MISSING");
    expect(p.status).not.toBe("Canceled");
    expect(v.pos.some((x) => x.poNumber === "1288888888" || x.poNumber === "1277777777")).toBe(false);
  });

  it("reads the year-to-date export: Closed, Cancelled, Shipped and Open POs", async () => {
    const f = await fixture("POM_PO_Search_2026.xlsx");
    expect(f.kind).toBe("POM");
    if (f.kind !== "POM") return;
    expect(f.parsed.rows).toHaveLength(1173);
    expect(f.parsed.skipped).toEqual([]);
    const pos = new Map(f.parsed.rows.map((r) => [r.poNumber, r.status]));
    expect(pos.size).toBe(622);
    expect([...pos.values()].filter((s) => s === "Closed").length).toBeGreaterThan(500);
    const closed = f.parsed.rows.find((r) => r.poNumber === "1195598500" && r.partNumber === "41562")!;
    expect(closed).toMatchObject({ status: "Closed", skuStatus: "Closed", orderQty: 144, shippedQty: 144, receivedQty: null, unitCost: 83.48 });
  });

  it("checks SKU lines and destination against the WMS (never POM's ESD)", async () => {
    const base = await views([]);
    const po = base.pos.find((p) => p.cartonCount && p.status !== "Canceled" && p.tms?.destFacility && !/^XD/i.test(p.tms.destFacility))!;
    const dc = po.tms!.destFacility!;
    const products = [...new Set(po.cartons.map((c) => c.product!))];
    const units = (prod: string) => po.cartons.filter((c) => c.product === prod).reduce((n, c) => n + (c.quantity ?? 0), 0);
    const v = await views([
      pomPo({
        poNumber: po.poNumber,
        status: "Shipped",
        destinationDc: "9999",
        lines: [
          { thdSku: "100", description: "A", partNumber: products[0], status: "Shipped", orderQty: units(products[0]) + 5, adjOrderQty: units(products[0]) + 5, shippedQty: units(products[0]) + 1, receivedQty: null, unitCost: 1 },
          { thdSku: "200", description: "B", partNumber: "NOT-SHIPPED", status: "Cancelled", orderQty: 4, adjOrderQty: 4, shippedQty: 0, receivedQty: null, unitCost: 1 },
        ],
      }),
    ]);
    const p = v.pos.find((x) => x.poNumber === po.poNumber)!;
    expect(codes(p)).not.toContain("SHIPPED_AFTER_ESD");
    expect(codes(p)).toEqual(expect.arrayContaining(["QTY_MISMATCH", "SKU_CANCELLED", "POM_DEST_MISMATCH"]));
    expect(p.flags.find((f) => f.code === "SKU_CANCELLED")?.message).toContain("Fill Rate");
    // A cancelled SKU the WMS shipped anyway
    const v2 = await views([pomPo({ poNumber: po.poNumber, status: "Open", destinationDc: dc, lines: [{ thdSku: "100", description: "A", partNumber: products[0], status: "Cancelled", orderQty: 1, adjOrderQty: 1, shippedQty: 0, receivedQty: null, unitCost: 1 }] })]);
    const p2 = v2.pos.find((x) => x.poNumber === po.poNumber)!;
    expect(codes(p2)).toContain("CANCELED_SKU_SHIPPED");
    expect(codes(p2)).not.toContain("POM_DEST_MISMATCH");
  });
});
