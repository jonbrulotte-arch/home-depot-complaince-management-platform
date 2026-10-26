import { describe, expect, it } from "vitest";
import { normalizePackageId } from "@/lib/package-id";

describe("Package IDs", () => {
  it("accepts alphanumeric IDs, trimmed, with separators between characters", () => {
    expect(normalizePackageId("  PKG20261015A  ")).toBe("PKG20261015A");
    expect(normalizePackageId("RC323000000053027")).toBe("RC323000000053027");
    expect(normalizePackageId("2026-10/A_1.b")).toBe("2026-10/A_1.b");
    expect(normalizePackageId("7")).toBe("7");
  });

  it("refuses anything else", () => {
    expect(normalizePackageId("")).toBeNull();
    expect(normalizePackageId("-PKG")).toBeNull();
    expect(normalizePackageId("PKG-")).toBeNull();
    expect(normalizePackageId("PKG 1")).toBeNull();
    expect(normalizePackageId("../etc")).toBeNull();
    expect(normalizePackageId("A".repeat(65))).toBeNull();
  });
});
