"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Eye, EyeOff, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { copyHtml, copyText } from "@/lib/clipboard";
import { defaultSubject, periodsLabel, summaryEmail, type Summary } from "@/lib/summarizer";

const noSubscribe = () => () => {};
// Mail apps cut off long mailto: links, so the button only fills in the body when it fits
const MAILTO_LIMIT = 1800;

/** The summary as an email: copy it formatted (or as text), or start one in the mail app. */
export function SummaryEmail({ summary, dashboardPath }: { summary: Summary; dashboardPath: string | null }) {
  const [subject, setSubject] = useState(() => defaultSubject(summary));
  const [intro, setIntro] = useState(() => `Hi team,\n\nHere is the THD compliance summary for ${periodsLabel(summary)}.`);
  const [copied, setCopied] = useState<"html" | "text" | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  // Links in the email need the site's full address, which is only known in the browser
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const email = summaryEmail(summary, { origin, dashboardPath }, intro);
  const mailtoBody = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(email.text)}`;
  const fits = mailtoBody.length <= MAILTO_LIMIT;

  async function copy(kind: "html" | "text") {
    const ok = kind === "html" ? await copyHtml(email.html, email.text) : await copyText(`${subject}\n\n${email.text}`);
    setFailed(!ok);
    if (!ok) return;
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="summary-subject" className="text-sm font-medium text-gray-700">
          Subject
        </label>
        <Input id="summary-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="summary-intro" className="text-sm font-medium text-gray-700">
          Message above the summary
        </label>
        <Textarea id="summary-intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => copy("html")}>
          {copied === "html" ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
          {copied === "html" ? "Copied" : "Copy email"}
        </Button>
        <Button variant="outline" onClick={() => copy("text")}>
          {copied === "text" ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
          {copied === "text" ? "Copied" : "Copy as plain text"}
        </Button>
        <Button asChild variant="outline">
          <a href={fits ? mailtoBody : `mailto:?subject=${encodeURIComponent(subject)}`}>
            <Mail className="h-4 w-4 mr-1.5" />
            Open in email app
          </a>
        </Button>
        <Button variant="ghost" onClick={() => setPreview(!preview)}>
          {preview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
          {preview ? "Hide preview" : "Preview email"}
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        <b className="font-medium text-gray-700">Copy email</b> keeps the tables and links: paste it into a new message in Outlook or Gmail.
        {!fits && " The summary is too long to send straight to the email app, so that button starts a message with just the subject; paste the copied email into it."}
      </p>
      {failed && <p className="text-xs text-red-700">The browser didn&apos;t allow copying. Open the preview, select it and copy it by hand.</p>}
      {preview && (
        // Built by summaryEmail, which escapes every value it inserts
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-gray-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: email.html }} />
      )}
    </div>
  );
}
