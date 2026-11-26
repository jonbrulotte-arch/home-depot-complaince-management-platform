import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { pomSkuText, type PomEvidence } from "@/lib/pom";

const cell = "px-2 py-1 text-right tabular-nums";

/** What THD's POM (Supplier Hub) shows for a violation's PO and SKU: status, quantities and a hint for disputing */
export function PomEvidenceCard({ evidence, children }: { evidence: PomEvidence; children?: React.ReactNode }) {
  const l = evidence.line;
  const cancelled = Boolean(l?.status && /^cancel/i.test(l.status));
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", cancelled ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-gray-900">
          <ClipboardList className="h-4 w-4 text-gray-400" />
          POM (Supplier Hub)
        </p>
        <p className="text-xs text-gray-500">
          PO {evidence.poNumber} · {evidence.poStatus}
          {evidence.destination ? ` · to ${evidence.destination}${evidence.crossDock ? ` (${evidence.crossDock})` : ""}` : ""}
          {evidence.reasonCode ? ` · reason code ${evidence.reasonCode}` : ""}
        </p>
      </div>
      <p className="mt-1 text-gray-700">{evidence.summary}</p>
      {evidence.hint && <p className={cn("mt-1 text-xs", cancelled ? "text-amber-800" : "text-gray-600")}>{evidence.hint}</p>}
      {l && (
        <table className="mt-2 text-xs text-gray-700">
          <thead className="text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left font-medium">SKU</th>
              <th className="px-2 py-1 text-left font-medium">Status</th>
              <th className={cn(cell, "font-medium")}>Ordered</th>
              <th className={cn(cell, "font-medium")}>Adjusted</th>
              <th className={cn(cell, "font-medium")}>Shipped</th>
              <th className={cn(cell, "font-medium")}>Received</th>
            </tr>
          </thead>
          <tbody>
            {[l, ...evidence.otherLines].map((x, i) => (
              <tr key={i} className={i === 0 ? "font-medium text-gray-900" : "text-gray-500"}>
                <td className="px-2 py-1">
                  {pomSkuText(x)}
                  {x.description ? ` · ${x.description}` : ""}
                  {i === 0 ? " (this line)" : ""}
                </td>
                <td className={cn("px-2 py-1", /^cancel/i.test(x.status ?? "") && "text-red-700")}>{x.status ?? "—"}</td>
                <td className={cell}>{x.orderQty ?? "—"}</td>
                <td className={cell}>{x.adjOrderQty ?? "—"}</td>
                <td className={cell}>{x.shippedQty ?? "—"}</td>
                <td className={cell}>{x.receivedQty ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {children}
    </div>
  );
}
