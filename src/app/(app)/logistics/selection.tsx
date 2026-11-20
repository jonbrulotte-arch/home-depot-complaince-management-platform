"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Download, FileText, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EDI_ISSUE_TYPES, MAX_SELECTION, ediDraft, suggestedTypes, type SelectionKind } from "@/lib/logistics/edi";
import { EmailComposer, type EmailTeam } from "@/components/email/email-composer";

// Selecting POs or shipments on the POs and Shipments tabs, exporting a report of them, and
// emailing a team (Admin › Teams addresses) or anyone else about them with that report attached.

export type { EmailTeam };

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

/** Send Email for POs or shipments: the Logistics requests and draft, the Logistics report attached */
function EdiEmail({ kind, items, teams, sender, today, pdfHref, onSent }: { kind: SelectionKind; items: SelectableItem[]; teams: EmailTeam[]; sender: string; today: string; pdfHref: string; onSent: () => void }) {
  const fileName = `Logistics_Report_${items.length}_${kind === "po" ? "POs" : "Shipments"}_${today}.pdf`;
  const poNumbers = [...new Set(items.flatMap((i) => i.poNumbers))];
  const noun = kind === "po" ? "PO" : "shipment";
  return (
    <EmailComposer
      title={`Send email: ${items.length} ${noun}${items.length > 1 ? "s" : ""}`}
      typesHint="Ticked from the flags on what you selected; change them as needed."
      requestTypes={EDI_ISSUE_TYPES}
      initialTypes={suggestedTypes(items.flatMap((i) => i.flagCodes))}
      draft={(types, team) => ediDraft({ kind, lines: items.map((i) => i.line), poNumbers, types, sender, fileName, team })}
      teams={teams}
      storeKey="logistics.emailTeam"
      attachment={{ href: pdfHref, name: fileName }}
      endpoint="/api/logistics/email"
      payload={{ kind, ids: items.map((i) => i.id) }}
      onSent={onSent}
    />
  );
}
