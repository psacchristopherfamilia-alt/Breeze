import { weeklyHoursFromRows } from "../availability";
import { createClient } from "../supabase/server";
import { addDaysKey, atLocal } from "../time";
import { computeSetupStatus, type SetupStatus } from "./setup";
import type { AgendaAppt, AgendaPro, AgendaService } from "@/components/agenda/AgendaView";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Profesionales (todos, activos o no) con horario y servicios. RLS: solo los de mi sucursal. */
export async function loadPros(supabase: Client, salonId: string, onlyActive = true) {
  let q = supabase
    .from("professionals")
    .select("id, first_name, last_name, color_hex, title, is_active, accepts_online, sort_order, accepts_cash, accepts_card, accepts_transfer, payment_note, avatar_url")
    .eq("salon_id", salonId)
    .order("sort_order")
    .order("created_at");
  if (onlyActive) q = q.eq("is_active", true);
  const { data: pros } = await q;
  const ids = (pros ?? []).map((p) => p.id);
  const [{ data: hours }, { data: links }] = await Promise.all([
    ids.length
      ? supabase.from("working_hours").select("professional_id, weekday, start_time, end_time").in("professional_id", ids)
      : Promise.resolve({ data: [] as { professional_id: string; weekday: number; start_time: string; end_time: string }[] }),
    supabase.from("professional_services").select("professional_id, service_id").eq("salon_id", salonId),
  ]);
  return (pros ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    colorHex: p.color_hex,
    title: p.title as string,
    isActive: p.is_active,
    acceptsOnline: p.accepts_online,
    acceptsCash: p.accepts_cash,
    acceptsCard: p.accepts_card,
    acceptsTransfer: p.accepts_transfer,
    paymentNote: p.payment_note ?? "",
    photoPath: p.avatar_url,
    serviceIds: (links ?? []).filter((l) => l.professional_id === p.id).map((l) => l.service_id),
    hours: weeklyHoursFromRows(
      (hours ?? [])
        .filter((h) => h.professional_id === p.id)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((h) => ({ weekday: h.weekday, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) })),
    ),
  }));
}

export async function loadServices(supabase: Client, salonId: string, onlyActive = true) {
  let q = supabase
    .from("services")
    .select("id, category_code, name_en, name_es, duration_min, buffer_min, price_cents, is_active, sort_order, photo_path")
    .eq("salon_id", salonId)
    .order("sort_order")
    .order("created_at");
  if (onlyActive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []).map((s) => ({
    id: s.id,
    categoryCode: s.category_code,
    nameEn: s.name_en,
    nameEs: s.name_es,
    durationMin: s.duration_min,
    bufferMin: s.buffer_min,
    priceCents: s.price_cents,
    isActive: s.is_active,
    photoPath: s.photo_path,
  }));
}

/** Todo lo que necesita la agenda de UN día (hora local de TCI). */
export async function loadAgendaDay(supabase: Client, salonId: string, dateKey: string) {
  return loadAgendaRange(supabase, salonId, dateKey, addDaysKey(dateKey, 1));
}

/** Agenda de un rango de días: desde `fromKey` (incluido) hasta `toKeyExclusive` (no incluido), en hora local de TCI. */
export async function loadAgendaRange(supabase: Client, salonId: string, fromKey: string, toKeyExclusive: string) {
  const from = atLocal(fromKey, "00:00").toISOString();
  const to = atLocal(toKeyExclusive, "00:00").toISOString();
  const [pros, services, appts, off, closures] = await Promise.all([
    loadPros(supabase, salonId),
    loadServices(supabase, salonId),
    supabase
      .from("appointments")
      .select("id, booking_group_id, professional_id, customer_id, service_id, service_name_en, service_name_es, price_cents, starts_at, ends_at, blocked_until, status, booking_groups!appointments_booking_group_id_salon_id_fkey(source)")
      .eq("salon_id", salonId)
      .neq("status", "cancelled")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    supabase.from("time_off").select("professional_id, starts_at, ends_at").lt("starts_at", to).gt("ends_at", from),
    supabase.from("salon_closures").select("starts_at, ends_at").eq("salon_id", salonId).lt("starts_at", to).gt("ends_at", from),
  ]);

  // Nombres y teléfonos de clientes (RLS: dueño/admin todos los de la organización; profesional, los suyos).
  const customerIds = [...new Set((appts.data ?? []).map((a) => a.customer_id))];
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, first_name, last_name, phone").in("id", customerIds)
    : { data: [] as { id: string; first_name: string; last_name: string; phone: string }[] };

  const appointments: AgendaAppt[] = (appts.data ?? []).map((a) => {
    const c = customers?.find((x) => x.id === a.customer_id);
    const group = a.booking_groups as { source: AgendaAppt["source"] } | { source: AgendaAppt["source"] }[] | null;
    return {
      id: a.id,
      groupId: a.booking_group_id,
      professionalId: a.professional_id,
      serviceId: a.service_id ?? undefined,
      serviceNameEn: a.service_name_en,
      serviceNameEs: a.service_name_es,
      priceCents: a.price_cents,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      blockedUntil: a.blocked_until,
      status: a.status,
      source: (Array.isArray(group) ? group[0]?.source : group?.source) ?? "online",
      customerName: c ? `${c.first_name} ${c.last_name}`.trim() : "—",
      customerPhone: c?.phone ?? "",
      customerId: c ? c.id : undefined,
    };
  });

  const proIds = new Set(pros.map((p) => p.id));
  const blocked = [
    ...(off.data ?? []).filter((o) => proIds.has(o.professional_id)).map((o) => ({ professionalId: o.professional_id, start: o.starts_at, end: o.ends_at })),
    ...(closures.data ?? []).flatMap((c) => pros.map((p) => ({ professionalId: p.id, start: c.starts_at, end: c.ends_at }))),
  ];

  return {
    pros: pros.map(({ isActive: _a, acceptsOnline: _b, ...p }) => p) as AgendaPro[],
    services: services as AgendaService[],
    appointments,
    blocked,
  };
}

/** Qué le falta a una sucursal para recibir reservas (ver `computeSetupStatus`). RLS: solo mi sucursal. */
export async function loadSetupStatus(supabase: Client, salonId: string): Promise<SetupStatus> {
  const [{ data: salon }, { data: services }, { data: pros }, { data: links }] = await Promise.all([
    supabase.from("salons").select("is_published").eq("id", salonId).single(),
    supabase.from("services").select("id").eq("salon_id", salonId).eq("is_active", true),
    supabase.from("professionals").select("id").eq("salon_id", salonId).eq("is_active", true),
    supabase.from("professional_services").select("professional_id, service_id").eq("salon_id", salonId),
  ]);
  const proIds = (pros ?? []).map((p) => p.id);
  const { data: hours } = proIds.length
    ? await supabase.from("working_hours").select("professional_id").in("professional_id", proIds)
    : { data: [] as { professional_id: string }[] };
  return computeSetupStatus({
    isPublished: !!salon?.is_published,
    activeServiceIds: (services ?? []).map((s) => s.id),
    activeProfessionalIds: proIds,
    links: links ?? [],
    professionalIdsWithHours: (hours ?? []).map((h) => h.professional_id),
  });
}
