import type { Metadata } from "next";
import { GuestBooking } from "@/components/booking/GuestBooking";
import type { BookingSummary } from "@/lib/booking/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** El enlace es privado: nunca se indexa. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Enlace del invitado (turista sin cuenta): ver, cancelar o reprogramar su cita. */
export default async function GuestBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let booking: BookingSummary | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_guest_booking", { p_token: token });
    booking = (data as BookingSummary | null) ?? null;
  }
  return <GuestBooking booking={booking} token={token} />;
}
