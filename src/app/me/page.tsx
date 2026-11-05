import { GuestMyBookings } from "@/components/booking/GuestMyBookings";
import { LiveMyBookings } from "@/components/booking/LiveMyBookings";
import { MockMyBookings } from "@/components/booking/MockMyBookings";
import type { BookingSummary } from "@/lib/booking/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Mis citas. Con cuenta: las de la cuenta (en cualquier dispositivo) y las que este navegador
 * hizo como invitado pasan a ella. Sin cuenta: las reservas de invitado guardadas en este navegador.
 */
export default async function MyBookingsPage() {
  if (!isSupabaseConfigured()) return <MockMyBookings />;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.is_anonymous) return <GuestMyBookings />;
  const { data } = await supabase.rpc("my_bookings");
  const { data: states } = await supabase.rpc("my_review_states");
  const reviewStates = Object.fromEntries(
    ((states as { booking_group_id: string; state: "ok" | "reviewed"; rating: number | null }[] | null) ?? []).map((s) => [s.booking_group_id, { state: s.state, rating: s.rating }]),
  );
  return <LiveMyBookings bookings={(data as BookingSummary[] | null) ?? []} reviewStates={reviewStates} />;
}
