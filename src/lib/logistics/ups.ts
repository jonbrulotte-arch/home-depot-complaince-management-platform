import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cartonRefs } from "@/lib/logistics/refs";
import { parseUpsTrack, type UpsStatus } from "@/lib/logistics/ups-parse";

export { parseUpsTrack };

// UPS tracking through the UPS Track API (OAuth client credentials). Settings come from .env
// (UPS_CLIENT_ID, UPS_CLIENT_SECRET, optional UPS_API_BASE), never the database, like email.

const base = () => (process.env.UPS_API_BASE?.trim() || "https://onlinetools.ups.com").replace(/\/+$/, "");
export const upsConfigured = () => Boolean(process.env.UPS_CLIENT_ID?.trim() && process.env.UPS_CLIENT_SECRET?.trim());

/** How long a check stays fresh before a refresh asks UPS again */
export const UPS_RECHECK_MINUTES = 60;
/** Most numbers one refresh asks UPS about */
export const UPS_BATCH = 150;

let token: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${process.env.UPS_CLIENT_ID!.trim()}:${process.env.UPS_CLIENT_SECRET!.trim()}`).toString("base64");
  const res = await fetch(`${base()}/security/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: string | number; response?: { errors?: { message?: string }[] } };
  if (!res.ok || !body.access_token) throw new Error(`UPS sign-in failed (${res.status}${body.response?.errors?.[0]?.message ? `: ${body.response.errors[0].message}` : ""})`);
  token = { value: body.access_token, expires: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function trackOne(n: string): Promise<{ status: UpsStatus; raw: unknown }> {
  const res = await fetch(`${base()}/api/track/v1/details/${encodeURIComponent(n)}?locale=en_US&returnSignature=false`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, transId: randomUUID().replace(/-/g, "").slice(0, 32), transactionSrc: "hd-compliance" },
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
  if (!upsConfigured()) throw new Error("UPS tracking isn't set up (UPS_CLIENT_ID and UPS_CLIENT_SECRET in .env)");
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
      const { status, raw } = await trackOne(n);
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
