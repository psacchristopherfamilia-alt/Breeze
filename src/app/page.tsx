"use client";
import { CalendarHeart, LayoutDashboard, MonitorPlay, ArrowRight, Store } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { resetPrototype } from "@/lib/mock/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const PROTOTYPE_CARDS = [
  { href: "/explore", icon: CalendarHeart, key: "client", accent: "#2BB3B1" },
  { href: "/dashboard", icon: LayoutDashboard, key: "panel", accent: "#2563EB" },
  { href: "/live/coral-salon", icon: MonitorPlay, key: "live", accent: "#BE185D" },
] as const;

// Con datos reales: reservar, entrar al panel o dar de alta un negocio.
const LIVE_CARDS = [
  { href: "/explore", icon: CalendarHeart, key: "client", accent: "#2BB3B1" },
  { href: "/dashboard", icon: LayoutDashboard, key: "panel", accent: "#2563EB" },
  { href: "/signup/salon", icon: Store, key: "business", accent: "#BE185D" },
] as const;

export default function Hub() {
  const t = useTranslations("hub");
  const live = isSupabaseConfigured();
  const cards = live ? LIVE_CARDS : PROTOTYPE_CARDS;
  return (
    <main className="bg-breeze-sky min-h-dvh">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
        <header className="flex items-center justify-between">
          <Logo size="lg" />
          <LocaleSwitcher />
        </header>

        <section className="mt-12 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-breeze-600">{t(live ? "eyebrowLive" : "eyebrow")}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
          <p className="mt-4 text-lg text-ink/70">{t(live ? "subtitleLive" : "subtitle")}</p>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {cards.map(({ href, icon: Icon, key, accent }) => (
            <Link
              key={key}
              href={href}
              className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <span className="grid size-12 place-items-center rounded-2xl text-white" style={{ backgroundColor: accent }}>
                <Icon className="size-6" />
              </span>
              <h2 className="mt-5 text-xl font-bold">{t(`${key}.title`)}</h2>
              <p className="mt-1 text-sm text-ink/60">{t(`${key}.desc`)}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-lagoon">
                {t("open")} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>

        {!live && (
        <section className="mt-10 rounded-3xl bg-white/70 p-6 ring-1 ring-breeze-100">
          <h3 className="font-bold">{t("tipTitle")}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/70">
            <li>{t("tip1")}</li>
            <li>{t("tip2")}</li>
            <li>{t("tip3")}</li>
          </ol>
          <button
            onClick={() => {
              resetPrototype();
              alert(t("resetDone"));
            }}
            className="mt-4 text-xs font-semibold text-ink/50 underline hover:text-ink"
          >
            {t("reset")}
          </button>
        </section>
        )}
      </div>
    </main>
  );
}
