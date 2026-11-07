import { describe, expect, it } from "vitest";
import {
  byMonth,
  changePct,
  crossTab,
  disputeGaps,
  figures,
  fiscalQuarter,
  goalPerformance,
  groupBy,
  issueInsights,
  metricKey,
  previousFrame,
  priorYearFrame,
  programKey,
  repeatPos,
  resolveTimeFrame,
  rootCauses,
  expectedVsAssessed,
  teamKey,
  winRate,
  type InsightIssue,
  type InsightLine,
} from "@/lib/insights";

let id = 0;
function line(o: Partial<InsightLine> = {}): InsightLine {
  return {
    id: `l${++id}`,
    month: 202608,
    programCode: "US_DS",
    programName: "US Drop Ship",
    metricCode: "ON_TIME",
    metricName: "On Time",
    isCompliant: false,
    offset: 10,
    disposition: "ACCEPTED",
    team: "WAREHOUSE_SITE_0",
    rootCause: null,
    dcNumber: null,
    carrier: null,
    sku: null,
    skuDescription: null,
    poNumber: "111",
    poRecordId: "r111",
    dispute: null,
    hasFeedback: false,
    ...o,
  };
}
const dispute = (status: NonNullable<InsightLine["dispute"]>["status"], disputed: number, recovered: number | null = null) => ({ status, disputed, recovered, reasonCode: "Carrier delay", submittedAt: new Date("2026-09-01"), decidedAt: status === "SUBMITTED" ? null : new Date("2026-09-11") });

describe("time frames", () => {
  it("ends at the latest month with data and counts back", () => {
    const f = resolveTimeFrame("3", 202608, 202301);
    expect(f.months).toEqual([202606, 202607, 202608]);
    expect(f.label).toBe("Jul 2026 – Sep 2026");
    expect(resolveTimeFrame("12", 202602, 202301).from).toBe(202503);
  });

  it("handles fiscal years (February to January), all time and custom ranges", () => {
    expect(resolveTimeFrame("fytd", 202608, 202301).months).toHaveLength(8);
    expect(resolveTimeFrame("pfy", 202608, 202301)).toMatchObject({ from: 202501, to: 202512 });
    expect(resolveTimeFrame("all", 202608, 202511).months).toHaveLength(10);
    expect(resolveTimeFrame("custom", 202608, 202301, { from: "202605", to: "202602" })).toMatchObject({ from: 202602, to: 202605 });
    expect(resolveTimeFrame("nonsense", 202608, 202301).key).toBe("12");
    expect(resolveTimeFrame("12", null, null).months).toEqual([]);
  });

  it("finds the previous period, the same months last year and fiscal quarters", () => {
    const f = resolveTimeFrame("3", 202608, 202301);
    expect(previousFrame(f)).toEqual({ from: 202603, to: 202605 });
    expect(priorYearFrame(f)).toEqual({ from: 202506, to: 202508 });
    expect(fiscalQuarter(202601)).toBe("FY2026 Q1");
    expect(fiscalQuarter(202612)).toBe("FY2026 Q4");
  });
});

describe("figures", () => {
  it("counts violations as scorecards do, leaving out Cancelled / Resolved and compliant lines", () => {
    const f = figures([line(), line({ disposition: "RESOLVED" }), line({ isCompliant: true, offset: 0 }), line({ disposition: "PENDING", offset: 5 }), line({ disposition: null, offset: 5 })]);
    expect(f).toMatchObject({ lines: 5, violations: 3, offsets: 20, unreviewed: 2 });
  });

  it("nets out what approved disputes recovered and measures the win rate", () => {
    const f = figures([
      line({ offset: 100, dispute: dispute("APPROVED", 100, 100) }),
      line({ offset: 50, dispute: dispute("PARTIAL", 50, 20) }),
      line({ offset: 30, dispute: dispute("DENIED", 30) }),
      line({ offset: 40, dispute: dispute("SUBMITTED", 40) }),
      line({ offset: 10, dispute: dispute("WITHDRAWN", 10) }),
    ]);
    expect(f).toMatchObject({ offsets: 230, recovered: 120, net: 110, disputed: 4, decided: 3, won: 2, awaiting: 40 });
    expect(winRate(f)).toBeCloseTo(66.67, 1);
    expect(winRate({ won: 0, decided: 0 })).toBeNull();
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(5, 0)).toBeNull();
  });
});

