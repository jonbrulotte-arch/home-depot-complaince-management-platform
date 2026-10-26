import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { getBranding } from "@/lib/branding";
import { Sidebar } from "./sidebar";

// Wrap every authenticated page (src/app/(app)/layout.tsx) in this shell.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const branding = await getBranding();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 print:block print:h-auto print:overflow-visible print:bg-white">
      <div className="contents print:hidden">
        <Sidebar user={{ name: user.name, role: user.role }} permissions={[...user.permissions]} branding={branding} />
      </div>
      <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
    </div>
  );
}
