"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Mail, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client-api";
import { EDI_ISSUE_TYPES, MAX_SELECTION, ediDraft, suggestedTypes, type SelectionKind } from "@/lib/logistics/edi";
import { mergeAddresses, parseAddresses } from "@/lib/email-address";

// Selecting POs or shipments on the POs and Shipments tabs, exporting a report of them, and
// emailing a team (Admin › Teams addresses) or anyone else about them with that report attached.

/** A team with addresses, offered in Send Email */
export interface EmailTeam {
  key: string;
  name: string;
  to: string[];
  cc: string[];
}

const NO_TEAM = "__none";
const TEAM_STORE = "logistics.emailTeam";

export interface SelectableItem {
  id: string;
  /** One line for the email */
  line: string;
  flagCodes: string[];
  /** The PO numbers it covers (a shipment's own POs) */
  poNumbers: string[];
}

interface Ctx {
  kind: SelectionKind;
  selected: Set<string>;
  toggle: (id: string) => void;
}
const SelectionContext = createContext<Ctx | null>(null);

/** Wraps a tab: the toolbar and the row checkboxes share the selection */
export function SelectionProvider(props: { kind: SelectionKind; items: SelectableItem[]; canEmail: boolean; teams: EmailTeam[]; sender: string; today: string; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTION) next.add(id);
      return next;
    });
  return (
    <SelectionContext.Provider value={{ kind: props.kind, selected, toggle }}>
      <Toolbar {...props} selected={selected} setSelected={setSelected} />
      {props.children}
    </SelectionContext.Provider>
  );
}

/** The checkbox at the start of a row */
export function SelectBox({ id, label }: { id: string; label: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  return <input type="checkbox" className="h-4 w-4 rounded border-gray-300" aria-label={`Select ${label}`} checked={ctx.selected.has(id)} onChange={() => ctx.toggle(id)} />;
}

function Toolbar({ kind, items, canEmail, teams, sender, today, selected, setSelected }: Parameters<typeof SelectionProvider>[0] & { selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  const [emailing, setEmailing] = useState(false);
  const noun = kind === "po" ? "PO" : "shipment";
  const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);
  const report = (format: "pdf" | "xlsx") => `/api/logistics/report?kind=${kind}&ids=${encodeURIComponent(ids.join(","))}&format=${format}`;
  const allShown = items.length > 0 && items.slice(0, MAX_SELECTION).every((i) => selected.has(i.id));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={allShown}
          onChange={() => setSelected(allShown ? new Set() : new Set(items.slice(0, MAX_SELECTION).map((i) => i.id)))}
          aria-label={`Select every ${noun} shown`}
        />
        {ids.length ? `${ids.length} ${noun}${ids.length > 1 ? "s" : ""} selected` : `Select ${noun}s to export or email`}
      </label>
      {ids.length > 0 && (
        <>
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <a href={report("pdf")}>
              <FileText className="h-4 w-4 mr-1.5" />
              Export report (PDF)
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={report("xlsx")}>
              <Download className="h-4 w-4 mr-1.5" />
              Export report (Excel)
            </a>
          </Button>
          {canEmail && (
            <Button size="sm" onClick={() => setEmailing(true)}>
              <Mail className="h-4 w-4 mr-1.5" />
              Send Email
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </>
      )}
      <Dialog open={emailing} onOpenChange={setEmailing}>
        <DialogContent className="max-w-3xl">
          {emailing && (
            <EdiEmail
              kind={kind}
              items={items.filter((i) => selected.has(i.id))}
              teams={teams}
              sender={sender}
              today={today}
              pdfHref={report("pdf")}
              onSent={() => {
                setEmailing(false);
                setSelected(new Set());
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The team picked last time in this browser, if it still has addresses */
function lastTeam(teams: EmailTeam[]): string {
  try {
    const key = window.localStorage.getItem(TEAM_STORE);
    return key && teams.some((t) => t.key === key) ? key : NO_TEAM;
  } catch {
    return NO_TEAM;
  }
}

function EdiEmail({ kind, items, teams, sender, today, pdfHref, onSent }: { kind: SelectionKind; items: SelectableItem[]; teams: EmailTeam[]; sender: string; today: string; pdfHref: string; onSent: () => void }) {
  const router = useRouter();
  const fileName = `Logistics_Report_${items.length}_${kind === "po" ? "POs" : "Shipments"}_${today}.pdf`;
  const poNumbers = useMemo(() => [...new Set(items.flatMap((i) => i.poNumbers))], [items]);
  const [types, setTypes] = useState<string[]>(() => suggestedTypes(items.flatMap((i) => i.flagCodes)));
  // The dialog mounts when opened, so the browser's last team can be read on the first render
  const [teamKey, setTeamKey] = useState(() => lastTeam(teams));
  const team = teams.find((t) => t.key === teamKey) ?? null;
  const build = (t: string[], tm: EmailTeam | null = team) => ediDraft({ kind, lines: items.map((i) => i.line), poNumbers, types: t, sender, fileName, team: tm?.name });
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
      window.localStorage.setItem(TEAM_STORE, key);
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
          Send email: {items.length} {kind === "po" ? "PO" : "shipment"}
          {items.length > 1 ? "s" : ""}
        </DialogTitle>
      </DialogHeader>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <fieldset>
          <legend className={label}>What needs doing</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {EDI_ISSUE_TYPES.map((t) => (
              <label key={t.key} className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={types.includes(t.key)} onChange={() => toggleType(t.key)} />
                {t.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">Ticked from the flags on what you selected; change them as needed.</p>
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
          <a href={pdfHref} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            {fileName}
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
              await apiFetch("/api/logistics/email", { body: { kind, ids: items.map((i) => i.id), types, team: team?.key ?? null, to, cc, subject, body } });
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
