import { describe, expect, it } from "vitest";
import { cleanPos, issueData, issueInput, issueLabel, issueWhere, normalizePoNumber, parsePoList, poNumberVariants, resolveIssuePo } from "@/lib/issues";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = {
  title: "  Carrier missed pickup ",
  issueDate: "2026-09-16",
  status: "OPEN",
  severity: "HIGH",
  category: "Carrier / pickup",
  description: "No-show at the dock",
  actionsTaken: "  ",
  pos: [{ poNumber: " 98963592 " }, { poNumber: "98963592" }, { poNumber: "12345678", poCreateDate: "2026-09-01" }],
};

describe("Issue Log", () => {
  it("labels issues and reads PO numbers", () => {
    expect(issueLabel(7)).toBe("ISS-0007");
    expect(normalizePoNumber(" ab 123 ")).toBe("AB123");
    expect(normalizePoNumber("12/34")).toBeNull();
    expect(parsePoList("98963592\n98992706, 98963592; bad/po 01556768")).toEqual({ pos: ["98963592", "98992706", "01556768"], invalid: ["bad/po"] });
    expect(poNumberVariants("01556768")).toEqual(["01556768", "1556768", "0001556768"]);
    expect(poNumberVariants("CB-1")).toEqual(["CB-1"]);
  });

  it("checks the form, trims text and de-duplicates POs", () => {
    const parsed = issueInput.parse(base);
    expect(parsed.title).toBe("Carrier missed pickup");
    expect(parsed.actionsTaken).toBeNull();
    expect(cleanPos(parsed.pos).pos).toEqual([
      { poNumber: "98963592", poCreateDate: null },
      { poNumber: "12345678", poCreateDate: d("2026-09-01") },
    ]);
    expect(cleanPos([{ poNumber: "no good!", poCreateDate: null }]).error).toMatch(/not a PO number/);
    expect(issueInput.safeParse({ ...base, issueDate: "2026-02-30" }).success).toBe(false);
    expect(issueInput.safeParse({ ...base, category: "Made up" }).success).toBe(false);
  });

  it("stamps the resolved time once and clears it when reopened", () => {
    const parsed = issueInput.parse({ ...base, status: "RESOLVED" });
    const first = issueData(parsed);
    expect(first.resolvedAt).toBeInstanceOf(Date);
    const kept = new Date("2026-09-20T10:00:00Z");
    expect(issueData(parsed, { status: "RESOLVED", resolvedAt: kept }).resolvedAt).toBe(kept);
    expect(issueData(issueInput.parse(base), { status: "RESOLVED", resolvedAt: kept }).resolvedAt).toBeNull();
  });

  it("links a reused PO number to the right use", () => {
    const uses = [{ id: "jan", poCreateDate: d("2024-01-24") }, { id: "aug", poCreateDate: d("2024-08-01") }];
    expect(resolveIssuePo(uses, null, d("2024-08-12"))?.id).toBe("aug");
    expect(resolveIssuePo(uses, null, d("2024-03-01"))?.id).toBe("jan");
    expect(resolveIssuePo(uses, d("2024-01-24"), d("2024-09-01"))?.id).toBe("jan");
    expect(resolveIssuePo(uses, d("2024-05-05"), d("2024-09-01"))).toBeNull();
    expect(resolveIssuePo([], null, d("2024-09-01"))).toBeNull();
  });

  it("filters the list by search, status and dates", () => {
    expect(issueWhere({})).toEqual({});
    const search = JSON.stringify(issueWhere({ q: "ISS-0012" }));
    expect(search).toContain('"number":12');
    expect(JSON.stringify(issueWhere({ q: "01556768" }))).toContain("1556768");
    expect(issueWhere({ status: "OPEN_ANY" })).toEqual({ AND: [{ status: { in: ["OPEN", "IN_PROGRESS"] } }] });
    expect(issueWhere({ status: "NOPE", from: "2026-13-01" })).toEqual({});
  });
});
