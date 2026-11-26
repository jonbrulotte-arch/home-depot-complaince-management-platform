import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { homePath } from "@/lib/permissions";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homePath(user.permissions) : "/login");
}
