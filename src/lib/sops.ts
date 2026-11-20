import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth-guard";

// SOPs (standard operating procedures) as PDFs: admins upload them under Admin › Settings and
// choose the roles each is for; Help & Docs lists the ones for the user's role to download.

export { MAX_SOP_BYTES, isPdf, sopFileName } from "@/lib/sop-file";
import { MAX_SOP_BYTES, isPdf } from "@/lib/sop-file";

/** Admins (Settings) see every SOP; everyone else those for their role. */
export const seesAllSops = (user: CurrentUser) => user.permissions.has("admin.settings");

/** The SOPs a user may download, without their bytes, in the admins' order. */
export async function sopsFor(user: CurrentUser) {
  return prisma.sopDocument.findMany({
    where: seesAllSops(user) ? {} : { roleIds: { has: user.roleId } },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, fileName: true, size: true, roleIds: true, updatedAt: true },
  });
}

/** Reads and checks the form fields shared by upload and edit. */
export async function sopForm(form: FormData, validRoleIds: string[]): Promise<{ title?: string; roleIds?: string[]; file?: { name: string; bytes: Uint8Array<ArrayBuffer> }; error?: string }> {
  const out: { title?: string; roleIds?: string[]; file?: { name: string; bytes: Uint8Array<ArrayBuffer> } } = {};
  const title = form.get("title");
  if (title !== null) {
    if (typeof title !== "string" || !title.trim()) return { error: "Give the SOP a title" };
    if (title.trim().length > 120) return { error: "The title is too long (120 characters at most)" };
    out.title = title.trim();
  }
  const roles = form.get("roleIds");
  if (roles !== null) {
    let ids: unknown;
    try {
      ids = JSON.parse(String(roles));
    } catch {
      return { error: "roleIds must be a JSON list" };
    }
    if (!Array.isArray(ids) || !ids.every((r) => typeof r === "string" && validRoleIds.includes(r))) return { error: "Unknown role" };
    out.roleIds = [...new Set(ids as string[])];
  }
  const file = form.get("file");
  if (file instanceof File) {
    if (file.size > MAX_SOP_BYTES) return { error: "SOP PDFs are limited to 25 MB" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(bytes)) return { error: "Upload a PDF (export the SOP as PDF first)" };
    out.file = { name: file.name, bytes };
  }
  return out;
}
