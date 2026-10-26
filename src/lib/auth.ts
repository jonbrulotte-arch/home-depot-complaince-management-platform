import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const ip = clientIp(request.headers);
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          const typed = typeof raw?.email === "string" ? raw.email.trim().slice(0, 200) : "";
          if (typed) await audit(null, "auth.signInFailed", "User", null, { email: typed, reason: "Not a valid email", ip });
          return null;
        }
        const { email } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
        // Failed attempts go to the App Log with the email that was tried
        const reason = !user ? "Unknown email" : !user.active ? "Account is inactive" : !(await bcrypt.compare(parsed.data.password, user.passwordHash)) ? "Wrong password" : null;
        if (!user || reason) {
          await audit(user?.id ?? null, "auth.signInFailed", "User", user?.id, { email, reason, ip });
          return null;
        }
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit(user.id, "auth.signIn", "User", user.id, { ip });
        return { id: user.id, name: user.name, email: user.email, role: user.role.name };
      },
    }),
  ],
  events: {
    async signOut(message) {
      const id = "token" in message ? (message.token?.id as string | undefined) : undefined;
      if (id) await audit(id, "auth.signOut", "User", id);
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      return session;
    },
  },
});
