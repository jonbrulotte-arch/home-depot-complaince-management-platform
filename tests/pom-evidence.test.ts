import { describe, expect, it } from "vitest";
import { isShippedCompleteCode, pomCommentText, pomEvidence, pomLineFor } from "@/lib/pom";
import { esdState, poEsd, type PomLine, type PomPo, type PoView } from "@/lib/logistics/views";

const line = (o: Partial<PomLine>): PomLine => ({ thdSku: null, description: null, partNumber: null, status: "Open", orderQty: null, adjOrderQty: null, shippedQty: null, receivedQty: null, unitCost: null, ...o });
const po = (o: Partial<PomPo>): PomPo => ({ poNumber: "1197910528", status: "Shipped", poCreateDate: "2026-11-17", dcDueDate: "2026-12-03", destinationDc: "6707", crossDock: null, finalRecvLocation: null, buyer: null, reasonCode: "250", totalQty: null, totalCost: null, updatedAt: new Date(), lines: [], ...o });

describe("POM evidence for a violation", () => {
  const lines = [
    line({ thdSku: "1002977047", partNumber: "41562", description: "DEWALT ADJ STOOL", status: "Cancelled", orderQty: 144, adjOrderQty: 144, shippedQty: 0 }),
    line({ thdSku: "1003043977", partNumber: "56831", status: "Shipped", orderQty: 32, adjOrderQty: 32, shippedQty: 32 }),
    line({ thdSku: "1002988748", partNumber: "41568", status: "Shipped", orderQty: 6, adjOrderQty: 4, shippedQty: 3 }),
  ];
  const p = po({ lines });
  it("finds the SKU line by THD's SKU, else our SKU, ignoring leading zeros", () => {
    expect(pomLineFor(p, { thdSku: "001002977047", vendorSku: null })?.partNumber).toBe("41562");
    expect(pomLineFor(p, { thdSku: null, vendorSku: "56831" })?.thdSku).toBe("1003043977");
    expect(pomLineFor(p, { thdSku: "999", vendorSku: "999" })).toBeNull();
  });
  it("explains a cancelled SKU for a Fill Rate dispute", () => {
    const e = pomEvidence(p, { thdSku: "1002977047", vendorSku: "41562" });
    expect(e.summary).toBe("POM shows SKU 1002977047 (our 41562) Cancelled: 144 ordered, 0 shipped.");
    expect(e.hint).toContain("doesn't say who cancelled");
    expect(e.shippedComplete).toBe(false);
    expect(e.otherLines).toHaveLength(2);
    expect(pomEvidence(po({ status: "Cancelled", lines }), { thdSku: "1002977047", vendorSku: null }).hint).toContain("whole PO is Cancelled");
  });
  it("gives shipped-complete evidence and the SPM comment", () => {
    const e = pomEvidence(p, { thdSku: "1003043977", vendorSku: null });
    expect(e.shippedComplete).toBe(true);
    expect(e.hint).toContain("Order Shipped Complete");
    expect(pomCommentText(e)).toBe("Per THD POM, PO 1197910528 SKU 1003043977 (our 56831) shows 32 of 32 units shipped (status Shipped).");
    const short = pomEvidence(p, { thdSku: "1002988748", vendorSku: null });
    expect(short.shippedComplete).toBe(false);
    expect(short.summary).toContain("THD adjusted the order from 6 to 4");
    expect(short.hint).toBe("POM shows a short shipment (3 of 4).");
    const none = pomEvidence(p, { thdSku: "1", vendorSku: "2" });
    expect(none.line).toBeNull();
    expect(pomCommentText(none)).toBeNull();
    expect(isShippedCompleteCode("Order Shipped Complete")).toBe(true);
    expect(isShippedCompleteCode("PO/SKU Cancelled")).toBe(false);
  });
});

describe("ESD state", () => {
  // The ESD is the TMS pickup date; POM's ESD isn't used (it runs a day off)
  const ship = (pickupLocal: string | null, status = "Tendered") => ({ shipmentNumber: "1", status, scac: null, pickupAt: null, pickupLocal, deliveryAt: null, deliveryLocal: null, originFacility: null, originCity: null, originState: null, destFacility: null, destCity: null, destState: null, poNumbers: [], appointment: null, tmsFlags: [] }) as unknown as PoView["shipments"][number];
  const view = (o: Partial<Pick<PoView, "pom" | "cartonCount" | "status" | "shipments">>) => ({ pom: po({ status: "Open" }), cartonCount: 0, status: "Open" as const, shipments: [ship("11/20/26 00:01 EDT")], ...o });
  it("is past, due this week or nothing, by the earliest live TMS pickup", () => {
    expect(poEsd(view({ shipments: [ship("11/27/26 08:00 EDT"), ship("11/21/26 08:00 EDT"), ship("11/01/26 08:00 EDT", "Canceled")] }))).toBe("2026-11-21");
    expect(esdState(view({}), "2026-11-25")).toBe("past");
    expect(esdState(view({ shipments: [ship("11/25/26 00:01 EDT")] }), "2026-11-25")).toBe("week");
    expect(esdState(view({ shipments: [ship("12/1/26 00:01 EST")] }), "2026-11-25")).toBe("week");
    expect(esdState(view({ shipments: [ship("12/2/26 00:01 EST")] }), "2026-11-25")).toBeNull();
    expect(esdState(view({ shipments: [] }), "2026-11-25")).toBeNull();
    expect(esdState(view({ cartonCount: 3 }), "2026-11-25")).toBeNull();
    expect(esdState(view({ pom: po({ status: "Shipped" }) }), "2026-11-25")).toBeNull();
    // No POM data: the TMS date still counts
    expect(esdState(view({ pom: null }), "2026-11-25")).toBe("past");
  });
});
