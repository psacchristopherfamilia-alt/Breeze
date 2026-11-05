import { LiveSettings } from "@/components/panel/LiveSettings";
import { SalonPhotos } from "@/components/panel/SalonPhotos";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx?.isManager) return null;
  const supabase = await createClient();
  const [{ data: s }, { data: closures }, { data: devices }, { data: photos }] = await Promise.all([
    supabase
      .from("salons")
      .select("id, name, slug, address, phone, zone, business_types, slot_step_min, min_lead_time_min, max_advance_days, cancellation_window_hours, no_show_block_enabled, no_show_threshold, reminder_offsets_min, is_published, logo_path, cover_path")
      .eq("id", ctx.current.salonId)
      .single(),
    supabase.from("salon_closures").select("id, starts_at, ends_at, reason_en").eq("salon_id", ctx.current.salonId).gt("ends_at", new Date().toISOString()).order("starts_at"),
    supabase.from("live_devices").select("id, name, paired_at, last_seen_at").eq("salon_id", ctx.current.salonId).not("paired_at", "is", null).is("revoked_at", null).order("paired_at"),
    supabase.from("salon_photos").select("id, path").eq("salon_id", ctx.current.salonId).order("sort_order").order("created_at"),
  ]);
  if (!s) return null;
  return (
    <LiveSettings
      photosSlot={<SalonPhotos salonId={s.id} name={s.name} logoPath={s.logo_path} coverPath={s.cover_path} photos={photos ?? []} />}
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
        reminderOffsetsMin: s.reminder_offsets_min,
      }}
      closures={(closures ?? []).map((c) => ({ id: c.id, start: c.starts_at, end: c.ends_at, reason: c.reason_en }))}
      devices={(devices ?? []).map((d) => ({ id: d.id, name: d.name, pairedAt: d.paired_at!, lastSeenAt: d.last_seen_at }))}
    />
  );
}
