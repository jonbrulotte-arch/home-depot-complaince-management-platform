"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";
import { cn, formatCurrency } from "@/lib/utils";
import type { DataPeriod } from "@prisma/client";

interface Preview {
  programCode: string;
  exportKind: string;
  lineCount: number;
  /** Lines from the other period's sheets, which only update existing lines */
  updateOnlyCount: number;
  fiscalMonths: Record<string, number>;
  metrics: { metricId: string; name: string; sheet: string; total: number; nonCompliant: number; offset: number; unmappedHeaders: string[]; outOfPeriod?: boolean }[];
  emptySheets: string[];
  warnings: string[];
  sample: { metricCode: string; fiscalMonth: number; poNumber: string | null; offset: number; sheet: string; row: number }[];
}

/** Imports an SPM export into one compliance period (On-Time & Fill Rate, or All other data) of a program. */
export function ImportPanel({ reportId, programId, programName, period, periodLabel }: { reportId: string; programId: string; programName: string; period: DataPeriod; periodLabel: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/reports/${reportId}/programs/${programId}/import`;

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("period", period);
      const res = await apiFetch<{ preview: Preview }>(url, { form });
      setPreview(res.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("period", period);
      form.set("confirm", "1");
      await apiFetch(url, { form });
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setBusy(false);
    }
  }

  function close() {
    setFile(null);
    setPreview(null);
    setError(null);
    setBusy(false);
  }

  return (
    <>
      <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4 mr-1.5" />
        {busy && !preview ? "Reading…" : "Import SPM export"}
      </Button>

      <Dialog open={Boolean(file && (preview || error))} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Import {periodLabel} into {programName}
            </DialogTitle>
            <DialogDescription>{file?.name}</DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{preview.exportKind.replace("_", " ")}</Badge>
                <Badge variant="secondary">{preview.lineCount} lines</Badge>
                {Object.entries(preview.fiscalMonths).map(([fm, n]) => (
                  <Badge key={fm} variant="secondary">FM {fm}: {n}</Badge>
                ))}
              </div>
              {preview.warnings.length > 0 && (
                <ul className="space-y-1">
                  {preview.warnings.map((w) => (
                    <li key={w} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{w}</li>
                  ))}
                </ul>
              )}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Sheet", "Lines", "Non-compliant", "Offsets", "Kept as raw only"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.metrics.map((m) => (
                      <tr key={m.metricId} className={cn("border-t border-gray-200", m.outOfPeriod && "bg-gray-50 text-gray-500")}>
                        <td className="px-4 py-2 text-gray-900">
                          {m.name}
                          {m.outOfPeriod && <div className="text-xs text-gray-500">Other period: only updates lines already imported</div>}
                        </td>
                        <td className="px-4 py-2 text-gray-700">{m.total}</td>
                        <td className="px-4 py-2 text-gray-700">{m.nonCompliant}</td>
                        <td className="px-4 py-2 text-gray-700">{formatCurrency(m.offset)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{m.unmappedHeaders.join(", ") || "—"}</td>
                      </tr>
                    ))}
                    {preview.emptySheets.map((s) => (
                      <tr key={s} className="border-t border-gray-200 opacity-50">
                        <td className="px-4 py-2 text-gray-900">{s}</td>
                        <td colSpan={4} className="px-4 py-2 text-xs text-gray-500">No data in export</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.sample.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Non-compliant lines (first {preview.sample.length})</p>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 text-xs">
                    {preview.sample.map((l) => (
                      <div key={`${l.sheet}-${l.row}`} className="flex justify-between border-t border-gray-100 px-3 py-1.5 first:border-t-0">
                        <span className="text-gray-700">{l.metricCode} · PO {l.poNumber ?? "—"} · FM {l.fiscalMonth}</span>
                        <span className="text-gray-900">{formatCurrency(l.offset)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            {preview && (
              <Button onClick={confirm} disabled={busy || preview.lineCount + preview.updateOnlyCount === 0}>
                {busy ? "Importing…" : preview.lineCount ? `Import ${preview.lineCount} lines` : "Update existing lines"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