describe("grouping", () => {
  const lines = [
    line({ offset: 100, programCode: "US_RDC", programName: "US RDC", metricCode: "LATE_ASN", metricName: "Late ASN", team: "EDI", rootCause: "BC roll-out", month: 202607 }),
    line({ offset: 50, team: "EDI", rootCause: "bc  roll-out", month: 202608 }),
    line({ offset: 25, team: null }),
    line({ offset: 0, isCompliant: true }),
  ];

  it("groups by team, program or metric with shares, largest first", () => {
    const teams = groupBy(lines, teamKey, (k) => k);
    expect(teams.map((t) => [t.label, t.offsets, Math.round(t.share)])).toEqual([["EDI", 150, 86], ["Not set", 25, 14]]);
    expect(groupBy(lines, metricKey).map((m) => m.key)).toEqual(["US_RDC|LATE_ASN", "US_DS|ON_TIME"]);
  });

  it("lays out months, cross-tabs and root causes", () => {
    expect(byMonth(lines, [202607, 202608, 202609]).map((m) => m.offsets)).toEqual([100, 75, 0]);
    const x = crossTab(lines, { key: teamKey, label: (k) => k }, { key: programKey, label: (_k, l) => l.programName });
    expect(x.cell("EDI", "US_RDC").offsets).toBe(100);
    expect(x.cell("EDI", "US_DS").offsets).toBe(50);
    expect(rootCauses(lines)).toEqual([{ cause: "BC roll-out", violations: 2, offsets: 150, teams: ["EDI"] }]);
  });

  it("finds POs with repeat violations and disputable lines never disputed", () => {
    const rp = repeatPos([line({ month: 202607 }), line({ metricName: "Fill Rate" }), line({ poNumber: "222", poRecordId: "r222" })]);
    expect(rp).toEqual([{ poNumber: "111", poRecordId: "r111", violations: 2, offsets: 20, metrics: ["On Time", "Fill Rate"], months: ["Aug 2026", "Sep 2026"] }]);
    expect(disputeGaps([line({ disposition: "DISPUTABLE" }), line({ disposition: "DISPUTABLE", dispute: dispute("READY", 10) })])).toEqual({
      disputableNotDisputed: { count: 1, offsets: 10 },
      open: { count: 1, disputed: 10 },
    });
  });
});

describe("performance against goal", () => {
  it("lines up published scorecards by month and counts months that met the goal", () => {
    const snap = (month: number, postPct: number, meetsGoal: boolean) => ({
      month,
      programs: [{ code: "US_DS", name: "US Drop Ship", metrics: [{ code: "ON_TIME", name: "On Time", goalPct: 95, prePct: postPct, postPct, meetsGoal, postOffset: 0 }] }],
    });
    const g = goalPerformance([snap(202608, 96, true), snap(202607, 90, false), snap(202501, 99, true)], [202607, 202608]);
    expect(g.months).toEqual([202607, 202608]);
    expect(g.programs[0].metrics[0]).toMatchObject({ goalPct: 95, met: 1, judged: 2 });
    expect(g.programs[0].metrics[0].cells.map((c) => c?.pct)).toEqual([90, 96]);
    expect(goalPerformance([snap(202608, 96, true)], [202608], "US_RDC").programs).toEqual([]);
  });
});

describe("issue insights", () => {
  const issue = (o: Partial<InsightIssue>): InsightIssue => ({
    id: "i",
    number: 1,
    title: "t",
    issueDate: new Date("2026-09-10T00:00:00Z"),
    status: "OPEN",
    severity: "MEDIUM",
    category: "ASN / EDI",
    team: "EDI",
    programCode: null,
    createdAt: new Date("2026-09-10"),
    resolvedAt: null,
    followUpDate: null,
    poCount: 1,
    posFound: 1,
    estimatedFine: null,
    violations: 0,
    offsets: 0,
    ...o,
  });
  const monthOf = (d: Date) => (d.getUTCMonth() === 8 ? 202608 : 202607);

  it("counts issues by category, ages open ones and finds overdue follow-ups", () => {
    const now = new Date("2026-11-06T00:00:00Z");
    const ins = issueInsights(
      [
        issue({ id: "a", violations: 2, offsets: 250, followUpDate: new Date("2026-11-01T00:00:00Z") }),
        issue({ id: "b", status: "RESOLVED", category: "Carrier / pickup", resolvedAt: new Date("2026-09-14T00:00:00Z") }),
        issue({ id: "c", issueDate: new Date("2026-08-01T00:00:00Z") }),
      ],
      [202608],
      monthOf,
      now,
    );
    expect(ins).toMatchObject({ total: 2, open: 1, withViolations: 1, linkedOffsets: 250, avgDaysToResolve: 4 });
    expect(ins.byCategory.map((c) => [c.label, c.count])).toEqual([["ASN / EDI", 1], ["Carrier / pickup", 1]]);
    expect(ins.aging.map((a) => a.count)).toEqual([0, 0, 1, 1]);
    expect(ins.overdue.map((i) => i.id)).toEqual(["a"]);
    expect(ins.costliest.map((i) => i.id)).toEqual(["a"]);
  });

  it("compares expected fines with what THD assessed on the issues' POs", () => {
    const e = expectedVsAssessed([
      issue({ id: "a", estimatedFine: 5950, offsets: 1700 }),
      issue({ id: "b", estimatedFine: 1000, offsets: 0 }),
      issue({ id: "c", estimatedFine: null, offsets: 250 }),
      issue({ id: "d", estimatedFine: null, offsets: 0 }),
    ]);
    expect(e.estimated).toEqual({ issues: 2, expected: 6950, assessed: 1700, difference: -5250 });
    expect(e.fineRows.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
