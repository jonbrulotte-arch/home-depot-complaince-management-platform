import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ImportError, MAX_FILE_BYTES } from "@/lib/import/parse";
import { buildPreview, persistImport, sha256 } from "@/lib/import/persist";
import { getPeriodBasis } from "@/lib/periods";

type Params = { params: Promise<{ id: string; programId: string }> };

// POST multipart/form-data with "file" (.xlsx). Without confirm=1 it returns a preview and
// writes nothing; with confirm=1 it imports the same file.
export async function POST(req: Request, { params }: Params) {
  const guard = await requireApiPermission("reports.import");
  if (guard.error) return guard.error;
  const { id, programId } = await params;

  const reportProgram = await prisma.reportProgram.findUnique({
    where: { reportId_programId: { reportId: id, programId } },
    include: { report: { include: { period: true } } },
  });
  if (!reportProgram) return notFound("Program is not part of this report");
  if (reportProgram.report.status !== "DRAFT" && reportProgram.report.status !== "IN_REVIEW") {
    return badRequest("Data can only be imported while the report is in Draft or In Review");
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("Attach an .xlsx file in the \"file\" field");
  if (!/\.xlsx$/i.test(file.name)) return badRequest("Only .xlsx SPM exports are supported");
  if (file.size > MAX_FILE_BYTES) return badRequest("File is larger than 25 MB");
  const confirm = form?.get("confirm") === "1";

  const buffer = Buffer.from(await file.arrayBuffer());
  const fiscalMonth = reportProgram.report.period.fiscalMonth;
  try {
    const preview = await buildPreview(prisma, {
      buffer,
      fileName: file.name,
      programId,
      fallbackFiscalMonth: fiscalMonth,
      // When reports group by month received, lines from other fiscal months (e.g. Fill Rate) are expected
      expectedFiscalMonth: (await getPeriodBasis()) === "FISCAL_MONTH" ? fiscalMonth : undefined,
    });
    const hash = sha256(buffer);
    const previous = await prisma.importBatch.findFirst({ where: { sha256: hash }, orderBy: { importedAt: "desc" } });
    if (previous) {
      preview.warnings.unshift(`This exact file was already imported on ${previous.importedAt.toISOString().slice(0, 10)}; importing again updates the same lines.`);
    }

    if (!confirm) {
      const { lines, ...rest } = preview;
      return NextResponse.json({
        preview: {
          ...rest,
          lineCount: lines.length,
          sample: lines
            .filter((l) => !l.isCompliant)
            .slice(0, 50)
            .map((l) => ({ metricCode: l.metricCode, fiscalMonth: l.fiscalMonth, poNumber: l.fields.poNumber ?? null, offset: l.offsetAmount, sheet: l.sourceSheet, row: l.sourceRow })),
        },
      });
    }

    const result = await persistImport(prisma, {
      preview,
      fileName: file.name,
      sha256: hash,
      source: "upload",
      reportProgramId: reportProgram.id,
      importedById: guard.user.id,
      receivedMonth: fiscalMonth,
    });
    await audit(guard.user.id, "import.confirm", "ImportBatch", result.batchId, { reportId: id, programId, fileName: file.name, ...result });
    return NextResponse.json({ result }, { status: 201 });
  } catch (e) {
    if (e instanceof ImportError) return badRequest(e.message);
    throw e;
  }
}
