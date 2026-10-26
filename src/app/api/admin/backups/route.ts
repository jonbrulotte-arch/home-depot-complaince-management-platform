import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { saveBackup } from "@/lib/backup";

const schema = z.object({ label: z.string().trim().max(40).optional() });

/** Creates a backup on the server; download it from /api/admin/backups/[name]. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.backup");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const saved = await saveBackup(prisma, body.data.label || null);
  await audit(guard.user.id, "backup.create", "Backup", saved.name, { size: saved.size, counts: saved.counts });
  return NextResponse.json(saved, { status: 201 });
}
