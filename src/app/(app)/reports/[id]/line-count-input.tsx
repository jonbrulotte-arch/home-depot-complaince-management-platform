"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

/** Lines in one program's compliance period: the denominator where the export lists only violations. */
export function LineCountInput({
  reportId,
  programId,
  period,
  initial,
  usedFor,
  canEdit,
}: {
  reportId: string;
  programId: string;
  period: "FILL_ON_TIME" | "OTHER";
  initial: number | null;
  /** Metrics in this period whose export gives no line total, so the entered count is used */
  usedFor: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = trimmed === "" || /^\d+$/.test(trimmed);
  const changed = trimmed !== (initial === null ? "" : String(initial));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${reportId}/line-counts`, { method: "PUT", body: { programId, period, count: trimmed === "" ? null : Number(trimmed) } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const hint = usedFor.length
    ? `Used for ${usedFor.join(", ")}: the export lists only violations.`
    : "Not needed now: the export has every line for this period's metrics.";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`lines-${programId}-${period}`} className="text-sm font-medium text-gray-700">
        Lines
      </label>
      {canEdit ? (
        <>
          <Input
            id={`lines-${programId}-${period}`}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Not entered"
            className="h-8 w-32"
          />
          {changed && (
            <Button size="sm" onClick={save} disabled={busy || !valid}>
              {busy ? "Saving…" : "Save"}
            </Button>
          )}
        </>
      ) : (
        <span className="text-sm text-gray-900">{initial === null ? <span className="text-gray-400">Not entered</span> : initial.toLocaleString("en-US")}</span>
      )}
      <span className="text-xs text-gray-500">{hint}</span>
      {!valid && <span className="text-xs text-red-700">Enter a whole number.</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
