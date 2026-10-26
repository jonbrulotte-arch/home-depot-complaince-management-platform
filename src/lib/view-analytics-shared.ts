// Pure helpers for View Analytics, shared by its pages, client components and tests

/** Time windows offered on the View Analytics pages, in days (0 = all time) */
export const ANALYTICS_RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
  { days: 0, label: "All time" },
] as const;

export function parseRange(value: string | undefined): number {
  const days = Number(value ?? 30);
  return ANALYTICS_RANGES.some((r) => r.days === days) ? days : 30;
}

export interface DayPoint {
  /** YYYY-MM-DD (UTC) */
  day: string;
  hits: number;
  sessions: number;
}

/** One point per UTC day from `from` to today, zero where there were no hits. */
export function fillDays(points: { day: Date; hits: number; sessions: number }[], from: Date, to = new Date()): DayPoint[] {
  const byDay = new Map(points.map((p) => [p.day.toISOString().slice(0, 10), p]));
  const out: DayPoint[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (; d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const p = byDay.get(key);
    out.push({ day: key, hits: p?.hits ?? 0, sessions: p?.sessions ?? 0 });
  }
  return out;
}

/** "Chrome on Windows" from a user agent string, for the hits table. */
export function browserLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Other browser";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}
