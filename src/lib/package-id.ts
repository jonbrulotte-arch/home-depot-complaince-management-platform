// Chargeback Package IDs: alphanumeric references THD puts on the remittance for a batch of
// offsets. Database-free, so the report page's input can check them too.

export const MAX_PACKAGE_ID_LENGTH = 64;

/** A trimmed Package ID, or null when it isn't one (letters and digits, with - _ . / between) */
export function normalizePackageId(value: string): string | null {
  const id = value.trim();
  return id.length <= MAX_PACKAGE_ID_LENGTH && /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/.test(id) ? id : null;
}
