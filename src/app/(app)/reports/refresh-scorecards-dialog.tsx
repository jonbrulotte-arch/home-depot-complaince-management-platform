"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";
import { fiscalLabel } from "@/lib/fiscal";
import { cn, formatCurrency } from "@/lib/utils";
import type { RefreshResult } from "@/lib/scorecard-refresh";

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm whitespace-nowrap";

function Moved({ from, to, money = true, goodWhenUp = false }: { from: number; to: number; money?: boolean; goodWhenUp?: boolean }) {
  const f = (n: number) => (money ? formatCurrency(n) : n.toLocaleString("en-US"));
  if (from === to) return <span className="text-gray-500">{f(to)}</span>;
  const better = goodWhenUp ? to > from : to < from;
  return (
    <span>
      <span className="text-gray-400 line-through">{f(from)}</span> <span className={cn("font-medium", better ? "text-green-700" : "text-red-700")}>{f(to)}</span>
    </span>
  );
}

/** "Refresh scorecards": rebuilds every published scorecard and replaces the ones whose data changed. */
export function RefreshScorecardsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefreshResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await apiFetch<RefreshResult>("/api/reports/scorecards/refresh", { body: {} }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh the scorecards");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setOpen(false);
    setResult(null);
    setError(null);
  };
  const unchanged = result ? result.checked - result.changed.length - result.failed.length : 0;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Refresh scorecards
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : !busy && close())}>
        <DialogContent className={result?.changed.length ? "max-w-4xl" : undefined}>
          <DialogHeader>
            <DialogTitle>Refresh published scorecards</DialogTitle>
            <DialogDescription>
              {result
                ? `Checked ${result.checked} published scorecard(s): ${result.changed.length} refreshed, ${unchanged} already up to date${result.failed.length ? `, ${result.failed.length} failed` : ""}.`
                : "Rebuilds every published scorecard from the current data (dispute decisions, reviews, teams, late imports) and replaces the ones that changed. They stay published throughout: the publish date, public link and feedback are kept, and each refreshed scorecard gets a new version. Scorecards with nothing new are left as they are."}
            </DialogDescription>
          </DialogHeader>

          {result && result.changed.length > 0 && (
            <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {["Month", "Version", "Violations", "Offsets", "Recovered", "Post-dispute", "Awaiting THD"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.changed.map((c) => (
                    <tr key={c.reportId} className="border-t border-gray-200">
                      <td className={cn(td, "text-gray-900")}>{fiscalLabel(c.fiscalMonth)}</td>
                      <td className={cn(td, "text-gray-500")}>
                        v{c.fromVersion} → v{c.toVersion}
                      </td>
                      <td className={td}>
                        <Moved from={c.before.violations} to={c.after.violations} money={false} />
                      </td>
                      <td className={td}>
                        <Moved from={c.before.preOffset} to={c.after.preOffset} />
                      </td>
                      <td className={td}>
                        <Moved from={c.before.recovered} to={c.after.recovered} goodWhenUp />
                      </td>
                      <td className={td}>
                        <Moved from={c.before.postOffset} to={c.after.postOffset} />
                      </td>
                      <td className={td}>
                        <Moved from={c.before.pendingAmount} to={c.after.pendingAmount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && result.changed.length > 0 && (
            <p className="text-xs text-gray-500">A scorecard can change with the same totals, for example when a team was renamed, a root cause added or a dispute moved status.</p>
          )}
          {result?.failed.map((f) => (
            <p key={f.reportId} className="text-sm text-red-700">
              {f.title}: {f.error}
            </p>
          ))}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          <DialogFooter>
            {result ? (
              <Button onClick={close}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={run} disabled={busy}>
                  <RefreshCw className={cn("h-4 w-4 mr-1.5", busy && "animate-spin")} />
                  {busy ? "Refreshing… (this can take a minute)" : "Refresh all"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
