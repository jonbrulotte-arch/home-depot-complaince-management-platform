"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentMode, DataPeriod } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import type { ShipmentInput } from "@/lib/shipments";
import { FILL_ON_TIME_LAG_MONTHS, SHIPMENT_RANGES, shiftIsoDate, type ShipmentRanges } from "@/lib/shipment-ranges";

const MODES: { mode: ShipmentMode; label: string }[] = [
  { mode: "SMALL_PARCEL", label: "Small Parcel" },
  { mode: "LTL_TL", label: "LTL & TL" },
];

/** Program → compliance period → mode → typed value */
type Draft = Record<string, Record<DataPeriod, Record<ShipmentMode, string>>>;
type RangeKey = keyof ShipmentRanges;
type RangeDraft = Record<RangeKey, { from: string; to: string }>;

const PERIODS = SHIPMENT_RANGES.map((r) => r.period);
const modeDraft = (counts: Record<ShipmentMode, number | null>) => ({ SMALL_PARCEL: counts.SMALL_PARCEL?.toString() ?? "", LTL_TL: counts.LTL_TL?.toString() ?? "" });
const toDraft = (inputs: ShipmentInput[]): Draft =>
  Object.fromEntries(inputs.map((i) => [i.programId, { FILL_ON_TIME: modeDraft(i.counts.FILL_ON_TIME), OTHER: modeDraft(i.counts.OTHER) }]));
const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";

const toRangeDraft = (ranges: ShipmentRanges): RangeDraft => ({
  fillOnTime: { from: ranges.fillOnTime?.from ?? "", to: ranges.fillOnTime?.to ?? "" },
  other: { from: ranges.other?.from ?? "", to: ranges.other?.to ?? "" },
});

