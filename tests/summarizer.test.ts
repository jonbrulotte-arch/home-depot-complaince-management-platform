import { describe, expect, it } from "vitest";
import type { ScorecardData, ScorecardViolation } from "@/lib/scorecard";
import { buildSummary, defaultSubject, summaryEmail, type SummaryInput } from "@/lib/summarizer";

const violation = (program: string, metric: string, poNumber: string, offset: number, teamInfluence: string | null): ScorecardViolation => ({
  program, metric, poNumber, dcNumber: null, offset, disposition: "ACCEPTED", teamInfluence, disputeStatus: null, reasonCode: null, recovered: null, notes: null,
});

function input(reportId: string, fiscalMonth: number, periodLabel: string, violations: ScorecardViolation[], recovered = 0): SummaryInput {
  const preOffset = violations.reduce((s, v) => s + v.offset, 0);
  const data = {
    fiscalMonth,
    periodLabel,
    programs: [
      { name: "US RDC", metrics: [{ name: "Fill Rate" }, { name: "Late ASN" }] },
      { name: "US DFC", metrics: [{ name: "Missing ASN" }] },
    ],
    totals: { violations: violations.length, preOffset, recovered, postOffset: preOffset - recovered },
    violations,
  } as unknown as ScorecardData;
  return { reportId, title: `${periodLabel} report`, data, scorecardPath: `/s/token-${reportId}` };
}

const june = input("r6", 202605, "Jun 2026", [
  violation("US DFC", "Missing ASN", "111", 1000, "EDI"),
  violation("US RDC", "Late ASN", "222", 250, "Warehouse (Site 0)"),
  violation("US RDC", "Late ASN", "333", 250, null),
], 250);
const may = input("r5", 202604, "May 2026", [violation("US RDC", "Late ASN", "444", 250, "Warehouse (Site 0)")]);

describe("summarizer", () => {
  it("groups violations by compliance type in scorecard order, oldest period first", () => {
    const s = buildSummary([june, may]);
    expect(s.reports.map((r) => r.periodLabel)).toEqual(["May 2026", "Jun 2026"]);
    expect(s.groups.map((g) => `${g.program} · ${g.metric}`)).toEqual(["US RDC · Late ASN", "US DFC · Missing ASN"]);
    const late = s.groups[0];
    expect(late.violations).toBe(3);
    expect(late.offset).toBe(750);
    expect(late.rows.map((r) => [r.periodLabel, r.poNumber, r.team])).toEqual([
      ["May 2026", "444", "Warehouse (Site 0)"],
      ["Jun 2026", "222", "Warehouse (Site 0)"],
      ["Jun 2026", "333", "Not assigned"],
    ]);
    expect(s.teams).toEqual([
      { team: "EDI", violations: 1, offset: 1000 },
      { team: "Warehouse (Site 0)", violations: 2, offset: 500 },
      { team: "Not assigned", violations: 1, offset: 250 },
    ]);
    expect(s.totals).toEqual({ violations: 4, preOffset: 1750, recovered: 250, postOffset: 1500 });
    expect(defaultSubject(s)).toBe("THD Compliance Summary: May 2026 & Jun 2026");
  });

  it("writes the email with full links and escapes what people typed", () => {
    const s = buildSummary([june]);
    const { html, text } = summaryEmail(s, { origin: "http://10.0.10.106:8014", dashboardPath: "/d/dash" }, "Hi <team>\nSee below");
    expect(html).toContain('href="http://10.0.10.106:8014/s/token-r6"');
    expect(html).toContain('href="http://10.0.10.106:8014/d/dash"');
    expect(html).toContain("Hi &lt;team&gt;<br>See below");

    expect(text).toContain("Compliance dashboard: http://10.0.10.106:8014/d/dash");
    expect(text).toContain("US DFC · Missing ASN (1 violation, $1,000.00)");
    expect(text).toContain("  - PO 333: $250.00, Not assigned");
    // One period: only the overview has a Period column
    expect(html.match(/>Period<\/th>/g)).toHaveLength(1);
  });

  it("leaves out the dashboard when it is off and says when there are no violations", () => {
    const s = buildSummary([input("r1", 202601, "Feb 2026", [])]);
    const { html, text } = summaryEmail(s, { origin: "https://x", dashboardPath: null });
    expect(html).not.toContain("/d/");
    expect(text).toContain("No violations.");
    expect(s.teams).toEqual([]);
  });
});
