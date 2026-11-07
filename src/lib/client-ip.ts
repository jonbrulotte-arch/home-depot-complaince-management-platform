/** The client's address: the first X-Forwarded-For entry behind a proxy, else X-Real-IP. */
export function clientIp(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip")?.trim() || null)?.slice(0, 64) ?? null;
}
