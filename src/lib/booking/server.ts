import type { BusyRange } from "../availability";
import { weeklyHoursFromRows } from "../availability";
import type { CategoryCode, ProTitle, Zone, BusinessType } from "../mock/data";
import { mediaUrl } from "../media";
import { createClient } from "../supabase/server";
import { coverFor, type BookingData, type PublicSalon } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Catálogo público de un salón publicado (RLS: solo columnas/filas públicas). */
export async function loadBookingData(supabase: Client, slug: string): Promise<BookingData | null> {
  const { data: s } = await supabase
    .from("salons")
    .select("id, slug, name, business_types, zone, address, phone, cancellation_window_hours, slot_step_min, min_lead_time_min, max_advance_days, logo_path, cover_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!s) return null;

  const [services, pros, links, photos] = await Promise.all([
    supabase
      .from("services")
      .select("id, category_code, name_en, name_es, duration_min, buffer_min, price_cents, sort_order, photo_path")
      .eq("salon_id", s.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("professionals")
      .select("id, public_name, color_hex, title, accepts_online, sort_order, accepts_cash, accepts_card, accepts_transfer, payment_note, avatar_url")
      .eq("salon_id", s.id)
      .eq("is_active", true)
      .eq("accepts_online", true)
      .order("sort_order"),
    supabase.from("professional_services").select("professional_id, service_id").eq("salon_id", s.id),
    supabase.from("salon_photos").select("path").eq("salon_id", s.id).order("sort_order").order("created_at"),
  ]);

  const salon: PublicSalon = {
    id: s.id,
    slug: s.slug,
    name: s.name,
    businessTypes: s.business_types as BusinessType[],
    zone: s.zone as Zone,
    address: s.address,
    phone: s.phone,
    cover: coverFor(s.id),
    coverUrl: mediaUrl(s.cover_path),
    logoUrl: mediaUrl(s.logo_path),
    gallery: (photos.data ?? []).map((p) => mediaUrl(p.path)).filter((u): u is string => !!u),
    cancellationWindowHours: s.cancellation_window_hours,
    slotStepMin: s.slot_step_min,
    minLeadMin: s.min_lead_time_min,
    maxAdvanceDays: s.max_advance_days,
  };

  return {
    salon,
    services: (services.data ?? []).map((v) => ({
      id: v.id,
      category: v.category_code as CategoryCode,
      nameEn: v.name_en,
      nameEs: v.name_es,
      durationMin: v.duration_min,
      bufferMin: v.buffer_min,
      priceCents: v.price_cents,
      photoUrl: mediaUrl(v.photo_path),
    })),
    pros: (pros.data ?? []).map((p) => {
      // public_name = "Carlos M." → nombre + inicial (nunca el apellido completo)
      const [first, ...rest] = (p.public_name ?? "").split(" ");
      return {
        id: p.id,
        firstName: first,
        lastName: rest.join(" ").replace(/\.$/, ""),
        colorHex: p.color_hex,
        title: p.title as ProTitle,
        serviceIds: (links.data ?? []).filter((l) => l.professional_id === p.id).map((l) => l.service_id),
        hours: {},
        payment: { cash: p.accepts_cash, card: p.accepts_card, transfer: p.accepts_transfer, note: p.payment_note },
        photoUrl: mediaUrl(p.avatar_url),
      };
    }),
  };
}

/** Horarios + rangos ocupados (sin datos de clientes) para los próximos `days` días. */
export async function loadSchedule(supabase: Client, data: BookingData, days = 15): Promise<BusyRange[]> {
  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);
  const { data: sched, error } = await supabase.rpc("get_public_schedule", {
    p_salon_id: data.salon.id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !sched) return [];
  const s = sched as {
    professionals: { id: string; hours: { weekday: number; start: string; end: string }[] }[];
    busy: { professional_id: string; start: string; end: string }[];
  };
  for (const p of data.pros) p.hours = weeklyHoursFromRows(s.professionals.find((x) => x.id === p.id)?.hours ?? []);
  return s.busy.map((b) => ({ professionalId: b.professional_id, start: new Date(b.start), end: new Date(b.end) }));
}
