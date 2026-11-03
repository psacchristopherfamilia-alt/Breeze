import { LiveMyBookings } from "@/components/booking/LiveMyBookings";
import { MockMyBookings } from "@/components/booking/MockMyBookings";
import type { BookingSummary } from "@/lib/booking/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Mis citas (con sesión; el proxy redirige a /login si no la hay). */
export default async function MyBookingsPage() {
  if (!isSupabaseConfigured()) return <MockMyBookings />;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_bookings");
  return <LiveMyBookings bookings={(data as BookingSummary[] | null) ?? []} />;
}
