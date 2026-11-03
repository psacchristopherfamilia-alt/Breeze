import { notFound } from "next/navigation";
import { LiveBooking } from "@/components/booking/LiveBooking";
import { MockBooking } from "@/components/booking/MockBooking";
import type { Account } from "@/components/booking/BookingFlow";
import { loadBookingData, loadSchedule } from "@/lib/booking/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

interface BookingJson {
  booking_group_id: string;
  salon: { slug: string };
  items: { service_id: string; starts_at: string; status: string; professional: { id: string } }[];
}

/**
 * /s/[slug]                       → reservar
 * /s/[slug]?reschedule=<grupo>    → reprogramar (con sesión)
 * /s/[slug]?rt=<token>            → reprogramar (invitado, desde su enlace)
 */
export default async function SalonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reschedule?: string; rt?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!isSupabaseConfigured()) return <MockBooking slug={slug} rescheduleGroup={sp.reschedule} />;

  const supabase = await createClient();
  const data = await loadBookingData(supabase, slug);
  if (!data) notFound();
  const busy = await loadSchedule(supabase, data);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let account: Account | null = null;
  if (user) {
    const { data: p } = await supabase.from("profiles").select("full_name, email, phone").eq("id", user.id).maybeSingle();
    account = { name: p?.full_name || user.email || "", email: p?.email ?? user.email ?? null, phone: p?.phone ?? null };
  }

  // Reprogramar: cargamos la reserva actual y sus rangos dejan de contar como ocupados.
  let booking: BookingJson | null = null;
  if (sp.rt) {
    const { data: g } = await supabase.rpc("get_guest_booking", { p_token: sp.rt });
    booking = (g as BookingJson | null) ?? null;
  } else if (sp.reschedule && user) {
    const { data: mine } = await supabase.rpc("my_bookings");
    booking = ((mine as BookingJson[] | null) ?? []).find((b) => b.booking_group_id === sp.reschedule) ?? null;
  }
  const active = booking?.salon.slug === slug ? booking.items.filter((i) => i.status === "booked") : [];
  const reschedule = active.length
    ? {
        serviceIds: active.map((i) => i.service_id),
        professionalId: active[0].professional.id,
        groupId: sp.rt ? undefined : booking!.booking_group_id,
        token: sp.rt,
      }
    : null;
  const own = new Set(active.map((i) => `${i.professional.id}|${new Date(i.starts_at).getTime()}`));

  return (
    <LiveBooking
      data={data}
      account={account}
      reschedule={reschedule}
      busy={busy
        .filter((b) => !own.has(`${b.professionalId}|${b.start.getTime()}`))
        .map((b) => ({ professionalId: b.professionalId, start: b.start.toISOString(), end: b.end.toISOString() }))}
    />
  );
}
