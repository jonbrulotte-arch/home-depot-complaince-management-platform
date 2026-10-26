// Branding values safe to import anywhere (no database access).

export const DEFAULT_SITE_NAME = "Sympl CM";
export const MAX_LOGO_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"] as const;

export interface Branding {
  /** True when custom branding is switched on */
  custom: boolean;
  siteName: string;
  /** Versioned URL of the uploaded logo, when custom branding has one */
  logoUrl: string | null;
}

/** Detects the image type from the file's first bytes, so the declared type cannot lie. */
export function sniffLogoType(bytes: Buffer): (typeof LOGO_TYPES)[number] | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  const head = bytes.subarray(0, 1024).toString("utf8").trimStart();
  if ((head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) && head.includes("<svg")) return "image/svg+xml";
  return null;
}
