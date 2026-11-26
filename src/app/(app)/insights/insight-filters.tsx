"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_OPTIONS } from "@/lib/insights";

const ALL = "all";

/** Time frame and program for every Reports & Insights tab; kept in the address so it can be bookmarked. */
export function InsightFilters({
  tab,
  range,
  from,
  to,
  program,
  months,
  programs,
}: {
  tab: string;
  range: string;
  from: number;
  to: number;
  program: string | null;
  /** Months with data, oldest first, for the custom range */
  months: { value: number; label: string }[];
  programs: { code: string; name: string }[];
}) {
  const router = useRouter();
  function go(next: Partial<{ range: string; from: number; to: number; program: string | null }>) {
    const v = { range, from, to, program, ...next };
    const params = new URLSearchParams({ tab, range: v.range });
    if (v.range === "custom") {
      params.set("from", String(v.from));
      params.set("to", String(v.to));
    }
    if (v.program) params.set("program", v.program);
    router.push(`/insights?${params}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-52">
        <label htmlFor="ins-range" className="mb-1 block text-xs font-medium text-gray-500">
          Time frame
        </label>
        <Select value={range} onValueChange={(r) => go({ range: r })}>
          <SelectTrigger id="ins-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {range === "custom" && (
        <>
          <MonthPicker id="ins-from" label="From" value={from} months={months} onChange={(m) => go({ from: m })} />
          <MonthPicker id="ins-to" label="To" value={to} months={months} onChange={(m) => go({ to: m })} />
        </>
      )}
      <div className="w-56">
        <label htmlFor="ins-program" className="mb-1 block text-xs font-medium text-gray-500">
          Program
        </label>
        <Select value={program ?? ALL} onValueChange={(p) => go({ program: p === ALL ? null : p })}>
          <SelectTrigger id="ins-program">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All programs</SelectItem>
            {programs.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function MonthPicker({ id, label, value, months, onChange }: { id: string; label: string; value: number; months: { value: number; label: string }[]; onChange: (m: number) => void }) {
  return (
    <div className="w-36">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-500">
        {label}
      </label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
