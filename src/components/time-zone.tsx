"use client";

import { createContext, useContext, useEffect } from "react";
import { TZ_COOKIE, browserTimeZone } from "@/lib/time-zones";

function readCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${TZ_COOKIE}=`))
    ?.slice(TZ_COOKIE.length + 1);
}

const TimeZoneContext = createContext<string | undefined>(undefined);

/** The viewer's time zone in client components; pass it to formatDate/formatDateTime. */
export function useTimeZone(): string | undefined {
  return useContext(TimeZoneContext);
}

/**
 * Gives client components the zone the server rendered with, and keeps the tz cookie set to the
 * browser's own zone. When the page followed the browser's zone (no zone picked in Account
 * settings) and the cookie was missing or out of date, the page is reloaded once in the right zone.
 */
export function TimeZoneProvider({ timeZone, followsBrowser, children }: { timeZone: string; followsBrowser: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const tz = browserTimeZone();
    if (!tz || readCookie() === tz) return;
    // Zone names only hold letters, digits, "_", "+", "-" and "/", all allowed in a cookie value
    document.cookie = `${TZ_COOKIE}=${tz}; path=/; max-age=31536000; samesite=lax`;
    // Reload only once the cookie has really changed, so a browser that blocks cookies can't loop
    if (followsBrowser && tz !== timeZone && readCookie() === tz) window.location.reload();
  }, [timeZone, followsBrowser]);
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}
