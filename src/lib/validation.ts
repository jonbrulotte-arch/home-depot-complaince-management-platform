import { z } from "zod";
import { isPermission } from "@/lib/permissions";

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  permissions: z.array(z.string().trim()).refine((p) => p.every(isPermission), "contains an unknown permission"),
});
