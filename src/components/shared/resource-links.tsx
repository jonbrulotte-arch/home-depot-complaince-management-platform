"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTimeZone } from "@/components/time-zone";
import { apiFetch } from "@/lib/client-api";
import { cleanResourceUrl, linkHost, MAX_LINK_LABEL, MAX_LINK_URL } from "@/lib/resource-links";
import { formatDateTime } from "@/lib/utils";

// "+ Link Resource": links to documents kept elsewhere (OneDrive, SharePoint…) beside uploaded files,
// opening in a new tab. Used on disputes and Issue Log issues.

export interface ResourceLinkView {
  id: string;
  label: string;
  url: string;
  createdAt: string;
  createdBy: string | null;
}

/** One linked resource: the link text opens it in a new tab; its site, date and who added it underneath */
export function ResourceLinkItem({ link, onRemove, compact = false }: { link: ResourceLinkView; onRemove?: () => void; compact?: boolean }) {
  const tz = useTimeZone();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm text-blue-600 hover:underline" title={link.url}>
          <span className="truncate">{link.label}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <span className={compact ? "ml-2 text-xs text-gray-400" : "block text-xs text-gray-400"}>
          {linkHost(link.url)} · {formatDateTime(link.createdAt, tz)}
          {link.createdBy ? ` · ${link.createdBy}` : ""}
        </span>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600" title="Remove link" aria-label={`Remove the link ${link.label}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Removes a link after asking, then refreshes the page; returns an error message on failure */
export async function removeResourceLink(endpoint: string, link: ResourceLinkView): Promise<string | null> {
  if (!window.confirm(`Remove the link "${link.label}"? The document itself isn't touched.`)) return null;
  try {
    await apiFetch(`${endpoint}/${link.id}`, { method: "DELETE" });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not remove the link";
  }
}

/** The "+ Link Resource" button and its window: Link Text and URL, POSTed to `endpoint` */
export function LinkResourceButton({ endpoint, size = "sm", className }: { endpoint: string; size?: "sm" | "default"; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleaned = url.trim() ? cleanResourceUrl(url) : null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(endpoint, { body: { label, url } });
      setOpen(false);
      setLabel("");
      setUrl("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        Link Resource
      </Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || setError(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a resource</DialogTitle>
            <DialogDescription>Link to a document kept elsewhere, such as a OneDrive or SharePoint file shared within the company. It opens in a new tab.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div>
              <label htmlFor="link-label" className="mb-1.5 block text-sm font-medium text-gray-700">
                Link Text
              </label>
              <Input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_LINK_LABEL} placeholder="e.g. Signed BOL for PO 1157696857" autoFocus />
            </div>
            <div>
              <label htmlFor="link-url" className="mb-1.5 block text-sm font-medium text-gray-700">
                URL
              </label>
              <Input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={MAX_LINK_URL} placeholder="https://…sharepoint.com/…" inputMode="url" />
              {url.trim() && !cleaned && <p className="mt-1 text-xs text-red-700">Enter a web address starting with https://</p>}
              {cleaned && <p className="mt-1 text-xs text-gray-500">Opens {linkHost(cleaned)}</p>}
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !label.trim() || !cleaned}>
                {busy ? "Adding…" : "Add link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
