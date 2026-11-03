"use client";
import { CalendarDays, MonitorPlay, Users, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { PrototypeBanner } from "@/components/ui/PrototypeBanner";
import { SALONS, type Salon } from "@/lib/mock/data";

const SalonCtx = createContext<{ salon: Salon; setSalonId: (id: string) => void }>({
  salon: SALONS[1],
  setSalonId: () => {},
});
export const useSalon = () => useContext(SalonCtx);

/** Sucursales del dueño de la demo ("Coral Group": 2 sucursales) + el resto para explorar. */
const DEMO_ORG = "Coral Group";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("panel");
  const path = usePathname();
  const [salonId, setSalonIdState] = useState("s2");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("breeze-panel-salon");
      if (saved && SALONS.some((s) => s.id === saved)) setSalonIdState(saved);
    } catch {}
  }, []);
  const setSalonId = (id: string) => {
    setSalonIdState(id);
    try {
      localStorage.setItem("breeze-panel-salon", id);
    } catch {}
  };
  const salon = SALONS.find((s) => s.id === salonId) ?? SALONS[1];
  const own = SALONS.filter((s) => s.organization === DEMO_ORG);
  const others = SALONS.filter((s) => s.organization !== DEMO_ORG);

  const nav = [
    { href: "/dashboard", icon: CalendarDays, label: t("nav.agenda") },
    { href: "/dashboard/professionals", icon: Users, label: t("nav.professionals") },
    { href: `/live/${salon.slug}`, icon: MonitorPlay, label: "Breeze Live" },
  ];

  return (
    <SalonCtx.Provider value={{ salon, setSalonId }}>
      <PrototypeBanner />
      <div className="min-h-dvh bg-foam/50 lg:flex">
        <aside className="border-b border-breeze-100 bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-5 lg:py-6">
            <Logo href="/dashboard" />
            <div className="lg:hidden"><LocaleSwitcher /></div>
          </div>
          <div className="px-4 pb-3 lg:px-5">
            <label className="flex items-center gap-2 rounded-xl bg-breeze-50 px-3 py-2 ring-1 ring-breeze-100">
              <Building2 className="size-4 shrink-0 text-lagoon" />
              <select
                value={salon.id}
                onChange={(e) => setSalonId(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold outline-none"
                aria-label={t("branch")}
              >
                <optgroup label={`${DEMO_ORG} · ${t("yourBranches")}`}>
                  {own.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
                <optgroup label={t("otherDemo")}>
                  {others.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 no-scrollbar lg:flex-col lg:px-3">
            {nav.map(({ href, icon: Icon, label }) => {
              const on = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    on ? "bg-lagoon text-white" : "text-ink/70 hover:bg-breeze-50"
                  }`}
                >
                  <Icon className="size-4" /> {label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden px-5 pt-6 lg:block">
            <LocaleSwitcher />
            <div className="mt-6 rounded-2xl bg-sand p-4 text-xs text-ink/70">
              <p className="font-bold text-ink">{t("plan.title")}</p>
              <p className="mt-1">{t("plan.body")}</p>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </SalonCtx.Provider>
  );
}
