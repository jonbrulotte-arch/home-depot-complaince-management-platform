"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PeriodBasis } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/client-api";

const OPTIONS: { value: PeriodBasis; title: string; detail: string }[] = [
  {
    value: "RECEIVED_MONTH",
    title: "Month received",
    detail: "Each line belongs to the monthly report it arrived in (the report it was imported into, or its archive folder). Matches the monthly compliance workbooks: Fill Rate, assessed about eight weeks after arrival, lands in a later report.",
  },
  {
    value: "FISCAL_MONTH",
    title: "THD fiscal month",
    detail: "Each line belongs to the fiscal month THD gives it in the SPM export (FM01 = February), regardless of when it arrived.",
  },
];

export function ReportPeriodSettings({ initial }: { initial: PeriodBasis }) {
  const router = useRouter();
  const [basis, setBasis] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/settings/report-periods", { method: "PUT", body: { basis } });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Report periods</CardTitle>
          <CardDescription>Which month groups compliance lines into monthly reports, the dashboard and scorecards.</CardDescription>
        </div>
        <Button onClick={save} disabled={saving || basis === initial}>{saving ? "Saving…" : saved && basis === initial ? "Saved" : "Save"}</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50">
            <input type="radio" name="basis" className="mt-1 h-4 w-4 text-blue-600" checked={basis === o.value} onChange={() => { setBasis(o.value); setSaved(false); }} />
            <span>
              <span className="block text-sm font-medium text-gray-900">{o.title}</span>
              <span className="block text-xs text-gray-500">{o.detail}</span>
            </span>
          </label>
        ))}
        {basis !== initial && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Open reports regroup straight away; published scorecards keep their numbers. To regroup historical reports, use Compliance Reports › Historical reports › Rebuild after saving.
          </p>
        )}
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </CardContent>
    </Card>
  );
}
