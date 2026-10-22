"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentMode } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import type { ShipmentInput } from "@/lib/shipments";

const MODES: { mode: ShipmentMode; label: string }[] = [
  { mode: "SMALL_PARCEL", label: "Small Parcel" },
  { mode: "LTL_TL", label: "LTL & TL" },
];

type Draft = Record<string, Record<ShipmentMode, string>>;

const toDraft = (inputs: ShipmentInput[]): Draft =>
  Object.fromEntries(inputs.map((i) => [i.programId, { SMALL_PARCEL: i.counts.SMALL_PARCEL?.toString() ?? "", LTL_TL: i.counts.LTL_TL?.toString() ?? "" }]));

export function ShipmentCounts({ reportId, inputs, canEdit }: { reportId: string; inputs: ShipmentInput[]; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(inputs));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const value = (pid: string, mode: ShipmentMode) => {
    const v = draft[pid][mode].trim();
    return v === "" ? null : Number(v);
  };
  const invalid = inputs.some((i) => MODES.some(({ mode }) => {
    const v = value(i.programId, mode);
    return v !== null && (!Number.isInteger(v) || v < 0);
  }));
  const ltl = (code: string) => {
    const i = inputs.find((x) => x.code === code);
    return i ? value(i.programId, "LTL_TL") ?? 0 : 0;
  };
  const missing = inputs.filter((i) => MODES.some(({ mode }) => value(i.programId, mode) === null)).length;

  function set(pid: string, mode: ShipmentMode, v: string) {
    setDraft({ ...draft, [pid]: { ...draft[pid], [mode]: v } });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${reportId}/shipments`, {
        method: "PUT",
        body: { counts: inputs.flatMap((i) => MODES.map(({ mode }) => ({ programId: i.programId, mode, count: value(i.programId, mode) }))) },
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!inputs.length) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CardTitle>Shipment counts</CardTitle>
            {missing > 0 ? <Badge variant="warning">{missing} program(s) incomplete</Badge> : <Badge variant="success">Complete</Badge>}
          </div>
          <CardDescription>
            Shipments in the period by mode, for the scorecard. SPM exports do not carry the mode for RDC/DFC, so enter them from TMS/WMS; Drop Ship is suggested from THD&apos;s Parcel flag.
          </CardDescription>
        </div>
        {canEdit && (
          <Button onClick={save} disabled={saving || invalid}>{saving ? "Saving…" : saved ? "Saved" : "Save counts"}</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Program", ...MODES.map((m) => m.label), "Total", "From the data"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inputs.map((i) => {
                const total = MODES.reduce((s, { mode }) => s + (value(i.programId, mode) ?? 0), 0);
                const hasSuggestion = i.suggested.SMALL_PARCEL !== undefined || i.suggested.LTL_TL !== undefined;
                return (
                  <tr key={i.programId} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-gray-900">{i.name}</td>
                    {MODES.map(({ mode }) => (
                      <td key={mode} className="px-4 py-2 w-40">
                        <Input type="number" min={0} step={1} value={draft[i.programId][mode]} disabled={!canEdit} placeholder="—" onChange={(e) => set(i.programId, mode, e.target.value)} aria-label={`${i.name} ${mode}`} />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-gray-900 font-medium">{total || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {hasSuggestion && (
                        <>
                          {i.suggested.SMALL_PARCEL ?? 0} parcel / {i.suggested.LTL_TL ?? 0} LTL orders
                          {canEdit && (
                            <button
                              className="ml-2 text-blue-600 hover:underline"
                              onClick={() => {
                                setDraft({ ...draft, [i.programId]: { SMALL_PARCEL: String(i.suggested.SMALL_PARCEL ?? 0), LTL_TL: String(i.suggested.LTL_TL ?? 0) } });
                                setSaved(false);
                              }}
                            >
                              Use
                            </button>
                          )}
                        </>
                      )}
                      {i.shipmentsInData !== null && <>{i.shipmentsInData} TMS shipment(s) in the On Time data</>}
                    </td>
                  </tr>
                );
              })}
              {inputs.some((i) => i.code === "US_RDC" || i.code === "US_DFC") && (
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">US Transportation (RDC + DFC LTL)</td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3 text-gray-700">{ltl("US_RDC") + ltl("US_DFC")}</td>
                  <td className="px-4 py-3 text-gray-700">{ltl("US_RDC") + ltl("US_DFC")}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">Derived</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </CardContent>
    </Card>
  );
}
