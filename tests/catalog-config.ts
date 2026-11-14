import { DEFAULT_ALIASES, PROGRAM_CATALOG } from "@/lib/import/catalog";
import type { ConfigAlias, ConfigProgram } from "@/lib/import/transform";

/** Builds an in-memory importer config from the seed catalog, using codes as ids. */
export function catalogConfig(): { programs: ConfigProgram[]; aliases: ConfigAlias[] } {
  const programs = PROGRAM_CATALOG.map((p) => ({
    id: p.code,
    code: p.code,
    name: p.name,
    filePrefix: p.filePrefix,
    metrics: p.metrics.map((m) => ({ id: `${p.code}:${m.code}`, code: m.code, name: m.name, sheetNames: m.sheetNames })),
  }));
  const aliases = Object.entries(DEFAULT_ALIASES).map(([sourceHeader, canonicalField]) => ({
    programId: null, metricId: null, sourceHeader, canonicalField,
  }));
  return { programs, aliases };
}
