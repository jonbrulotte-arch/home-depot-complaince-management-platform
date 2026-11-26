"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

const NEXT: Partial<Record<ReportStatus, { status: ReportStatus; label: string }>> = {
  DRAFT: { status: "IN_REVIEW", label: "Start review" },
  IN_REVIEW: { status: "DISPUTES", label: "Ready for disputes" },
  DISPUTES: { status: "SCORECARD", label: "Generate scorecard" },
  SCORECARD: { status: "PUBLISHED", label: "Publish scorecard" },
};
const BACK: Partial<Record<ReportStatus, { status: ReportStatus; label: string }>> = {
  IN_REVIEW: { status: "DRAFT", label: "Back to import" },
  DISPUTES: { status: "IN_REVIEW", label: "Reopen review" },
  SCORECARD: { status: "DISPUTES", label: "Back to disputes" },
  PUBLISHED: { status: "SCORECARD", label: "Unpublish" },
};

export function ReportActions({ reportId, status, pending }: { reportId: string; status: ReportStatus; pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(to: ReportStatus) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${reportId}`, { method: "PATCH", body: { status: to } });
      if (to === "SCORECARD" && status === "DISPUTES") router.push(`/reports/${reportId}/scorecard`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the report");
    } finally {
      setBusy(false);
    }
  }

  const next = NEXT[status];
  const back = BACK[status];
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {back && <Button variant="ghost" onClick={() => move(back.status)} disabled={busy}>{back.label}</Button>}
        {next && (
          <Button onClick={() => move(next.status)} disabled={busy || (next.status === "DISPUTES" && pending > 0)} title={next.status === "DISPUTES" && pending > 0 ? `${pending} line(s) still need a decision` : undefined}>
            {busy ? "Saving…" : next.label}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
