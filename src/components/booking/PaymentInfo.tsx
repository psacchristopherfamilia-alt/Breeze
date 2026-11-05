"use client";
import { Banknote, CreditCard, Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProPayment } from "@/lib/booking/types";

/** Cómo pagará el cliente a este profesional (en persona o por transferencia). Breeze no cobra nada. */
export function PaymentInfo({ payment, name }: { payment: ProPayment; name: string }) {
  const t = useTranslations("booking");
  const methods = [
    { key: "cash", on: payment.cash, Icon: Banknote },
    { key: "card", on: payment.card, Icon: CreditCard },
    { key: "transfer", on: payment.transfer, Icon: Landmark },
  ].filter((m) => m.on);

  return (
    <section aria-label={t("payTitle")} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
      <p className="text-sm font-bold">{t("payTitle")}</p>
      <p className="text-xs text-ink/50">{t("payDirect", { name })}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {methods.map(({ key, Icon }) => (
          <li key={key} className="inline-flex items-center gap-1.5 rounded-full bg-breeze-50 px-3 py-1.5 text-sm font-semibold text-lagoon">
            <Icon className="size-4" /> {t(`pay.${key}`)}
          </li>
        ))}
      </ul>
      {payment.transfer && payment.note && (
        <div className="mt-3 rounded-xl bg-foam p-3 text-sm ring-1 ring-breeze-100">
          <p className="text-xs font-bold uppercase text-ink/50">{t("payTransferDetails")}</p>
          <p className="mt-1 whitespace-pre-line break-words">{payment.note}</p>
        </div>
      )}
    </section>
  );
}
