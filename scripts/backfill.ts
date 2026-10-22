import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { parseMonthLabel } from "../src/lib/fiscal";
import { buildPreview, persistImport, sha256 } from "../src/lib/import/persist";
import { runHistoricalReports } from "./historical-reports";

// Usage: npm run backfill -- <directory> [--dry-run] [--reports]
// --reports then creates published historical reports for the imported months
// (see scripts/historical-reports.ts).
// Imports every SPM export (US_*.xlsx) under <directory>, oldest folder first. The fiscal
// month comes from each line; folder names such as "Sep-2024" supply it for exports without
// one (US Drop Ship). Files already imported (same SHA-256) are skipped.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function folderFiscalMonth(file: string, root: string): number | null {
  const parts = path.relative(root, path.dirname(file)).split(path.sep).reverse();
  for (const part of parts) {
    const fm = parseMonthLabel(part);
    if (fm) return fm;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const root = args.find((a) => !a.startsWith("--"));
  if (!root) {
    console.error("Usage: npm run backfill -- <directory> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const all = walk(root);
  const isExport = (f: string) => /^US_.*\.xlsx$/i.test(path.basename(f));
  const skipped = all.filter((f) => !isExport(f));
  const files = all
    .filter(isExport)
    .map((f) => ({ file: f, fm: folderFiscalMonth(f, root) }))
    .sort((a, b) => (a.fm ?? 0) - (b.fm ?? 0) || a.file.localeCompare(b.file));

  let imported = 0;
  let lines = 0;
  for (const { file, fm } of files) {
    const rel = path.relative(root, file);
    const buffer = readFileSync(file);
    const hash = sha256(buffer);
    if (!dryRun && (await prisma.importBatch.findFirst({ where: { sha256: hash }, select: { id: true } }))) {
      console.log(`= ${rel} (already imported)`);
      continue;
    }
    if (!fm) console.warn(`! ${rel}: no month in folder name; lines without a fiscal month will be skipped`);
    try {
      const preview = await buildPreview(prisma, { buffer, fileName: path.basename(file), fallbackFiscalMonth: fm ?? 0 });
      if (!fm) preview.lines = preview.lines.filter((l) => l.fiscalMonth !== 0);
      const nc = preview.lines.filter((l) => !l.isCompliant).length;
      const summary = `${preview.programCode} ${preview.exportKind} ${preview.lines.length} lines, ${nc} non-compliant`;
      if (dryRun) {
        console.log(`~ ${rel}: ${summary}`);
      } else {
        const result = await persistImport(prisma, { preview, fileName: path.basename(file), sha256: hash, source: "backfill" });
        console.log(`+ ${rel}: ${summary} (${result.created} new, ${result.updated} updated)`);
        imported += 1;
      }
      lines += preview.lines.length;
      for (const w of preview.warnings) console.log(`    ! ${w}`);
    } catch (e) {
      console.error(`x ${rel}: ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n${dryRun ? "Would import" : "Imported"} ${dryRun ? files.length : imported} file(s), ${lines} line(s).`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} non-SPM file(s):`);
    for (const f of skipped) console.log(`  - ${path.relative(root, f)}`);
  }
  if (args.includes("--reports")) {
    console.log("\nHistorical reports:");
    await runHistoricalReports(dryRun ? ["--dry-run"] : []);
  }
}

main().finally(() => prisma.$disconnect());
