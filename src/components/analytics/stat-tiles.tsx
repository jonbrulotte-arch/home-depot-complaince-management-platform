import Link from "next/link";
import { cn } from "@/lib/utils";

type Stat = { label: string; value: string; hint?: string; tone?: string; /** Opens the list behind the figure */ href?: string };

/** A row of figure tiles, as on the package and PO record pages. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => {
        const body = (
          <>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={cn("text-xl font-bold text-gray-900", s.tone)}>{s.value}</p>
            {s.hint && <p className="text-xs text-gray-500">{s.hint}</p>}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            {body}
          </div>
        );
      })}
    </div>
  );
}
