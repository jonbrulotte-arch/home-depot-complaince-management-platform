"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Link2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyText } from "@/lib/clipboard";

const noSubscribe = () => () => {};

/** Public link to a published scorecard, and the way into its warehouse feedback. */
export function ScorecardShareBar({ sharePath, feedbackHref, feedbackCount }: { sharePath: string | null; feedbackHref: string | null; feedbackCount: number }) {
  const [copied, setCopied] = useState(false);
  // The site's address is only known in the browser; the server renders the path alone
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const url = sharePath ? `${origin}${sharePath}` : "";

  async function copy() {
    if (!(await copyText(url))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!sharePath && !feedbackHref) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 print:hidden">
      {sharePath && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="shrink-0 text-sm font-medium text-gray-700">Public link</span>
          <Input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 text-xs text-gray-600" aria-label="Public link" />
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button asChild variant="ghost" size="sm" title="Open the public page">
            <a href={sharePath} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}
      {feedbackHref && (
        <Button asChild variant="outline" size="sm">
          <Link href={feedbackHref}>
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Feedback{feedbackCount ? ` (${feedbackCount})` : ""}
          </Link>
        </Button>
      )}
    </div>
  );
}
