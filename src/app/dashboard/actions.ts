"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/server";
import { PRO_COLORS } from "@/lib/colors";
import { MEDIA_BUCKET, isPathInSalon } from "@/lib/media";
import { SALON_COOKIE, panelErrorKey } from "@/lib/panel/server";
import { normalizePhone } from "@/lib/phone";
import { buildHours, validRange } from "@/lib/panel/setup";
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
/** Solo el error (para acciones cuyo éxito lleva datos propios). */
const bad = (e: { code?: string; message?: string } | null): { ok: false; error: string } => ({ ok: false, error: panelErrorKey(e) });
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
  acceptsCash: z.boolean().default(true),
  acceptsCard: z.boolean().default(false),
  acceptsTransfer: z.boolean().default(false),
  paymentNote: z.string().trim().max(400).default(""),
});

export async function saveProfessional(input: z.input<typeof proSchema>): Promise<Result<{ id?: string }>> {
  const p = proSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const d = p.data;
  // Al menos una forma de pago, y la transferencia necesita sus datos.
  if (!d.acceptsCash && !d.acceptsCard && !d.acceptsTransfer) return { ok: false, error: "payment_method_required" };
  if (d.acceptsTransfer && !d.paymentNote) return { ok: false, error: "transfer_details_required" };
  const row = {
    first_name: d.firstName,
    last_name: d.lastName,
    title: d.title,
    color_hex: d.colorHex,
    is_active: d.isActive,
    accepts_online: d.acceptsOnline,
    accepts_cash: d.acceptsCash,
    accepts_card: d.acceptsCard,
    accepts_transfer: d.acceptsTransfer,
    payment_note: d.paymentNote || null,
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

const serviceItemSchema = z.object({
  categoryCode: z.string().min(2),
  nameEn: z.string().trim().min(2).max(120),
  nameEs: z.string().trim().min(2).max(120),
  durationMin: z.number().int().min(5).max(480),
  bufferMin: z.number().int().min(0).max(120),
  priceCents: z.number().int().min(0).max(10_000_00),
});

const templatesSchema = z.object({
  salonId: uuid,
  items: z.array(serviceItemSchema).min(1).max(40),
});

/** Alta rápida: crea varios servicios sugeridos de una vez (RLS exige ser dueño/admin del salón). */
export async function addServiceTemplates(input: z.input<typeof templatesSchema>): Promise<Result> {
  const p = templatesSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const supabase = await createClient();
  const { count } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("salon_id", p.data.salonId);
  const base = count ?? 0;
  const { error } = await supabase.from("services").insert(
    p.data.items.map((d, i) => ({
      salon_id: p.data.salonId,
      category_code: d.categoryCode,
      name_en: d.nameEn,
      name_es: d.nameEs,
      duration_min: d.durationMin,
      buffer_min: d.bufferMin,
      price_cents: d.priceCents,
      sort_order: base + i,
    })),
  );
  if (error?.code === "23514") return { ok: false, error: "category_mismatch" };
  return error ? fail(error) : done();
}

// ─── Avisos en el teléfono (Web Push) ──────────────────────────────────────

const pushSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  p256dh: z.string().min(10).max(200),
  auth: z.string().min(10).max(100),
  userAgent: z.string().max(300).optional(),
});

/** Guarda este teléfono/navegador para recibir avisos de reservas. */
export async function savePushSubscription(input: z.input<typeof pushSchema>): Promise<Result> {
  const p = pushSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: p.data.endpoint,
    p_p256dh: p.data.p256dh,
    p_auth: p.data.auth,
    p_user_agent: p.data.userAgent,
  });
  return error ? fail(error) : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  return error ? fail(error) : { ok: true };
}

// ─── Ficha del cliente ─────────────────────────────────────────────────────

const customerSchema = z.object({
  id: uuid,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60),
  phone: z.string(),
  email: z.string().trim().max(200),
  locale: z.enum(["en", "es"]),
  whatsappOptIn: z.boolean(),
  marketingOptIn: z.boolean(),
});

