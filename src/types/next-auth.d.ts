import type { DefaultSession } from "next-auth";

// The role name is display-only; permissions are always re-read from the database
// (src/lib/auth-guard.ts) so role changes apply without signing out.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
  }
}
