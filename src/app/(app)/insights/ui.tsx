import type { ReactNode } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Building blocks for the Reports & Insights tabs: cards, tables with an optional magnitude bar,
// and the number formats they share.

export const n = (v: number) => v.toLocaleString("en-US");
export const money = (v: number) => formatCurrency(v);
/** Whole dollars, e.g. $5,950 */
export const dollars = (v: number) => formatCurrency(v).replace(/\.00$/, "");
/** "+$250.00" / "−$4,250.00" */
export const signedMoney = (v: number) => (v === 0 ? "$0.00" : `${v > 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`);
export const pct = (v: number | null, digits = 1) => (v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}%`);

/** "+12%" / "−8%" for a change; `upIsBad` colours a rise red (offsets, violations) */
export function Change({ value, upIsBad = true }: { value: number | null; upIsBad?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-gray-400">—</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="text-gray-500">0%</span>;
  const bad = upIsBad ? rounded > 0 : rounded < 0;
  return <span className={bad ? "text-red-700" : "text-green-700"}>{`${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`}</span>;
}

export function Section({ title, description, children, className, action }: { title: string; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export interface Col<R> {
  header: string;
  cell: (row: R) => ReactNode;
  align?: "right";
  className?: string;
}

const th = "px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm align-top";

/** A Sympl table; `bar` adds a column with a bar sized by that value against the largest row. */
export function Table<R>({ rows, cols, empty = "Nothing in this time frame.", bar, foot }: { rows: R[]; cols: Col<R>[]; empty?: string; bar?: { header: string; value: (row: R) => number }; foot?: ReactNode[] }) {
  if (!rows.length) return <p className="px-6 pb-6 text-sm text-gray-400">{empty}</p>;
  const max = bar ? Math.max(...rows.map(bar.value), 0) : 0;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            {cols.map((c) => (
              <th key={c.header} className={cn(th, c.align === "right" ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
            {bar && <th className={cn(th, "text-left w-40")}>{bar.header}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-200">
              {cols.map((c) => (
                <td key={c.header} className={cn(td, c.align === "right" ? "text-right tabular-nums whitespace-nowrap" : "text-left", "text-gray-700", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
              {bar && (
                <td className={cn(td, "w-40")}>
                  <div className="h-2 rounded-sm bg-gray-100" aria-hidden>
                    <div className="h-2 rounded-sm bg-blue-600" style={{ width: `${max ? Math.max((bar.value(r) / max) * 100, bar.value(r) > 0 ? 2 : 0) : 0}%` }} />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot className="bg-gray-50">
            <tr className="border-t border-gray-200 font-semibold text-gray-900">
              {foot.map((f, i) => (
                <td key={i} className={cn(td, cols[i]?.align === "right" ? "text-right tabular-nums whitespace-nowrap" : "text-left")}>
                  {f}
                </td>
              ))}
              {bar && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
