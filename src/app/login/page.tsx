import { connection } from "next/server";
import { getBranding } from "@/lib/branding";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Branding is stored in the database, so render per request rather than at build time
  await connection();
  return <LoginForm branding={await getBranding()} />;
}
