"use client";

import { useEffect, useRef } from "react";

/** Counts one view of a published scorecard for Admin › View Analytics. Renders nothing. */
export function ScorecardHitBeacon(props: { reportId: string } | { token: string }) {
  const key = "token" in props ? `t:${props.token}` : `r:${props.reportId}`;
  const sent = useRef<string | null>(null);

  useEffect(() => {
    // Once per scorecard per mount, also under React's development double-run
    if (sent.current === key) return;
    sent.current = key;
    const body = JSON.stringify(key.startsWith("t:") ? { token: key.slice(2) } : { reportId: key.slice(2) });
    fetch("/api/scorecard-hits", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }, [key]);

  return null;
}
