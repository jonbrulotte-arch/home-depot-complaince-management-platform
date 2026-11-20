"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { timeZoneLabel } from "@/lib/time-zones";
import { TimeZoneSelect } from "@/components/time-zone-select";

function Status({ ok, error }: { ok: string | null; error: string | null }) {
  if (error) return <span className="text-sm text-red-700">{error}</span>;
  if (ok) return <span className="text-sm text-green-700">{ok}</span>;
  return null;
}

export function AccountSettings({
  name: initialName,
  email,
  role,
  timeZone: initialTimeZone,
  shownIn,
}: {
  name: string;
  email: string;
  role: string;
  /** The zone the user picked, or null to follow the browser */
  timeZone: string | null;
  /** The zone this page was shown in */
  shownIn: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: string | null; error: string | null }>({ ok: null, error: null });

  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [savedTimeZone, setSavedTimeZone] = useState(initialTimeZone);
  const [tzBusy, setTzBusy] = useState(false);
  const [tzMsg, setTzMsg] = useState<{ ok: string | null; error: string | null }>({ ok: null, error: null });

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: string | null; error: string | null }>({ ok: null, error: null });

  async function saveName() {
    setNameBusy(true);
    setNameMsg({ ok: null, error: null });
    try {
      await apiFetch("/api/account", { method: "PATCH", body: { name } });
      setSavedName(name.trim());
      setNameMsg({ ok: "Name saved.", error: null });
      router.refresh();
    } catch (e) {
      setNameMsg({ ok: null, error: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setNameBusy(false);
    }
  }

  async function saveTimeZone() {
    setTzBusy(true);
    setTzMsg({ ok: null, error: null });
    try {
      await apiFetch("/api/account", { method: "PATCH", body: { timeZone } });
      setSavedTimeZone(timeZone);
      setTzMsg({ ok: "Time zone saved.", error: null });
      router.refresh();
    } catch (e) {
      setTzMsg({ ok: null, error: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setTzBusy(false);
    }
  }

  const pwProblem = !next ? null : next.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.` : confirm && confirm !== next ? "The new passwords don't match." : null;

  async function changePassword() {
    setPwBusy(true);
    setPwMsg({ ok: null, error: null });
    try {
      await apiFetch("/api/account/password", { body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwMsg({ ok: "Password changed. Use it the next time you sign in.", error: null });
    } catch (e) {
      setPwMsg({ ok: null, error: e instanceof Error ? e.message : "Could not change the password" });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="account-name" className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-900">{email}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Role</dt>
              <dd className="text-gray-900">{role}</dd>
            </div>
          </dl>
          <p className="text-xs text-gray-500">To change your email or role, ask an administrator.</p>
          <div className="flex items-center justify-end gap-3">
            <Status {...nameMsg} />
            <Button onClick={saveName} disabled={nameBusy || !name.trim() || name.trim() === savedName}>
              {nameBusy ? "Saving…" : "Save name"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Time zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="account-tz" className="mb-1 block text-sm font-medium text-gray-700">
              Show times in
            </label>
            <TimeZoneSelect id="account-tz" value={timeZone} onChange={setTimeZone} />
          </div>
          <p className="text-xs text-gray-500">
            Times across the platform (when something was logged, updated, imported or decided) are shown in this zone, now {timeZoneLabel(shownIn)}. Automatic follows
            the computer you&apos;re on. Dates and times from THD&apos;s exports are shown as THD sent them.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Status {...tzMsg} />
            <Button onClick={saveTimeZone} disabled={tzBusy || timeZone === savedTimeZone}>
              {tzBusy ? "Saving…" : "Save time zone"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="pw-current" className="mb-1 block text-sm font-medium text-gray-700">
              Current password
            </label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="pw-new" className="mb-1 block text-sm font-medium text-gray-700">
                New password <span className="font-normal text-gray-400">(at least {PASSWORD_MIN} characters)</span>
              </label>
              <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pw-confirm" className="mb-1 block text-sm font-medium text-gray-700">
                Confirm new password
              </label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            {pwProblem ? <span className="text-sm text-red-700">{pwProblem}</span> : <Status {...pwMsg} />}
            <Button onClick={changePassword} disabled={pwBusy || !current || !next || next !== confirm || Boolean(pwProblem)}>
              {pwBusy ? "Changing…" : "Change password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
