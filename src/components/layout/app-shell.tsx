import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { Sidebar } from "./sidebar";

// Wrap every authenticated page (src/app/(app)/layout.tsx) in this shell.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar user={{ name: user.name, role: user.role }} permissions={[...user.permissions]} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
