import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { BackupError, deleteBackupFile, isBackupName, readBackupFile } from "@/lib/backup";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await requireApiPermission("admin.backup");
  if (guard.error) return guard.error;
  const { name } = await params;
  if (!isBackupName(name)) return badRequest("Invalid backup name");
  try {
    const buffer = await readBackupFile(name);
    await audit(guard.user.id, "backup.download", "Backup", name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${name}"` },
    });
  } catch (e) {
    if (e instanceof BackupError) return notFound(e.message);
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireApiPermission("admin.backup");
  if (guard.error) return guard.error;
  const { name } = await params;
  if (!isBackupName(name)) return badRequest("Invalid backup name");
  await deleteBackupFile(name).catch(() => null);
  await audit(guard.user.id, "backup.delete", "Backup", name);
  return NextResponse.json({ ok: true });
}
