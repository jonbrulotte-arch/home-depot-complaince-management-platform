import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, homePath, type Permission } from "@/lib/permissions";

const role = (name: string) => new Set(DEFAULT_ROLES.find((r) => r.name === name)!.permissions);

describe("roles and landing pages", () => {
  it("has a Warehouse role limited to scorecard feedback and the Issue Log", () => {
    expect([...role("Warehouse")].sort()).toEqual(["feedback.submit", "feedback.view", "issues.manage", "issues.view"]);
  });

  it("has a read-only Finance role for PO Lookup, Scorecard Feedback, the Issue Log and the Summarizer", () => {
    expect([...role("Finance")].sort()).toEqual(["feedback.view", "issues.view", "summarizer.use", "view.polookup"]);
    expect(role("Finance").has("feedback.submit")).toBe(false);
    expect(role("Finance").has("issues.manage")).toBe(false);
  });

  it("lets Analysts use the Summarizer but not Viewers or the Warehouse", () => {
    expect(role("Analyst").has("summarizer.use")).toBe(true);
    expect(role("Viewer").has("summarizer.use")).toBe(false);
    expect(role("Warehouse").has("summarizer.use")).toBe(false);
  });

  it("has a Director role with the Warehouse's access plus the dashboard, PO Lookup and Reports & Insights", () => {
    expect([...role("Director")].sort()).toEqual([...role("Warehouse"), "insights.view", "view.dashboard", "view.polookup"].sort());
    expect(role("Director").has("reports.view")).toBe(false);
    expect(role("Director").has("summarizer.use")).toBe(false);
    expect(role("Warehouse").has("insights.view")).toBe(false);
  });

  it("sends each user to the first page their role allows", () => {
    expect(homePath(role("Admin"))).toBe("/dashboard");
    expect(homePath(role("Viewer"))).toBe("/dashboard");
    expect(homePath(role("Warehouse"))).toBe("/feedback");
    expect(homePath(role("Finance"))).toBe("/feedback");
    expect(homePath(role("Director"))).toBe("/dashboard");
    expect(homePath(new Set<Permission>(["view.polookup"]))).toBe("/po-lookup");
    expect(homePath(new Set<Permission>())).toBe("/no-access");
  });
});
