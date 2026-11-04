import { redirect } from "next/navigation";
import { BillingView } from "@/components/panel/BillingView";
import { PrototypeOnly } from "@/components/panel/PrototypeOnly";
import type { OwnerBilling } from "@/lib/billing";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Plan y pagos: solo el dueño del negocio. */
export default async function BillingPage() {
  if (!isSupabaseConfigured()) return <PrototypeOnly />;
  const ctx = await getPanelContext();
  if (!ctx) return null;
  if (!ctx.isOwner) redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_billing", { p_organization_id: ctx.current.organizationId });
  if (!data) redirect("/dashboard");
  return <BillingView data={data as unknown as OwnerBilling} />;
}
