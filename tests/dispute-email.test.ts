import { describe, expect, it } from "vitest";
import { disputeDraft, disputeLine, disputeReportFileName, suggestedDisputeRequests, type DisputeEmailItem } from "@/lib/dispute-email";

const item = (over: Partial<DisputeEmailItem> = {}): DisputeEmailItem => ({
  poNumber: "1157696857",
  program: "US Direct Fulfillment Center",
  metric: "Fill Rate",
  amountDisputed: 389.9,
  status: "PREPARING",
  statusLabel: "Preparing",
  reasonCode: "Order Shipped Complete",
  requiredDocs: "Packing list, Bill of Lading, or Proof of Delivery",
  openItems: 7,
  item: "SKU 56829",
  decision: null,
  ...over,
});

describe("Disputes › Send Email", () => {
  it("describes each dispute on one line", () => {
    expect(disputeLine(item())).toBe(
      "PO 1157696857 · US Direct Fulfillment Center Fill Rate · SKU 56829 · $389.90 disputed · reason: Order Shipped Complete · needs: Packing list, Bill of Lading, or Proof of Delivery · Preparing",
    );
    expect(disputeLine(item({ status: "DENIED", statusLabel: "Denied", decision: "D2" }))).toContain("THD: Denied (D2)");
    expect(disputeLine(item({ status: "DENIED", statusLabel: "Denied" }))).not.toContain("needs:");
  });

  it("ticks documents for disputes being prepared and the decision for decided ones", () => {
    expect(suggestedDisputeRequests([item()])).toEqual(["docs"]);
    expect(suggestedDisputeRequests([item({ openItems: 0 })])).toEqual([]);
    expect(suggestedDisputeRequests([item(), item({ status: "APPROVED" })])).toEqual(["docs", "outcome"]);
  });

  it("drafts the email from the disputes, the requests and the team", () => {
    const d = disputeDraft({ items: [item(), item({ poNumber: "1160007021", amountDisputed: 9.46 })], types: ["docs", "pod"], sender: "Jon", fileName: "r.pdf", reportTitle: "Oct 2026 Compliance Report", windowCloses: "12/08/2026", team: "Ohio Shipping" });
    expect(d.subject).toBe("Dispute support needed: 2 POs (Send the supporting documents; Send the proof of delivery)");
    expect(d.body.startsWith("Hi Ohio Shipping team,\n")).toBe(true);
    expect(d.body).toContain("on the 2 POs below (Oct 2026 Compliance Report)");
    expect(d.body).toContain("- Send the signed proof of delivery for these POs.");
    expect(d.body).toContain("- PO 1160007021 ·");
    expect(d.body).toContain("THD's dispute window closes 12/08/2026");
    expect(d.body.endsWith("Thanks,\nJon")).toBe(true);
    const outcome = disputeDraft({ items: [item({ status: "APPROVED", statusLabel: "Approved" })], types: ["outcome"], sender: "Jon", fileName: "r.pdf", reportTitle: "Oct 2026 Compliance Report", windowCloses: "12/08/2026" });
    expect(outcome.subject).toBe("Dispute update: 1 PO (Oct 2026 Compliance Report)");
    expect(outcome.body.startsWith("Hi,\n")).toBe(true);
    expect(outcome.body).not.toContain("dispute window closes");
    expect(disputeReportFileName(1, "2026-11-17")).toBe("Dispute_Report_1_PO_2026-11-17.pdf");
  });
});
