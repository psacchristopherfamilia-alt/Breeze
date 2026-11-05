import type { Metadata } from "next";
import { PricingView } from "@/components/negocios/PricingView";
import { plansFromRows, FALLBACK_PLANS } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Breeze plans for barbershops, salons and spas in Turks and Caicos. 14-day free trial.",
};

export default async function PricingPage() {
  let plans = FALLBACK_PLANS;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plans")
      .select("code, name, min_pros, max_pros, monthly_price_cents, annual_price_cents, extra_branch_price_cents, message_quota, features")
      .eq("is_active", true)
      .order("sort_order");
    plans = plansFromRows(data);
  }
  return <PricingView plans={plans} />;
}
