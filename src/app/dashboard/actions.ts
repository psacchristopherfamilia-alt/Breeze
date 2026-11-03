"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/server";
import { PRO_COLORS } from "@/lib/colors";
import { SALON_COOKIE, panelErrorKey } from "@/lib/panel/server";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { ZONES } from "@/lib/validation/auth";

/**
 * Acciones del panel. RLS + RPC deciden QUIÉN puede hacer QUÉ: aquí solo validamos la forma.
 * Siempre devuelven { ok } o { ok: false, error: <clave panel.errors.*> }.
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const done = (): Result => {
  revalidatePath("/dashboard", "layout");
  return { ok: true };
};
const fail = (e: { code?: string; message?: string } | null): Result => ({ ok: false, error: panelErrorKey(e) });
const uuid = z.string().uuid();

// ─── Contexto ──────────────────────────────────────────────────────────────

export async function switchSalon(salonId: string) {
  (await cookies()).set(SALON_COOKIE, uuid.parse(salonId), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard", "layout");
}

const businessSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  salonName: z.string().trim().min(2).max(120),
  businessTypes: z.array(z.enum(["barbershop", "salon", "spa"])).min(1),
  zone: z.enum(ZONES),
});

/** Usuario con sesión pero sin negocio: crea organización + primera sucursal. */
export async function createBusiness(input: z.input<typeof businessSchema>): Promise<Result> {
  const p = businessSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_org_name: p.data.orgName,
    p_salon_name: p.data.salonName,
    p_business_types: p.data.businessTypes,
    p_zone: p.data.zone,
  });
  return error ? fail(error) : done();
}

// ─── Agenda ────────────────────────────────────────────────────────────────

export async function staffCreate(
  salonId: string,
  input: { professionalId: string; serviceId: string; startsAt: string; source: "phone" | "walk_in"; customer: { firstName: string; lastName: string; phone: string } },
): Promise<Result> {
  const phone = normalizePhone(input.customer.phone);
  if (!input.customer.firstName.trim()) return { ok: false, error: "name_required" };
  if (!phone) return { ok: false, error: "phone_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_create_appointment", {
    p_salon_id: uuid.parse(salonId),
    p_items: [{ service_id: input.serviceId, professional_id: input.professionalId }],
    p_starts_at: input.startsAt,
    p_customer: { first_name: input.customer.firstName.trim(), last_name: input.customer.lastName.trim(), phone },
    p_source: input.source,
  });
  return error ? fail(error) : done();
}

export async function markAppointment(id: string, status: "completed" | "no_show"): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_appointment", { p_appointment_id: uuid.parse(id), p_status: status });
  return error ? fail(error) : done();
}

export async function cancelGroup(groupId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_group_id: uuid.parse(groupId), p_reason: "salon" });
  return error ? fail(error) : done();
}

// ─── Profesionales ─────────────────────────────────────────────────────────

const proSchema = z.object({
  id: uuid.optional(),
  salonId: uuid,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60),
  title: z.enum(["barber", "stylist", "nail_tech", "makeup_artist", "esthetician", "massage_therapist", "other"]),
  colorHex: z.enum(PRO_COLORS.map((c) => c.hex) as [string, ...string[]]),
  isActive: z.boolean().default(true),
  acceptsOnline: z.boolean().default(true),
});

export async function saveProfessional(input: z.input<typeof proSchema>): Promise<Result<{ id?: string }>> {
  const p = proSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const d = p.data;
  const row = {
    first_name: d.firstName,
    last_name: d.lastName,
    title: d.title,
    color_hex: d.colorHex,
    is_active: d.isActive,
    accepts_online: d.acceptsOnline,
  };
  const supabase = await createClient();
  if (d.id) {
    const { error, count } = await supabase.from("professionals").update(row, { count: "exact" }).eq("id", d.id);
    if (error) return fail(error.code === "23505" ? { code: "23505", message: "color" } : error);
    if (!count) return { ok: false, error: "forbidden" };
    revalidatePath("/dashboard", "layout");
    return { ok: true, id: d.id };
  }
  const { data, error } = await supabase.from("professionals").insert({ ...row, salon_id: d.salonId }).select("id").single();
  if (error) return fail(error.code === "23505" ? { code: "23505", message: "color" } : error);
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: data.id };
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export async function setHours(professionalId: string, hours: { weekday: number; start: string; end: string }[]): Promise<Result> {
  const p = z.array(z.object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm })).safeParse(hours);
  if (!p.success) return { ok: false, error: "invalid_hours" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_working_hours", { p_professional_id: uuid.parse(professionalId), p_hours: p.data });
  return error ? fail(error) : done();
}

export async function setProServices(professionalId: string, serviceIds: string[]): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_professional_services", {
    p_professional_id: uuid.parse(professionalId),
    p_service_ids: z.array(uuid).parse(serviceIds),
  });
  return error ? fail(error) : done();
}

