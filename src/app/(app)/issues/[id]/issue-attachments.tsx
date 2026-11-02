"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";

interface Attachment {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  uploadedBy: string | null;
}

/** An issue's files: download for everyone who can see the issue; attach and remove with issues.manage. */
export function IssueAttachments({ issueId, attachments, canEdit }: { issueId: string; attachments: Attachment[]; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      await apiFetch(`/api/issues/${issueId}/attachments`, { form });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(a: Attachment) {
    if (!window.confirm(`Remove ${a.fileName}?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/issues/${issueId}/attachments/${a.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the file");
    }
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-400">No files yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <a href={`/api/issues/${issueId}/attachments/${a.id}`} className="block truncate text-sm text-blue-600 hover:underline">
                  {a.fileName}
                </a>
                <span className="text-xs text-gray-400">
                  {a.size < 1024 ? "under 1 KB" : `${(a.size / 1024).toFixed(0)} KB`} · {formatDateTime(a.createdAt)}
                  {a.uploadedBy ? ` · ${a.uploadedBy}` : ""}
                </span>
              </div>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => remove(a)} aria-label={`Remove ${a.fileName}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex items-center gap-3">
          <input ref={input} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <Paperclip className="h-4 w-4 mr-1.5" />
            {busy ? "Uploading…" : "Attach a file"}
          </Button>
          <span className="text-xs text-gray-400">PDF, images, Excel/CSV, Word, Outlook .msg/.eml or text, up to 10 MB</span>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
