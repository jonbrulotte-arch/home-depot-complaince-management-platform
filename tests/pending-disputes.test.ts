import { describe, expect, it } from "vitest";
import { PENDING_DOCUMENTATION, pendingDisputeNote, pendingDisputesText, rootCauseAndNotes } from "@/lib/scorecard-rules";

describe("pending disputes on the scorecard", () => {
  const checklist = [
    { label: "Obtain: Packing list, Bill of Lading, or Proof of Delivery", done: false },
    { label: "Document shows PO number", done: true },
    { label: "Highlight the key information", done: false },
  ];
  it("notes a dispute still being prepared, with what is still needed and its notes", () => {
    expect(pendingDisputeNote({ status: "PREPARING", checklist, notes: ["Asked Ohio for the BOL", "  "] })).toBe(
      `${PENDING_DOCUMENTATION}\nStill needed: Obtain: Packing list, Bill of Lading, or Proof of Delivery; Highlight the key information.\nDispute notes: Asked Ohio for the BOL`,
    );
    expect(pendingDisputeNote({ status: "READY", checklist: [], notes: [] })).toBe(`${PENDING_DOCUMENTATION}\nDocuments ready; to be submitted in SPM.`);
    expect(pendingDisputeNote({ status: "SUBMITTED", checklist, notes: ["x"] })).toBeNull();
    expect(pendingDisputeNote({ status: "PREPARING", checklist: "bad", notes: [] })).toBe(PENDING_DOCUMENTATION);
  });
  it("adds the note to the notes column and words the banner", () => {
    expect(rootCauseAndNotes({ rootCause: "Late pickup", notes: "Carrier missed", disputeNote: PENDING_DOCUMENTATION })).toBe(`Root cause: Late pickup\nCarrier missed\n${PENDING_DOCUMENTATION}`);
    expect(pendingDisputesText({ pendingDisputes: 3, preparingDisputes: 2 })).toBe(
      "2 dispute(s) pending documentation from our teams (noted on each violation); regenerate the scorecard once they are submitted. 1 dispute(s) await THD's decision. Post-dispute figures assume pending disputes are not approved.",
    );
    expect(pendingDisputesText({ pendingDisputes: 1 })).toBe("1 dispute(s) await THD's decision. Post-dispute figures assume pending disputes are not approved.");
  });
});
