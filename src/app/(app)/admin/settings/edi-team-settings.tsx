"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";

/** Where Logistics › Send to EDI team emails go. */
export function EdiTeamSettings({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = email.trim() !== (initial ?? "");
  return (
    <Card id="edi-team" className="scroll-mt-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>EDI team email</CardTitle>
          <CardDescription>
            Where <strong>Logistics › Send to EDI team</strong> emails go. The address fills the To line; people can still change it before sending. Several addresses: separate them with commas.
          </CardDescription>
        </div>
        <Button
          disabled={saving || !changed}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await apiFetch("/api/admin/settings/edi-team", { method: "PUT", body: { email } });
              setSaved(true);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : saved && !changed ? "Saved" : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <label htmlFor="edi-team-email" className="block text-sm font-medium text-gray-700">
          EDI team address
        </label>
        <Input id="edi-team-email" value={email} onChange={(e) => (setEmail(e.target.value), setSaved(false))} placeholder="edi@jsproducts.com" />
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      </CardContent>
    </Card>
  );
}
