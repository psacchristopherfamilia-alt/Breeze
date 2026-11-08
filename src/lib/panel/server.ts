import { cookies } from "next/headers";
import { createClient } from "../supabase/server";

export const SALON_COOKIE = "breeze-salon";

export type PanelRole = "owner" | "admin" | "professional";

export interface PanelSalon {
  salonId: string;
  salonName: string;
  salonSlug: string;
  organizationId: string;
  organizationName: string;
  roles: PanelRole[];
  professionalId: string | null;
}

export interface PanelContext {
  salons: PanelSalon[];
  current: PanelSalon;
  /** Dueño o admin de la sucursal actual: gestiona todo. */
  isManager: boolean;
  isOwner: boolean;
  /** Si solo es profesional: su ficha (solo ve su agenda). */
  professionalId: string | null;
}

/** Sucursales y roles del usuario (sin la pantalla "display", que no entra al panel). */
export async function getPanelContext(): Promise<PanelContext | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_context");
  const bySalon = new Map<string, PanelSalon>();
  for (const r of data ?? []) {
    if (r.role === "display") continue;
    const s =
      bySalon.get(r.salon_id) ??
      ({
        salonId: r.salon_id,
        salonName: r.salon_name,
        salonSlug: r.salon_slug,
        organizationId: r.organization_id,
        organizationName: r.organization_name,
        roles: [],
        professionalId: null,
      } satisfies PanelSalon);
    s.roles.push(r.role as PanelRole);
    if (r.professional_id) s.professionalId = r.professional_id;
    bySalon.set(r.salon_id, s);
  }
  const salons = [...bySalon.values()];
  if (salons.length === 0) return null;

  const wanted = (await cookies()).get(SALON_COOKIE)?.value;
  const current = salons.find((s) => s.salonId === wanted) ?? salons[0];
  const isManager = current.roles.includes("owner") || current.roles.includes("admin");
  return {
    salons,
    current,
    isManager,
    isOwner: current.roles.includes("owner"),
    professionalId: isManager ? null : current.professionalId,
  };
}

/** Traduce errores de Supabase/RPC a claves panel.errors.* */
export function panelErrorKey(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "generic";
  if (e.code === "23P01") return "slot_taken";
  if (e.code === "23505") return e.message?.includes("color") ? "color_taken" : "duplicate";
  if (e.code === "42501") return "forbidden";
  const known = [
    "forbidden", "invalid_hours", "overlapping_hours", "invalid_service", "salon_incomplete", "professional_already_linked",
    "email_or_phone_required", "too_soon", "outside_working_hours", "not_started", "invalid_status", "nothing_to_cancel",
    "phone_required", "name_required", "service_not_offered", "invalid_items", "not_found", "reply_too_long", "reason_required",
    "already_started", "invalid_duration",
  ];
  return known.includes(e.message ?? "") ? (e.message as string) : "generic";
}
