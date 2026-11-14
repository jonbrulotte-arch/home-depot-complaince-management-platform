import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { readBackup, restoreBackup, saveBackup } from "../src/lib/backup";

// Usage: npm run restore -- <backup.json.gz> --yes
// Replaces ALL data with the backup's (for disaster recovery when the app cannot run).
// A "pre-restore" backup of the current data is saved to BACKUP_DIR first.
async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file || !process.argv.includes("--yes")) {
    console.error("Usage: npm run restore -- <backup.json.gz> --yes   (replaces all data)");
    process.exitCode = 1;
    return;
  }
  const backup = readBackup(readFileSync(file));
  const safety = await saveBackup(prisma, "pre-restore");
  console.log(`Saved the current data to ${safety.name}`);
  const counts = await restoreBackup(prisma, backup);
  console.log(`Restored backup from ${backup.createdAt}:`, counts);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
