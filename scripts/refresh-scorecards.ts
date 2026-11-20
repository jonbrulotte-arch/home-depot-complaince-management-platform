import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fiscalLabel } from "../src/lib/fiscal";
import { refreshPublishedScorecards } from "../src/lib/scorecard-refresh";

// Usage: npm run refresh-scorecards
// Rebuilds every published scorecard from the current data and replaces those that changed (new
// dispute decisions, reviews, team names, late imports), keeping them published. For cron, e.g.
// nightly after the backup.
async function main() {
  const r = await refreshPublishedScorecards(null);
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  console.log(`Checked ${r.checked} published scorecard(s): ${r.changed.length} refreshed, ${r.checked - r.changed.length - r.failed.length} unchanged, ${r.failed.length} failed.`);
  for (const c of r.changed) {
    console.log(`  ${fiscalLabel(c.fiscalMonth)} v${c.fromVersion} -> v${c.toVersion}: post-dispute ${money(c.before.postOffset)} -> ${money(c.after.postOffset)}, recovered ${money(c.before.recovered)} -> ${money(c.after.recovered)}`);
  }
  for (const f of r.failed) console.log(`  FAILED ${f.title}: ${f.error}`);
  if (r.failed.length) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
