import { describe, expect, it } from "vitest";
import { HELP_TOPICS, helpText, helpTopicsFor } from "@/lib/help-content";
import { ALL_PERMISSIONS, DEFAULT_ROLES, isPermission, type Permission } from "@/lib/permissions";

const role = (name: string) => new Set(DEFAULT_ROLES.find((r) => r.name === name)!.permissions);
const ids = (permissions: Set<Permission>, all = false) => helpTopicsFor(permissions, all).map((t) => t.id);

describe("Help & Docs", () => {
  it("has unique topic ids and only real permissions", () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
    for (const t of HELP_TOPICS) for (const p of t.anyOf ?? []) expect(isPermission(p)).toBe(true);
  });

  it("shows each role the topics for the parts it uses", () => {
    expect(ids(role("Warehouse"))).toEqual(["getting-started", "feedback", "faq", "glossary"]);
    expect(ids(role("Finance"))).toEqual(["getting-started", "feedback", "summarizer", "po-lookup", "faq", "glossary"]);
    expect(ids(new Set(ALL_PERMISSIONS))).toEqual(HELP_TOPICS.map((t) => t.id));
    // Show all topics
    expect(ids(role("Warehouse"), true)).toHaveLength(HELP_TOPICS.length);
  });

  it("searches the words, without the bold markers", () => {
    const pkg = HELP_TOPICS.find((t) => t.id === "po-lookup")!;
    expect(helpText(pkg)).toContain("export to excel");
    expect(helpText(pkg)).not.toContain("**");
  });
});
