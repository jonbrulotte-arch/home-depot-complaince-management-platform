import { describe, expect, it } from "vitest";
import { pdfText } from "@/lib/issue-pdf";

describe("issue PDF text", () => {
  it("keeps what the standard PDF fonts can draw and replaces the rest", () => {
    expect(pdfText("ASN for PO# 1191140500 — “late” · café 50%")).toBe("ASN for PO# 1191140500 — “late” · café 50%");
    expect(pdfText("PER*OC*ar@jsproducts.com~")).toBe("PER*OC*ar@jsproducts.com~");
    expect(pdfText("Fill rate ≥ 98% → OK ✅")).toBe("Fill rate >= 98% -> OK ?");
    expect(pdfText("line one\r\nline two")).toBe("line one\nline two");
  });
});