/** Corrige los datos de contacto y los permisos de un cliente. Solo dueño/administrador (lo exige la RLS). */
export async function saveCustomer(input: z.input<typeof customerSchema>): Promise<Result> {
  const p = customerSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const d = p.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return { ok: false, error: "phone_required" };
  if (d.email && !z.string().email().safeParse(d.email).success) return { ok: false, error: "invalid_email" };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("customers")
    .update(
      { first_name: d.firstName, last_name: d.lastName, phone, email: d.email || null, locale: d.locale, whatsapp_opt_in: d.whatsappOptIn, marketing_opt_in: d.marketingOptIn },
      { count: "exact" },
    )
    .eq("id", d.id);
  if (error) return fail(error);
  if (!count) return { ok: false, error: "forbidden" };
  revalidatePath("/dashboard/clients", "layout");
  return { ok: true };
}

/** Nueva nota privada. El autor y su nombre los pone la base de datos. */
export async function addCustomerNote(customerId: string, body: string): Promise<Result> {
  const text = z.string().trim().min(1).max(1000).safeParse(body);
  if (!text.success) return { ok: false, error: "invalid_note" };
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("organization_id").eq("id", uuid.parse(customerId)).maybeSingle();
  if (!customer) return { ok: false, error: "forbidden" };
  const { error } = await supabase.from("customer_notes").insert({ customer_id: customerId, organization_id: customer.organization_id, body: text.data });
  if (error) return fail(error);
  revalidatePath(`/dashboard/clients/${customerId}`);
  return { ok: true };
}

/** Solo su autor puede borrar una nota (la RLS lo exige). */
export async function deleteCustomerNote(noteId: string, customerId: string): Promise<Result> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("customer_notes").delete({ count: "exact" }).eq("id", uuid.parse(noteId));
  if (error) return fail(error);
  if (!count) return { ok: false, error: "forbidden" };
  revalidatePath(`/dashboard/clients/${uuid.parse(customerId)}`);
  return { ok: true };
}

// ─── Asistente de arranque ─────────────────────────────────────────────────

const setupSchema = z.object({
  salonId: uuid,
  services: z.array(serviceItemSchema).max(40),
  pro: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60),
    title: z.enum(["barber", "stylist", "nail_tech", "makeup_artist", "esthetician", "massage_therapist", "other"]),
    colorHex: z.enum(PRO_COLORS.map((c) => c.hex) as [string, ...string[]]),
    acceptsCash: z.boolean(),
    acceptsCard: z.boolean(),
    acceptsTransfer: z.boolean(),
    paymentNote: z.string().trim().max(400),
  }),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: z.string(),
  end: z.string(),
  publish: z.boolean(),
});

/**
 * Deja el salón listo en un solo paso: servicios sugeridos, primer profesional (con su forma de cobro),
 * servicios asignados y horario; y publica si se pide. Solo crea lo que falta (si ya hay servicios o un
 * profesional activo, los usa), así que repetirlo tras un fallo no duplica nada.
 */
