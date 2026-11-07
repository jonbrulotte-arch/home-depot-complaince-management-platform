import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_LABELS, actionCategory, csvLine, detailPairs, entryLink, logWhere } from "@/lib/app-log";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("App Log", () => {
  it("has a label and a category for every action the code logs", () => {
    const logged = new Set<string>();
    for (const file of sourceFiles("src")) {
      for (const m of readFileSync(file, "utf8").matchAll(/audit\([^,]+,\s*(?:[^"]*\?\s*)?"([\w.]+)"(?:\s*:\s*"([\w.]+)")?/g)) {
        logged.add(m[1]);
        if (m[2]) logged.add(m[2]);
      }
    }
    expect(logged.size).toBeGreaterThan(40);
    for (const action of logged) {
      expect(ACTION_LABELS[action], action).toBeDefined();
      expect(actionCategory(action), action).not.toBe("Other");
    }
  });

  it("builds filters from the search box, user, category and dates", () => {
    expect(logWhere({})).toEqual({});
    expect(logWhere({ userId: "none" })).toEqual({ AND: [{ userId: null }] });
    const signins = logWhere({ category: "signin" }) as { AND: unknown[] };
    expect(signins.AND).toEqual([{ OR: [{ action: { startsWith: "auth." } }] }]);
    // Searching a label finds its action
    const search = JSON.stringify(logWhere({ q: "failed sign" }));
    expect(search).toContain("auth.signInFailed");
    // Bad dates are ignored, good ones bound the range (the "to" day included)
    expect(logWhere({ from: "nope", to: "2026-13-45" })).toEqual({});
    const range = logWhere({ from: "2026-10-01", to: "2026-10-31" }) as { AND: { at: { gte?: Date; lt?: Date } }[] };
    expect(range.AND[0].at.gte!.getDate()).toBe(1);
    expect(range.AND[1].at.lt!.getMonth()).toBe(10);
  });

  it("links entries to the page they are about", () => {
    expect(entryLink("ComplianceReport", "r1", null)).toBe("/reports/r1");
    expect(entryLink("Scorecard", "s1", { reportId: "r1" })).toBe("/reports/r1/scorecard");
    expect(entryLink("ChargebackPackage", "CB 1", null)).toBe("/po-lookup/package/CB%201");
    expect(entryLink("ComplianceLine", "l1", null)).toBeNull();
  });

  it("shortens details and keeps CSV safe for spreadsheets", () => {
    expect(detailPairs({ email: "a@b.c", reason: "Wrong password", ip: null })).toEqual(["email: a@b.c", "reason: Wrong password"]);
    expect(detailPairs(null)).toEqual([]);
    expect(csvLine(["=HYPERLINK(1)", 'say "hi"', 3, null])).toBe(`"'=HYPERLINK(1)","say ""hi""","3",""`);
  });
});
