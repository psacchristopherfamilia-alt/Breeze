"use client";
import { Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/Providers";
import type { OwnerBilling } from "@/lib/billing";
import { formatPrice } from "@/lib/mock/data";

/** Fecha con año (un recibo lo necesita), en la hora de Turks and Caicos. */
const fullDate = (v: string, locale: "en" | "es") =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "America/Grand_Turk" }).format(/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-05:00`) : new Date(v));

type Invoice = OwnerBilling["invoices"][number];

/** Factura (pendiente de pago) o recibo (pagada). El botón imprime solo el documento; en el diálogo se elige «Guardar como PDF». */
export function InvoiceDocument({
  business,
  invoice,
  plan,
  payment,
  instructions,
}: {
  business: string;
  invoice: Invoice;
  plan: string | null;
  payment: OwnerBilling["payments"][number] | null;
  instructions: OwnerBilling["instructions"];
}) {
  const t = useTranslations("billing");
  const { locale } = useAppLocale();
  const paid = invoice.status === "paid";
  const notes = instructions ? (locale === "es" ? instructions.instructions_es : instructions.instructions_en) : "";

  return (
    <div className="p-4 lg:p-8">
      <style>{`@media print { body * { visibility: hidden } #invoice-doc, #invoice-doc * { visibility: visible } #invoice-doc { position: absolute; inset: 0; box-shadow: none !important; border: 0 !important } }`}</style>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/billing" className="text-sm font-semibold text-lagoon hover:underline">← {t("title")}</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800">
          <Printer className="size-4" /> {t("print")}
        </button>
      </div>

      <article id="invoice-doc" className="mx-auto max-w-2xl rounded-3xl bg-white p-8 text-ink ring-1 ring-breeze-100">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-extrabold text-lagoon">Breeze</p>
            <p className="text-sm text-ink/60">Turks and Caicos</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-extrabold uppercase tracking-wide">{t(paid ? "receiptTitle" : "invoiceTitle")}</h1>
            <p className="font-mono text-sm">{invoice.number}</p>
          </div>
        </header>

        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase text-ink/50">{t("billedTo")}</dt>
            <dd className="mt-1 font-semibold">{business}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-ink/50">{t(paid ? "paidOn" : "dueOn")}</dt>
            <dd className="mt-1 font-semibold">{fullDate(paid && invoice.paid_at ? invoice.paid_at : invoice.due_at, locale)}</dd>
          </div>
        </dl>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-breeze-100 text-left text-xs uppercase text-ink/50">
              <th className="py-2">{t("concept")}</th>
              <th className="py-2 text-right">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-3">
                <b>{plan ? `Breeze ${plan}` : "Breeze"}</b>
                <span className="block text-xs text-ink/60">{fullDate(invoice.period_start, locale)} – {fullDate(invoice.period_end, locale)}</span>
              </td>
              <td className="py-3 text-right font-semibold">{formatPrice(invoice.amount_cents)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-breeze-100">
              <td className="py-3 font-extrabold">{t("total")} (USD)</td>
              <td className="py-3 text-right text-lg font-extrabold">{formatPrice(invoice.amount_cents)}</td>
            </tr>
          </tfoot>
        </table>

        {paid && (
          <p className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            {t("paidNote")}
            {payment && ` · ${t(`method.${payment.method}`)}${payment.reference ? ` (${payment.reference})` : ""}`}
          </p>
        )}

        {instructions && (
          <div className="mt-6 rounded-2xl bg-foam p-4 text-sm ring-1 ring-breeze-100">
            <p className="text-xs font-bold uppercase text-ink/50">{t("howToPay")}</p>
            <p className="mt-2 font-semibold">{instructions.payee_name}</p>
            <p>{instructions.bank_name} · {instructions.account_number}</p>
            {notes && <p className="mt-2 whitespace-pre-line text-ink/70">{notes}</p>}
            <p className="mt-2 text-ink/70">{t("useReference", { number: invoice.number })}</p>
          </div>
        )}
      </article>
    </div>
  );
}
