// Email addresses as people type them: one or more, separated by commas, semicolons or spaces.
// Pure and safe in the browser.

/** The addresses in `text`, without repeats; [] when empty, null when one isn't an address */
export function parseAddresses(text: string): string[] | null {
  const list = text
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (!list.every((a) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a))) return null;
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** `extra` added to `base`, leaving out any already there (compared without case) */
export function mergeAddresses(base: string[], extra: string[]): string[] {
  const seen = new Set(base.map((a) => a.toLowerCase()));
  return [...base, ...extra.filter((a) => !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()))];
}
