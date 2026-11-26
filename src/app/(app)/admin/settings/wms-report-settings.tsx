"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { WMS_SYNC_OPTIONS } from "@/lib/logistics/sync-schedule";

/** The WMS "shipped last 60 days" report link that Logistics › Sync WMS lines retrieves, and its sync schedule. */
export function WmsReportSettings({
  initial,
  initialMinutes,
  nextAt,
  last,
}: {
  initial: string | null;
  initialMinutes: number;
  /** The next scheduled run, as shown; null when the schedule is off */
  nextAt: string | null;
  /** The last scheduled run */
  last: { at: string; ok: boolean; message: string } | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initial ?? "");
  const [minutes, setMinutes] = useState(initialMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = url.trim() !== (initial ?? "") || minutes !== initialMinutes;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/settings/wms-report", { method: "PUT", body: { url: url.trim() || null, syncMinutes: minutes } });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="wms-report" className="scroll-mt-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>WMS report link</CardTitle>
          <CardDescription>
            The WMS &quot;shipped last 60 days&quot; report that <strong>Logistics › Sync WMS lines</strong> retrieves and imports. The server must be able to reach it. With a <strong>Sync schedule</strong>, the server also
            syncs it on its own. Leave the link empty to turn syncing off.
          </CardDescription>
        </div>
        <Button
          onClick={save}
          disabled={saving || !changed}
        >
          {saving ? "Saving…" : saved && !changed ? "Saved" : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="wms-url" className="block text-sm font-medium text-gray-700">
            Report link
          </label>
          <Input
            id="wms-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSaved(false);
            }}
            placeholder="http://mango.jsproducts.com/…/ShippedLast60.php"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="wms-schedule" className="block text-sm font-medium text-gray-700">
            Sync schedule
          </label>
          <div className="max-w-xs">
            <Select
              value={String(minutes)}
              onValueChange={(v) => {
                setMinutes(Number(v));
                setSaved(false);
              }}
              disabled={!url.trim()}
            >
              <SelectTrigger id="wms-schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WMS_SYNC_OPTIONS.map((o) => (
                  <SelectItem key={o.minutes} value={String(o.minutes)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-gray-500">
            How often the server retrieves and imports the report by itself, while it is running. A new schedule starts within a minute of saving (or one interval after the last scheduled sync). A sync that
            fails is tried again at the next interval and is logged in the App Log.
          </p>
          {initial && (nextAt || last) && (
            <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              {nextAt && (
                <p className="flex items-center gap-2 text-gray-700">
                  <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                  Next scheduled sync: {nextAt}
                </p>
              )}
              {last && (
                <p className={`flex items-start gap-2 ${last.ok ? "text-gray-700" : "text-red-700"}`}>
                  {last.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  <span>
                    Last scheduled sync {last.at}: {last.message}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </CardContent>
    </Card>
  );
}
