import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest } from "@/lib/api";
import { audit } from "@/lib/audit";
import { BackupError, MAX_BACKUP_UPLOAD_BYTES, readBackup, readBackupFile, restoreBackup, saveBackup } from "@/lib/backup";

// multipart/form-data with confirm=RESTORE and either "file" (an uploaded backup) or "name"
// (a backup stored on the server). A safety backup of the current data is saved first.
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.backup");
  if (guard.error) return guard.error;
  const form = await req.formData().catch(() => null);
  if (form?.get("confirm") !== "RESTORE") return badRequest('Type RESTORE to confirm');

  const file = form.get("file");
  const name = form.get("name");
  try {
    let buffer: Buffer;
    let source: string;
    if (file instanceof File) {
      if (file.size > MAX_BACKUP_UPLOAD_BYTES) return badRequest("Backup files are limited to 500 MB");
      buffer = Buffer.from(await file.arrayBuffer());
      source = `upload ${file.name}`;
    } else if (typeof name === "string" && name) {
      buffer = await readBackupFile(name);
      source = name;
    } else {
      return badRequest("Choose a backup to restore");
    }

    const backup = readBackup(buffer);
    const safety = await saveBackup(prisma, "pre-restore");
    const counts = await restoreBackup(prisma, backup);

    // The restored data may not contain the person who ran the restore
    const stillExists = await prisma.user.findUnique({ where: { id: guard.user.id }, select: { id: true } });
    await audit(stillExists ? guard.user.id : null, "backup.restore", "Backup", source, { backupCreatedAt: backup.createdAt, safetyBackup: safety.name, counts, by: guard.user.email });
    return NextResponse.json({ restored: counts, backupCreatedAt: backup.createdAt, safetyBackup: safety.name, signedOut: !stillExists });
  } catch (e) {
    if (e instanceof BackupError) return badRequest(e.message);
    throw e;
  }
}
