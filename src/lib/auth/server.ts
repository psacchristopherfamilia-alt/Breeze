import type { SupabaseClient, User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { Database } from "@/types/database";
import { salonSignUpSchema } from "@/lib/validation/auth";

type Client = SupabaseClient<Database>;

export { safeNext } from "./redirect";

/** URL base para los enlaces de los correos de Supabase. */
export async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** A dónde va cada usuario al entrar: personal del salón → panel; cliente → sus citas. */
export async function homeFor(supabase: Client): Promise<string> {
  const { data } = await supabase.rpc("my_context");
  if (data && data.length > 0) return "/dashboard";
  // El administrador de la plataforma sin negocio propio entra directo a su panel.
  return (await isPlatformAdmin(supabase)) ? "/admin" : "/me";
}

/** ¿La sesión actual es de administrador de la plataforma? (profiles.is_platform_admin; solo se pone por SQL). */
export async function isPlatformAdmin(supabase: Client): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.is_anonymous) return false;
  const { data } = await supabase.from("profiles").select("is_platform_admin").eq("id", auth.user.id).maybeSingle();
  return data?.is_platform_admin === true;
}

/**
 * Si el dueño se registró con confirmación de correo, los datos del salón quedan en
 * user_metadata.pending_salon y el salón se crea al confirmar (callback) o al entrar.
 */
export async function finishPendingSalon(supabase: Client, user: User | null): Promise<boolean> {
  const pending = user?.user_metadata?.pending_salon;
  if (!pending) return false;
  const parsed = salonSignUpSchema
    .pick({ orgName: true, salonName: true, businessTypes: true, zone: true, salonPhone: true, address: true })
    .safeParse(pending);
  if (!parsed.success) return false;

  const { data: ctx } = await supabase.rpc("my_context");
  if (!ctx || ctx.length === 0) {
    const d = parsed.data;
    const { error } = await supabase.rpc("create_organization", {
      p_org_name: d.orgName,
      p_salon_name: d.salonName,
      p_business_types: d.businessTypes,
      p_zone: d.zone,
      p_phone: d.salonPhone,
      p_address: d.address,
    });
    if (error) throw error;
  }
  await supabase.auth.updateUser({ data: { pending_salon: null } });
  return true;
}
