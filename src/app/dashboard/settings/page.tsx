import { LiveSettings } from "@/components/panel/LiveSettings";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx?.isManager) return null;
  const supabase = await createClient();
  const [{ data: s }, { data: closures }] = await Promise.all([
    supabase
      .from("salons")
      .select("id, name, slug, address, phone, zone, business_types, slot_step_min, min_lead_time_min, max_advance_days, cancellation_window_hours, no_show_block_enabled, no_show_threshold, is_published")
      .eq("id", ctx.current.salonId)
      .single(),
    supabase.from("salon_closures").select("id, starts_at, ends_at, reason_en").eq("salon_id", ctx.current.salonId).gt("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  if (!s) return null;
  return (
    <LiveSettings
      salon={{
        id: s.id,
        slug: s.slug,
        isPublished: s.is_published,
        name: s.name,
        address: s.address ?? "",
        phone: s.phone ?? "",
        zone: s.zone,
        businessTypes: s.business_types,
        slotStepMin: s.slot_step_min,
        minLeadTimeMin: s.min_lead_time_min,
        maxAdvanceDays: s.max_advance_days,
        cancellationWindowHours: s.cancellation_window_hours,
        noShowBlockEnabled: s.no_show_block_enabled,
        noShowThreshold: s.no_show_threshold,
      }}
      closures={(closures ?? []).map((c) => ({ id: c.id, start: c.starts_at, end: c.ends_at, reason: c.reason_en }))}
    />
  );
}
