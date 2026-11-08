import { LiveAgenda } from "@/components/agenda/LiveAgenda";
import { MockAgenda } from "@/components/agenda/MockAgenda";
import { SetupChecklist } from "@/components/panel/SetupChecklist";
import { weekDays } from "@/lib/agenda/occupancy";
import { loadAgendaRange, loadSetupStatus } from "@/lib/panel/data";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, localDateKey } from "@/lib/time";

/**
 * Agenda. ?date=YYYY-MM-DD&view=day|week|team&pro=<id>
 *  · día: una columna por profesional (con su color)
 *  · semana: los 7 días de UN profesional
 *  · equipo: resumen de ocupación de toda la semana
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; pro?: string }> }) {
  if (!isSupabaseConfigured()) return <MockAgenda />;
  const ctx = await getPanelContext();
  if (!ctx) return null; // el layout muestra "crea tu negocio"

  const { date, view: rawView, pro } = await searchParams;
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateKey(new Date());
  const view = rawView === "week" || rawView === "team" ? rawView : "day";
  const supabase = await createClient();
  const { data: salon } = await supabase.from("salons").select("id, name, slug, slot_step_min").eq("id", ctx.current.salonId).single();
  const days = view === "day" ? [dateKey] : weekDays(dateKey);
  const day = await loadAgendaRange(supabase, ctx.current.salonId, days[0], addDaysKey(days[days.length - 1], 1));
  const proId = ctx.professionalId ?? (day.pros.some((p) => p.id === pro) ? pro! : (day.pros[0]?.id ?? null));
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
      view={view}
      proId={proId}
      onlyProfessionalId={ctx.professionalId}
      />
    </>
  );
}
