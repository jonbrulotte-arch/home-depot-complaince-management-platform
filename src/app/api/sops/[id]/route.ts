import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { seesAllSops } from "@/lib/sops";

/** Downloads an SOP PDF: for signed-in users whose role it's for, and admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sop = await prisma.sopDocument.findUnique({ where: { id: (await params).id } });
  // Not for this role reads the same as missing
  if (!sop || (!seesAllSops(user) && !sop.roleIds.includes(user.roleId))) return notFound("SOP not found");
  await audit(user.id, "sop.download", "SopDocument", sop.id, { title: sop.title });
  return new NextResponse(new Uint8Array(sop.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sop.fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(sop.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
