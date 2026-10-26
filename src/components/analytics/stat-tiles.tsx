import { cn } from "@/lib/utils";

/** A row of figure tiles, as on the package and PO record pages. */
export function StatTiles({ stats }: { stats: { label: string; value: string; hint?: string; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">{s.label}</p>
          <p className={cn("text-xl font-bold text-gray-900", s.tone)}>{s.value}</p>
          {s.hint && <p className="text-xs text-gray-500">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}
