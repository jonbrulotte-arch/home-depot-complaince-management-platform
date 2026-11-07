"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";

export function DeleteIssueButton({ issueId, label }: { issueId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/issues/${issueId}`, { method: "DELETE" });
      router.push("/issues");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the issue");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-red-600 hover:text-red-700">
        <Trash2 className="h-4 w-4 mr-1.5" />
        Delete
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {label}?</DialogTitle>
            <DialogDescription>The issue, its updates and its files are removed. This cannot be undone. To keep the record, set its status to Closed instead.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
