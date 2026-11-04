import { atLocal, formatDayShort } from "./time";

/** Facturación manual: tipos y reglas de presentación (la lógica de cobro vive en la base de datos). */

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
export type BillingCycle = "monthly" | "annual";

const DAY = 86_400_000;

export type BillingNotice =
  | { kind: "trial_ending"; days: number }
  | { kind: "trial_ended"; days: number }
  | { kind: "payment_due"; days: number }
  | { kind: "past_due"; days: number }
  | { kind: "suspended" };

/**
 * Aviso que ve el dueño en su panel (o null si todo está en orden).
 * `days`: días que faltan (prueba por terminar) o días de retraso (resto).
 */
export function billingNotice(
  s: { status: SubscriptionStatus; trial_ends_at: string | null; current_period_end: string | null },
  now: Date = new Date(),
): BillingNotice | null {
  if (s.status === "suspended" || s.status === "cancelled") return { kind: "suspended" };
  const end = s.current_period_end ?? s.trial_ends_at;
  if (!end) return null;
  const diff = new Date(end).getTime() - now.getTime();
  const left = Math.ceil(diff / DAY);
  const late = Math.max(1, Math.floor(-diff / DAY) + 1);
  if (s.status === "past_due") return { kind: "past_due", days: late };
  if (s.status === "trialing") {
    if (diff > 0) return left <= 3 ? { kind: "trial_ending", days: left } : null;
    return { kind: "trial_ended", days: late };
  }
  return diff < 0 ? { kind: "payment_due", days: late } : null;
}

/** Ingreso mensual recurrente aproximado: negocios activos (el anual cuenta como 1/12). */
export function monthlyRecurringCents(
  orgs: { status: SubscriptionStatus | null; plan_code: string | null; billing_cycle: BillingCycle | null; extra_branches: number | null }[],
  plans: { code: string; monthly_price_cents: number; annual_price_cents: number; extra_branch_price_cents: number }[],
): number {
  let total = 0;
  for (const o of orgs) {
    if (o.status !== "active" && o.status !== "past_due") continue;
    const p = plans.find((x) => x.code === o.plan_code);
    if (!p) continue;
    const extra = (o.extra_branches ?? 0) * p.extra_branch_price_cents;
    total += o.billing_cycle === "annual" ? Math.round(p.annual_price_cents / 12) + extra : p.monthly_price_cents + extra;
  }
  return total;
}

export interface OwnerBilling {
  subscription: {
    plan_code: string;
    plan_name: string;
    status: SubscriptionStatus;
    billing_cycle: BillingCycle;
    extra_branches: number;
    trial_ends_at: string | null;
    current_period_end: string | null;
    can_book: boolean;
    monthly_price_cents: number;
    annual_price_cents: number;
    extra_branch_price_cents: number;
  } | null;
  open_invoice: { number: string; amount_cents: number; due_at: string; period_start: string; period_end: string } | null;
  invoices: { number: string; period_start: string; period_end: string; amount_cents: number; status: "open" | "paid" | "void"; due_at: string; paid_at: string | null }[];
  payments: { amount_cents: number; method: "bank_transfer" | "cash" | "other"; reference: string | null; received_at: string }[];
  instructions: { payee_name: string; bank_name: string; account_number: string; instructions_en: string; instructions_es: string } | null;
}

export interface PlatformOrg {
  id: string;
  name: string;
  owner_email: string | null;
  owner_name: string | null;
  created_at: string;
  salons: number;
  published_salons: number;
  plan_code: string | null;
  status: SubscriptionStatus | null;
  billing_cycle: BillingCycle | null;
  extra_branches: number | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  can_book: boolean;
  open_invoice: { id: string; number: string; amount_cents: number; due_at: string; period_start: string; period_end: string } | null;
  last_payment: { amount_cents: number; received_at: string; method: "bank_transfer" | "cash" | "other" } | null;
}

export interface PlatformOverview {
  settings: { payee_name: string; bank_name: string; account_number: string; instructions_en: string; instructions_es: string };
  plans: { code: string; name: string; monthly_price_cents: number; annual_price_cents: number; extra_branch_price_cents: number }[];
  organizations: PlatformOrg[];
}

/** Fecha corta en hora de TCI. Acepta "2027-03-10" (día sin hora) o una marca de tiempo ISO. */
export function billingDate(v: string, locale: "en" | "es"): string {
  return formatDayShort(/^\d{4}-\d{2}-\d{2}$/.test(v) ? atLocal(v, "12:00") : new Date(v), locale);
}
