"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone";

export interface NoteRow {
  id: string;
  body: string;
  author: string | null;
  authorId: string | null;
  createdAt: string;
}

/** Notes on a PO or a shipment: a timeline, newest last, with a box to add one. */
export function LogisticsNotes({ target, notes, userId, canManage }: { target: { poNumber?: string; shipmentNumber?: string }; notes: NoteRow[]; userId: string; canManage: boolean }) {
  const router = useRouter();
  const tz = useTimeZone();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400">No notes yet.</p>
      ) : (
        <ul className="space-y-3 border-l-2 border-gray-200 pl-4">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium text-gray-900">{n.author ?? "Former user"}</span>
                <span>{formatDateTime(n.createdAt, tz)}</span>
                {(n.authorId === userId || canManage) && (
                  <button className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Delete note" disabled={busy} onClick={() => confirm("Delete this note?") && run(() => apiFetch(`/api/logistics/notes/${n.id}`, { method: "DELETE" }))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-gray-700">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <label htmlFor="logistics-note" className="block text-sm font-medium text-gray-700">
          Add a note
        </label>
        <Textarea id="logistics-note" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} placeholder="What happened, who you spoke to, what's next" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button
          size="sm"
          disabled={busy || !body.trim()}
          onClick={async () => {
            if (await run(() => apiFetch("/api/logistics/notes", { body: { ...target, body } }))) setBody("");
          }}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}
