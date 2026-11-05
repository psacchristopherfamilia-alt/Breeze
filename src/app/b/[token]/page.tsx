import type { Metadata } from "next";
import { GuestBooking } from "@/components/booking/GuestBooking";
import type { BookingSummary } from "@/lib/booking/types";
import type { ReviewRequest } from "@/lib/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** El enlace es privado: nunca se indexa. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Enlace del invitado (turista sin cuenta): ver, cancelar o reprogramar su cita. */
export default async function GuestBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let booking: BookingSummary | null = null;
  let review: { state: "ok" | "reviewed"; rating?: number | null } | undefined;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_guest_booking", { p_token: token });
    booking = (data as BookingSummary | null) ?? null;
    if (booking) {
      // ¿Ya puede (o ya dejó) su reseña? Solo se enseña el aviso si hay algo que hacer.
      const { data: r } = await supabase.rpc("get_review_request", { p_ref: token });
      const req = r as unknown as ReviewRequest | null;
      if (req?.state === "ok") review = req.review ? { state: "reviewed", rating: req.review.rating } : { state: "ok" };
    }
  }
  return <GuestBooking booking={booking} token={token} review={review} />;
}
