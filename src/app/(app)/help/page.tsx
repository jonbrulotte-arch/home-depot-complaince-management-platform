import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { HELP_TOPICS, helpTopicsFor } from "@/lib/help-content";
import { HelpBrowser } from "./help-browser";

// Help & Docs: open to every signed-in user; topics follow the role unless ?all=1
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const all = (await searchParams).all === "1";
  const topics = helpTopicsFor(user.permissions, all);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Docs</h1>
        <p className="text-sm text-gray-500 mt-1">How the platform works, step by step, for the parts your role uses.</p>
      </div>
      <HelpBrowser topics={topics} allShown={all} hiddenCount={HELP_TOPICS.length - helpTopicsFor(user.permissions).length} />
    </div>
  );
}
