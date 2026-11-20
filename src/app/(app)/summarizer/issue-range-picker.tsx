"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Choose the dates for the Issues report; they go in the address (?from=…&to=…) so a report can be reopened. */
export function IssueRangePicker({ from: initialFrom, to: initialTo, presets }: { from: string; to: string; presets: { label: string; from: string; to: string }[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const built = Boolean(initialFrom && initialTo);
  const unchanged = built && from === initialFrom && to === initialTo;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="issues-from" className="mb-1.5 block text-sm font-medium text-gray-700">
            From
          </label>
          <Input id="issues-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div>
          <label htmlFor="issues-to" className="mb-1.5 block text-sm font-medium text-gray-700">
            To
          </label>
          <Input id="issues-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                from === p.from && to === p.to ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => router.push(`/summarizer?from=${from}&to=${to}`)} disabled={!from || !to || unchanged}>
          <ClipboardList className="h-4 w-4 mr-1.5" />
          {built ? "Update issues report" : "Build issues report"}
        </Button>
        <span className="text-sm text-gray-500">Issues dated in the range, with the compliance data on their POs and the updates made during it.</span>
      </div>
    </div>
  );
}
