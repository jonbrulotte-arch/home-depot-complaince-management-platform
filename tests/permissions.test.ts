import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, homePath, type Permission } from "@/lib/permissions";

const role = (name: string) => new Set(DEFAULT_ROLES.find((r) => r.name === name)!.permissions);

describe("roles and landing pages", () => {
  it("has a Warehouse role limited to scorecard feedback", () => {
    expect([...role("Warehouse")].sort()).toEqual(["feedback.submit", "feedback.view"]);
  });

  it("sends each user to the first page their role allows", () => {
    expect(homePath(role("Admin"))).toBe("/dashboard");
    expect(homePath(role("Viewer"))).toBe("/dashboard");
    expect(homePath(role("Warehouse"))).toBe("/feedback");
    expect(homePath(new Set<Permission>(["view.polookup"]))).toBe("/po-lookup");
    expect(homePath(new Set<Permission>())).toBe("/no-access");
  });
});
