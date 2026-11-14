import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest } from "@/lib/api";
import { importLogisticsFile, type ImportResult } from "@/lib/logistics/import";
import { MAX_FILE_BYTES } from "@/lib/import/parse";

/** Imports one or more logistics files (multipart "files"); each is recognised by its columns. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("logistics.manage");
  if (guard.error) return guard.error;
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return badRequest("Choose the files to import");
  if (files.length > 10) return badRequest("Import at most 10 files at a time");
  const results: (ImportResult | { fileName: string; error: string })[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      results.push({ fileName: f.name, error: "The file is larger than 25 MB" });
      continue;
    }
    try {
      results.push(await importLogisticsFile(new Uint8Array(await f.arrayBuffer()), f.name, guard.user.id));
    } catch (e) {
      results.push({ fileName: f.name, error: e instanceof Error ? e.message : "Couldn't read the file" });
    }
  }
  return NextResponse.json({ results });
}
