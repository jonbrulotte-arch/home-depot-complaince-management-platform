import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";

export default async function NoAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">No pages available</h1>
      <p className="mt-2 text-sm text-gray-500">Your role ({user.role}) does not give access to any pages yet. Ask an administrator to update it under Roles &amp; Access.</p>
    </div>
  );
}
