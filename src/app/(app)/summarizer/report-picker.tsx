"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

export interface PickerReport {
  id: string;
  title: string;
  periodLabel: string;
  historical: boolean;
  violations: number;
  preOffset: number;
}

/** Choose the published reports to summarize; the selection goes in the address (?r=…) so a summary can be reopened. */
export function ReportPicker({ reports, selected: initial }: { reports: PickerReport[]; selected: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(initial));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ids = reports.filter((r) => selected.has(r.id)).map((r) => r.id);
  const unchanged = ids.length === initial.length && ids.every((id) => initial.includes(id));

  if (!reports.length) return <p className="text-sm text-gray-400">No published scorecards yet.</p>;
  return (
    <div className="space-y-3">
      <ul className="max-h-80 divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200">
        {reports.map((r) => (
          <li key={r.id}>
            <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50", selected.has(r.id) && "bg-blue-50 hover:bg-blue-50")}>
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">{r.periodLabel}</span>
                <span className="ml-2 text-sm text-gray-500">{r.title}</span>
                {r.historical && (
                  <Badge variant="secondary" className="ml-2">
                    Historical
                  </Badge>
                )}
              </span>
              <span className="shrink-0 text-sm text-gray-500">
                {r.violations} violation(s) · {formatCurrency(r.preOffset)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button onClick={() => router.push(`/summarizer?r=${ids.join(",")}`)} disabled={!ids.length || unchanged}>
          <FileText className="h-4 w-4 mr-1.5" />
          {initial.length ? "Update summary" : "Build summary"}
        </Button>
        {selected.size > 0 && (
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        )}
        <span className="text-sm text-gray-500">{ids.length} selected</span>
      </div>
    </div>
  );
}
