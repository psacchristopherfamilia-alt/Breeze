import { LiveProfessionals } from "@/components/panel/LiveProfessionals";
import { MockProfessionals } from "@/components/panel/MockProfessionals";
import { loadPros, loadServices } from "@/lib/panel/data";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function ProfessionalsPage() {
  if (!isSupabaseConfigured()) return <MockProfessionals />;
  const ctx = await getPanelContext();
  if (!ctx?.isManager) return null;
  const supabase = await createClient();
  const salonId = ctx.current.salonId;
  const [pros, services, members, invites, off] = await Promise.all([
    loadPros(supabase, salonId, false),
    loadServices(supabase, salonId),
    supabase.from("memberships").select("professional_id").eq("salon_id", salonId).eq("role", "professional"),
    supabase.from("invitations").select("professional_id, email, phone, expires_at").eq("salon_id", salonId).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
    supabase.from("time_off").select("id, professional_id, starts_at, ends_at, reason").gt("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  return (
    <LiveProfessionals
      salon={{ id: salonId, name: ctx.current.salonName, organizationId: ctx.current.organizationId }}
      pros={pros}
      services={services}
      linked={(members.data ?? []).map((m) => m.professional_id!).filter(Boolean)}
      pendingInvites={(invites.data ?? []).map((i) => ({ professionalId: i.professional_id!, contact: i.email ?? i.phone ?? "" }))}
      timeOff={(off.data ?? []).map((t) => ({ id: t.id, professionalId: t.professional_id, start: t.starts_at, end: t.ends_at, reason: t.reason }))}
    />
  );
}
