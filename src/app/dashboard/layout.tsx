import { DashboardShell } from "@/components/agenda/DashboardShell";
import { CreateBusiness } from "@/components/panel/CreateBusiness";
import { LiveShell, type ShellSubscription } from "@/components/panel/LiveShell";
import { billingNotice, type BillingNotice, type SubscriptionStatus } from "@/lib/billing";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <DashboardShell>{children}</DashboardShell>;

  const ctx = await getPanelContext();
  if (!ctx) return <CreateBusiness />;

  let subscription: ShellSubscription | null = null;
  let notice: BillingNotice | null = null;
  if (ctx.isOwner) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("plan_code, status, trial_ends_at, current_period_end")
      .eq("organization_id", ctx.current.organizationId)
      .maybeSingle();
    if (data) {
      const days = data.status === "trialing" && data.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(data.trial_ends_at).getTime() - Date.now()) / 86_400_000))
        : null;
      subscription = { plan: data.plan_code, status: data.status, daysLeft: days };
      notice = billingNotice({ status: data.status as SubscriptionStatus, trial_ends_at: data.trial_ends_at, current_period_end: data.current_period_end });
    }
  }

  return (
    <LiveShell salons={ctx.salons} current={ctx.current} isManager={ctx.isManager} subscription={subscription} notice={notice}>
      {children}
    </LiveShell>
  );
}
