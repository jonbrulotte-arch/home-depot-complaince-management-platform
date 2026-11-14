import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { CANONICAL_FIELDS } from "@/lib/import/transform";
import { normalizeHeader } from "@/lib/import/values";

const aliasSchema = z.object({
  programId: z.string().trim().min(1).nullable(),
  metricId: z.string().trim().min(1).nullable(),
  sourceHeader: z.string().trim().min(1).max(200),
  canonicalField: z.enum(CANONICAL_FIELDS),
});

export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const body = await parseJson(req, aliasSchema);
  if (body.error) return body.error;
  const { programId, metricId, canonicalField } = body.data;
  const sourceHeader = normalizeHeader(body.data.sourceHeader);

  if (metricId) {
    const metric = await prisma.metric.findUnique({ where: { id: metricId } });
    if (!metric || (programId && metric.programId !== programId)) return badRequest("Metric does not belong to the program");
  } else if (programId && !(await prisma.program.findUnique({ where: { id: programId } }))) {
    return badRequest("Unknown program");
  }
  const scoped = { programId: metricId ? null : programId, metricId };
  if (await prisma.columnAlias.findFirst({ where: { ...scoped, sourceHeader } })) {
    return badRequest("That header is already mapped at this scope");
  }
  const alias = await prisma.columnAlias.create({ data: { ...scoped, sourceHeader, canonicalField } });
  await audit(guard.user.id, "alias.create", "ColumnAlias", alias.id, { ...scoped, sourceHeader, canonicalField });
  return NextResponse.json({ id: alias.id }, { status: 201 });
}
