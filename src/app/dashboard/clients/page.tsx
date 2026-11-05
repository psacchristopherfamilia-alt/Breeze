import { ClientsList } from "@/components/panel/ClientsList";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Clientes del negocio con búsqueda. Dueño/administrador ven todos; el profesional, solo los que atiende (RLS). */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx) return null;
  const q = ((await searchParams).q ?? "").slice(0, 80);
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_customers", { p_organization_id: ctx.current.organizationId, p_query: q.trim() || undefined, p_limit: 100 });
  return (
    <ClientsList
      q={q}
      isManager={ctx.isManager}
      clients={(data ?? []).map((c) => ({
        id: c.customer_id,
        firstName: c.first_name,
        lastName: c.last_name,
        phone: c.phone,
        visits: c.visits,
        lastVisit: c.last_visit,
        nextVisit: c.next_visit,
      }))}
    />
  );
}
