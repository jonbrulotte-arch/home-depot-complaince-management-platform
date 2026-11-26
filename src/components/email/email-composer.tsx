"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";
import { mergeAddresses, parseAddresses } from "@/lib/email-address";

// The Send Email window shared by Logistics (POs, shipments) and Disputes: pick a team (Admin ›
// Teams addresses) and/or type addresses, tick what's needed, edit the drafted message, send.

/** A team with addresses, offered in Send Email */
export interface EmailTeam {
  key: string;
  name: string;
  to: string[];
  cc: string[];
}

const NO_TEAM = "__none";

/** The team picked last time in this browser, if it still has addresses */
function lastTeam(teams: EmailTeam[], storeKey: string): string {
  try {
    const key = window.localStorage.getItem(storeKey);
    return key && teams.some((t) => t.key === key) ? key : NO_TEAM;
  } catch {
    return NO_TEAM;
  }
}

export interface EmailComposerProps {
  /** e.g. "Send email: 2 POs" */
  title: string;
  /** Under the requests, e.g. how they were pre-ticked */
  typesHint?: string;
  /** The requests people can tick ("What needs doing") */
  requestTypes: { key: string; label: string }[];
  /** Ticked when the window opens */
  initialTypes: string[];
  /** The drafted subject and message for the ticked requests and the team picked */
  draft: (types: string[], teamName: string | null) => { subject: string; body: string };
  teams: EmailTeam[];
  /** Remembers the team picked last in this browser, per place */
  storeKey: string;
  attachment: { href: string; name: string };
  /** POSTed with { types, team, to, cc, subject, body } added */
  endpoint: string;
  payload: Record<string, unknown>;
  onSent: () => void;
}

/** The Send Email window: team, extra recipients, requests, and a draft people edit before sending. */
export function EmailComposer({ title, typesHint = "Change them as needed.", requestTypes, initialTypes, draft, teams, storeKey, attachment, endpoint, payload, onSent }: EmailComposerProps) {
  const router = useRouter();
  const [types, setTypes] = useState<string[]>(initialTypes);
  // The dialog mounts when opened, so the browser's last team can be read on the first render
  const [teamKey, setTeamKey] = useState(() => lastTeam(teams, storeKey));
  const team = teams.find((t) => t.key === teamKey) ?? null;
  const build = (t: string[], tm: EmailTeam | null = team) => draft(t, tm?.name ?? null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(() => build(types).subject);
  const [body, setBody] = useState(() => build(types).body);
  // Everyone it will go to: the team's addresses plus any typed (bad typed addresses are reported on send)
  const typedTo = parseAddresses(to) ?? [];
  const allTo = mergeAddresses(team?.to ?? [], typedTo);
  const allCc = mergeAddresses(team?.cc ?? [], parseAddresses(cc) ?? []).filter((a) => !allTo.some((t) => t.toLowerCase() === a.toLowerCase()));
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = "mb-1.5 block text-sm font-medium text-gray-700";

  const toggleType = (key: string) => {
    const next = types.includes(key) ? types.filter((t) => t !== key) : [...types, key];
    setTypes(next);
    // Until the message is edited by hand, it follows the issue types
    if (!edited) {
      const d = build(next);
      setSubject(d.subject);
      setBody(d.body);
    }
  };

  const pickTeam = (key: string) => {
    setTeamKey(key);
    try {
      window.localStorage.setItem(storeKey, key);
    } catch {
      // Not remembered; nothing else depends on it
    }
    // The greeting follows the team until the message is edited by hand
    if (!edited) setBody(build(types, teams.find((t) => t.key === key) ?? null).body);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {title}
        </DialogTitle>
      </DialogHeader>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <fieldset>
          <legend className={label}>What needs doing</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {requestTypes.map((t) => (
              <label key={t.key} className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={types.includes(t.key)} onChange={() => toggleType(t.key)} />
                {t.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">{typesHint}</p>
        </fieldset>
        <div>
          <label htmlFor="email-team" className={label}>
            Team
          </label>
          <Select value={teamKey} onValueChange={pickTeam}>
            <SelectTrigger id="email-team" className="sm:w-1/2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>No team (addresses below only)</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {team ? (
            <p className="mt-1 text-xs text-gray-500 break-all">
              {team.to.length > 0 && <>To: {team.to.join(", ")}</>}
              {team.to.length > 0 && team.cc.length > 0 && " · "}
              {team.cc.length > 0 && <>Cc: {team.cc.join(", ")}</>}
            </p>
          ) : (
            !teams.length && <p className="mt-1 text-xs text-gray-500">No team has an email address yet. An administrator can add them under Admin › Teams.</p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="edi-to" className={label}>
              {team ? "Also to" : "To"}
            </label>
            <Input id="edi-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder={team ? "Optional, other addresses" : "name@example.com"} />
          </div>
          <div>
            <label htmlFor="edi-cc" className={label}>
              {team ? "Also cc" : "Cc"}
            </label>
            <Input id="edi-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional, separate with commas" />
          </div>
        </div>
        <div>
          <label htmlFor="edi-subject" className={label}>
            Subject
          </label>
          <Input id="edi-subject" value={subject} maxLength={250} onChange={(e) => (setSubject(e.target.value), setEdited(true))} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="edi-body" className="text-sm font-medium text-gray-700">
              Message
            </label>
            {edited && (
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => {
                  const d = build(types);
                  setSubject(d.subject);
                  setBody(d.body);
                  setEdited(false);
                }}
              >
                Start the message again from the issue types
              </button>
            )}
          </div>
          <Textarea id="edi-body" value={body} rows={14} className="font-mono text-xs" onChange={(e) => (setBody(e.target.value), setEdited(true))} />
        </div>
        <p className="flex items-center gap-1.5 text-sm text-gray-700">
          <Paperclip className="h-4 w-4 text-gray-400" />
          Attached:{" "}
          <a href={attachment.href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            {attachment.name}
          </a>
          <span className="text-xs text-gray-500">· replies go to you</span>
        </p>
        {allTo.length > 0 && (
          <p className="text-xs text-gray-500 break-all">
            Goes to {allTo.join(", ")}
            {allCc.length > 0 && <> · cc {allCc.join(", ")}</>}
          </p>
        )}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
      <DialogFooter>
        <Button
          disabled={busy || (!allTo.length && !to.trim()) || !subject.trim() || !body.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await apiFetch(endpoint, { body: { ...payload, types, team: team?.key ?? null, to, cc, subject, body } });
              onSent();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "The email couldn't be sent");
              setBusy(false);
            }
          }}
        >
          <Mail className="h-4 w-4 mr-1.5" />
          {busy ? "Sending…" : "Send email"}
        </Button>
      </DialogFooter>
    </>
  );
}
