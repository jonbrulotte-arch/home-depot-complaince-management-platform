import { describe, expect, it, vi } from "vitest";
import { pickerTeams } from "@/lib/team-options";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("teams", () => {
  it("makes a stable key from a new team's name, unique among existing keys", async () => {
    const { teamKeyFor } = await import("@/lib/teams");
    expect(teamKeyFor("Warehouse (Site 5)", ["EDI"])).toBe("WAREHOUSE_SITE_5");
    expect(teamKeyFor("EDI", ["EDI"])).toBe("EDI_2");
    expect(teamKeyFor("edi", ["EDI", "EDI_2"])).toBe("EDI_3");
    expect(teamKeyFor("Équipe ++ Qualité", [])).toBe("EQUIPE_QUALITE");
    expect(teamKeyFor("!!!", [])).toBe("TEAM");
  });

  it("offers active teams, plus an inactive one already chosen", () => {
    const teams = [
      { key: "EDI", name: "EDI", active: true },
      { key: "WAREHOUSE", name: "Warehouse (site not set)", active: false },
    ];
    expect(pickerTeams(teams, null).map((t) => t.key)).toEqual(["EDI"]);
    expect(pickerTeams(teams, "WAREHOUSE").map((t) => t.key)).toEqual(["EDI", "WAREHOUSE"]);
  });
});
