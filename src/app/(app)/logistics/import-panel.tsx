"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

type Result = { fileName: string; label?: string; rows?: number; created?: number; updated?: number; skipped?: { row: number; reason: string }[]; error?: string };

/** Upload the WMS report and the two TMS exports (any order, several at once), or pull the WMS report from its link. */
export function ImportPanel({ wmsLink }: { wmsLink: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy("Importing…");
    setError(null);
    const form = new FormData();
    for (const f of files) form.append("files", f);
    try {
      const r = await apiFetch<{ results: Result[] }>("/api/logistics/import", { form });
      setResults(r.results);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function pull() {
    setBusy("Pulling the WMS report…");
    setError(null);
    try {
      const r = await apiFetch<Result>("/api/logistics/fetch-wms", { method: "POST" });
      setResults([r]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't pull the WMS report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload([...e.dataTransfer.files]);
        }}
        className={`rounded-lg border-2 border-dashed px-6 py-8 text-center ${drag ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-gray-50"}`}
      >
        <Upload className="mx-auto h-6 w-6 text-gray-400" />
        <p className="mt-2 text-sm text-gray-700">
          Drop the <strong>WMS shipped-lines report</strong> (xlsx), the TMS <strong>Shipments</strong> export and the TMS <strong>Purchase Orders</strong> export here, or
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()} disabled={Boolean(busy)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Choose files
          </Button>
          {wmsLink && (
            <Button variant="outline" onClick={pull} disabled={Boolean(busy)}>
              <CloudDownload className="h-4 w-4 mr-1.5" />
              Pull the WMS report now
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">Each file is recognised by its columns. Importing again updates what changed; nothing older is removed.</p>
        <input
          ref={input}
          type="file"
          multiple
          accept=".xlsx,.csv,.xls,.html,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void upload(files);
          }}
        />
      </div>
      {busy && <p className="text-sm text-gray-500">{busy}</p>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {results.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white text-sm">
          {results.map((r, i) => (
            <li key={i} className="px-4 py-2.5">
              <span className="font-medium text-gray-900">{r.fileName}</span>
              {r.error ? (
                <span className="ml-2 text-red-700">{r.error}</span>
              ) : (
                <span className="ml-2 text-gray-600">
                  {r.label}: {r.rows} row(s), {r.created} new, {r.updated} updated
                  {r.skipped?.length ? <span className="text-amber-700">, {r.skipped.length} skipped (first: row {r.skipped[0].row}, {r.skipped[0].reason})</span> : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
