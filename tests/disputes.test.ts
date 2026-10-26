import { describe, expect, it } from "vitest";
import { buildChecklist, canTransition, defaultDisputeWindow, draftSupplierComment, isApprovedDecision, isDeniedDecision } from "@/lib/disputes";

const day = (d: Date) => d.toISOString().slice(0, 10);

describe("dispute window", () => {
  it("opens the 2nd Wednesday after the performance month and closes the 2nd Tuesday of the month after", () => {
    // FM 202605 is June 2026
    expect(day(defaultDisputeWindow(202605).open)).toBe("2026-07-08");
    expect(day(defaultDisputeWindow(202605).close)).toBe("2026-08-11");
  });

  it("rolls over the calendar year", () => {
    // FM 202611 is December 2026
    expect(day(defaultDisputeWindow(202611).open)).toBe("2027-01-13");
    expect(day(defaultDisputeWindow(202611).close)).toBe("2027-02-09");
  });
});

describe("dispute status transitions", () => {
  it("follows prepare → submit → decide", () => {
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransition("SUBMITTED", "PARTIAL")).toBe(true);
    expect(canTransition("SUBMITTED", "DENIED")).toBe(true);
  });

  it("blocks skipping submission and withdrawing after submission", () => {
    expect(canTransition("PREPARING", "APPROVED")).toBe(false);
    expect(canTransition("SUBMITTED", "WITHDRAWN")).toBe(false);
    expect(canTransition("APPROVED", "DENIED")).toBe(false);
  });

  it("allows reopening a decision or a withdrawn dispute", () => {
    expect(canTransition("DENIED", "SUBMITTED")).toBe(true);
    expect(canTransition("WITHDRAWN", "PREPARING")).toBe(true);
  });
});

describe("dispute preparation", () => {
  it("builds a document checklist from the THD dispute matrix entry", () => {
    const items = buildChecklist({ requiredDocs: "Proof of Delivery", docDetails: "PO number; PO date; Delivery date" });
    expect(items.map((i) => i.label)).toEqual([
      "Obtain: Proof of Delivery",
      "Document shows PO number",
      "Document shows PO date",
      "Document shows delivery date",
      "Highlight or circle the key information on each document",
    ]);
    expect(items.every((i) => !i.done)).toBe(true);
    expect(buildChecklist(null).map((i) => i.label)[0]).toBe("Gather supporting documentation");
  });

  it("drafts the SPM comment", () => {
    expect(draftSupplierComment({ poNumber: "1141585118", metricName: "Late ASN" }, "ASN Sent On-Time", "856 sent 06/04 07:12.")).toBe(
      "PO 1141585118 - Late ASN. Dispute reason: ASN Sent On-Time. 856 sent 06/04 07:12. Supporting documentation attached.",
    );
  });

  it("recognises SPM Approve/Deny values", () => {
    expect(isApprovedDecision("Approved")).toBe(true);
    expect(isDeniedDecision("Deny")).toBe(true);
    expect(isDeniedDecision("Denied")).toBe(true);
    expect(isApprovedDecision(null)).toBe(false);
  });
});
