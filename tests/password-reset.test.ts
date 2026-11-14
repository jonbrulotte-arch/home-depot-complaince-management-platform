import { describe, expect, it, vi } from "vitest";
import { hashInviteToken, isInviteToken } from "@/lib/invites";
import { RESET_IP_LIMIT, RESET_MINUTES, mayRequestReset, newResetToken, resetState } from "@/lib/password-reset";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/branding", () => ({ getBranding: async () => ({ siteName: "HD Compliance Platform" }) }));

const now = new Date("2026-11-03T15:00:00Z");

describe("password reset links", () => {
  it("makes a one-hour link whose token is stored only as its hash", () => {
    const { token, tokenHash, expiresAt } = newResetToken(now);
    expect(isInviteToken(token)).toBe(true);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).not.toContain(token);
    expect(expiresAt.getTime() - now.getTime()).toBe(RESET_MINUTES * 60_000);
    expect(newResetToken(now).token).not.toBe(token);
  });

  it("is valid until it expires or is used", () => {
    const later = new Date(now.getTime() + 30 * 60_000);
    expect(resetState(null)).toBe("invalid");
    expect(resetState({ expiresAt: later, usedAt: null }, now)).toBe("valid");
    expect(resetState({ expiresAt: now, usedAt: null }, now)).toBe("expired");
    expect(resetState({ expiresAt: later, usedAt: now }, now)).toBe("used");
  });

  it("sends at most one email per user every two minutes, and limits each address", () => {
    expect(mayRequestReset({ lastForUser: null, recentFromIp: 0 }, now)).toBe("ok");
    expect(mayRequestReset({ lastForUser: new Date(now.getTime() - 60_000), recentFromIp: 0 }, now)).toBe("user-wait");
    expect(mayRequestReset({ lastForUser: new Date(now.getTime() - 3 * 60_000), recentFromIp: 0 }, now)).toBe("ok");
    expect(mayRequestReset({ lastForUser: null, recentFromIp: RESET_IP_LIMIT }, now)).toBe("ip-limit");
  });
});
