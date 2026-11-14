import { describe, expect, it } from "vitest";
import { sniffLogoType } from "@/lib/brand";

describe("logo type detection", () => {
  it("reads the type from the file's bytes", () => {
    expect(sniffLogoType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("image/png");
    expect(sniffLogoType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffLogoType(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(sniffLogoType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffLogoType(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("image/svg+xml");
  });

  it("rejects anything that is not an image", () => {
    expect(sniffLogoType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffLogoType(Buffer.from("%PDF-1.4"))).toBeNull();
  });
});
