"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

/** Asks UPS for fresh tracking: the numbers given, or every number due for a check. */
export function UpsRefreshButton({ numbers, label = "Refresh UPS tracking" }: { numbers?: string[]; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await apiFetch<{ checked: number; errors: number; remaining: number }>("/api/logistics/ups-refresh", { method: "POST", body: { numbers, force: Boolean(numbers) } });
            setMsg(`Checked ${r.checked}${r.errors ? `, ${r.errors} with errors` : ""}${r.remaining ? `, ${r.remaining} left for the next run` : ""}.`);
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "UPS tracking failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
        {label}
      </Button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </span>
  );
}
