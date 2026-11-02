import { describe, expect, it, vi } from "vitest";
import { MailError, emailHtml, mailConfig, sendMail } from "@/lib/mail";
import { INVITE_DAYS, hashInviteToken, inviteState, isInviteToken, newInviteToken } from "@/lib/invites";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/branding", () => ({ getBranding: async () => ({ siteName: "HD Compliance Platform" }) }));

const env = { MS_GRAPH_TENANT_ID: "t", MS_GRAPH_CLIENT_ID: "c", MS_GRAPH_CLIENT_SECRET: "s", MS_GRAPH_SENDER: "noreply@jsproducts.com" };

describe("email through Microsoft Graph", () => {
  it("reads its settings from the environment and names what is missing", () => {
    expect(mailConfig(env).config?.sender).toBe("noreply@jsproducts.com");
    expect(mailConfig({ ...env, MS_GRAPH_CLIENT_SECRET: " " })).toEqual({ config: null, missing: ["MS_GRAPH_CLIENT_SECRET"] });
  });

  it("gets a token, then sends from the configured mailbox", async () => {
    const calls: [string, RequestInit][] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (url.includes("login.microsoftonline.com")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    await sendMail({ to: "a@b.com", subject: "Hi", html: "<p>x</p>" }, mailConfig(env).config, fetchMock);
    expect(calls[0][0]).toBe("https://login.microsoftonline.com/t/oauth2/v2.0/token");
    expect(String(calls[0][1].body)).toContain("grant_type=client_credentials");
    expect(calls[1][0]).toBe("https://graph.microsoft.com/v1.0/users/noreply%40jsproducts.com/sendMail");
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(calls[1][1].body)).message.toRecipients[0].emailAddress.address).toBe("a@b.com");
  });

  it("reports Microsoft's reason when sending fails", async () => {
    const fetchMock = (async (url: string) =>
      url.includes("login")
        ? new Response(JSON.stringify({ access_token: "tok2", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Access is denied." } }), { status: 403 })) as unknown as typeof fetch;
    await expect(sendMail({ to: "a@b.com", subject: "Hi", html: "" }, { ...mailConfig(env).config!, tenantId: "t2" }, fetchMock)).rejects.toThrow(/Access is denied/);
    await expect(sendMail({ to: "a@b.com", subject: "Hi", html: "" }, null, fetchMock)).rejects.toBeInstanceOf(MailError);
  });

  it("keeps Microsoft's sign-in error readable", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ error: "invalid_request", error_description: "AADSTS900021: Requested tenant identifier is not valid. Trace ID: abc Correlation ID: def" }), { status: 400 })) as unknown as typeof fetch;
    await expect(sendMail({ to: "a@b.com", subject: "Hi", html: "" }, { ...mailConfig(env).config!, tenantId: "t3" }, fetchMock)).rejects.toThrow(
      /^Microsoft sign-in failed: AADSTS900021: Requested tenant identifier is not valid\.$/,
    );
  });

  it("escapes what goes into the email", () => {
    const html = emailHtml({ siteName: "A&B", heading: "<b>x</b>", paragraphs: ['"quoted"'], button: { label: "Go", url: "https://x/invite/abc?y=1&z=2" } });
    expect(html).toContain("A&amp;B");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).toContain('href="https://x/invite/abc?y=1&amp;z=2"');
  });
});

describe("invitations", () => {
  it("makes unguessable one-time links and stores only their hash", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const a = newInviteToken(now);
    const b = newInviteToken(now);
    expect(a.token).not.toBe(b.token);
    expect(isInviteToken(a.token)).toBe(true);
    expect(isInviteToken("short")).toBe(false);
    expect(a.tokenHash).toBe(hashInviteToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.expiresAt.getTime() - now.getTime()).toBe(INVITE_DAYS * 86_400_000);
  });

  it("knows whether an invitation can still be used", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const base = { expiresAt: new Date("2026-11-10T12:00:00Z"), acceptedAt: null, revokedAt: null };
    expect(inviteState(base, now)).toBe("pending");
    expect(inviteState({ ...base, expiresAt: new Date("2026-11-01T00:00:00Z") }, now)).toBe("expired");
    expect(inviteState({ ...base, acceptedAt: now }, now)).toBe("accepted");
    expect(inviteState({ ...base, revokedAt: now }, now)).toBe("revoked");
  });
});