export function ShipmentCounts({ reportId, inputs, ranges, canEdit }: { reportId: string; inputs: ShipmentInput[]; ranges: ShipmentRanges; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(inputs));
  const [rangeDraft, setRangeDraft] = useState<RangeDraft>(() => toRangeDraft(ranges));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const value = (pid: string, period: DataPeriod, mode: ShipmentMode) => {
    const v = draft[pid][period][mode].trim();
    return v === "" ? null : Number(v);
  };
  const cells = inputs.flatMap((i) => PERIODS.flatMap((period) => MODES.map(({ mode }) => ({ programId: i.programId, period, mode, count: value(i.programId, period, mode) }))));
  const invalid = cells.some(({ count }) => count !== null && (!Number.isInteger(count) || count < 0));
  /** Sum over programs (all when `codes` is omitted), periods and modes */
  const sum = (opts: { programId?: string; codes?: string[]; period?: DataPeriod; mode?: ShipmentMode }) =>
    cells
      .filter((c) => (!opts.programId || c.programId === opts.programId) && (!opts.period || c.period === opts.period) && (!opts.mode || c.mode === opts.mode))
      .filter((c) => !opts.codes || opts.codes.includes(inputs.find((i) => i.programId === c.programId)!.code))
      .reduce((s, c) => s + (c.count ?? 0), 0);
  const DCS = ["US_RDC", "US_DFC"];
  // A range is saved only with both dates; one date alone or an end before the start is an error
  const rangeError = (key: RangeKey) => {
    const { from, to } = rangeDraft[key];
    if (!from && !to) return null;
    if (!from || !to) return "Enter both dates";
    return from > to ? "Starts after it ends" : null;
  };
  const rangesInvalid = SHIPMENT_RANGES.some(({ key }) => rangeError(key) !== null);
  // One item per program and period with a count missing, plus each range without both dates
  const missing =
    inputs.reduce((n, i) => n + PERIODS.filter((period) => MODES.some(({ mode }) => value(i.programId, period, mode) === null)).length, 0) +
    SHIPMENT_RANGES.filter(({ key }) => !rangeDraft[key].from || !rangeDraft[key].to).length;

  function setRange(key: RangeKey, end: "from" | "to", v: string) {
    setRangeDraft({ ...rangeDraft, [key]: { ...rangeDraft[key], [end]: v } });
    setSaved(false);
  }

  /** Fill Rate and On Time trail the other data by two months */
  function fillFromOther() {
    const { from, to } = rangeDraft.other;
    setRangeDraft({ ...rangeDraft, fillOnTime: { from: shiftIsoDate(from, -FILL_ON_TIME_LAG_MONTHS), to: shiftIsoDate(to, -FILL_ON_TIME_LAG_MONTHS) } });
    setSaved(false);
  }

  function set(pid: string, period: DataPeriod, mode: ShipmentMode, v: string) {
    setDraft({ ...draft, [pid]: { ...draft[pid], [period]: { ...draft[pid][period], [mode]: v } } });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${reportId}/shipments`, {
        method: "PUT",
        body: {
          counts: cells,
          ranges: Object.fromEntries(
            SHIPMENT_RANGES.map(({ key }) => [key, rangeDraft[key].from && rangeDraft[key].to ? rangeDraft[key] : null]),
          ),
        },
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
            {missing > 0 ? <Badge variant="warning">{missing} item(s) incomplete</Badge> : <Badge variant="success">Complete</Badge>}
          </div>
          <CardDescription>
            Shipments by mode for each compliance period, and the dates they cover; the two periods together make the totals. SPM exports do not carry the mode for RDC/DFC, so enter them from TMS/WMS; Drop Ship&apos;s On-Time &amp; Fill Rate counts are suggested from THD&apos;s Parcel flag.
          </CardDescription>
        </div>
        {canEdit && (
          <Button onClick={save} disabled={saving || invalid || rangesInvalid}>{saving ? "Saving…" : saved ? "Saved" : "Save"}</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Compliance period", "From", "To", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIPMENT_RANGES.map(({ key, label, hint }) => {
                const err = rangeError(key);
                return (
                  <tr key={key} className="border-t border-gray-200">
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{label}</div>
                      <div className="text-xs text-gray-500">{hint}</div>
                    </td>
                    {(["from", "to"] as const).map((end) => (
                      <td key={end} className="px-4 py-2 w-48">
                        <Input type="date" value={rangeDraft[key][end]} disabled={!canEdit} onChange={(e) => setRange(key, end, e.target.value)} aria-label={`${label} ${end}`} />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-xs">
                      {err ? (
                        <span className="text-red-600">{err}</span>
                      ) : (
                        key === "fillOnTime" &&
                        canEdit &&
                        rangeDraft.other.from &&
                        rangeDraft.other.to &&
                        !rangeError("other") && (
                          <button className="text-blue-600 hover:underline" onClick={fillFromOther}>
                            Use other range − {FILL_ON_TIME_LAG_MONTHS} months
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th rowSpan={2} className={th}>Program</th>
                {SHIPMENT_RANGES.map((r) => (
                  <th key={r.key} colSpan={MODES.length} className={`${th} border-l border-gray-200 pb-1`}>{r.label}</th>
                ))}
                <th rowSpan={2} className={`${th} border-l border-gray-200`}>Total</th>
                <th rowSpan={2} className={th}>From the data</th>
              </tr>
              <tr>
                {SHIPMENT_RANGES.flatMap((r) =>
                  MODES.map((m, i) => (
                    <th key={`${r.key}-${m.mode}`} className={`${th} pt-1 normal-case tracking-normal ${i === 0 ? "border-l border-gray-200" : ""}`}>{m.label}</th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {inputs.map((i) => {
                const total = sum({ programId: i.programId });
                const hasSuggestion = i.suggested.SMALL_PARCEL !== undefined || i.suggested.LTL_TL !== undefined;
                return (
                  <tr key={i.programId} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-gray-900">{i.name}</td>
                    {SHIPMENT_RANGES.flatMap((r) =>
                      MODES.map(({ mode, label }, n) => (
                        <td key={`${r.key}-${mode}`} className={`px-3 py-2 w-32 ${n === 0 ? "border-l border-gray-200" : ""}`}>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={draft[i.programId][r.period][mode]}
                            disabled={!canEdit}
                            placeholder="—"
                            onChange={(e) => set(i.programId, r.period, mode, e.target.value)}
                            aria-label={`${i.name} ${r.label} ${label}`}
                          />
                        </td>
                      )),
                    )}
                    <td className="px-4 py-3 text-gray-900 font-medium border-l border-gray-200">{total || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {hasSuggestion && (
                        <>
                          {i.suggested.SMALL_PARCEL ?? 0} parcel / {i.suggested.LTL_TL ?? 0} LTL orders (On-Time &amp; Fill Rate)
                          {canEdit && (
                            <button
                              className="ml-2 text-blue-600 hover:underline"
                              onClick={() => {
                                setDraft({
                                  ...draft,
                                  [i.programId]: { ...draft[i.programId], FILL_ON_TIME: { SMALL_PARCEL: String(i.suggested.SMALL_PARCEL ?? 0), LTL_TL: String(i.suggested.LTL_TL ?? 0) } },
                                });
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
              {inputs.some((i) => DCS.includes(i.code)) && (
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">US Transportation (RDC + DFC LTL)</td>
                  {SHIPMENT_RANGES.flatMap((r) => [
                    <td key={`${r.key}-sp`} className="px-4 py-3 text-gray-400 border-l border-gray-200">—</td>,
                    <td key={`${r.key}-ltl`} className="px-4 py-3 text-gray-700">{sum({ codes: DCS, period: r.period, mode: "LTL_TL" })}</td>,
                  ])}
                  <td className="px-4 py-3 text-gray-700 border-l border-gray-200">{sum({ codes: DCS, mode: "LTL_TL" })}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">Derived</td>
                </tr>
              )}
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-900">Total</td>
                {SHIPMENT_RANGES.flatMap((r) =>
                  MODES.map(({ mode }, n) => (
                    <td key={`${r.key}-${mode}`} className={`px-4 py-3 text-gray-900 ${n === 0 ? "border-l border-gray-200" : ""}`}>{sum({ period: r.period, mode })}</td>
                  )),
                )}
                <td className="px-4 py-3 text-gray-900 border-l border-gray-200">{sum({})}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </CardContent>
    </Card>
  );
}
