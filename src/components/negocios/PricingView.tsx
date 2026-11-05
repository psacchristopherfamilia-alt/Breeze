"use client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LegalLinks } from "@/components/legal/LegalConsent";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { Logo } from "@/components/ui/Logo";
import type { PublicPlan } from "@/lib/plans";

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Precios de Breeze Negocios. Sin pagos en línea: se factura a mano (transferencia o efectivo). */
export function PricingView({ plans }: { plans: PublicPlan[] }) {
  const t = useTranslations("pricing");
  const [annual, setAnnual] = useState(false);
  const featured = plans.length >= 2 ? plans[1].code : plans[0]?.code;

  return (
    <main className="min-h-dvh bg-marine text-white">
      <div className="mx-auto max-w-5xl px-5 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <Logo href="/negocios" invert />
          <LocaleSwitcher invert />
        </header>

        <h1 className="mt-10 text-3xl font-extrabold leading-tight tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-white/70">{t("subtitle")}</p>

        <div role="group" aria-label={t("cycle")} className="mt-6 inline-flex rounded-full bg-marine-2 p-1 ring-1 ring-white/15">
          {([false, true] as const).map((a) => (
            <button
              key={String(a)}
              onClick={() => setAnnual(a)}
              aria-pressed={annual === a}
              className={`rounded-full px-4 py-1.5 text-sm font-bold ${annual === a ? "bg-glow text-marine" : "text-white/70 hover:text-white"}`}
            >
              {t(a ? "annual" : "monthly")}
            </button>
          ))}
        </div>
        {annual && <p className="mt-2 text-sm font-semibold text-glow">{t("annualNote")}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <section key={p.code} className={`flex flex-col rounded-3xl p-6 ring-1 ${p.code === featured ? "bg-white text-marine ring-glow" : "bg-marine-2 ring-white/15"}`}>
              <h2 className="text-xl font-extrabold">{p.name}</h2>
              <p className={`text-sm ${p.code === featured ? "text-marine/70" : "text-white/60"}`}>
                {p.maxPros ? t("pros", { min: p.minPros, max: p.maxPros }) : t("prosOpen", { min: p.minPros })}
              </p>
              <p className="mt-4">
                <span className="text-4xl font-extrabold">{usd(annual ? p.annualCents : p.monthlyCents)}</span>
                <span className={`ml-1 text-sm ${p.code === featured ? "text-marine/70" : "text-white/60"}`}>{t(annual ? "perYear" : "perMonth")}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {(["agenda", "online", "reminders"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lagoon" /> {t(`features.${k}`)}</li>
                ))}
                {p.live && <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lagoon" /> {t("features.live")}</li>}
                {p.whatsapp && <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lagoon" /> {t("features.whatsapp", { count: p.messageQuota })}</li>}
                {p.reports && <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lagoon" /> {t("features.reports")}</li>}
              </ul>
              <Link
                href="/signup/salon"
                className={`mt-6 inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 font-bold ${p.code === featured ? "bg-lagoon text-white hover:bg-breeze-800" : "bg-glow text-marine hover:brightness-105"}`}
              >
                {t("cta")} <ArrowRight className="size-4" />
              </Link>
            </section>
          ))}
        </div>

        <ul className="mt-8 space-y-2 text-sm text-white/70">
          <li>{t("extraBranch", { price: usd(plans[0]?.extraBranchCents ?? 3900) })}</li>
          <li>{t("trial")}</li>
          <li>{t("billing")}</li>
          <li>{t("noLock")}</li>
        </ul>

        <footer className="mt-10 border-t border-white/15 pt-4">
          <LegalLinks invert />
        </footer>
      </div>
    </main>
  );
}
