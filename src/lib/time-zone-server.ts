import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth-guard";
import { FALLBACK_TIME_ZONE, TZ_COOKIE, effectiveTimeZone, isTimeZone } from "@/lib/time-zones";

/** The zone used before a browser has reported its own: DEFAULT_TIME_ZONE in .env, else Pacific. */
export function defaultTimeZone(): string {
  const configured = process.env.DEFAULT_TIME_ZONE?.trim();
  return isTimeZone(configured) ? configured : FALLBACK_TIME_ZONE;
}

/** The browser's zone from the tz cookie (tolerating a URL-encoded value). */
function cookieTimeZone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * The time zone this request's viewer sees times in (cached per request): the one they picked in
 * Account settings, else the one their browser reported (the tz cookie), else the default.
 * Signed-out pages (public scorecards and dashboard) use the browser's zone.
 */
export const getTimeZone = cache(async (): Promise<string> => {
  const [user, jar] = await Promise.all([getCurrentUser(), cookies()]);
  return effectiveTimeZone(user?.timeZone, cookieTimeZone(jar.get(TZ_COOKIE)?.value), defaultTimeZone());
});