export async function completeSetup(input: z.input<typeof setupSchema>): Promise<Result<{ published: boolean }>> {
  const p = setupSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid_form" };
  const d = p.data;
  if (!validRange(d.start, d.end)) return { ok: false, error: "invalid_hours" };
  if (!d.pro.acceptsCash && !d.pro.acceptsCard && !d.pro.acceptsTransfer) return { ok: false, error: "payment_method_required" };
  if (d.pro.acceptsTransfer && !d.pro.paymentNote) return { ok: false, error: "transfer_details_required" };

  const supabase = await createClient();

  // 1. Servicios
  const { data: existing } = await supabase.from("services").select("id").eq("salon_id", d.salonId).eq("is_active", true);
  let serviceIds = (existing ?? []).map((s) => s.id);
  if (serviceIds.length === 0) {
    if (d.services.length === 0) return { ok: false, error: "services_required" };
    const { data, error } = await supabase
      .from("services")
      .insert(
        d.services.map((s, i) => ({
          salon_id: d.salonId,
          category_code: s.categoryCode,
          name_en: s.nameEn,
          name_es: s.nameEs,
          duration_min: s.durationMin,
          buffer_min: s.bufferMin,
          price_cents: s.priceCents,
          sort_order: i,
        })),
      )
      .select("id");
    if (error) return error.code === "23514" ? { ok: false, error: "category_mismatch" } : bad(error);
    serviceIds = (data ?? []).map((s) => s.id);
  }

  // 2. Profesional
  const { data: pros } = await supabase.from("professionals").select("id").eq("salon_id", d.salonId).eq("is_active", true).order("created_at").limit(1);
  let proId = pros?.[0]?.id;
  if (!proId) {
    const { data, error } = await supabase
      .from("professionals")
      .insert({
        salon_id: d.salonId,
        first_name: d.pro.firstName,
        last_name: d.pro.lastName,
        title: d.pro.title,
        color_hex: d.pro.colorHex,
        accepts_cash: d.pro.acceptsCash,
        accepts_card: d.pro.acceptsCard,
        accepts_transfer: d.pro.acceptsTransfer,
        payment_note: d.pro.paymentNote || null,
      })
      .select("id")
      .single();
    if (error) return bad(error.code === "23505" ? { code: "23505", message: "color" } : error);
    proId = data.id;
  }

  // 3. Servicios del profesional y 4. horario
  const link = await supabase.rpc("set_professional_services", { p_professional_id: proId, p_service_ids: serviceIds });
  if (link.error) return bad(link.error);
  const hours = await supabase.rpc("set_working_hours", { p_professional_id: proId, p_hours: buildHours(d.days, d.start, d.end) });
  if (hours.error) return bad(hours.error);

  // 5. Publicar (si se pidió)
  if (d.publish) {
    const pub = await supabase.rpc("set_salon_published", { p_salon_id: d.salonId, p_published: true });
    if (pub.error) return bad(pub.error);
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, published: d.publish };
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

// ─── Fotos ─────────────────────────────────────────────────────────────────
// El navegador reduce y sube el archivo a Storage (RLS: solo dueño/admin en la carpeta de su salón);
// aquí solo se guarda la RUTA en la base de datos y se limpian los archivos que dejan de usarse.

type Supa = Awaited<ReturnType<typeof createClient>>;
const photoErr = (e: { code?: string; message?: string }) =>
  ({ ok: false, error: e.message === "photo_limit" ? "photo_limit" : e.code === "23514" ? "invalid_photo" : panelErrorKey(e) }) as const;
/** Borra archivos que ya nadie usa (si falla no pasa nada grave: queda un archivo huérfano). */
async function removeFiles(supabase: Supa, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(MEDIA_BUCKET).remove(list);
}
const photoPath = (salonId: string, path: string | null) => path === null || isPathInSalon(path, salonId);

/** Añade una foto a la galería. La primera pasa a ser la portada. */
export async function addSalonPhoto(salonId: string, path: string): Promise<Result> {
  const sid = uuid.parse(salonId);
  if (!photoPath(sid, path)) return { ok: false, error: "invalid_photo" };
  const supabase = await createClient();
  const { data: last } = await supabase.from("salon_photos").select("sort_order").eq("salon_id", sid).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("salon_photos").insert({ salon_id: sid, path, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) {
    await removeFiles(supabase, [path]);
    return photoErr(error);
  }
  const { data: s } = await supabase.from("salons").select("cover_path").eq("id", sid).single();
  if (s && !s.cover_path) await supabase.from("salons").update({ cover_path: path }).eq("id", sid);
  return done();
}

export async function removeSalonPhoto(salonId: string, photoId: string): Promise<Result> {
  const sid = uuid.parse(salonId);
  const supabase = await createClient();
  const { data: row } = await supabase.from("salon_photos").select("path").eq("id", uuid.parse(photoId)).eq("salon_id", sid).maybeSingle();
  if (!row) return { ok: false, error: "not_found" };
  const { error } = await supabase.from("salon_photos").delete().eq("id", uuid.parse(photoId)).eq("salon_id", sid);
  if (error) return fail(error);
  // Si era la portada, la siguiente foto de la galería toma su lugar.
  const { data: s } = await supabase.from("salons").select("cover_path").eq("id", sid).single();
  if (s?.cover_path === row.path) {
    const { data: next } = await supabase.from("salon_photos").select("path").eq("salon_id", sid).order("sort_order").limit(1).maybeSingle();
    await supabase.from("salons").update({ cover_path: next?.path ?? null }).eq("id", sid);
  }
  await removeFiles(supabase, [row.path]);
  return done();
}

/** La portada es siempre una foto de la galería. */
export async function setSalonCover(salonId: string, photoId: string): Promise<Result> {
  const sid = uuid.parse(salonId);
  const supabase = await createClient();
  const { data: row } = await supabase.from("salon_photos").select("path").eq("id", uuid.parse(photoId)).eq("salon_id", sid).maybeSingle();
  if (!row) return { ok: false, error: "not_found" };
  const { error, count } = await supabase.from("salons").update({ cover_path: row.path }, { count: "exact" }).eq("id", sid);
  if (error) return fail(error);
  return count ? done() : { ok: false, error: "forbidden" };
}

export async function setSalonLogo(salonId: string, path: string | null): Promise<Result> {
  const sid = uuid.parse(salonId);
  if (!photoPath(sid, path)) return { ok: false, error: "invalid_photo" };
  const supabase = await createClient();
  const { data: old } = await supabase.from("salons").select("logo_path").eq("id", sid).maybeSingle();
  const { error, count } = await supabase.from("salons").update({ logo_path: path }, { count: "exact" }).eq("id", sid);
  if (error) return photoErr(error);
  if (!count) return { ok: false, error: "forbidden" };
  if (old?.logo_path && old.logo_path !== path) await removeFiles(supabase, [old.logo_path]);
  return done();
}

export async function setProPhoto(salonId: string, professionalId: string, path: string | null): Promise<Result> {
  const sid = uuid.parse(salonId);
  if (!photoPath(sid, path)) return { ok: false, error: "invalid_photo" };
  const supabase = await createClient();
  const { data: old } = await supabase.from("professionals").select("avatar_url").eq("id", uuid.parse(professionalId)).eq("salon_id", sid).maybeSingle();
  const { error, count } = await supabase.from("professionals").update({ avatar_url: path }, { count: "exact" }).eq("id", uuid.parse(professionalId)).eq("salon_id", sid);
  if (error) return photoErr(error);
  if (!count) return { ok: false, error: "forbidden" };
  if (old?.avatar_url && old.avatar_url !== path) await removeFiles(supabase, [old.avatar_url]);
  return done();
}

export async function setServicePhoto(salonId: string, serviceId: string, path: string | null): Promise<Result> {
  const sid = uuid.parse(salonId);
  if (!photoPath(sid, path)) return { ok: false, error: "invalid_photo" };
  const supabase = await createClient();
  const { data: old } = await supabase.from("services").select("photo_path").eq("id", uuid.parse(serviceId)).eq("salon_id", sid).maybeSingle();
  const { error, count } = await supabase.from("services").update({ photo_path: path }, { count: "exact" }).eq("id", uuid.parse(serviceId)).eq("salon_id", sid);
  if (error) return photoErr(error);
  if (!count) return { ok: false, error: "forbidden" };
  if (old?.photo_path && old.photo_path !== path) await removeFiles(supabase, [old.photo_path]);
  return done();
}

// ─── Reseñas ───────────────────────────────────────────────────────────────
// Solo dueño/administrador responden o reportan (la RPC lo comprueba). Reportar NO oculta: manda la reseña a la cola del administrador.

export async function replyReview(reviewId: string, text: string): Promise<Result> {
  if (text.length > 500) return { ok: false, error: "reply_too_long" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_review", { p_review_id: uuid.parse(reviewId), p_reply: text.trim() });
  return error ? fail(error) : done();
}

export async function reportReview(reviewId: string, reason: string): Promise<Result> {
  const r = reason.trim();
  if (r.length < 3 || r.length > 300) return { ok: false, error: "reason_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_review", { p_review_id: uuid.parse(reviewId), p_reason: r });
  if (error?.message === "invalid_status") return { ok: false, error: "already_reported" };
  return error ? fail(error) : done();
}
