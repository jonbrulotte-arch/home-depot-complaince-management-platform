import { describe, expect, it } from "vitest";
import { cleanPos, issueData, issueInput, issueLabel, issueWhere, lineItem, normalizePoNumber, parsePoList, poNumberVariants, resolveIssuePo } from "@/lib/issues";

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
      { poNumber: "98963592", poCreateDate: null, estimatedFine: null },
      { poNumber: "12345678", poCreateDate: d("2026-09-01"), estimatedFine: null },
    ]);
    expect(cleanPos([{ poNumber: "no good!", poCreateDate: null, estimatedFine: null }]).error).toMatch(/not a PO number/);
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

describe("HD Support tickets", () => {
  it("splits a typed or pasted list, trims and drops repeats", async () => {
    const { parseTickets, cleanTickets } = await import("@/lib/issues");
    expect(parseTickets("7822873, 7822521;7822873\n HDS-448812 ")).toEqual(["7822873", "7822521", "HDS-448812"]);
    expect(cleanTickets([" a1 ", "A1", "", "b2"])).toEqual(["a1", "b2"]);
  });

  it("accepts a list of tickets on an issue and cleans it", async () => {
    const { issueInput } = await import("@/lib/issues");
    const base = { title: "t", issueDate: "2026-11-04", status: "OPEN", severity: "MEDIUM", category: "ASN / EDI", description: "d", pos: [] };
    expect(issueInput.parse({ ...base, hdTickets: ["7822873", " 7822521 ", "7822873", ""] }).hdTickets).toEqual(["7822873", "7822521"]);
    expect(issueInput.parse(base).hdTickets).toEqual([]);
    expect(issueInput.safeParse({ ...base, hdTickets: Array.from({ length: 21 }, (_, i) => String(i)) }).success).toBe(false);
  });
});

describe("estimated maximum fine", () => {
  it("reads typed whole dollars and checks the range", async () => {
    const { parseWholeDollars, issueInput } = await import("@/lib/issues");
    expect(parseWholeDollars("$5,950")).toBe(5950);
    expect(parseWholeDollars("  ")).toBeNull();
    expect(parseWholeDollars("12.50")).toBeNaN();
    const base = { title: "t", issueDate: "2026-11-06", status: "OPEN", severity: "MEDIUM", category: "ASN / EDI", description: "d", pos: [] };
    expect(issueInput.parse({ ...base, estimatedFine: 1700 }).estimatedFine).toBe(1700);
    expect(issueInput.parse(base).estimatedFine).toBeNull();
    expect(issueInput.safeParse({ ...base, estimatedFine: -5 }).success).toBe(false);
    expect(issueInput.safeParse({ ...base, estimatedFine: 12.5 }).success).toBe(false);
  });
});

describe("estimates per PO", () => {
  it("totals the POs' estimates, or uses the whole-issue figure when no PO has one", async () => {
    const { issueEstimate } = await import("@/lib/issues");
    expect(issueEstimate(5950, [{ estimatedFine: 100 }, { estimatedFine: null }, { estimatedFine: 250 }])).toBe(350);
    expect(issueEstimate(5950, [{ estimatedFine: null }, {}])).toBe(5950);
    expect(issueEstimate(null, [])).toBeNull();
    expect(issueEstimate(null, [{ estimatedFine: 0 }])).toBe(0);
  });
});

describe("lineItem", () => {
  it("tells a PO's lines apart by SKU, else an order reference", () => {
    expect(lineItem({ vendorSku: "56829", sku: "1003043946", skuDescription: "DEWALT 6FT STORAGE RACK", orderedQty: 14, receivedQty: 0 })).toEqual({
      primary: "SKU 56829",
      secondary: "THD SKU 1003043946 · DEWALT 6FT STORAGE RACK · ordered 14, received 0",
      qty: "ordered 14, received 0",
    });
    expect(lineItem({ sku: "1003043946" })).toEqual({ primary: "THD SKU 1003043946", secondary: null, qty: null });
    expect(lineItem({ omsId: "301771362", customerOrder: "WM49638419" })).toEqual({ primary: "OMS 301771362", secondary: null, qty: null });
    expect(lineItem({ vendorSku: "41562", omsId: "301771363" }).secondary).toBe("OMS 301771363");
    expect(lineItem({})).toEqual({ primary: "—", secondary: null, qty: null });
  });
});

describe("Link Resource", () => {
  it("accepts web addresses only, adding https:// when left out", async () => {
    const { cleanResourceUrl, linkHost, parseResourceLink } = await import("@/lib/resource-links");
    expect(cleanResourceUrl(" https://jsproducts-my.sharepoint.com/:b:/p/jon/Abc?e=1 ")).toBe("https://jsproducts-my.sharepoint.com/:b:/p/jon/Abc?e=1");
    expect(cleanResourceUrl("onedrive.live.com/view?id=1")).toBe("https://onedrive.live.com/view?id=1");
    expect(cleanResourceUrl("javascript:alert(1)")).toBeNull();
    expect(cleanResourceUrl("file:///C:/docs/bol.pdf")).toBeNull();
    expect(cleanResourceUrl("not a link")).toBeNull();
    expect(cleanResourceUrl("")).toBeNull();
    expect(linkHost("https://www.example.com/a")).toBe("example.com");
    expect(parseResourceLink({ label: "  Signed   BOL ", url: "example.com/bol.pdf" })).toEqual({ label: "Signed BOL", url: "https://example.com/bol.pdf" });
    expect(parseResourceLink({ label: "", url: "https://x.com" })).toEqual({ error: "Enter the link text" });
    expect(parseResourceLink({ label: "x", url: "ftp://x.com" })).toEqual({ error: "Enter a web address (https://…)" });
  });
});
