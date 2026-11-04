"use client";
import { AlertTriangle, Clock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { BillingNotice } from "@/lib/billing";

/** Aviso de plan/pago para el dueño, encima de todas las pantallas del panel. */
export function BillingBanner({ notice }: { notice: BillingNotice }) {
  const t = useTranslations("panel.notice");
  const urgent = notice.kind === "past_due" || notice.kind === "suspended";
  const Icon = urgent ? AlertTriangle : Clock;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm font-semibold lg:px-8 ${
        urgent ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{t(notice.kind, { days: "days" in notice ? notice.days : 0 })}</span>
      <Link href="/dashboard/billing" className="underline underline-offset-2">{t("cta")}</Link>
    </div>
  );
}
