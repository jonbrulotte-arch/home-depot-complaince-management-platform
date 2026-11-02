import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import { hashInviteToken, isInviteToken } from "@/lib/invites";
import { MailError, emailHtml, mailConfig, sendMail } from "@/lib/mail";

// "Forgot password" links. Like invitations, the link carries a random token and only its sha256 is
// stored; a link works once, for RESET_MINUTES, and a newer link or a password change voids it.

export { RESET_MINUTES } from "@/lib/password-reset-rules";
import { RESET_MINUTES } from "@/lib/password-reset-rules";
/** A user gets at most one email per this many minutes, however often the form is sent. */
export const RESET_RESEND_MINUTES = 2;
/** At most this many requests per IP address per RESET_IP_WINDOW_MINUTES. */
export const RESET_IP_LIMIT = 10;
export const RESET_IP_WINDOW_MINUTES = 15;

export type ResetState = "valid" | "invalid" | "expired" | "used";

export function resetState(reset: { expiresAt: Date; usedAt: Date | null } | null, now = new Date()): ResetState {
  if (!reset) return "invalid";
  if (reset.usedAt) return "used";
  return reset.expiresAt.getTime() <= now.getTime() ? "expired" : "valid";
}

/** A fresh link token, its hash, and when it expires. */
export function newResetToken(now = new Date()): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000) };
}

/** The reset behind a link, with its user, if the token is well formed and known. */
export async function findReset(token: string) {
  if (!isInviteToken(token)) return null;
  return prisma.passwordReset.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: { select: { id: true, email: true, name: true, active: true } } },
  });
}

/** Voids a user's unused reset links, after their password changed some other way. */
export async function voidResets(userId: string): Promise<void> {
  await prisma.passwordReset.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
}

/** Whether a link should be sent now, given the user's latest request and the address's recent ones. */
export function mayRequestReset(args: { lastForUser: Date | null; recentFromIp: number }, now = new Date()): "ok" | "user-wait" | "ip-limit" {
  if (args.recentFromIp >= RESET_IP_LIMIT) return "ip-limit";
  if (args.lastForUser && now.getTime() - args.lastForUser.getTime() < RESET_RESEND_MINUTES * 60_000) return "user-wait";
  return "ok";
}

/** Emails a reset link; returns the reason when it couldn't be sent. */
export async function emailReset(args: { to: string; name: string; link: string }): Promise<{ emailed: boolean; reason?: string }> {
  const { config } = mailConfig();
  if (!config) return { emailed: false, reason: "Email is not configured on the server" };
  const { siteName } = await getBranding();
  try {
    await sendMail(
      {
        to: args.to,
        subject: `Reset your ${siteName} password`,
        html: emailHtml({
          siteName,
          heading: `Hi ${args.name}`,
          paragraphs: [
            `Someone (hopefully you) asked to reset the password for your ${siteName} account.`,
            `Open the link below to choose a new password. It works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email: your password stays as it is.`,
          ],
          button: { label: "Choose a new password", url: args.link },
        }),
      },
      config,
    );
    return { emailed: true };
  } catch (e) {
    return { emailed: false, reason: e instanceof MailError ? e.message : "Could not reach Microsoft Graph" };
  }
}
