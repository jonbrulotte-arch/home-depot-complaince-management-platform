"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";

/** The box for adding an update to an issue's timeline. */
export function AddIssueNote({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/issues/${issueId}/notes`, { body: { body } });
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="An update: a call with THD, a carrier reply, a new consequence…" aria-label="New update" />
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-sm text-red-700">{error}</span>}
        <Button size="sm" onClick={add} disabled={busy || !body.trim()}>
          {busy ? "Adding…" : "Add update"}
        </Button>
      </div>
    </div>
  );
}
