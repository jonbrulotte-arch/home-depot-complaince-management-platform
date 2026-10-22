"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";
import { fiscalLabel } from "@/lib/fiscal";
import type { HistoricalPlan, HistoricalResult } from "@/lib/historical";

export function HistoricalDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<HistoricalPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<HistoricalResult[] | null>(null);

  async function load() {
    setOpen(true);
    setPlan(null);
    setCreated(null);
    setError(null);
    try {
      setPlan(await apiFetch<HistoricalPlan>("/api/reports/historical"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the archive months");
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ created: HistoricalResult[] }>("/api/reports/historical", { method: "POST" });
      setCreated(r.created);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the reports");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={load}>
        <History className="h-4 w-4 mr-1.5" />
        Historical reports
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create historical reports</DialogTitle>
            <DialogDescription>
              For each month of imported data without a report, create a report and publish its scorecard. Violations are accepted as THD reported them;
              dispute results come from THD&apos;s exports. The newest two months are left for the normal workflow.
            </DialogDescription>
          </DialogHeader>

          {!plan && !error && <p className="text-sm text-gray-500">Checking the imported months…</p>}
          {plan && !created && (
            <div className="space-y-2 text-sm">
              {plan.months.length === 0 ? (
                <p className="text-gray-500">Every month up to {plan.to ? fiscalLabel(plan.to) : "now"} already has a report.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Programs (violations / lines)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.months.map((m) => (
                        <tr key={m.fiscalMonth} className="border-t border-gray-200">
                          <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{m.label}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{m.programs.map((p) => `${p.name} ${p.violations}/${p.lines}`).join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {plan.existing.length > 0 && <p className="text-xs text-gray-500">Already have a report (skipped): {plan.existing.map(fiscalLabel).join(", ")}</p>}
            </div>
          )}
          {created && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              Created and published {created.length} historical report(s). They are on the Scorecards page.
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>{created ? "Close" : "Cancel"}</Button>
            {plan && !created && plan.months.length > 0 && (
              <Button onClick={create} disabled={busy}>{busy ? `Creating ${plan.months.length} reports…` : `Create ${plan.months.length} reports`}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
