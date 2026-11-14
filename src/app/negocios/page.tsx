"use client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { NegociosShell } from "@/components/negocios/Shell";

const DOORS = [
  { key: "enter", href: "/login?for=negocios&next=/dashboard", main: true },
  { key: "register", href: "/signup/salon", main: false },
  { key: "team", href: "/negocios/equipo", main: false },
  { key: "demo", href: "/demo", main: false },
] as const;

/** Puerta de Breeze Negocios: dueños, administradores y equipo. Los clientes entran por /explore. */
export default function NegociosPage() {
  const t = useTranslations("negocios");
  return (
    <NegociosShell>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-white/70">{t("subtitle")}</p>

      <nav aria-label={t("tag")} className="mt-8 space-y-3">
        {DOORS.map(({ key, href, main }) => (
          <Link
            key={key}
            href={href}
            className={`group flex items-center justify-between gap-3 rounded-2xl p-4 ring-1 transition ${
              main ? "bg-glow text-marine ring-glow hover:brightness-105" : "bg-marine-2 ring-white/15 hover:ring-white/40"
            }`}
          >
            <span>
              <b className="block text-lg">{t(`${key}.title`)}</b>
              <span className={`block text-sm ${main ? "text-marine/75" : "text-white/65"}`}>{t(`${key}.desc`)}</span>
            </span>
            <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-1" />
          </Link>
        ))}
      </nav>

      <Link href="/negocios/precios" className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-glow underline-offset-2 hover:underline">
        {t("pricing")} <ArrowRight className="size-4" />
      </Link>

      <ul className="mt-8 space-y-2 text-sm text-white/70">
        {(["agenda", "online", "reminders", "live"] as const).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-glow" /> {t(`perks.${k}`)}
          </li>
        ))}
      </ul>
    </NegociosShell>
  );
}
