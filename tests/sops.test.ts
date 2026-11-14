import { describe, expect, it } from "vitest";
import { isPdf, sopFileName } from "@/lib/sop-file";

describe("SOP documents", () => {
  it("accepts only files that start with a PDF header", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
    expect(isPdf(new TextEncoder().encode("PK\u0003\u0004 a docx"))).toBe(false);
    expect(isPdf(new TextEncoder().encode("%PDF"))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
  });

  it("makes a download file name that is safe for a header and ends in .pdf", () => {
    expect(sopFileName("Warehouse SOP.pdf")).toBe("Warehouse SOP.pdf");
    expect(sopFileName("Director SOP")).toBe("Director SOP.pdf");
    expect(sopFileName('a/b\\c"d\r\ne.PDF')).toBe("a_b_c_d__e.pdf");
    expect(sopFileName("  .pdf")).toBe("SOP.pdf");
  });
});
