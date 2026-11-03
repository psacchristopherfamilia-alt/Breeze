import { z } from "zod";
import { normalizePhone } from "../phone";

/**
 * Esquemas compartidos por formularios (cliente) y server actions (servidor).
 * Los mensajes son CLAVES de traducción (auth.errors.*), no texto.
 */
const BUSINESS_TYPES = ["barbershop", "salon", "spa"] as const;
export const ZONES = [
  "grace_bay", "downtown_provo", "leeward", "long_bay", "turtle_cove", "the_bight", "chalk_sound",
  "five_cays", "blue_hills", "kew_town", "grand_turk", "north_caicos", "middle_caicos", "south_caicos", "salt_cay",
] as const;

const email = z.string().trim().toLowerCase().email("invalidEmail");
const password = z.string().min(8, "passwordTooShort").max(72, "passwordTooLong");
const phone = z
  .string()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return p;
  });
const locale = z.enum(["en", "es"]).catch("en");

export const signInSchema = z.object({ email, password: z.string().min(1, "required") });

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "nameTooShort").max(120),
  email,
  phone,
  password,
  locale,
});

export const salonSignUpSchema = signUpSchema.extend({
  orgName: z.string().trim().min(2, "businessNameTooShort").max(120),
  salonName: z.string().trim().min(2, "businessNameTooShort").max(120),
  businessTypes: z.array(z.enum(BUSINESS_TYPES)).min(1, "pickBusinessType"),
  zone: z.enum(ZONES, { message: "pickZone" }),
  salonPhone: z.string().optional().transform((v) => normalizePhone(v) ?? undefined),
  address: z.string().trim().max(200).optional(),
});

export type SalonSignUp = z.infer<typeof salonSignUpSchema>;

/** FormData → objeto plano (soporta campos repetidos como businessTypes). */
export function formToObject(fd: FormData, arrays: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    out[key] = arrays.includes(key) ? fd.getAll(key) : fd.get(key);
  }
  for (const a of arrays) out[a] ??= [];
  return out;
}

/** Primer error por campo → { campo: "clave" } */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const k = String(issue.path[0] ?? "form");
    out[k] ??= issue.message;
  }
  return out;
}
