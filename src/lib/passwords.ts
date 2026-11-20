import bcrypt from "bcryptjs";

export { PASSWORD_MIN } from "@/lib/password-rules";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
