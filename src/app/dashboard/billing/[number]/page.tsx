import { notFound, redirect } from "next/navigation";
import { InvoiceDocument } from "@/components/panel/InvoiceDocument";
import type { OwnerBilling } from "@/lib/billing";
import { getPanelContext } from "@/lib/panel/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Factura o recibo imprimible (o «Guardar como PDF» desde el navegador). Solo el dueño. */
export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  if (!isSupabaseConfigured() || !/^BRZ-\d{4}-\d{5}$/.test(number)) notFound();
  const ctx = await getPanelContext();
  if (!ctx) return null;
  if (!ctx.isOwner) redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_billing", { p_organization_id: ctx.current.organizationId });
  const billing = data as unknown as OwnerBilling | null;
  const invoice = billing?.invoices.find((i) => i.number === number);
  if (!billing || !invoice || invoice.status === "void") notFound();
  // El pago que cerró esta factura (mismo importe, el más cercano a la fecha de pago).
  const payment =
    invoice.status === "paid" && invoice.paid_at
      ? billing.payments
          .filter((p) => p.amount_cents >= invoice.amount_cents)
          .sort((a, b) => Math.abs(+new Date(a.received_at) - +new Date(invoice.paid_at!)) - Math.abs(+new Date(b.received_at) - +new Date(invoice.paid_at!)))[0] ?? null
      : null;
  return (
    <InvoiceDocument
      business={ctx.current.organizationName}
      invoice={invoice}
      plan={billing.subscription?.plan_name ?? null}
      payment={payment}
      instructions={invoice.status === "open" ? billing.instructions : null}
    />
  );
}
