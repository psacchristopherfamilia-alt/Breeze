"use client";
import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SetupStatus } from "@/lib/panel/setup";

/** "Pasos para empezar a recibir reservas": se ve en la agenda hasta que la sucursal se publica. */
export function SetupChecklist({ status }: { status: SetupStatus }) {
  const t = useTranslations("panel.setup");
  const tw = useTranslations("wizard");
  if (status.isPublished) return null;

  const steps = [
    { key: "service", done: status.hasService, href: "/dashboard/services" },
    { key: "professional", done: status.hasProfessional, href: "/dashboard/professionals" },
    { key: "assignment", done: status.hasAssignment, href: "/dashboard/professionals" },
    { key: "hours", done: status.hasHours, href: "/dashboard/professionals" },
    { key: "publish", done: false, href: "/dashboard/settings" },
  ] as const;
  const ready = steps.slice(0, 4).every((s) => s.done);
  const firstPending = steps.find((s) => !s.done)?.key;

  return (
    <section aria-labelledby="setup-title" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-200">
      <h2 id="setup-title" className="text-lg font-extrabold">{t("title")}</h2>
      <p className="mt-1 text-sm text-ink/60">{t(ready ? "readyHint" : "hint")}</p>
      {!status.hasService && !status.hasProfessional && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-breeze-50 p-4">
          <div>
            <p className="font-bold">{tw("cta")}</p>
            <p className="text-sm text-ink/60">{tw("ctaHint")}</p>
          </div>
          <Link href="/dashboard/setup" className="rounded-xl bg-lagoon px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-breeze-800">{tw("ctaButton")}</Link>
        </div>
      )}
      <ol className="mt-4 space-y-2">
        {steps.map((s) => {
          const current = s.key === firstPending;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${s.done ? "bg-lagoon text-white" : "text-ink/30 ring-1 ring-breeze-200"}`}
                aria-hidden
              >
                {s.done ? <Check className="size-4" strokeWidth={3} /> : <Circle className="size-3" />}
              </span>
              <span className={`flex-1 text-sm ${s.done ? "text-ink/50 line-through" : "font-semibold"}`}>
                {t(`steps.${s.key}`)}
                <span className="sr-only"> — {t(s.done ? "done" : "pending")}</span>
              </span>
              {!s.done && (
                <Link
                  href={s.href}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${current ? "bg-lagoon text-white hover:bg-breeze-800" : "text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50"}`}
                >
                  {t(`go.${s.key}`)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
