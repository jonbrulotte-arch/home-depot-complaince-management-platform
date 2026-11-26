import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cartonRefs } from "@/lib/logistics/refs";
import { parseUpsTrack, type UpsStatus } from "@/lib/logistics/ups-parse";

export { parseUpsTrack };

// UPS tracking through the UPS Track API (OAuth client credentials). The client ID and secret are
// set under Admin › Settings (SiteSettings); the secret never goes back to the browser.

export const UPS_PRODUCTION = "https://onlinetools.ups.com";
export const UPS_TEST = "https://wwwcie.ups.com";

interface UpsConfig {
  clientId: string;
  clientSecret: string;
  base: string;
}

export async function upsConfig(): Promise<UpsConfig | null> {
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { upsClientId: true, upsClientSecret: true, upsTestMode: true } });
  const clientId = s?.upsClientId?.trim();
  const clientSecret = s?.upsClientSecret?.trim();
  return clientId && clientSecret ? { clientId, clientSecret, base: s?.upsTestMode ? UPS_TEST : UPS_PRODUCTION } : null;
}

export const upsConfigured = async () => Boolean(await upsConfig());

/** How long a check stays fresh before a refresh asks UPS again */
export const UPS_RECHECK_MINUTES = 60;
/** Most numbers one refresh asks UPS about */
export const UPS_BATCH = 150;

// Cached per set of credentials, so a change in Settings takes effect at once
let token: { key: string; value: string; expires: number } | null = null;

async function accessToken(cfg: UpsConfig): Promise<string> {
  const key = `${cfg.base}|${cfg.clientId}|${cfg.clientSecret}`;
  if (token && token.key === key && token.expires > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(`${cfg.base}/security/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: string | number; response?: { errors?: { message?: string }[] } };
  if (!res.ok || !body.access_token) throw new Error(`UPS sign-in failed (${res.status}${body.response?.errors?.[0]?.message ? `: ${body.response.errors[0].message}` : ""})`);
  token = { key, value: body.access_token, expires: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** Signs in to UPS with the given (or saved) credentials, for Settings' Test connection. */
export async function testUpsCredentials(cfg?: UpsConfig | null): Promise<void> {
  const c = cfg ?? (await upsConfig());
  if (!c) throw new Error("Enter the UPS client ID and secret first");
  token = null;
  await accessToken(c);
}

async function trackOne(cfg: UpsConfig, n: string): Promise<{ status: UpsStatus; raw: unknown }> {
  const res = await fetch(`${cfg.base}/api/track/v1/details/${encodeURIComponent(n)}?locale=en_US&returnSignature=false`, {
    headers: { Authorization: `Bearer ${await accessToken(cfg)}`, transId: randomUUID().replace(/-/g, "").slice(0, 32), transactionSrc: "hd-compliance" },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.json().catch(() => null);
  if (res.status === 401) token = null;
  const status = parseUpsTrack(raw);
  if (!res.ok && !status.error) status.error = `UPS answered ${res.status}`;
  return { status, raw };
}

/** Every UPS number on a WMS carton */
async function upsNumbers(): Promise<string[]> {
  const cartons = await prisma.wmsCarton.findMany({ where: { OR: [{ trackingNumber: { startsWith: "1Z", mode: "insensitive" } }, { secondTrack: { startsWith: "1Z", mode: "insensitive" } }] }, select: { trackingNumber: true, secondTrack: true } });
  return [...new Set(cartons.map((c) => cartonRefs(c.trackingNumber, c.secondTrack).ups).filter((x): x is string => Boolean(x)))];
}

/**
 * Asks UPS about the numbers not delivered yet and not checked in the last hour (all of them with
 * `force`), oldest check first, at most UPS_BATCH per run.
 */
export async function refreshUpsTracking(opts: { force?: boolean; numbers?: string[] } = {}) {
  const cfg = await upsConfig();
  if (!cfg) throw new Error("UPS tracking isn't set up (Admin › Settings › UPS tracking)");
  const all = opts.numbers ?? (await upsNumbers());
  const known = new Map((await prisma.parcelTracking.findMany({ where: { trackingNumber: { in: all } } })).map((p) => [p.trackingNumber, p]));
  const stale = Date.now() - UPS_RECHECK_MINUTES * 60_000;
  const candidates = all
    .filter((n) => {
      const p = known.get(n);
      return opts.force || opts.numbers || !p || (!p.delivered && (!p.checkedAt || p.checkedAt.getTime() < stale));
    })
    .sort((a, b) => (known.get(a)?.checkedAt?.getTime() ?? 0) - (known.get(b)?.checkedAt?.getTime() ?? 0));
  const due = candidates.slice(0, UPS_BATCH);
  let checked = 0;
  let errors = 0;
  for (const n of due) {
    try {
      const { status, raw } = await trackOne(cfg, n);
      const data = { ...status, checkedAt: new Date(), raw: (raw ?? undefined) as Prisma.InputJsonValue | undefined };
      await prisma.parcelTracking.upsert({ where: { trackingNumber: n }, create: { trackingNumber: n, carrier: "UPS", ...data }, update: data });
      if (status.error) errors++;
      checked++;
    } catch (e) {
      errors++;
      const message = e instanceof Error ? e.message : String(e);
      await prisma.parcelTracking.upsert({ where: { trackingNumber: n }, create: { trackingNumber: n, carrier: "UPS", error: message, checkedAt: new Date() }, update: { error: message, checkedAt: new Date() } });
      // A sign-in failure would fail every number: stop and report it
      if (/sign-in/i.test(message)) throw e;
    }
  }
  return { numbers: all.length, checked, errors, remaining: candidates.length - due.length };
}
