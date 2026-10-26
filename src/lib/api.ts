import { NextResponse } from "next/server";
import type { z } from "zod";

export type IdParams = { params: Promise<{ id: string }> };

/** Parses and validates a JSON body; zod schemas trim strings at this boundary. */
export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Request body must be JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: NextResponse.json({ error: `${issue.path.join(".") || "body"}: ${issue.message}` }, { status: 400 }) };
  }
  return { data: parsed.data };
}

export function notFound(what = "Not found") {
  return NextResponse.json({ error: what }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
