"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import type { RollingPoint } from "@/lib/dashboard";

// Colors validated as a pair (blue / red, the diverging poles) against the white card surface.
const BLUE = "#2a78d6";
const RED = "#e34948";
const GRID = "#e5e7eb";
const AXIS = "#6b7280";
const LINE_H = 220;
const BAR_H = 150;
const GAP = 28;
const M = { top: 16, right: 84, bottom: 26, left: 64 };

const compact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : `$${Math.round(a)}`;
  return v < 0 ? `-${s}` : s;
};
const signed = (v: number) => (v > 0 ? `+${formatCurrency(v)}` : v < 0 ? `-${formatCurrency(-v)}` : formatCurrency(0));

/** Clean tick values from 0 (or the minimum) to the maximum */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  // From the step at or below the minimum to the first step at or above the maximum
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; ; v += step) {
    out.push(Math.round(v * 100) / 100);
    if (v >= max - step * 0.001) break;
  }
  return out;
}

/** Rounded data-end, square at the baseline */
function barPath(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

/** The 12-month offset total over time (line) and how much it moved each month (columns), on one time axis. */
export function RollingOffsetsChart({ points }: { points: RollingPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const n = points.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const slot = n ? plotW / n : 0;
  const x = (i: number) => M.left + slot * (i + 0.5);

  const maxRolling = Math.max(1, ...points.map((p) => p.rolling));
  const lineTicks = ticks(0, maxRolling);
  const lineTop = lineTicks[lineTicks.length - 1];
  const yLine = (v: number) => M.top + (LINE_H - M.top) * (1 - v / lineTop);

  const changes = points.map((p) => p.change ?? 0);
  const barTicks = ticks(Math.min(0, ...changes), Math.max(0, ...changes), 3);
  const [barMin, barMax] = [barTicks[0], barTicks[barTicks.length - 1]];
  const barTop = LINE_H + GAP;
  const yBar = (v: number) => barTop + (BAR_H - 6) * ((barMax - v) / (barMax - barMin || 1));
  const height = barTop + BAR_H + M.bottom;
  const barW = Math.max(2, Math.min(24, slot * 0.6));

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, plotW / 64)));
  const partialEnd = points.findIndex((p) => p.monthsInWindow >= 12);
  const last = points[n - 1];
  const linePath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${yLine(p.rolling)}`).join(" ");

  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !slot) return;
    setActive(Math.max(0, Math.min(n - 1, Math.floor((clientX - rect.left - M.left) / slot))));
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  }

  const hovered = active === null ? null : points[active];
  const tipLeft = active === null ? 0 : Math.min(Math.max(x(active) + 12, 0), width - 220);
  const tipFlip = active !== null && x(active) + 232 > width;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: BLUE }} />
            12-month total
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />
            Increase from the previous month
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BLUE }} />
            Decrease
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowTable(!showTable)}>
          {showTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {showTable ? (
        <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {["Month", "Offsets that month", "12-month total", "Change"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.month} className="border-t border-gray-200">
                  <td className="px-4 py-2 text-gray-900">{p.label}</td>
                  <td className="px-4 py-2 text-gray-700">{formatCurrency(p.monthOffset)}</td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {formatCurrency(p.rolling)}
                    {p.monthsInWindow < 12 && <span className="ml-1 text-xs font-normal text-gray-400">({p.monthsInWindow} mo of data)</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{p.change === null ? "—" : signed(p.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative select-none" style={{ height }}>
          {width > 0 && n > 0 && (
            <svg width={width} height={height} role="img" aria-label={`12-month pre-dispute offset total by month, ${points[0].label} to ${last.label}; latest ${formatCurrency(last.rolling)}`}>
              {/* The first months have less than a year of data behind them */}
              {partialEnd > 0 && (
                <g>
                  <rect x={M.left} y={M.top} width={slot * partialEnd} height={LINE_H - M.top} fill="#f9fafb" />
                  <text x={M.left + 6} y={M.top + 12} fontSize={11} fill={AXIS}>
                    Less than 12 months of data
                  </text>
                </g>
              )}

              {lineTicks.map((t) => (
                <g key={`l${t}`}>
                  <line x1={M.left} x2={M.left + plotW} y1={yLine(t)} y2={yLine(t)} stroke={GRID} strokeWidth={1} />
                  <text x={M.left - 8} y={yLine(t)} fontSize={11} fill={AXIS} textAnchor="end" dominantBaseline="middle">
                    {compact(t)}
                  </text>
                </g>
              ))}
              <path d={linePath} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1)} cy={yLine(last.rolling)} r={4} fill={BLUE} stroke="#ffffff" strokeWidth={2} />
              <text x={x(n - 1) + 10} y={yLine(last.rolling)} fontSize={12} fontWeight={600} fill="#111827" dominantBaseline="middle">
                {compact(last.rolling)}
              </text>

              <text x={M.left} y={barTop - 8} fontSize={11} fill={AXIS}>
                Change from the previous month
              </text>
              {barTicks.map((t) => (
                <g key={`b${t}`}>
                  <line x1={M.left} x2={M.left + plotW} y1={yBar(t)} y2={yBar(t)} stroke={t === 0 ? "#9ca3af" : GRID} strokeWidth={1} />
                  <text x={M.left - 8} y={yBar(t)} fontSize={11} fill={AXIS} textAnchor="end" dominantBaseline="middle">
                    {compact(t)}
                  </text>
                </g>
              ))}
              {points.map((p, i) =>
                p.change ? (
                  <path key={p.month} d={barPath(x(i) - barW / 2, barW, yBar(0), yBar(p.change))} fill={p.change > 0 ? RED : BLUE} opacity={active === null || active === i ? 1 : 0.55} />
                ) : null,
              )}

              {points.map((p, i) =>
                // Every few months, plus the latest; a regular label too close to the latest is skipped
                (i % labelEvery === 0 && n - 1 - i >= labelEvery) || i === n - 1 ? (
                  <text key={`x${p.month}`} x={x(i)} y={height - 8} fontSize={11} fill={AXIS} textAnchor="middle">
                    {p.label}
                  </text>
                ) : null,
              )}

              {hovered && active !== null && (
                <g pointerEvents="none">
                  <line x1={x(active)} x2={x(active)} y1={M.top} y2={barTop + BAR_H} stroke="#9ca3af" strokeWidth={1} />
                  <circle cx={x(active)} cy={yLine(hovered.rolling)} r={4} fill={BLUE} stroke="#ffffff" strokeWidth={2} />
                </g>
              )}
              <rect
                x={M.left}
                y={M.top}
                width={plotW}
                height={barTop + BAR_H - M.top}
                fill="transparent"
                tabIndex={0}
                aria-label="Chart: use the left and right arrow keys to read each month"
                className="outline-none focus-visible:outline-2 focus-visible:outline-blue-600"
                onPointerMove={(e) => pick(e.clientX)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive((a) => a ?? n - 1)}
                onBlur={() => setActive(null)}
                onKeyDown={onKey}
              />
            </svg>
          )}
          {hovered && active !== null && (
            <div
              className="pointer-events-none absolute z-10 w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md"
              style={{ left: tipFlip ? x(active) - 220 : tipLeft, top: M.top }}
              role="status"
            >
              <p className="font-medium text-gray-900">{hovered.label}</p>
              <p className="mt-1 flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: BLUE }} />
                <span className="font-semibold text-gray-900">{formatCurrency(hovered.rolling)}</span>
                <span className="text-gray-500">12-month total</span>
              </p>
              {hovered.monthsInWindow < 12 && <p className="text-gray-400">Only {hovered.monthsInWindow} month(s) of data so far</p>}
              <p className={cn("mt-1 font-semibold", "text-gray-900")}>
                {hovered.change === null ? "First month of data" : `${signed(hovered.change)} from ${points[active - 1].label}`}
              </p>
              <p className="text-gray-500">{formatCurrency(hovered.monthOffset)} assessed this month</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
