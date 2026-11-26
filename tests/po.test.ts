import { describe, expect, it } from "vitest";
import { lineAnchorDate, pickPoInstance, poInstanceKey } from "@/lib/po";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("PO instances", () => {
  it("keys a PO by its number and create date", () => {
    expect(poInstanceKey("01556768", d("2024-01-24"))).toBe("01556768|2024-01-24");
    expect(poInstanceKey("01556768", null)).toBe("01556768|");
  });

  it("puts an undated line on the use of the PO created before it shipped", () => {
    const uses = [{ id: "jan", poCreateDate: d("2024-01-24") }, { id: "aug", poCreateDate: d("2024-08-01") }];
    expect(pickPoInstance(uses, d("2024-02-10"))?.id).toBe("jan");
    expect(pickPoInstance(uses, d("2024-08-15"))?.id).toBe("aug");
    expect(pickPoInstance(uses, d("2023-12-01"))?.id).toBe("jan");
    expect(pickPoInstance(uses, null)?.id).toBe("aug");
    expect(pickPoInstance([{ id: "unknown", poCreateDate: null }], d("2024-02-10"))?.id).toBe("unknown");
    expect(pickPoInstance([], null)).toBeNull();
  });

  it("anchors on check-in, then ship dates", () => {
    expect(lineAnchorDate({ trailerCheckIn: d("2024-02-03"), actualShipDate: d("2024-02-01") })).toEqual(d("2024-02-03"));
    expect(lineAnchorDate({ estShipDate: d("2024-02-01") })).toEqual(d("2024-02-01"));
    expect(lineAnchorDate({})).toBeNull();
  });
});
