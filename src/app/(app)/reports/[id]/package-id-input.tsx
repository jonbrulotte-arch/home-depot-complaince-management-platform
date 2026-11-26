"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { normalizePackageId } from "@/lib/package-id";
import { formatCurrency } from "@/lib/utils";

/** The Package ID THD gives this program's chargebacks for the compliance period, entered by hand. */
export function PackageIdInput({
  reportId,
  programId,
  period,
  initial,
  offset,
  canEdit,
  canOpen,
}: {
  reportId: string;
  programId: string;
  period: "FILL_ON_TIME" | "OTHER";
  initial: string | null;
  /** Offsets in this program's compliance period, which the package covers */
  offset: number;
  canEdit: boolean;
  /** PO Lookup access, for the link to the package report */
  canOpen: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = trimmed === "" || normalizePackageId(trimmed) !== null;
  const changed = trimmed !== (initial ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${reportId}/package-ids`, { method: "PUT", body: { programId, period, packageId: trimmed === "" ? null : trimmed } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`package-${programId}-${period}`} className="text-sm font-medium text-gray-700">
        Package ID
      </label>
      {canEdit ? (
        <>
          <Input
            id={`package-${programId}-${period}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Not entered"
            maxLength={64}
            className="h-8 w-44"
          />
          {changed && (
            <Button size="sm" onClick={save} disabled={busy || !valid}>
              {busy ? "Saving…" : "Save"}
            </Button>
          )}
        </>
      ) : (
        <span className="text-sm text-gray-900">{initial ?? <span className="text-gray-400">Not entered</span>}</span>
      )}
      <span className="text-xs text-gray-500">
        {offset > 0 ? `Covers ${formatCurrency(offset)} in offsets this period.` : "No offsets this period."}
      </span>
      {initial && !changed && canOpen && (
        <Link href={`/po-lookup/package/${encodeURIComponent(initial)}`} className="text-xs text-blue-600 hover:underline">
          Open package
        </Link>
      )}
      {!valid && <span className="text-xs text-red-700">Use letters and digits (with - _ . / between).</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
