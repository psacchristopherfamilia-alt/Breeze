import { redirect } from "next/navigation";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import { SetupWizard } from "@/components/panel/SetupWizard";
import type { BusinessType } from "@/lib/mock/data";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Asistente de arranque (sugerido): servicios, primer profesional, horario y publicar, en 4 pasos. */
export default async function SetupPage() {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx?.isManager) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: salon }, { count: services }, { count: pros }, { data: auth }] = await Promise.all([
    supabase.from("salons").select("id, name, slug, business_types, is_published").eq("id", ctx.current.salonId).single(),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("salon_id", ctx.current.salonId).eq("is_active", true),
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("salon_id", ctx.current.salonId).eq("is_active", true),
    supabase.auth.getUser(),
  ]);
  if (!salon || salon.is_published || ((services ?? 0) > 0 && (pros ?? 0) > 0)) redirect("/dashboard");

  const { data: profile } = auth.user ? await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle() : { data: null };
  const [first = "", ...rest] = (profile?.full_name ?? "").trim().split(/\s+/);
  return (
    <SetupWizard
      salon={{ id: salon.id, name: salon.name, slug: salon.slug }}
      types={salon.business_types as BusinessType[]}
      hasServices={(services ?? 0) > 0}
      hasPro={(pros ?? 0) > 0}
      defaultFirst={first}
      defaultLast={rest.join(" ")}
    />
  );
}
