import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { backupDir, pruneBackups, saveBackup } from "../src/lib/backup";

// Usage: npm run backup [-- --keep 30] [--label scheduled]
// Writes a backup with the label (default "scheduled") to BACKUP_DIR (default ./backups) and keeps
// the newest N backups with that label. Run it from cron, e.g. daily: 15 2 * * * cd /app && npm run backup
// scripts/deploy.sh uses --label pre-deploy so its backups don't push out the scheduled ones.
function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const keepArg = option("--keep");
  const keep = keepArg === undefined ? 30 : Number(keepArg);
  if (!Number.isInteger(keep) || keep < 1) throw new Error("--keep must be a positive whole number");
  const label = option("--label") ?? "scheduled";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(label)) throw new Error("--label must be lowercase letters, digits and dashes");
  const saved = await saveBackup(prisma, label);
  const total = Object.values(saved.counts).reduce((s, n) => s + n, 0);
  console.log(`Saved ${backupDir()}/${saved.name} (${(saved.size / 1024).toFixed(0)} KB, ${total} rows)`);
  const removed = await pruneBackups(label, keep);
  if (removed.length) console.log(`Removed ${removed.length} older ${label} backup(s)`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
