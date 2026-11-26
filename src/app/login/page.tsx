import { connection } from "next/server";
import { getBranding } from "@/lib/branding";
import { TimeZoneProvider } from "@/components/time-zone";
import { FALLBACK_TIME_ZONE } from "@/lib/time-zones";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Branding is stored in the database, so render per request rather than at build time
  await connection();
  // Records the browser's time zone before the first app page, so that page needs no reload
  return (
    <TimeZoneProvider timeZone={FALLBACK_TIME_ZONE} followsBrowser={false}>
      <LoginForm branding={await getBranding()} />
    </TimeZoneProvider>
  );
}
