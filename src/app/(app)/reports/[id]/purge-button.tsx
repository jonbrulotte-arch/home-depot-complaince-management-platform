"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";
import type { PurgeSummary } from "@/lib/purge";
import type { DataPeriod } from "@prisma/client";

/** Deletes a program's imports for one compliance period of this report and the lines they created, after a confirmation. */
export function PurgeButton({ reportId, programId, programName, period, periodLabel }: { reportId: string; programId: string; programName: string; period: DataPeriod; periodLabel: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<PurgeSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/reports/${reportId}/programs/${programId}/purge?period=${period}`;

  async function start() {
    setOpen(true);
    setSummary(null);
    setError(null);
    try {
      setSummary(await apiFetch<PurgeSummary>(url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the imports");
    }
  }

  async function purge() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(url, { method: "POST" });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setBusy(false);
    }
  }

  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <>
      <Button variant="outline" size="sm" onClick={start} className="text-red-600 hover:text-red-700">
        <Trash2 className="h-4 w-4 mr-1.5" />
        Purge data
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge {programName} data?</DialogTitle>
            <DialogDescription>
              Removes the {periodLabel} imports for this program so you can import again. The other period&apos;s import is not touched. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {summary && (
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li>
                <span className="font-medium text-gray-900">{n(summary.imports)}</span> import(s) and the <span className="font-medium text-gray-900">{n(summary.linesRemoved)}</span> line(s) they added are deleted.
              </li>
              {summary.reviews > 0 && (
                <li className="text-red-700">
                  {n(summary.reviews)} line review(s){summary.disputes > 0 && <> and {n(summary.disputes)} dispute(s)</>} on those lines are deleted too.
                </li>
              )}
              {summary.linesKept > 0 && <li className="text-gray-500">{n(summary.linesKept)} line(s) that were already in the database from earlier imports are kept.</li>}
              <li className="text-gray-500">Shipment counts and date ranges are kept.</li>
            </ul>
          )}
          {!summary && !error && <p className="text-sm text-gray-500">Checking the imports…</p>}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={purge} disabled={busy || !summary}>{busy ? "Purging…" : "Purge data"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
