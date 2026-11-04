import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import type { PlatformOverview } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Administración de Breeze: negocios, facturas y pagos. Solo perfiles con is_platform_admin (si no, 404). */
export default async function AdminPage() {
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_overview");
  if (error || !data) notFound(); // no revelamos que existe
  return <AdminConsole data={data as unknown as PlatformOverview} />;
}