/** Invitación a un profesional: devuelve el enlace para compartir (WhatsApp/correo). */
export async function inviteProfessional(
  organizationId: string,
  salonId: string,
  professionalId: string,
  contact: string,
): Promise<Result<{ link?: string }>> {
  const isEmail = contact.includes("@");
  const email = isEmail ? z.string().trim().toLowerCase().email().safeParse(contact) : null;
  const phone = isEmail ? null : normalizePhone(contact);
  if ((isEmail && !email?.success) || (!isEmail && !phone)) return { ok: false, error: "email_or_phone_required" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_organization_id: uuid.parse(organizationId),
    p_role: "professional",
    p_salon_id: uuid.parse(salonId),
    p_professional_id: uuid.parse(professionalId),
    p_email: email?.success ? email.data : undefined,
    p_phone: phone ?? undefined,
  });
  if (error) return fail(error);
  revalidatePath("/dashboard/professionals");
  return { ok: true, link: `${await appOrigin()}/invite/${data}` };
}

export async function addTimeOff(professionalId: string, startsAt: string, endsAt: string, reason: string): Promise<Result> {
  if (!(new Date(endsAt) > new Date(startsAt))) return { ok: false, error: "invalid_range" };
  const supabase = await createClient();
  const { error } = await supabase.from("time_off").insert({
    professional_id: uuid.parse(professionalId),
    starts_at: startsAt,
    ends_at: endsAt,
    reason: reason.trim() || null,
  });
  return error ? fail(error) : done();
}

export async function deleteTimeOff(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("time_off").delete().eq("id", uuid.parse(id));
  return error ? fail(error) : done();
}

// ─── Servicios ─────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  id: uuid.optional(),
  salonId: uuid,
  categoryCode: z.string().min(2),
  nameEn: z.string().trim().min(2).max(120),
  nameEs: z.string().trim().min(2).max(120),
  durationMin: z.number().int().min(5).max(480),
  bufferMin: z.number().int().min(0).max(120),
  priceCents: z.number().int().min(0).max(10_000_00),
  isActive: z.boolean().default(true),
});

export async function saveService(input: z.input<typeof serviceSchema>): Promise<Result> {
  const p = serviceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const d = p.data;
  const row = {
    category_code: d.categoryCode,
    name_en: d.nameEn,
    name_es: d.nameEs,
    duration_min: d.durationMin,
    buffer_min: d.bufferMin,
    price_cents: d.priceCents,
    is_active: d.isActive,
  };
  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("services").update(row).eq("id", d.id)
    : await supabase.from("services").insert({ ...row, salon_id: d.salonId });
  if (error?.code === "23514") return { ok: false, error: "category_mismatch" };
  return error ? fail(error) : done();
}

// ─── Ajustes y publicación ─────────────────────────────────────────────────

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).nullable(),
  phone: z.string().nullable(),
  zone: z.enum(ZONES),
  businessTypes: z.array(z.enum(["barbershop", "salon", "spa"])).min(1),
  slotStepMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]),
  minLeadTimeMin: z.number().int().min(0).max(10080),
  maxAdvanceDays: z.number().int().min(1).max(365),
  cancellationWindowHours: z.number().int().min(0).max(168),
  noShowBlockEnabled: z.boolean(),
  noShowThreshold: z.number().int().min(1).max(10),
  reminderOffsetsMin: z.array(z.number().int().min(15).max(10080)).max(3).default([1440, 120]),
});

export async function saveSettings(salonId: string, input: z.input<typeof settingsSchema>): Promise<Result> {
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const d = p.data;
  const phone = d.phone ? normalizePhone(d.phone) : null;
  if (d.phone && !phone) return { ok: false, error: "phone_required" };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("salons")
    .update(
      {
        name: d.name,
        address: d.address || null,
        phone,
        zone: d.zone,
        business_types: d.businessTypes,
        slot_step_min: d.slotStepMin,
        min_lead_time_min: d.minLeadTimeMin,
        max_advance_days: d.maxAdvanceDays,
        cancellation_window_hours: d.cancellationWindowHours,
        no_show_block_enabled: d.noShowBlockEnabled,
        no_show_threshold: d.noShowThreshold,
        reminder_offsets_min: [...new Set(d.reminderOffsetsMin)].sort((a, b) => b - a),
      },
      { count: "exact" },
    )
    .eq("id", uuid.parse(salonId));
  if (error) return fail(error);
  return count ? done() : { ok: false, error: "forbidden" };
}

export async function setPublished(salonId: string, published: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_salon_published", { p_salon_id: uuid.parse(salonId), p_published: published });
  return error ? fail(error) : done();
}

export async function addClosure(salonId: string, startsAt: string, endsAt: string, reason: string): Promise<Result> {
  if (!(new Date(endsAt) > new Date(startsAt))) return { ok: false, error: "invalid_range" };
  const supabase = await createClient();
  const { error } = await supabase.from("salon_closures").insert({
    salon_id: uuid.parse(salonId),
    starts_at: startsAt,
    ends_at: endsAt,
    reason_en: reason.trim() || null,
    reason_es: reason.trim() || null,
  });
  return error ? fail(error) : done();
}

export async function deleteClosure(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("salon_closures").delete().eq("id", uuid.parse(id));
  return error ? fail(error) : done();
}

// ─── Pantallas Breeze Live ─────────────────────────────────────────────────

export async function pairLiveDevice(salonId: string, code: string, name: string): Promise<Result> {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return { ok: false, error: "invalid_code" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pair_live_device", { p_salon_id: uuid.parse(salonId), p_code: digits, p_name: name.trim() || undefined });
  return error ? { ok: false, error: error.message === "invalid_code" ? "invalid_code" : panelErrorKey(error) } : done();
}

export async function revokeLiveDevice(deviceId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_live_device", { p_device_id: uuid.parse(deviceId) });
  return error ? fail(error) : done();
}
