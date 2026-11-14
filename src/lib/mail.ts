// Email through Microsoft Graph (an Azure AD app registration with the Mail.Send application
// permission), using the client-credentials flow. Settings come from the server's .env so the
// client secret is never stored in the database or shown in the app.

export interface MailConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Mailbox the mail is sent from (user principal name or shared mailbox) */
  sender: string;
}

export const MAIL_ENV = ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MS_GRAPH_SENDER"] as const;

/** The Graph settings, or null with the names of the missing variables. */
export function mailConfig(env: Record<string, string | undefined> = process.env): { config: MailConfig | null; missing: string[] } {
  const value = (k: (typeof MAIL_ENV)[number]) => env[k]?.trim() || "";
  const missing = MAIL_ENV.filter((k) => !value(k));
  if (missing.length) return { config: null, missing };
  return {
    config: { tenantId: value("MS_GRAPH_TENANT_ID"), clientId: value("MS_GRAPH_CLIENT_ID"), clientSecret: value("MS_GRAPH_CLIENT_SECRET"), sender: value("MS_GRAPH_SENDER") },
    missing: [],
  };
}

export class MailError extends Error {}

let cached: { key: string; token: string; expires: number } | null = null;

async function accessToken(c: MailConfig, fetchImpl: typeof fetch): Promise<string> {
  const key = `${c.tenantId}|${c.clientId}`;
  if (cached && cached.key === key && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) {
    // Azure appends trace and correlation ids to the reason; keep the readable part
    throw new MailError(`Microsoft sign-in failed: ${(data.error_description ?? data.error ?? `HTTP ${res.status}`).split(/\r?\n| Trace ID:/)[0].trim()}`);
  }
  cached = { key, token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

/** Sends one email from the configured mailbox; throws MailError with Microsoft's reason when it fails. */
export async function sendMail(mail: Mail, config = mailConfig().config, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!config) throw new MailError("Email is not configured on the server");
  const token = await accessToken(config, fetchImpl);
  const res = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject: mail.subject, body: { contentType: "HTML", content: mail.html }, toRecipients: [{ emailAddress: { address: mail.to } }] },
      saveToSentItems: false,
    }),
  });
  if (res.status !== 202 && !res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    if (res.status === 401) cached = null;
    throw new MailError(`Microsoft Graph refused the email: ${data.error?.message ?? data.error?.code ?? `HTTP ${res.status}`}`);
  }
}

/** Escapes text for the HTML emails. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A plain, branded email body: a heading, paragraphs and an optional button. */
export function emailHtml({ siteName, heading, paragraphs, button }: { siteName: string; heading: string; paragraphs: string[]; button?: { label: string; url: string } }): string {
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#374151">${escapeHtml(t)}</p>`;
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px">
<tr><td style="background:#111827;padding:16px 24px;border-radius:8px 8px 0 0;color:#ffffff;font-size:16px;font-weight:700">${escapeHtml(siteName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:18px;color:#111827">${escapeHtml(heading)}</h1>
${paragraphs.map(p).join("\n")}
${button ? `<p style="margin:20px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">${escapeHtml(button.label)}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280">Or open this link: ${escapeHtml(button.url)}</p>` : ""}
</td></tr></table></body></html>`;
}
