// Time zones for showing app timestamps (when something was logged, imported, decided…) in the
// viewer's own time. Pure, so both server pages and client components use it. Imported THD
// timestamps are UTC wall-clock values and keep using formatUtcDate/formatUtcDateTime instead.

/** Cookie the browser sets with its own time zone, used when the user hasn't chosen one. */
export const TZ_COOKIE = "tz";

/** Used before the browser has reported its zone (first visit) unless DEFAULT_TIME_ZONE is set. */
export const FALLBACK_TIME_ZONE = "America/Los_Angeles";

/** The US zones, listed first in pickers. */
export const COMMON_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

/** Whether this is an IANA time zone the runtime knows. */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the runtime knows (UTC included), for the full picker list. */
export function allTimeZones(): string[] {
  const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [...COMMON_TIME_ZONES];
  return list.includes("UTC") ? list : ["UTC", ...list];
}

/** "UTC−08:00" style offset of a zone at a moment. */
export function utcOffset(tz: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  // "GMT-08:00", or "GMT" for zero
  const offset = part && part !== "GMT" ? part.replace("GMT", "") : "+00:00";
  return `UTC${offset.replace("-", "−")}`;
}

/** "America/Los_Angeles (UTC−08:00)" for pickers and the account page. */
export function timeZoneLabel(tz: string, at = new Date()): string {
  return `${tz.replace(/_/g, " ")} (${utcOffset(tz, at)})`;
}

/** The zone this browser is set to, or null when it can't tell. */
export function browserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/** The zone to show times in: the user's choice, else the browser's, else the default. */
export function effectiveTimeZone(userChoice: string | null | undefined, browser: string | null | undefined, fallback: string): string {
  if (isTimeZone(userChoice)) return userChoice;
  if (isTimeZone(browser)) return browser;
  return fallback;
}
