import { LiveServices } from "@/components/panel/LiveServices";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { loadServices } from "@/lib/panel/data";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { BusinessType } from "@/lib/mock/data";

export default async function ServicesPage() {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx?.isManager) return null;
  const supabase = await createClient();
  const [services, { data: salon }, { data: categories }] = await Promise.all([
    loadServices(supabase, ctx.current.salonId, false),
    supabase.from("salons").select("business_types").eq("id", ctx.current.salonId).single(),
    supabase.from("service_categories").select("code, business_type").order("sort_order"),
  ]);
  const types = (salon?.business_types ?? []) as BusinessType[];
  return (
    <LiveServices
      salon={{ id: ctx.current.salonId, name: ctx.current.salonName }}
      services={services}
      categories={(categories ?? []).filter((c) => types.includes(c.business_type as BusinessType)).map((c) => ({ code: c.code, type: c.business_type as BusinessType }))}
    />
  );
}
