import { LiveAgenda } from "@/components/agenda/LiveAgenda";
import { MockAgenda } from "@/components/agenda/MockAgenda";
import { SetupChecklist } from "@/components/panel/SetupChecklist";
import { loadAgendaDay, loadSetupStatus } from "@/lib/panel/data";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/time";

/** Agenda del día por columnas (una por profesional, con su color). ?date=YYYY-MM-DD */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  if (!isSupabaseConfigured()) return <MockAgenda />;
  const ctx = await getPanelContext();
  if (!ctx) return null; // el layout muestra "crea tu negocio"

  const { date } = await searchParams;
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateKey(new Date());
  const supabase = await createClient();
  const { data: salon } = await supabase.from("salons").select("id, name, slug, slot_step_min").eq("id", ctx.current.salonId).single();
  const day = await loadAgendaDay(supabase, ctx.current.salonId, dateKey);
  const setup = ctx.isManager ? await loadSetupStatus(supabase, ctx.current.salonId) : null;

  return (
    <>
      {setup && !setup.isPublished && (
        <div className="px-4 pt-4 lg:px-8 lg:pt-8">
          <SetupChecklist status={setup} />
        </div>
      )}
      <LiveAgenda
      salon={{ id: salon!.id, name: salon!.name, slug: salon!.slug, slotStepMin: salon!.slot_step_min }}
      pros={day.pros}
      services={day.services}
      appointments={day.appointments}
      blocked={day.blocked}
      dateKey={dateKey}
      onlyProfessionalId={ctx.professionalId}
      />
    </>
  );
}
