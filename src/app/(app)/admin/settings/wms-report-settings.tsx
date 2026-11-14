"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

/** The WMS "shipped last 60 days" report link that Logistics › Sync WMS lines retrieves. */
export function WmsReportSettings({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = url.trim() !== (initial ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/settings/wms-report", { method: "PUT", body: { url: url.trim() || null } });
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
            The WMS &quot;shipped last 60 days&quot; report that <strong>Logistics › Sync WMS lines</strong> retrieves and imports (also used by <code>npm run logistics-refresh</code>). The server must be able to reach it. Leave empty to turn the sync off.
          </CardDescription>
        </div>
        <Button onClick={save} disabled={saving || !changed}>
          {saving ? "Saving…" : saved && !changed ? "Saved" : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
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
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      </CardContent>
    </Card>
  );
}
