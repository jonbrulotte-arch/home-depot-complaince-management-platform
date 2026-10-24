import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fiscalLabel } from "../src/lib/fiscal";
import { createHistoricalReport, deleteHistoricalReports, planHistoricalReports } from "../src/lib/historical";

// Usage: npm run historical-reports [-- --dry-run] [--from 202307] [--to 202603] [--rebuild]
// --rebuild replaces existing historical reports (e.g. after changing how reports are grouped).
// Creates a published, auto-reviewed report and scorecard for each month of imported data that
// has no report yet. By default the current and previous month are left for the normal workflow.
export async function runHistoricalReports(args: string[]) {
  const arg = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n)) throw new Error(`${name} needs a fiscal month such as 202405`);
    return n;
  };
  const dryRun = args.includes("--dry-run");
  const rebuild = args.includes("--rebuild");
  const plan = await planHistoricalReports(prisma, { from: arg("--from"), to: arg("--to"), rebuild });
  if (!plan.latest) {
    console.log("No imported data yet. Run the backfill first.");
    return;
  }
  console.log(`Months up to ${fiscalLabel(plan.to!)} (newest data: ${fiscalLabel(plan.latest)}; the current and previous month are left for the normal workflow unless --to is given).`);
  if (plan.existing.length) console.log(`Skipping ${plan.existing.length} month(s) that already have a report: ${plan.existing.map(fiscalLabel).join(", ")}`);
  if (!plan.months.length) {
    console.log("Nothing to create.");
    return;
  }
  if (rebuild && !dryRun) console.log(`Removed ${await deleteHistoricalReports(prisma)} existing historical report(s).`);

  for (const month of plan.months) {
    const programs = month.programs.map((p) => `${p.name} ${p.violations}/${p.lines}`).join(", ");
    if (dryRun) {
      console.log(`~ ${month.label}: ${programs}`);
      continue;
    }
    const r = await createHistoricalReport(prisma, month, null);
    console.log(`+ ${month.label}: ${r.violations} violation(s), $${r.preOffset.toFixed(2)} pre-dispute, $${r.postOffset.toFixed(2)} post-dispute`);
  }
  console.log(`\n${dryRun ? "Would create" : "Created and published"} ${plan.months.length} historical report(s).`);
}

if (process.argv[1]?.endsWith("historical-reports.ts")) {
  runHistoricalReports(process.argv.slice(2))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
