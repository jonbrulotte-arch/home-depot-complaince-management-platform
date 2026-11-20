import { requirePagePermission } from "@/lib/auth-guard";
import { backupDir, listBackups } from "@/lib/backup";
import { BackupManager } from "./backup-manager";

export default async function BackupPage() {
  await requirePagePermission("admin.backup");
  const backups = await listBackups();
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup &amp; Restore</h1>
        <p className="text-sm text-gray-500 mt-1">
          A backup holds all platform data: users and roles, configuration, every imported line, reviews, disputes with their attachments, and scorecards.
        </p>
      </div>
      <BackupManager backups={backups} dir={backupDir()} />
    </div>
  );
}
