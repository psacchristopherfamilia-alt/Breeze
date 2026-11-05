"use client";
import { Banknote, CalendarClock, Receipt } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/Providers";
import { billingDate, type OwnerBilling } from "@/lib/billing";
import { formatPrice } from "@/lib/mock/data";

const dateOf = billingDate;

const STATUS_STYLE: Record<string, string> = {
  trialing: "bg-breeze-50 text-lagoon",
  active: "bg-green-50 text-green-700",
  past_due: "bg-amber-50 text-amber-800",
  suspended: "bg-red-50 text-red-700",
  cancelled: "bg-ink/5 text-ink/70",
};

/** "Plan y pagos" del dueño: su plan, la factura pendiente con cómo pagarla, y el historial. */
export function BillingView({ data }: { data: OwnerBilling }) {
  const t = useTranslations("billing");
  const tp = useTranslations("panel.plan");
  const { locale } = useAppLocale();
  const s = data.subscription;
  const inst = data.instructions;
  const hasInstructions = !!inst && (inst.payee_name || inst.bank_name || inst.account_number || inst.instructions_en || inst.instructions_es);
  const note = inst ? (locale === "es" ? inst.instructions_es || inst.instructions_en : inst.instructions_en || inst.instructions_es) : "";

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>

      {s && (
        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-extrabold">{t("plan", { plan: s.plan_name })}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[s.status]}`}>{tp(`status.${s.status}`)}</span>
          </div>
          <p className="mt-1 text-sm text-ink/70">
            {t(s.billing_cycle === "annual" ? "priceAnnual" : "priceMonthly", {
              price: formatPrice(s.billing_cycle === "annual" ? s.annual_price_cents : s.monthly_price_cents),
            })}
            {s.extra_branches > 0 && ` · ${t("extraBranches", { count: s.extra_branches, price: formatPrice(s.extra_branch_price_cents) })}`}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-lagoon" />
            {s.status === "trialing" && s.trial_ends_at
              ? t("trialEnds", { date: dateOf(s.trial_ends_at, locale) })
              : s.current_period_end
                ? t(s.status === "active" ? "activeUntil" : "periodEnded", { date: dateOf(s.current_period_end, locale) })
                : null}
          </p>
          {!s.can_book && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t("paused")}</p>}
        </section>
      )}

      <section className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100" aria-labelledby="inv-title">
        <h2 id="inv-title" className="flex items-center gap-2 text-lg font-extrabold"><Receipt className="size-5 text-lagoon" /> {t("openTitle")}</h2>
        {data.open_invoice ? (
          <>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-3xl font-extrabold text-lagoon">{formatPrice(data.open_invoice.amount_cents)}</p>
                <p className="text-sm text-ink/70">
                  {t("invoiceNo", { number: data.open_invoice.number })} · {dateOf(data.open_invoice.period_start, locale)} – {dateOf(data.open_invoice.period_end, locale)}
                </p>
              </div>
              <p className="text-sm font-semibold">{t("due", { date: dateOf(data.open_invoice.due_at, locale) })}</p>
            </div>

            <div className="mt-4 rounded-2xl bg-foam p-4 text-sm ring-1 ring-breeze-100">
              <p className="flex items-center gap-2 font-bold"><Banknote className="size-4 text-lagoon" /> {t("howToPay")}</p>
              {hasInstructions ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {inst?.payee_name && (<><dt className="text-ink/70">{t("payee")}</dt><dd className="font-semibold">{inst.payee_name}</dd></>)}
                  {inst?.bank_name && (<><dt className="text-ink/70">{t("bank")}</dt><dd className="font-semibold">{inst.bank_name}</dd></>)}
                  {inst?.account_number && (<><dt className="text-ink/70">{t("account")}</dt><dd className="font-semibold">{inst.account_number}</dd></>)}
                  <dt className="text-ink/70">{t("reference")}</dt>
                  <dd className="font-mono font-bold">{data.open_invoice.number}</dd>
                </dl>
              ) : (
                <p className="mt-2 text-ink/70">{t("noInstructions")}</p>
              )}
              {note && <p className="mt-3 whitespace-pre-line text-ink/70">{note}</p>}
              <p className="mt-3 text-xs text-ink/70">{t("afterPay")}</p>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink/70">{t("noInvoice")}</p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="hist-title">
        <h2 id="hist-title" className="text-sm font-bold uppercase tracking-wide text-ink/70">{t("invoices")}</h2>
        {data.invoices.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">{t("emptyInvoices")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-breeze-100 rounded-2xl bg-white ring-1 ring-breeze-100">
            {data.invoices.map((i) => (
              <li key={i.number} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <b className="font-mono">{i.number}</b>
                  <span className="block text-xs text-ink/70">{dateOf(i.period_start, locale)} – {dateOf(i.period_end, locale)}</span>
                </span>
                <span className="flex items-center gap-3">
                  {i.status !== "void" && (
                    <Link href={`/dashboard/billing/${i.number}`} className="text-xs font-bold text-lagoon hover:underline">{t("viewDocument")}</Link>
                  )}
                  <b>{formatPrice(i.amount_cents)}</b>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${i.status === "paid" ? "bg-green-50 text-green-700" : i.status === "void" ? "bg-ink/5 text-ink/70" : "bg-amber-50 text-amber-800"}`}>{t(`invoiceStatus.${i.status}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.payments.length > 0 && (
        <section className="mt-6" aria-labelledby="pay-title">
          <h2 id="pay-title" className="text-sm font-bold uppercase tracking-wide text-ink/70">{t("payments")}</h2>
          <ul className="mt-2 divide-y divide-breeze-100 rounded-2xl bg-white ring-1 ring-breeze-100">
            {data.payments.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <b>{dateOf(p.received_at, locale)}</b>
                  <span className="block text-xs text-ink/70">{t(`method.${p.method}`)}{p.reference ? ` · ${p.reference}` : ""}</span>
                </span>
                <b>{formatPrice(p.amount_cents)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
