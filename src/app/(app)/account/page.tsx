import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { AccountSettings } from "./account-settings";

/** Every signed-in user's own settings: their name and password. */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account settings</h1>
        <p className="text-sm text-gray-500 mt-1">Your name as others see it, and your password.</p>
      </div>
      <AccountSettings name={user.name} email={user.email} role={user.role} />
    </div>
  );
}
