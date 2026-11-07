"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/layout/brand-mark";
import { apiFetch } from "@/lib/client-api";
import { DEFAULT_SITE_NAME, MAX_LOGO_BYTES } from "@/lib/brand";

interface Initial {
  enabled: boolean;
  siteName: string;
  logoUrl: string | null;
}

export function BrandingSettings({ initial }: { initial: Initial }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [siteName, setSiteName] = useState(initial.siteName);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Object URLs for a chosen file are released when replaced or unmounted
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const t = setTimeout(() => setPreview(url), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const logoUrl = removeLogo ? null : file ? preview : initial.logoUrl;
  const branding = { custom: enabled, siteName: siteName.trim() || DEFAULT_SITE_NAME, logoUrl: enabled ? logoUrl : null };

  function choose(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_LOGO_BYTES) {
      setError("The logo is limited to 1 MB");
      return;
    }
    setError(null);
    setFile(f);
    setRemoveLogo(false);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("enabled", String(enabled));
      form.set("siteName", siteName);
      if (file) form.set("logo", file);
      if (removeLogo) form.set("removeLogo", "true");
      await apiFetch("/api/admin/settings/branding", { method: "PUT", form });
      setFile(null);
      setRemoveLogo(false);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CardTitle>Custom Branding</CardTitle>
            <Badge variant={initial.enabled ? "success" : "secondary"}>{initial.enabled ? "On" : "Off"}</Badge>
          </div>
          <CardDescription>
            Replace &quot;{DEFAULT_SITE_NAME}&quot; with your own name and logo in the sidebar, on the sign-in page, in the browser tab and on exported scorecards. When off, the default branding is used.
          </CardDescription>
        </div>
        <Button onClick={save} disabled={saving || (enabled && !siteName.trim())}>{saving ? "Saving…" : saved ? "Saved" : "Save"}</Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }} />
            Use custom branding
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Site name</label>
            <Input value={siteName} maxLength={60} placeholder="e.g. JS Products Compliance" onChange={(e) => { setSiteName(e.target.value); setSaved(false); }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Site logo <span className="text-gray-400 font-normal">(PNG, JPEG, GIF, WebP or SVG, up to 1 MB; a wide or square logo about 56 px high works best)</span>
            </label>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => input.current?.click()}>
                <ImageUp className="h-4 w-4 mr-1.5" />
                {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {logoUrl && (
                <Button variant="ghost" onClick={() => { setFile(null); setRemoveLogo(true); setSaved(false); }}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Remove
                </Button>
              )}
              {file && <span className="text-xs text-gray-500">{file.name} (not saved yet)</span>}
            </div>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview</p>
          <div className="w-56 overflow-hidden rounded-lg bg-gray-900">
            <div className="flex items-center h-14 px-4 border-b border-gray-700">
              <BrandMark branding={branding} />
            </div>
          </div>
          <div className="rounded-lg bg-gray-900 px-6 py-6 text-center">
            <BrandMark branding={branding} size="login" />
            <p className="text-gray-400 mt-1 text-sm">THD Compliance Management</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
