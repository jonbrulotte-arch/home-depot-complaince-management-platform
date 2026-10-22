import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { backupDir, pruneBackups, saveBackup } from "../src/lib/backup";

// Usage: npm run backup [-- --keep 30]
// Writes a backup labelled "scheduled" to BACKUP_DIR (default ./backups) and keeps the newest
// N scheduled backups. Run it from cron, e.g. daily: 15 2 * * * cd /app && npm run backup
async function main() {
  const i = process.argv.indexOf("--keep");
  const keep = i > 0 ? Number(process.argv[i + 1]) : 30;
  if (!Number.isInteger(keep) || keep < 1) throw new Error("--keep must be a positive whole number");
  const saved = await saveBackup(prisma, "scheduled");
  const total = Object.values(saved.counts).reduce((s, n) => s + n, 0);
  console.log(`Saved ${backupDir()}/${saved.name} (${(saved.size / 1024).toFixed(0)} KB, ${total} rows)`);
  const removed = await pruneBackups("scheduled", keep);
  if (removed.length) console.log(`Removed ${removed.length} older scheduled backup(s)`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
