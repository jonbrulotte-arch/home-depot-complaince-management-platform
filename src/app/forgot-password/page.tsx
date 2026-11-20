import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getBranding } from "@/lib/branding";
import { mailConfig } from "@/lib/mail";
import { BrandMark } from "@/components/layout/brand-mark";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** "Forgot password?" from the sign-in page: emails a reset link. No sign-in. */
export default async function ForgotPasswordPage() {
  await connection();
  const branding = await getBranding();
  const emailReady = Boolean(mailConfig().config);

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
          <h2 className="text-lg font-semibold text-gray-900">Reset your password</h2>
          {emailReady ? (
            <>
              <p className="mt-1 mb-6 text-sm text-gray-500">Enter the email you sign in with and we&apos;ll send you a link to choose a new password.</p>
              <ForgotPasswordForm />
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-700">Password reset by email isn&apos;t set up on this server yet. Ask an administrator to reset your password.</p>
          )}
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
