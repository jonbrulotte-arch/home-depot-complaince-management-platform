"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

type Result = { rows: number; created: number; updated: number; skipped: { row: number; reason: string }[] };

/** Retrieves the WMS shipped-lines report from its link and syncs it into Logistics. */
export function WmsSyncButton({ lastSync }: { lastSync: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await apiFetch<Result>("/api/logistics/fetch-wms", { method: "POST" });
            setMsg({ ok: true, text: `Synced ${r.rows} WMS line(s): ${r.created} new, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}.` });
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "The WMS sync failed" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing WMS lines…" : "Sync WMS lines"}
      </Button>
      {msg ? <span className={`max-w-sm text-right text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span> : lastSync && <span className="text-xs text-gray-500">Last synced {lastSync}</span>}
    </div>
  );
}
