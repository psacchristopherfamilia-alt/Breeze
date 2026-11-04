"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientIp, verifyCaptcha } from "@/lib/captcha";
import { bookingErrorKey, type ConfirmRequest, type ConfirmResult } from "@/lib/booking/types";
import { normalizePhone } from "@/lib/phone";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Acciones de reserva contra Supabase. Toda la validación de verdad (horario, antelación,
 * doble reserva, límites de invitado…) ocurre en las funciones RPC de la base de datos.
 */

export async function confirmBooking(salonId: string, req: ConfirmRequest): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let guest: { [k: string]: string | boolean | null } | null = null;
  if (!user) {
    const g = req.guest;
    const phone = normalizePhone(g?.phone);
    if (!g?.firstName?.trim()) return { ok: false, error: "name_required" };
    if (!phone) return { ok: false, error: "phone_required" };
    // Anti-bots: las reservas de invitado (sin cuenta) pasan por el captcha cuando está activado.
    if (!(await verifyCaptcha(req.captchaToken, clientIp((await headers()).get("x-forwarded-for"))))) {
      return { ok: false, error: "captcha_failed" };
    }
    guest = {
      first_name: g.firstName.trim(),
      last_name: g.lastName?.trim() ?? "",
      phone,
      email: g.email?.trim() || null,
      locale: g.locale,
      whatsapp_opt_in: g.whatsapp,
    };
  }

  const { data, error } = await supabase.rpc("book_appointment", {
    p_salon_id: salonId,
    p_items: req.items.map((i) => ({ service_id: i.serviceId, professional_id: i.professionalId })),
    p_starts_at: req.startsAt,
    p_guest: guest ?? undefined,
  });
  if (error) return { ok: false, error: bookingErrorKey(error) };
  const r = data as { booking_group_id: string; guest_token: string | null };
  // El invitado recibe su enlace privado /b/<token> en la confirmación y los recordatorios.
  if (r.guest_token) await supabase.rpc("attach_guest_link", { p_token: r.guest_token });
  revalidatePath("/me");
  return { ok: true, bookingGroupId: r.booking_group_id, guestToken: r.guest_token };
}

/** Reprogramar: con sesión (groupId) o como invitado (token del enlace). */
export async function rescheduleBooking(
  ref: { groupId?: string; token?: string },
  startsAt: string,
): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = ref.token
    ? await supabase.rpc("reschedule_by_guest_token", { p_token: ref.token, p_new_start: startsAt })
    : await supabase.rpc("reschedule_booking", { p_booking_group_id: ref.groupId!, p_new_start: startsAt });
  if (error) return { ok: false, error: bookingErrorKey(error) };
  revalidatePath("/me");
  return { ok: true, bookingGroupId: ref.groupId ?? "", guestToken: ref.token ?? null };
}

export type CancelState = { error?: string; done?: boolean } | undefined;

/** Formulario de cancelar (en /me o en /b/[token]). */
export async function cancelBookingAction(_: CancelState, fd: FormData): Promise<CancelState> {
  if (!isSupabaseConfigured()) return { error: "generic" };
  const supabase = await createClient();
  const token = fd.get("token");
  const groupId = fd.get("groupId");
  const reason = String(fd.get("reason") ?? "") || undefined;
  const { error } = token
    ? await supabase.rpc("cancel_by_guest_token", { p_token: String(token), p_reason: reason })
    : await supabase.rpc("cancel_booking", { p_booking_group_id: String(groupId), p_reason: reason });
  if (error) return { error: bookingErrorKey(error) };
  revalidatePath("/me");
  if (token) revalidatePath(`/b/${token}`);
  return { done: true };
}
