import { describe, expect, it } from "vitest";
import { buildIssueReport, parseReportRange, rangeLabel, rangePresets, type ReportIssue } from "@/lib/issue-report";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const at = (s: string) => new Date(s);

function issue(n: number, over: Partial<ReportIssue> = {}): ReportIssue {
  return {
    id: `i${n}`,
    number: n,
    title: `Issue ${n}`,
    issueDate: d("2026-10-05"),
    status: "OPEN",
    severity: "MEDIUM",
    category: "Carrier / pickup",
    team: null,
    program: null,
    hdTickets: [],
    description: "What happened",
    actionsTaken: null,
    consequences: null,
    resolution: null,
    estimatedFine: null,
    followUpDate: null,
    resolvedAt: null,
    createdAt: at("2026-10-05T15:00:00Z"),
    createdBy: "Jon",
    pos: [],
    notes: [],
    ...over,
  };
}
const v = (offset: number, over: Partial<ReportIssue["pos"][number]["violations"][number]> = {}) => ({ month: "Oct 2026", program: "US RDC", metric: "Late ASN", offset, team: null, disputeStatus: null, recovered: 0, ...over });

describe("Issues report", () => {
  it("reads the date range in either order and refuses bad or overlong ranges", () => {
    const r = parseReportRange("2026-10-31", "2026-10-01")!;
    expect(r).toMatchObject({ fromKey: "2026-10-01", toKey: "2026-10-31", label: "Oct 1 – Oct 31, 2026" });
    expect(r.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(parseReportRange("2025-12-15", "2026-01-14")!.label).toBe("Dec 15, 2025 – Jan 14, 2026");
    expect(parseReportRange("2026-10-03", "2026-10-03")!.label).toBe("Oct 3, 2026");
    expect(parseReportRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(parseReportRange("2026-10-01", undefined)).toBeNull();
    expect(parseReportRange("2020-01-01", "2026-01-01")).toBeNull();
    expect(rangeLabel(d("2026-01-01"), d("2026-12-31"))).toBe("Jan 1 – Dec 31, 2026");
  });

  it("offers quick ranges relative to today", () => {
    const p = Object.fromEntries(rangePresets(at("2026-11-11T20:00:00Z")).map((x) => [x.label, `${x.from}..${x.to}`]));
    expect(p).toMatchObject({
      "Last 7 days": "2026-11-05..2026-11-11",
      "Last 30 days": "2026-10-13..2026-11-11",
      "This month": "2026-11-01..2026-11-11",
      "Last month": "2026-10-01..2026-10-31",
      "Year to date": "2026-01-01..2026-11-11",
    });
  });

  it("summarizes the issues dated in the range with the compliance data on their POs", () => {
    const range = parseReportRange("2026-10-01", "2026-10-31")!;
    const report = buildIssueReport(
      [
        issue(1, {
          estimatedFine: 300,
          team: "Warehouse (Site 3)",
          severity: "HIGH",
          pos: [
            { poNumber: "111", estimatedFine: 300, found: true, violations: [v(250), v(100, { disputeStatus: "APPROVED", recovered: 100 })] },
            { poNumber: "222", estimatedFine: null, found: true, violations: [] },
            { poNumber: "333", estimatedFine: null, found: false, violations: [] },
          ],
          notes: [
            { author: "Jon", createdAt: at("2026-09-30T23:00:00Z"), body: "before" },
            { author: "Jon", createdAt: at("2026-10-20T12:00:00Z"), body: "during" },
          ],
        }),
        issue(2, { issueDate: d("2026-10-31"), status: "RESOLVED", resolvedAt: at("2026-11-02T10:00:00Z"), pos: [{ poNumber: "444", estimatedFine: null, found: true, violations: [v(1000)] }] }),
        // earlier issue updated in the range
        issue(3, { issueDate: d("2026-09-10"), createdAt: at("2026-09-10T10:00:00Z"), status: "CLOSED", resolvedAt: at("2026-10-15T10:00:00Z"), notes: [{ author: null, createdAt: at("2026-10-15T09:00:00Z"), body: "closing" }] }),
        // earlier issue with no activity in the range, and one after it
        issue(4, { issueDate: d("2026-08-01"), createdAt: at("2026-08-01T10:00:00Z") }),
        issue(5, { issueDate: d("2026-11-01"), createdAt: at("2026-11-01T10:00:00Z") }),
      ],
      range,
    );
    expect(report.issues.map((i) => i.number)).toEqual([2, 1]);
    expect(report.earlier.map((i) => [i.number, i.resolvedInRange, i.loggedInRange, i.updates.length])).toEqual([[3, true, false, 1]]);
    expect(report.totals).toMatchObject({
      issues: 2,
      open: 1,
      resolvedInRange: 1,
      pos: 4,
      posFound: 3,
      violations: 3,
      offsets: 1350,
      recovered: 100,
      estimated: { issues: 1, expected: 300, assessed: 350 },
      updates: 2,
    });
    expect(report.issues[1].updates.map((u) => u.body)).toEqual(["during"]);
    expect(report.byTeam.map((r) => [r.label, r.count, r.offsets])).toEqual([
      ["Not set", 1, 1000],
      ["Warehouse (Site 3)", 1, 350],
    ]);
    expect(report.bySeverity.map((r) => r.label)).toEqual(["HIGH", "MEDIUM"]);
    expect(report.byStatus.map((r) => [r.label, r.count, r.open])).toEqual([
      ["OPEN", 1, 1],
      ["RESOLVED", 1, 0],
    ]);
  });
});
