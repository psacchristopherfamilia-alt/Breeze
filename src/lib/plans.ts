/** Planes públicos. La base de datos manda (tabla `plans`); estos valores son el respaldo en modo prototipo. */
export interface PublicPlan {
  code: string;
  name: string;
  minPros: number;
  maxPros: number | null;
  monthlyCents: number;
  annualCents: number;
  extraBranchCents: number;
  messageQuota: number;
  live: boolean;
  whatsapp: boolean;
  reports: boolean;
}

export const FALLBACK_PLANS: PublicPlan[] = [
  { code: "solo", name: "Solo", minPros: 1, maxPros: 2, monthlyCents: 2900, annualCents: 29000, extraBranchCents: 3900, messageQuota: 0, live: false, whatsapp: false, reports: false },
  { code: "studio", name: "Studio", minPros: 3, maxPros: 6, monthlyCents: 5900, annualCents: 59000, extraBranchCents: 3900, messageQuota: 300, live: true, whatsapp: true, reports: false },
  { code: "salon", name: "Salon", minPros: 7, maxPros: null, monthlyCents: 9900, annualCents: 99000, extraBranchCents: 3900, messageQuota: 1000, live: true, whatsapp: true, reports: true },
];

type Row = {
  code: string;
  name: string;
  min_pros: number;
  max_pros: number | null;
  monthly_price_cents: number;
  annual_price_cents: number;
  extra_branch_price_cents: number;
  message_quota: number;
  features: unknown;
};

export function plansFromRows(rows: Row[] | null | undefined): PublicPlan[] {
  if (!rows?.length) return FALLBACK_PLANS;
  return rows.map((r) => {
    const f = (r.features ?? {}) as Record<string, boolean>;
    return {
      code: r.code,
      name: r.name,
      minPros: r.min_pros,
      maxPros: r.max_pros,
      monthlyCents: r.monthly_price_cents,
      annualCents: r.annual_price_cents,
      extraBranchCents: r.extra_branch_price_cents,
      messageQuota: r.message_quota,
      live: !!f.live,
      whatsapp: !!f.whatsapp,
      reports: !!f.reports,
    };
  });
}
