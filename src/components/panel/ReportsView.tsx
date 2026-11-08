"use client";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { relativeAge, type Age } from "@/lib/panel/clients";
import { DOW_ORDER, PERIODS, delta, formatMoney, heatGrid, heatStep, share, type Delta, type StaffReport } from "@/lib/panel/reports";

/** Una sola rampa turquesa, de poco a mucho. */
const RAMP = ["#e3f3f5", "#a9dbe0", "#5fb7c1", "#1f8f9c", "#075560"];

interface Tip {
  text: string;
  x: number;
  y: number;
}

export function ReportsView({ report, days, isManager, nowIso }: { report: StaffReport | null; days: number; isManager: boolean; nowIso: string }) {
  const t = useTranslations("reports");
  const tw = useTranslations();
  const tc = useTranslations("clients");
  const { locale } = useAppLocale();
  const [tip, setTip] = useState<Tip | null>(null);
  const now = new Date(nowIso);

  const tipProps = (text: string) => ({
    tabIndex: 0,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, text),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, text),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });
  const showTip = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ text, x: r.left + r.width / 2, y: r.top });
  };
  const svc = (s: { name_en: string; name_es: string }) => (locale === "es" ? s.name_es || s.name_en : s.name_en || s.name_es);
  const ago = (a: Age) => (a.unit === "today" || a.unit === "yesterday" ? tc(`ago.${a.unit}`) : tc(`ago.${a.unit}`, { count: a.n }));

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/70">{t(isManager ? "subtitleManager" : "subtitlePro")}</p>
      </div>
      <nav aria-label={t("periodLabel")} className="flex gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/dashboard/reports?days=${p}`}
            aria-current={days === p ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${days === p ? "bg-lagoon text-white ring-lagoon" : "bg-white text-ink ring-breeze-100 hover:bg-breeze-50"}`}
          >
            {t("lastDays", { days: p })}
          </Link>
        ))}
      </nav>
    </div>
  );

  if (!report)
    return (
      <div className="mx-auto max-w-5xl p-4 lg:p-8">
        {header}
        <p role="alert" className="mt-6 rounded-3xl bg-white p-8 text-center text-ink/70 ring-1 ring-breeze-100">{t("loadError")}</p>
      </div>
    );

  const { current: cur, previous: prev } = report;
  const hasData = cur.appointments > 0 || report.heatmap.length > 0;
  const grid = heatGrid(report.heatmap);
  const maxRev = Math.max(1, ...report.by_pro.map((p) => p.revenue_cents));
  const clientsTotal = report.clients.new + report.clients.returning;
  const pNew = share(report.clients.new, clientsTotal);
  const dowName = (d: number) => tw(`weekdays.${d}`);
  const dowShort = (d: number) => dowName(d).slice(0, 3);

  const kpis: { label: string; value: string; d: Delta; pts?: boolean }[] = [
    { label: t("kpi.revenue"), value: formatMoney(cur.revenue_cents), d: delta(cur.revenue_cents, prev.revenue_cents) },
    { label: t("kpi.appointments"), value: String(cur.appointments), d: delta(cur.appointments, prev.appointments) },
    { label: t("kpi.avgTicket"), value: formatMoney(cur.avg_ticket_cents), d: delta(cur.avg_ticket_cents, prev.avg_ticket_cents) },
    { label: t("kpi.occupancy"), value: `${cur.occupancy_pct}%`, d: delta(cur.occupancy_pct, prev.occupancy_pct, "pts"), pts: true },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
      {header}

      {!hasData ? (
        <section className="rounded-3xl bg-white p-8 text-center ring-1 ring-breeze-100">
          <h2 className="text-lg font-extrabold">{t("empty.title")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink/70">{t("empty.body")}</p>
        </section>
      ) : (
        <>
          <section aria-label={t("summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
                <p className="text-sm text-ink/70">{k.label}</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums">{k.value}</p>
                <p className={`mt-1 inline-flex flex-wrap items-center gap-1 text-xs font-bold ${k.d.dir === "up" ? "text-emerald-800" : k.d.dir === "down" ? "text-red-700" : "text-ink/70"}`}>
                  {k.d.dir === "up" ? <ArrowUp className="size-3.5" aria-hidden="true" /> : k.d.dir === "down" ? <ArrowDown className="size-3.5" aria-hidden="true" /> : <Minus className="size-3.5" aria-hidden="true" />}
                  {k.d.value === null ? t("noCompare") : `${k.d.value > 0 ? "+" : ""}${String(k.d.value).replace(".", locale === "es" ? "," : ".")}${k.pts ? ` ${t("pts")}` : "%"}`}
                  <span className="font-medium text-ink/70">{t("vsPrevious", { days })}</span>
                </p>
              </div>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="rep-rev">
              <h2 id="rep-rev" className="text-lg font-bold">{t(isManager ? "revenueByPro" : "yourRevenue")}</h2>
              <p className="mb-3 text-xs text-ink/70">{t("revenueHint", { days })}</p>
              <ul className="grid grid-cols-[minmax(80px,auto)_1fr] items-center gap-x-3 gap-y-2.5">
                {report.by_pro.map((p) => (
                  <li key={p.id} className="contents">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color_hex }} aria-hidden="true" />
                      {p.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        role="img"
                        aria-label={`${p.name}: ${formatMoney(p.revenue_cents)}, ${share(p.revenue_cents, cur.revenue_cents)}%`}
                        className="h-4 rounded-r"
                        style={{ width: `${Math.max(3, (p.revenue_cents / maxRev) * 70)}%`, background: p.color_hex }}
                        {...tipProps(`${p.name}: ${formatMoney(p.revenue_cents)} (${share(p.revenue_cents, cur.revenue_cents)}%) · ${t("apptCount", { count: p.appointments })}`)}
                      />
                      <span className="text-sm font-bold tabular-nums">{formatMoney(p.revenue_cents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="rep-occ">
              <h2 id="rep-occ" className="text-lg font-bold">{t(isManager ? "occupancyByPro" : "yourOccupancy")}</h2>
              <p className="mb-3 text-xs text-ink/70">{t("occupancyHint")}</p>
              <ul className="grid grid-cols-[minmax(80px,auto)_1fr] items-center gap-x-3 gap-y-2.5">
                {report.by_pro.map((p) => (
                  <li key={p.id} className="contents">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color_hex }} aria-hidden="true" />
                      {p.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-4 flex-1 overflow-hidden rounded-r bg-ink/[0.07]">
                        <span
                          role="img"
                          aria-label={`${p.name}: ${p.occupancy_pct}%`}
                          className="block h-full rounded-r"
                          style={{ width: `${p.occupancy_pct}%`, background: RAMP[3] }}
                          {...tipProps(`${p.name}: ${p.occupancy_pct}% ${t("booked")}`)}
                        />
                      </span>
                      <span className="w-10 text-right text-sm font-bold tabular-nums">{p.occupancy_pct}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="rep-svc">
              <h2 id="rep-svc" className="mb-2 text-lg font-bold">{t("services")}</h2>
              {report.by_service.length === 0 ? (
                <p className="text-sm text-ink/70">{t("none")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink/70">
                        <th scope="col" className="py-1.5 font-bold">{t("col.service")}</th>
                        <th scope="col" className="py-1.5 text-right font-bold">{t("col.appointments")}</th>
                        <th scope="col" className="py-1.5 text-right font-bold">{t("col.revenue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_service.map((s, i) => (
                        <tr key={i} className="border-t border-breeze-100">
                          <td className="py-2 font-semibold">{svc(s)}</td>
                          <td className="py-2 text-right tabular-nums">{s.appointments}</td>
                          <td className="py-2 text-right font-bold tabular-nums">{formatMoney(s.revenue_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="rep-cli">
              <h2 id="rep-cli" className="text-lg font-bold">{t("clients")}</h2>
              <p className="mb-3 text-xs text-ink/70">{t("clientsHint", { count: clientsTotal, days })}</p>
              {clientsTotal === 0 ? (
                <p className="text-sm text-ink/70">{t("none")}</p>
              ) : (
                <>
                  <div className="flex h-7 gap-0.5" role="img" aria-label={t("clientsAria", { returning: report.clients.returning, fresh: report.clients.new })}>
                    {report.clients.returning > 0 && (
                      <div className="flex items-center overflow-hidden rounded bg-lagoon px-2 text-xs font-bold text-white" style={{ flex: report.clients.returning }} {...tipProps(`${t("returning")}: ${report.clients.returning}`)}>
                        {100 - pNew}%
                      </div>
                    )}
                    {report.clients.new > 0 && (
                      <div className="flex items-center overflow-hidden rounded px-2 text-xs font-bold text-ink" style={{ flex: report.clients.new, background: RAMP[1] }} {...tipProps(`${t("newClients")}: ${report.clients.new}`)}>
                        {pNew}%
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink/70">
                    <span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-lagoon align-[-1px]" />{t("returning")} ({report.clients.returning})</span>
                    <span><i className="mr-1.5 inline-block size-2.5 rounded-sm align-[-1px]" style={{ background: RAMP[1] }} />{t("newClients")} ({report.clients.new})</span>
                  </div>
                </>
              )}
              {report.lapsed && (
                <div className="mt-5 border-t border-breeze-100 pt-4">
                  <h3 className="text-sm font-bold">{t("lapsed")}</h3>
                  <p className="text-xs text-ink/70">{t("lapsedHint")}</p>
                  {report.lapsed.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/70">{t("lapsedNone")}</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-breeze-100">
                      {report.lapsed.map((l) => (
                        <li key={l.customer_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span>
                            <b>{l.name}</b> <span className="text-ink/70">· {ago(relativeAge(new Date(l.last_visit), now))}</span>
                          </span>
                          <Link href={`/dashboard/clients/${l.customer_id}`} className="shrink-0 font-bold text-lagoon hover:underline">{t("viewFile")}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>

          <section className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="rep-heat">
            <h2 id="rep-heat" className="text-lg font-bold">{t("heat")}</h2>
            <p className="mb-3 text-xs text-ink/70">
              {t("heatHint")}{" "}
              {grid.best && <b className="text-ink">{t("peak", { day: dowName(grid.best.dow), from: `${grid.best.hour}:00`, to: `${grid.best.hour + 1}:00`, count: grid.best.count })}</b>}
            </p>
            <div className="overflow-x-auto">
              <div className="grid min-w-[300px] gap-0.5" style={{ gridTemplateColumns: "40px repeat(7, minmax(28px, 1fr))" }}>
                <span />
                {DOW_ORDER.map((d) => (
                  <span key={d} className="pb-1 text-center text-xs font-bold text-ink/70">{dowShort(d)}</span>
                ))}
                {grid.hours.map((h, i) => (
                  <div key={h} className="contents">
                    <span className="flex items-center justify-end pr-1.5 text-[11px] tabular-nums text-ink/70">{h}:00</span>
                    {grid.rows[i].map((n, j) => (
                      <span
                        key={j}
                        role="img"
                        aria-label={`${dowName(DOW_ORDER[j])} ${h}:00, ${t("apptCount", { count: n })}`}
                        className="h-6 rounded"
                        style={{ background: RAMP[heatStep(n, grid.max) - 1] }}
                        {...tipProps(`${dowName(DOW_ORDER[j])} ${h}:00 – ${h + 1}:00 · ${t("apptCount", { count: n })}`)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink/70">
              {t("less")}
              {RAMP.map((c) => (
                <i key={c} className="inline-block size-3 rounded-sm ring-1 ring-ink/10" style={{ background: c }} />
              ))}
              {t("more")}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-bold text-lagoon">{t("viewTable")}</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink/70">
                      <th scope="col" className="py-1">{t("col.hour")}</th>
                      {DOW_ORDER.map((d) => (
                        <th key={d} scope="col" className="py-1">{dowShort(d)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.hours.map((h, i) => (
                      <tr key={h} className="border-t border-breeze-100">
                        <th scope="row" className="py-1 text-left font-semibold tabular-nums">{h}:00</th>
                        {grid.rows[i].map((n, j) => (
                          <td key={j} className="py-1 tabular-nums">{n}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <p className="rounded-2xl bg-breeze-50 px-4 py-3 text-xs text-ink/70">{t("howTo")}</p>
        </>
      )}

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[70] max-w-60 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
          style={{ left: Math.min(Math.max(tip.x, 130), (typeof window === "undefined" ? 1000 : window.innerWidth) - 130), top: tip.y - 8 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
