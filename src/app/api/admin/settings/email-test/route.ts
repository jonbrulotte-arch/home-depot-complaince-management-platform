import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { MailError, emailHtml, mailConfig, sendMail } from "@/lib/mail";

const schema = z.object({ to: z.string().trim().toLowerCase().email("must be an email address").max(200) });

/** Sends a test email through Microsoft Graph so an admin can check the settings. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { config, missing } = mailConfig();
  if (!config) return badRequest(`Email is not configured on the server. Set ${missing.join(", ")} in .env and restart.`);
  const { siteName } = await getBranding();
  try {
    await sendMail({
      to: body.data.to,
      subject: `${siteName}: test email`,
      html: emailHtml({ siteName, heading: "Test email", paragraphs: [`${guard.user.name} sent this test from Admin › Settings. Email from ${siteName} is working.`] }),
    });
  } catch (e) {
    const reason = e instanceof MailError ? e.message : "Could not reach Microsoft Graph";
    await audit(guard.user.id, "email.test", "SiteSettings", "site", { to: body.data.to, ok: false, reason });
    return NextResponse.json({ error: reason }, { status: 502 });
  }
  await audit(guard.user.id, "email.test", "SiteSettings", "site", { to: body.data.to, ok: true });
  return NextResponse.json({ ok: true });
}
