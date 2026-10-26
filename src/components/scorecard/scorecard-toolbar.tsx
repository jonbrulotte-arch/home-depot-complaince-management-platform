"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

export function ScorecardToolbar({ reportId, canRegenerate, canExport }: { reportId: string; canRegenerate: boolean; canExport: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${reportId}/scorecard`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {error && <span className="text-xs text-red-700">{error}</span>}
      {canRegenerate && (
        <Button variant="outline" onClick={regenerate} disabled={busy} title="Rebuild from the latest dispute decisions">
          <RefreshCw className="h-4 w-4 mr-1.5" />
          {busy ? "Regenerating…" : "Regenerate"}
        </Button>
      )}
      {canExport && (
        <>
          <Button asChild variant="outline">
            <a href={`/api/reports/${reportId}/scorecard/pdf`}>
              <FileText className="h-4 w-4 mr-1.5" />
              PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/reports/${reportId}/scorecard/export`}>
              <Download className="h-4 w-4 mr-1.5" />
              Excel
            </a>
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={() => window.print()} title="Print this page">
        <Printer className="h-4 w-4" />
      </Button>
    </div>
  );
}
