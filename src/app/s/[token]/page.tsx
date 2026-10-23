import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Download, FileText } from "lucide-react";
import { getBranding } from "@/lib/branding";
import { sharedScorecard } from "@/lib/scorecard-share";
import { formatDate } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { ScorecardView } from "@/components/scorecard/scorecard-view";

// Public, read-only view of a published scorecard. Anyone with the link can open it; no sign-in.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharedScorecardPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const found = await sharedScorecard(token);
  if (!found) notFound();
  const branding = await getBranding();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <BrandMark branding={branding} />
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/s/${token}/pdf`}>
                <FileText className="h-4 w-4 mr-1.5" />
                PDF
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/s/${token}/export`}>
                <Download className="h-4 w-4 mr-1.5" />
                Excel
              </a>
            </Button>
          </div>
        </div>
      </header>
      <main className="p-6 max-w-7xl mx-auto space-y-6 print:p-0 print:max-w-none">
        <p className="text-sm text-gray-500 print:hidden">
          Published {formatDate(found.scorecard.publishedAt!)} · version {found.scorecard.version}
        </p>
        <ScorecardView data={found.data} />
      </main>
    </div>
  );
}
