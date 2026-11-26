import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getBranding } from "@/lib/branding";
import { findInvite, inviteState } from "@/lib/invites";
import { BrandMark } from "@/components/layout/brand-mark";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const MESSAGES = {
  invalid: "This invitation link is not valid. Check that you opened the whole link from the email.",
  expired: "This invitation has expired. Ask an administrator to send it again.",
  revoked: "This invitation was cancelled. Ask an administrator for a new one.",
  accepted: "This invitation has already been used. Sign in with the password you set.",
};

/** Opened from an invitation email: the invited person sets their name and password. No sign-in. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const [branding, invite] = await Promise.all([getBranding(), findInvite(token)]);
  const state = invite ? inviteState(invite) : "invalid";

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="flex justify-center">
            <BrandMark branding={branding} size="login" />
          </h1>
          <p className="text-gray-400 mt-1 text-sm">THD Compliance Management</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {invite && state === "pending" ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Set up your account</h2>
              <p className="mt-1 mb-6 text-sm text-gray-500">
                You were invited as <span className="font-medium text-gray-700">{invite.email}</span> with the {invite.role.name} role.
              </p>
              <AcceptInviteForm token={token} email={invite.email} initialName={invite.name ?? ""} />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Invitation</h2>
              <p className="mt-2 text-sm text-gray-700">{MESSAGES[state as keyof typeof MESSAGES]}</p>
              <Link href="/login" className="mt-6 inline-block text-sm font-medium text-blue-600 hover:underline">
                Go to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
