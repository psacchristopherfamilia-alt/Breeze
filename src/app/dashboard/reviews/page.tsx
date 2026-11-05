import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { ReviewsPanel } from "@/components/panel/ReviewsPanel";
import { getPanelContext } from "@/lib/panel/server";
import type { StaffReview } from "@/lib/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Reseñas del salón. Dueño/administrador ven todas; el profesional, solo las de sus propias citas. */
export default async function ReviewsPage() {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_reviews", { p_salon_id: ctx.current.salonId, p_limit: 100 });
  return <ReviewsPanel reviews={(data as unknown as StaffReview[] | null) ?? []} isManager={ctx.isManager} />;
}
