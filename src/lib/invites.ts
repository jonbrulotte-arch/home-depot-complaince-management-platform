import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import { MailError, emailHtml, mailConfig, sendMail } from "@/lib/mail";

// Invitations to join the platform. The link carries a random token; only its sha256 is stored,
// so a database copy or backup can't be used to accept an invitation.

export const INVITE_DAYS = 7;

export type InviteState = "pending" | "expired" | "accepted" | "revoked";

export function inviteState(invite: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }, now = new Date()): InviteState {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh link token, its hash, and when it expires. */
export function newInviteToken(now = new Date()): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000) };
}

/** Tokens are 43 base64url characters; anything else is rejected before touching the database. */
export function isInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** The address the platform is reached at: APP_URL when set, else the request's own host. */
export function appOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

/**
 * Emails an invitation link. Returns whether it was sent and, when it wasn't (email not configured
 * or Microsoft refused it), the reason, so the admin can send the link themselves.
 */
export async function emailInvite(args: { to: string; name: string | null; roleName: string; inviter: string; link: string }): Promise<{ emailed: boolean; reason?: string }> {
  const { config } = mailConfig();
  if (!config) return { emailed: false, reason: "Email is not configured on the server" };
  const { siteName } = await getBranding();
  try {
    await sendMail(
      {
        to: args.to,
        subject: `You're invited to ${siteName}`,
        html: emailHtml({
          siteName,
          heading: args.name ? `Hi ${args.name}, you're invited` : "You're invited",
          paragraphs: [
            `${args.inviter} invited you to ${siteName}, JS Products' Home Depot compliance platform, with the ${args.roleName} role.`,
            `Open the link below to set your name and password. It works once and expires in ${INVITE_DAYS} days.`,
          ],
          button: { label: "Set up my account", url: args.link },
        }),
      },
      config,
    );
    return { emailed: true };
  } catch (e) {
    return { emailed: false, reason: e instanceof MailError ? e.message : "Could not reach Microsoft Graph" };
  }
}

/** The invitation behind a link, if the token is well formed and known. */
export async function findInvite(token: string) {
  if (!isInviteToken(token)) return null;
  return prisma.userInvite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { role: { select: { name: true } } } });
}
