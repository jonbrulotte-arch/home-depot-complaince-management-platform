// Database-free SOP file helpers (unit-tested)

export const MAX_SOP_BYTES = 25 * 1024 * 1024;

/** Whether the bytes are a PDF (by its header, not the file name). */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** A file name safe for a download header, ending in .pdf. */
export function sopFileName(name: string): string {
  const base = name.replace(/[\\/\r\n"]/g, "_").replace(/\.pdf$/i, "").trim().slice(0, 150) || "SOP";
  return `${base}.pdf`;
}
