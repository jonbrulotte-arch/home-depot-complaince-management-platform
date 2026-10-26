import type { DayPoint } from "@/lib/view-analytics-shared";

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Hits per day as thin bars; hovering a day shows its hits and sessions. */
export function HitsChart({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.hits));
  const total = points.reduce((s, p) => s + p.hits, 0);
  if (total === 0) return <p className="text-sm text-gray-400">No hits in this period.</p>;
  return (
    <div>
      <div className="flex gap-3">
        <div className="flex h-40 flex-col justify-between text-right text-xs text-gray-400">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="relative flex h-40 flex-1 items-end gap-0.5 border-b border-l border-gray-200" role="img" aria-label={`Hits per day, ${total} in total`}>
          {points.map((p) => (
            <div key={p.day} className="group relative flex h-full flex-1 items-end justify-center hover:bg-gray-50">
              {p.hits > 0 && <div className="w-full max-w-4 rounded-t bg-blue-600 group-hover:bg-blue-700" style={{ height: `${(p.hits / max) * 100}%` }} />}
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-md group-hover:block">
                <span className="font-medium text-gray-900">{dayLabel(p.day)}</span> · {p.hits} hit{p.hits === 1 ? "" : "s"} · {p.sessions} session{p.sessions === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-8 mt-1 flex justify-between pl-3 text-xs text-gray-400">
        <span>{dayLabel(points[0].day)}</span>
        <span>{dayLabel(points[points.length - 1].day)}</span>
      </div>
    </div>
  );
}
