"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { helpText, type HelpBlock, type HelpTopic } from "@/lib/help-content";
import { cn } from "@/lib/utils";

/** Text with **bold** runs */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-gray-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Block({ block }: { block: HelpBlock }) {
  if ("h" in block) return <h3 className="pt-2 text-sm font-semibold text-gray-900">{block.h}</h3>;
  if ("p" in block) return <p><Rich text={block.p} /></p>;
  if ("note" in block)
    return (
      <p className="flex gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span><Rich text={block.note} /></span>
      </p>
    );
  if ("steps" in block)
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {block.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}
      </ol>
    );
  if ("list" in block)
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.list.map((s, i) => <li key={i}><Rich text={s} /></li>)}
      </ul>
    );
  return (
    <dl className="divide-y divide-gray-200 rounded-lg border border-gray-200">
      {block.terms.map(([term, def]) => (
        <div key={term} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt className="font-medium text-gray-900">{term}</dt>
          <dd><Rich text={def} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function HelpBrowser({ topics, allShown, hiddenCount }: { topics: HelpTopic[]; allShown: boolean; hiddenCount: number }) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? topics.filter((t) => { const text = helpText(t); return words.every((w) => text.includes(w)); }) : topics;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help" aria-label="Search help" className="pl-9" />
        </div>
        <nav aria-label="Help topics" className="space-y-0.5">
          {shown.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="block rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">
              {t.title}
            </a>
          ))}
        </nav>
        {(hiddenCount > 0 || allShown) && (
          <p className="px-2 text-xs text-gray-500">
            {allShown ? (
              <Link href="/help" className="text-blue-600 hover:underline">Show only topics for my role</Link>
            ) : (
              <>
                {hiddenCount} topic(s) cover parts of the platform your role doesn&apos;t use.{" "}
                <Link href="/help?all=1" className="text-blue-600 hover:underline">Show all topics</Link>
              </>
            )}
          </p>
        )}
      </aside>

      <div className="min-w-0 space-y-6">
        {shown.length === 0 && <p className="text-sm text-gray-500">Nothing in the help matches &quot;{query}&quot;.</p>}
        {shown.map((t) => (
          <Card key={t.id} id={t.id} className="scroll-mt-6">
            <CardHeader className="pb-3">
              <CardTitle>{t.title}</CardTitle>
              <CardDescription>{t.summary}</CardDescription>
            </CardHeader>
            <CardContent className={cn("space-y-3 text-sm leading-relaxed text-gray-700")}>
              {t.blocks.map((b, i) => <Block key={i} block={b} />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
