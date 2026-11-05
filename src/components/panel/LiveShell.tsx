"use client";
import { Building2, CalendarDays, CreditCard, LogOut, MonitorPlay, Scissors, Settings, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { switchSalon } from "@/app/dashboard/actions";
import { Logo } from "@/components/ui/Logo";
import type { BillingNotice } from "@/lib/billing";
import { BillingBanner } from "./BillingBanner";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import type { PanelSalon } from "@/lib/panel/server";

export interface ShellSubscription {
  plan: string;
  status: string;
  daysLeft: number | null;
}

/** Menú del panel real. El profesional solo ve su agenda; dueño/admin ven la gestión completa. */
export function LiveShell({
  salons,
  current,
  isManager,
  isAdmin = false,
  subscription,
  notice,
  children,
}: {
  salons: PanelSalon[];
  current: PanelSalon;
  isManager: boolean;
  /** Administrador de la plataforma: ve el enlace a /admin (nadie más lo ve). */
  isAdmin?: boolean;
  subscription: ShellSubscription | null;
  notice: BillingNotice | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("panel");
  const path = usePathname();
  const [pending, start] = useTransition();

  const nav = [
    { href: "/dashboard", icon: CalendarDays, label: t("nav.agenda"), show: true },
    { href: "/dashboard/professionals", icon: Users, label: t("nav.professionals"), show: isManager },
    { href: "/dashboard/services", icon: Scissors, label: t("nav.services"), show: isManager },
    { href: "/dashboard/settings", icon: Settings, label: t("nav.settings"), show: isManager },
    { href: "/dashboard/billing", icon: CreditCard, label: t("nav.billing"), show: !!subscription }, // solo el dueño
    { href: `/live/${current.salonSlug}`, icon: MonitorPlay, label: "Breeze Live", show: true },
    { href: "/admin", icon: ShieldCheck, label: t("nav.admin"), show: isAdmin },
  ].filter((n) => n.show);

  return (
    <div className="min-h-dvh bg-foam/50 lg:flex">
      <aside className="border-b border-breeze-100 bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-6">
          <span className="inline-flex items-center gap-2">
            <Logo href="/dashboard" />
            <span className="rounded-full border border-lagoon/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lagoon">{t("tag")}</span>
          </span>
          <div className="lg:hidden"><LocaleSwitcher /></div>
        </div>
        <div className="px-4 pb-3 lg:px-5">
          <label className={`flex items-center gap-2 rounded-xl bg-breeze-50 px-3 py-2 ring-1 ring-breeze-100 ${pending ? "opacity-60" : ""}`}>
            <Building2 className="size-4 shrink-0 text-lagoon" />
            <select
              value={current.salonId}
              onChange={(e) => start(() => switchSalon(e.target.value))}
              className="w-full bg-transparent text-sm font-semibold outline-none"
              aria-label={t("branch")}
            >
              {salons.map((s) => (
                <option key={s.salonId} value={s.salonId}>
                  {s.salonName}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 px-1 text-xs text-ink/70">
            {current.organizationName} · {current.roles.map((r) => t(`roles.${r}`)).join(", ")}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 no-scrollbar lg:flex-col">
          {nav.map(({ href, icon: Icon, label }) => {
            const on = path === href;
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${on ? "bg-lagoon text-white" : "text-ink/70 hover:bg-breeze-50"}`}
              >
                <Icon className="size-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-5 pt-4 lg:block lg:flex-1">
          <LocaleSwitcher />
          {subscription && (
            <div className="mt-6 rounded-2xl bg-sand p-4 text-xs text-ink/70">
              <p className="font-bold capitalize text-ink">
                {t("plan.name", { plan: subscription.plan })} · {t(`plan.status.${subscription.status}`)}
              </p>
              {subscription.daysLeft !== null && <p className="mt-1">{t("plan.daysLeft", { days: subscription.daysLeft })}</p>}
              <p className="mt-1">{t("plan.payHint")}</p>
              <Link href="/dashboard/billing" className="mt-2 inline-block font-bold text-lagoon underline underline-offset-2">{t("plan.manage")}</Link>
            </div>
          )}
        </div>
        <form action={signOut} className="hidden px-5 pb-6 lg:block">
          <input type="hidden" name="to" value="/negocios" />
          <button className="inline-flex items-center gap-2 text-sm font-semibold text-ink/70 hover:text-ink">
            <LogOut className="size-4" /> {t("signOut")}
          </button>
        </form>
      </aside>
      <main className="min-w-0 flex-1">
        {notice && <BillingBanner notice={notice} />}
        {children}
      </main>
    </div>
  );
}
