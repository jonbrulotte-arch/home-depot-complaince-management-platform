import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getBranding } from "@/lib/branding";
import { findReset, resetState } from "@/lib/password-reset";
import { BrandMark } from "@/components/layout/brand-mark";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const MESSAGES = {
  invalid: "This reset link is not valid. Check that you opened the whole link from the email, or ask for a new one.",
  expired: "This reset link has expired, or a newer one was sent. Ask for a new one.",
  used: "This reset link has already been used. Sign in with your new password, or ask for a new link.",
  inactive: "This account is inactive. Ask an administrator.",
};

/** Opened from a password reset email: choose a new password. No sign-in. */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const [branding, reset] = await Promise.all([getBranding(), findReset(token)]);
  const state = reset && !reset.user.active ? "inactive" : resetState(reset);

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
          <h2 className="text-lg font-semibold text-gray-900">Choose a new password</h2>
          {reset && state === "valid" ? (
            <>
              <p className="mt-1 mb-6 text-sm text-gray-500">
                For <span className="font-medium text-gray-700">{reset.user.email}</span>.
              </p>
              <ResetPasswordForm token={token} email={reset.user.email} />
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-700">{MESSAGES[state as keyof typeof MESSAGES]}</p>
              <div className="mt-6 flex gap-4 text-sm font-medium">
                <Link href="/forgot-password" className="text-blue-600 hover:underline">
                  Ask for a new link
                </Link>
                <Link href="/login" className="text-blue-600 hover:underline">
                  Go to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
