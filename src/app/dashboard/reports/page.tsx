import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { ReportsView } from "@/components/panel/ReportsView";
import { getPanelContext } from "@/lib/panel/server";
import { parsePeriod, periodKeys, type StaffReport } from "@/lib/panel/reports";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { atLocal, localDateKey } from "@/lib/time";

/**
 * Informes de la sucursal activa: últimos 7 o 30 días contra el periodo anterior (?days=7|30).
 * Dueño y administradores ven todo; el profesional, solo sus cifras (lo decide la base de datos).
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx) return null;
  const days = parsePeriod((await searchParams).days);
  const now = new Date();
  const { fromKey, toKeyExclusive } = periodKeys(localDateKey(now), days);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_report", {
    p_salon_id: ctx.current.salonId,
    p_from: atLocal(fromKey, "00:00").toISOString(),
    p_to: atLocal(toKeyExclusive, "00:00").toISOString(),
  });
  return <ReportsView report={error || !data ? null : (data as unknown as StaffReport)} days={days} isManager={ctx.isManager} nowIso={now.toISOString()} />;
}
