"use client";
import { CalendarHeart, LayoutDashboard, MonitorPlay, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { useAppHref } from "@/lib/demo/useDemo";
import { resetPrototype } from "@/lib/mock/store";

const CARDS = [
  { href: "/explore", icon: CalendarHeart, key: "client", accent: "#2BB3B1" },
  { href: "/dashboard", icon: LayoutDashboard, key: "panel", accent: "#2563EB" },
  { href: "/live/coral-salon", icon: MonitorPlay, key: "live", accent: "#BE185D" },
] as const;

/** Portada del prototipo (sin Supabase) y de la demo pública (/demo, con `demo`). */
export function Hub({ demo = false }: { demo?: boolean }) {
  const t = useTranslations("hub");
  const d = useTranslations("demo");
  const appHref = useAppHref();
  return (
    <main className="bg-breeze-sky min-h-dvh">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
        <header className="flex items-center justify-between">
          <Logo size="lg" />
          <LocaleSwitcher />
        </header>

        <section className="mt-12 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-breeze-600">{demo ? d("eyebrow") : t("eyebrow")}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{demo ? d("title") : t("title")}</h1>
          <p className="mt-4 text-lg text-ink/70">{demo ? d("subtitle") : t("subtitle")}</p>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {CARDS.map(({ href, icon: Icon, key, accent }) => (
            <Link
              key={key}
              href={appHref(href)}
              className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <span className="grid size-12 place-items-center rounded-2xl text-white" style={{ backgroundColor: accent }}>
                <Icon className="size-6" />
              </span>
              <h2 className="mt-5 text-xl font-bold">{t(`${key}.title`)}</h2>
              <p className="mt-1 text-sm text-ink/70">{t(`${key}.desc`)}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-lagoon">
                {t("open")} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>

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
            className="mt-4 text-xs font-semibold text-ink/70 underline hover:text-ink"
          >
            {t("reset")}
          </button>
        </section>

        {demo && (
          <section className="mt-6 flex flex-col gap-4 rounded-3xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold">{d("ctaTitle")}</h3>
              <p className="mt-1 text-sm text-white/80">{d("ctaBody")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/signup/salon" className="rounded-2xl bg-breeze-300 px-5 py-3 font-bold text-ink hover:bg-white">
                {d("start")}
              </Link>
              <Link href="/negocios/precios" className="rounded-2xl px-5 py-3 font-bold text-white ring-1 ring-white/40 hover:bg-white/10">
                {d("prices")}
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
