import { notFound } from "next/navigation";
import { ClientProfile } from "@/components/panel/ClientProfile";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Ficha del cliente: contacto y permisos, notas privadas e historial. La RLS decide quién la puede abrir. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getPanelContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, email, locale, whatsapp_opt_in, marketing_opt_in, created_at")
    .eq("id", id)
    .eq("organization_id", ctx.current.organizationId)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: notes }, { data: appts }, { data: auth }] = await Promise.all([
    supabase.from("customer_notes").select("id, author_id, author_name, body, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, booking_group_id, starts_at, status, service_name_en, service_name_es, price_cents, professionals(public_name)")
      .eq("customer_id", id)
      .order("starts_at", { ascending: false })
      .limit(60),
    supabase.auth.getUser(),
  ]);

  return (
    <ClientProfile
      canEdit={ctx.isManager}
      meId={auth.user?.id ?? ""}
      customer={{
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        phone: c.phone,
        email: c.email ?? "",
        locale: c.locale === "es" ? "es" : "en",
        whatsappOptIn: c.whatsapp_opt_in,
        marketingOptIn: c.marketing_opt_in,
      }}
      notes={(notes ?? []).map((n) => ({ id: n.id, authorId: n.author_id, authorName: n.author_name, body: n.body, createdAt: n.created_at }))}
      visits={(appts ?? []).map((a) => {
        const pro = a.professionals as { public_name: string } | { public_name: string }[] | null;
        return {
          id: a.id,
          groupId: a.booking_group_id,
          startsAt: a.starts_at,
          status: a.status,
          serviceEn: a.service_name_en,
          serviceEs: a.service_name_es,
          priceCents: a.price_cents,
          proName: (Array.isArray(pro) ? pro[0]?.public_name : pro?.public_name) ?? "",
        };
      })}
    />
  );
}
