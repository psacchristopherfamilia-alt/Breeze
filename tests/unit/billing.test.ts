import { describe, expect, it } from "vitest";
import { billingNotice, monthlyRecurringCents } from "@/lib/billing";

const NOW = new Date("2027-03-10T15:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("aviso de pago del dueño", () => {
  it("prueba con tiempo de sobra: nada; a 3 días o menos: aviso con los días que quedan", () => {
    expect(billingNotice({ status: "trialing", trial_ends_at: day(10), current_period_end: day(10) }, NOW)).toBeNull();
    expect(billingNotice({ status: "trialing", trial_ends_at: day(3), current_period_end: day(3) }, NOW)).toEqual({ kind: "trial_ending", days: 3 });
    expect(billingNotice({ status: "trialing", trial_ends_at: day(0.5), current_period_end: null }, NOW)).toEqual({ kind: "trial_ending", days: 1 });
  });

  it("prueba terminada pero aún con gracia: avisa con los días de retraso", () => {
    expect(billingNotice({ status: "trialing", trial_ends_at: day(-0.2), current_period_end: day(-0.2) }, NOW)).toEqual({ kind: "trial_ended", days: 1 });
    expect(billingNotice({ status: "trialing", trial_ends_at: day(-4), current_period_end: day(-4) }, NOW)).toEqual({ kind: "trial_ended", days: 5 });
  });

  it("plan activo: sin aviso mientras esté al día; con aviso en cuanto vence", () => {
    expect(billingNotice({ status: "active", trial_ends_at: null, current_period_end: day(20) }, NOW)).toBeNull();
    expect(billingNotice({ status: "active", trial_ends_at: null, current_period_end: day(-2) }, NOW)).toEqual({ kind: "payment_due", days: 3 });
  });

  it("pago pendiente y suspendido", () => {
    expect(billingNotice({ status: "past_due", trial_ends_at: null, current_period_end: day(-9) }, NOW)).toEqual({ kind: "past_due", days: 10 });
    expect(billingNotice({ status: "suspended", trial_ends_at: null, current_period_end: day(-20) }, NOW)).toEqual({ kind: "suspended" });
    expect(billingNotice({ status: "cancelled", trial_ends_at: null, current_period_end: null }, NOW)).toEqual({ kind: "suspended" });
  });

  it("sin fechas no inventa avisos", () => {
    expect(billingNotice({ status: "active", trial_ends_at: null, current_period_end: null }, NOW)).toBeNull();
  });
});

describe("ingreso mensual recurrente (MRR)", () => {
  const plans = [
    { code: "solo", monthly_price_cents: 2900, annual_price_cents: 29000, extra_branch_price_cents: 3900 },
    { code: "studio", monthly_price_cents: 5900, annual_price_cents: 59000, extra_branch_price_cents: 3900 },
  ];
  it("suma negocios activos o con pago pendiente; el anual cuenta 1/12; las sucursales extra se suman", () => {
    const orgs = [
      { status: "active" as const, plan_code: "studio", billing_cycle: "monthly" as const, extra_branches: 1 }, // 5900 + 3900
      { status: "active" as const, plan_code: "solo", billing_cycle: "annual" as const, extra_branches: 0 }, // 29000 / 12
      { status: "past_due" as const, plan_code: "solo", billing_cycle: "monthly" as const, extra_branches: 0 }, // 2900
    ];
    expect(monthlyRecurringCents(orgs, plans)).toBe(9800 + Math.round(29000 / 12) + 2900);
  });
  it("no cuenta pruebas, suspendidos, cancelados ni planes desconocidos", () => {
    const base = { billing_cycle: "monthly" as const, extra_branches: 0 };
    expect(
      monthlyRecurringCents(
        [
          { ...base, status: "trialing", plan_code: "studio" },
          { ...base, status: "suspended", plan_code: "studio" },
          { ...base, status: "cancelled", plan_code: "studio" },
          { ...base, status: "active", plan_code: "inexistente" },
          { ...base, status: null, plan_code: null },
        ],
        plans,
      ),
    ).toBe(0);
  });
});
