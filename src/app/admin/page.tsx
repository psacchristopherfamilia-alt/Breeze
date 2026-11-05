import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { ReportedReviews, type ReportedReview } from "@/components/admin/ReportedReviews";
import type { PlatformOverview } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Administración de Breeze: negocios, facturas y pagos. Solo perfiles con is_platform_admin (si no, 404). */
export default async function AdminPage() {
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_overview");
  if (error || !data) notFound(); // no revelamos que existe
  const { data: reported } = await supabase.rpc("platform_reported_reviews");
  return <AdminConsole data={data as unknown as PlatformOverview} reviewsSlot={<ReportedReviews reviews={(reported as unknown as ReportedReview[] | null) ?? []} />} />;
}
