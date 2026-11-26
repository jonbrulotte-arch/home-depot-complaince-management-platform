import { money } from "./ui";

// Column charts for Reports & Insights › Cancellations: one series each, the platform's blue on a
// recessive grid, each measure on its own scale (never two measures on one axis). Hovering a bar shows
// its month and value; the tables below are the exact figures.

const W = 560;
const H = 200;
const AXIS = 52;
const BOTTOM = 26;
const TOP = 16;

const short = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${Math.round(v / 1_000)}k` : `$${Math.round(v)}`);

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

export function MonthColumns({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - AXIS - 8;
  const plotH = H - TOP - BOTTOM;
  const slot = data.length ? plotW / data.length : plotW;
  const barW = Math.max(4, Math.min(36, slot - 6));
  const peak = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? 0) ? i : m), 0);
  const y = (v: number) => TOP + plotH - (plotH * v) / max;
  return (
    <figure className="rounded-lg border border-gray-200 bg-white p-4">
      <figcaption className="mb-2 text-sm font-medium text-gray-900">{title}</figcaption>
      {data.some((d) => d.value > 0) ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${money(d.value)}`).join(", ")}`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={AXIS} x2={W - 8} y1={y(max * f)} y2={y(max * f)} stroke={f === 0 ? "#9CA3AF" : "#E5E7EB"} strokeWidth={1} />
              <text x={AXIS - 6} y={y(max * f) + 4} textAnchor="end" className="fill-gray-500" fontSize={11}>
                {short(max * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = AXIS + slot * i + (slot - barW) / 2;
            const top = y(d.value);
            return (
              <g key={d.label}>
                <title>{`${d.label}: ${money(d.value)}`}</title>
                {/* A tall invisible target so the whole column shows the value on hover */}
                <rect x={AXIS + slot * i} y={TOP} width={slot} height={plotH} fill="transparent" />
                {d.value > 0 && <rect x={x} y={top} width={barW} height={TOP + plotH - top} rx={3} className="fill-blue-600 hover:fill-blue-700" />}
                {d.value > 0 && (i === peak || i === data.length - 1) && (
                  <text x={x + barW / 2} y={top - 5} textAnchor="middle" className="fill-gray-900" fontSize={11} fontWeight={600}>
                    {short(d.value)}
                  </text>
                )}
                {(data.length <= 12 || i % 2 === 0) && (
                  <text x={AXIS + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="fill-gray-500" fontSize={10.5}>
                    {d.label.replace(" 20", " '")}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="py-10 text-center text-sm text-gray-400">None in this selection.</p>
      )}
    </figure>
  );
}
