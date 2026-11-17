// "+ Link Resource": links to documents kept elsewhere (OneDrive, SharePoint…) beside a dispute's or
// an issue's files. Pure and safe in the browser.

export const MAX_LINK_LABEL = 200;
export const MAX_LINK_URL = 2000;

/**
 * A link as typed, made safe to open: trimmed, "https://" added when no scheme is given, and only
 * http(s) allowed (never javascript: or file:). Null when it isn't a web address.
 */
export function cleanResourceUrl(input: string): string | null {
  let v = input.trim();
  if (!v || v.length > MAX_LINK_URL) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
  return u.href;
}

/** The site a link goes to, e.g. "jsproducts-my.sharepoint.com" */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Link text and URL from a request body; an error names what to fix */
export function parseResourceLink(body: unknown): { label: string; url: string } | { error: string } {
  const b = (body ?? {}) as { label?: unknown; url?: unknown };
  const label = typeof b.label === "string" ? b.label.trim().replace(/\s+/g, " ") : "";
  if (!label) return { error: "Enter the link text" };
  if (label.length > MAX_LINK_LABEL) return { error: `Keep the link text under ${MAX_LINK_LABEL} characters` };
  const url = typeof b.url === "string" ? cleanResourceUrl(b.url) : null;
  if (!url) return { error: "Enter a web address (https://…)" };
  return { label, url };
}
