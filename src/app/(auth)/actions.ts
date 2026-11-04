"use server";
import { redirect } from "next/navigation";
import { appOrigin, finishPendingSalon, homeFor, safeNext } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formToObject, salonSignUpSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";

/** Estado que devuelven las acciones a los formularios: claves de traducción (auth.errors.*). */
export type FormState =
  | { error?: string; fields?: Record<string, string>; values?: Record<string, string | string[]> }
  | undefined;

/** Lo que el usuario escribió (sin contraseñas), para no vaciarle el formulario tras un error. */
function keep(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(fd.keys())) {
    if (key === "password" || key.startsWith("$")) continue;
    const all = fd.getAll(key).map(String);
    out[key] = key === "businessTypes" ? all : all[0];
  }
  return out;
}



function mapAuthError(code: string | undefined): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return "emailTaken";
    case "weak_password":
      return "passwordTooShort";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    case "invalid_credentials":
      return "invalidCredentials";
    default:
      return "generic";
  }
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured", values: keep(fd) };
  const parsed = signInSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: keep(fd) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: mapAuthError(error.code ?? "invalid_credentials"), values: keep(fd) };

  await finishPendingSalon(supabase, data.user);
  redirect(safeNext(fd.get("next")) ?? (await homeFor(supabase)));
}

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured", values: keep(fd) };
  const parsed = signUpSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: keep(fd) };
  const { email, password, fullName, phone, locale } = parsed.data;
  const next = safeNext(fd.get("next")) ?? "/me";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, locale },
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: mapAuthError(error.code), values: keep(fd) };
  redirect(data.session ? next : "/check-email");
}

export async function signUpSalon(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured", values: keep(fd) };
  const parsed = salonSignUpSchema.safeParse(formToObject(fd, ["businessTypes"]));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: keep(fd) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: {
        full_name: d.fullName,
        phone: d.phone,
        locale: d.locale,
        pending_salon: {
          orgName: d.orgName,
          salonName: d.salonName,
          businessTypes: d.businessTypes,
          zone: d.zone,
          salonPhone: d.salonPhone,
          address: d.address,
        },
      },
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent("/dashboard?welcome=1")}`,
    },
  });
  if (error) return { error: mapAuthError(error.code), values: keep(fd) };
  if (!data.session) redirect("/check-email");

  await finishPendingSalon(supabase, data.user);
  redirect("/dashboard?welcome=1");
}

/** Cierra la sesión. El formulario indica a dónde volver (`to`): el cliente a /explore, el negocio a /negocios. */
export async function signOut(fd?: FormData) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect(safeNext(fd?.get("to") ?? null) ?? "/explore");
}

const INVITE_ERRORS: Record<string, string> = {
  invitation_not_found: "inviteNotFound",
  invitation_already_used: "inviteUsed",
  invitation_expired: "inviteExpired",
  invitation_wrong_account: "inviteWrongAccount",
};

export async function acceptInvitation(_: FormState, fd: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "notConfigured", values: keep(fd) };
  const token = String(fd.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: INVITE_ERRORS[error.message] ?? "generic" };
  redirect("/dashboard");
}
