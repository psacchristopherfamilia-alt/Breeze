"use client";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { completeSetup } from "@/app/dashboard/actions";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import { PRO_COLORS } from "@/lib/colors";
import { formatDuration } from "@/lib/format";
import type { BusinessType } from "@/lib/mock/data";
import { templatesFor } from "@/lib/panel/service-templates";
import { Toggle } from "./LiveProfessionals";
import { SalonQr } from "./SalonQr";

const TITLES = ["barber", "stylist", "nail_tech", "makeup_artist", "esthetician", "massage_therapist", "other"] as const;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const OPEN_TIMES = ["06:00", "07:00", "08:00", "08:30", "09:00", "09:30", "10:00", "11:00", "12:00"];
const CLOSE_TIMES = ["14:00", "15:00", "16:00", "17:00", "17:30", "18:00", "18:30", "19:00", "20:00", "21:00", "22:00"];
const TITLE_BY_TYPE: Record<BusinessType, (typeof TITLES)[number]> = { barbershop: "barber", salon: "stylist", spa: "massage_therapist" };

const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function SetupWizard({
  salon,
  types,
  hasServices,
  hasPro,
  defaultFirst,
  defaultLast,
}: {
  salon: { id: string; name: string; slug: string };
  types: BusinessType[];
  hasServices: boolean;
  hasPro: boolean;
  defaultFirst: string;
  defaultLast: string;
}) {
  const t = useTranslations("wizard");
  const tt = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const options = templatesFor(types);
  const [step, setStep] = useState(hasServices ? (hasPro ? 3 : 2) : 1);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(options.map((o) => [o.key, true])));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [pro, setPro] = useState({
    firstName: defaultFirst,
    lastName: defaultLast,
    title: TITLE_BY_TYPE[types[0] ?? "barbershop"],
    colorHex: PRO_COLORS[0].hex as string,
    acceptsCash: true,
    acceptsCard: false,
    acceptsTransfer: false,
    paymentNote: "",
  });
  // Por defecto, el mismo horario de lunes a sábado; cada profesional puede cambiarlo después.
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const chosen = options.filter((o) => picked[o.key]);
  const priceOf = (o: (typeof options)[number]) => {
    const v = Number((prices[o.key] ?? (o.priceCents / 100).toFixed(2)).replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : o.priceCents;
  };
  const serviceCount = hasServices ? null : chosen.length;
  const proName = `${pro.firstName} ${pro.lastName.charAt(0)}${pro.lastName ? "." : ""}`.trim();

  const stepOk =
    step === 1 ? hasServices || chosen.length > 0
    : step === 2 ? hasPro || (pro.firstName.trim().length > 0 && (pro.acceptsCash || pro.acceptsCard || pro.acceptsTransfer) && (!pro.acceptsTransfer || pro.paymentNote.trim().length > 0))
    : step === 3 ? days.length > 0 && start < end
    : true;

  const submit = (publish: boolean) =>
    run(async () => {
      setError(null);
      const r = await completeSetup({
        salonId: salon.id,
        services: chosen.map((o) => ({ categoryCode: o.category, nameEn: o.nameEn, nameEs: o.nameEs, durationMin: o.durationMin, bufferMin: o.bufferMin, priceCents: priceOf(o) })),
        pro: { ...pro, firstName: pro.firstName.trim(), lastName: pro.lastName.trim() },
        days,
        start,
        end,
        publish,
      });
      if (!r.ok) return setError(r.error);
      if (r.published) setPublished(true);
      else router.push("/dashboard");
      router.refresh();
    });

  if (published) {
    return (
      <div className="mx-auto max-w-xl p-4 lg:p-8">
        <section className="rounded-3xl bg-white p-6 text-center ring-1 ring-breeze-100">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-breeze-50 text-breeze-500"><Check className="size-8" strokeWidth={3} /></span>
          <h1 className="mt-3 text-2xl font-extrabold">{t("publishedTitle")}</h1>
          <p className="mt-1 text-ink/70">{t("publishedHint")}</p>
          <div className="mt-5 text-left"><SalonQr slug={salon.slug} name={salon.name} /></div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href={`/s/${salon.slug}`} target="_blank" className="rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">{t("viewPage")}</Link>
            <Link href="/dashboard" className="rounded-2xl bg-white px-5 py-3 font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50">{t("goPanel")}</Link>
          </div>
        </section>
      </div>
    );
  }

  const field = "mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100";
  return (
    <div className="mx-auto max-w-xl p-4 lg:p-8">
      <p className="text-sm font-semibold text-ink/70">{salon.name}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ink/70">{t("step", { a: step, b: 4 })}</p>
      <div className="mt-2 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-label={t("step", { a: step, b: 4 })}>
        {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-breeze-500" : "bg-breeze-100"}`} />)}
      </div>

      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
        {step === 1 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("s1Title")}</h1>
            <p className="mt-1 text-sm text-ink/70">{hasServices ? t("s1Have") : t("s1Hint")}</p>
            {!hasServices && (
              <div className="mt-3 divide-y divide-breeze-50">
                {options.map((o) => (
                  <label key={o.key} className="flex items-center gap-3 py-2.5 text-sm">
                    <input type="checkbox" checked={!!picked[o.key]} onChange={(e) => setPicked({ ...picked, [o.key]: e.target.checked })} className="size-4 accent-lagoon" />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{locale === "es" ? o.nameEs : o.nameEn}</span>
                      <span className="ml-2 text-xs text-ink/70">{formatDuration(o.durationMin)}</span>
                    </span>
                    <span className="text-ink/70">$</span>
                    <input
                      inputMode="decimal"
                      aria-label={`${locale === "es" ? o.nameEs : o.nameEn} (USD)`}
                      value={prices[o.key] ?? (o.priceCents / 100).toFixed(2)}
                      onChange={(e) => setPrices({ ...prices, [o.key]: e.target.value })}
                      className="w-20 rounded-lg bg-foam px-2 py-1.5 text-right ring-1 ring-breeze-100"
                    />
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("s2Title")}</h1>
            <p className="mt-1 text-sm text-ink/70">{hasPro ? t("s2Have") : t("s2Hint")}</p>
            {!hasPro && (
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-xs font-bold text-ink/70">{tt("booking.first")}</span>
                    <input value={pro.firstName} onChange={(e) => setPro({ ...pro, firstName: e.target.value })} className={field} autoComplete="given-name" /></label>
                  <label className="block"><span className="text-xs font-bold text-ink/70">{tt("booking.last")}</span>
                    <input value={pro.lastName} onChange={(e) => setPro({ ...pro, lastName: e.target.value })} className={field} autoComplete="family-name" /></label>
                </div>
                <label className="block"><span className="text-xs font-bold text-ink/70">{tt("pros.role")}</span>
                  <select value={pro.title} onChange={(e) => setPro({ ...pro, title: e.target.value as (typeof TITLES)[number] })} className={field}>
                    {TITLES.map((ti) => <option key={ti} value={ti}>{tt(`titles.${ti}`)}</option>)}
                  </select></label>
                <div>
                  <p className="text-xs font-bold text-ink/70">{tt("pros.color")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PRO_COLORS.map((c) => (
                      <button key={c.key} type="button" onClick={() => setPro({ ...pro, colorHex: c.hex })} aria-pressed={pro.colorHex === c.hex} aria-label={c[locale]}
                        className="grid size-9 place-items-center rounded-full text-white ring-offset-2" style={{ backgroundColor: c.hex, boxShadow: pro.colorHex === c.hex ? `0 0 0 2px #fff, 0 0 0 4px ${c.hex}` : undefined }}>
                        {pro.colorHex === c.hex && <Check className="size-4" strokeWidth={3} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-foam p-3">
                  <ProBadge pro={{ firstName: pro.firstName || "?", lastName: pro.lastName || "?", colorHex: pro.colorHex }} size="lg" />
                  <div><p className="font-bold">{proName || tt("pros.namePlaceholder")}</p><p className="text-xs text-ink/70">{tt("pros.publicPreview")}</p></div>
                </div>
                <div className="space-y-2 rounded-2xl bg-foam p-3">
                  <p className="text-xs font-bold text-ink/70">{tt("pros.paymentTitle")}</p>
                  <Toggle label={tt("booking.pay.cash")} checked={pro.acceptsCash} onChange={(v) => setPro({ ...pro, acceptsCash: v })} />
                  <Toggle label={tt("booking.pay.card")} checked={pro.acceptsCard} onChange={(v) => setPro({ ...pro, acceptsCard: v })} />
                  <Toggle label={tt("booking.pay.transfer")} checked={pro.acceptsTransfer} onChange={(v) => setPro({ ...pro, acceptsTransfer: v })} />
                  {pro.acceptsTransfer && (
                    <label className="block"><span className="text-xs font-bold text-ink/70">{tt("pros.transferDetails")}</span>
                      <textarea value={pro.paymentNote} maxLength={400} rows={3} onChange={(e) => setPro({ ...pro, paymentNote: e.target.value })} placeholder={tt("pros.transferPlaceholder")} className="mt-1 w-full rounded-xl bg-white px-3 py-2.5 ring-1 ring-breeze-100" />
                      <span className="mt-1 block text-xs text-ink/70">{tt("pros.transferPublic")}</span></label>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("s3Title")}</h1>
            <p className="mt-1 text-sm text-ink/70">{t("s3Hint")}</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label={t("s3Title")}>
              {DAY_ORDER.map((d) => {
                const on = days.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={`min-w-0 rounded-xl py-2.5 text-xs font-bold ring-2 ${on ? "bg-breeze-50 text-lagoon ring-breeze-400" : "bg-white text-ink/70 ring-breeze-100"}`}>
                    {tt(`weekdays.${d}`)}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <label className="block"><span className="text-xs font-bold text-ink/70">{t("opens")}</span>
                <select value={start} onChange={(e) => setStart(e.target.value)} className={field}>{OPEN_TIMES.map((h) => <option key={h} value={h}>{fmt12(h)}</option>)}</select></label>
              <label className="block"><span className="text-xs font-bold text-ink/70">{t("closes")}</span>
                <select value={end} onChange={(e) => setEnd(e.target.value)} className={field}>{CLOSE_TIMES.map((h) => <option key={h} value={h}>{fmt12(h)}</option>)}</select></label>
            </div>
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="mt-3 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50">{t("everyDay")}</button>
            <p className="mt-3 text-xs text-ink/70">{t("hoursLater")}</p>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("s4Title")}</h1>
            <p className="mt-1 text-sm text-ink/70">{t("s4Hint")}</p>
            <ul className="mt-4 space-y-2 text-sm font-semibold">
              {[
                serviceCount === null ? t("sumServicesHave") : t("sumServices", { count: serviceCount }),
                hasPro ? t("sumProHave") : t("sumPro", { name: proName }),
                t("sumHours", { days: days.length, from: fmt12(start), to: fmt12(end) }),
              ].map((line) => (
                <li key={line} className="flex items-center gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-green-600 text-white"><Check className="size-3" strokeWidth={3.5} /></span>{line}</li>
              ))}
            </ul>
          </>
        )}

        {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{tt(`panel.errors.${error}`)}</p>}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {step > 1 ? <button type="button" onClick={() => { setError(null); setStep(step - 1); }} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold ring-1 ring-breeze-200 hover:bg-breeze-50">{t("back")}</button> : <span />}
        <Link href="/dashboard" className="text-sm font-semibold text-ink/70 hover:underline">{t("skip")}</Link>
        {step < 4 ? (
          <button type="button" disabled={!stepOk} onClick={() => setStep(step + 1)} className="rounded-xl bg-lagoon px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-breeze-800 disabled:opacity-50">{t("next")}</button>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button type="button" disabled={pending} onClick={() => submit(false)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold ring-1 ring-breeze-200 hover:bg-breeze-50 disabled:opacity-50">{t("saveOnly")}</button>
            <button type="button" disabled={pending} onClick={() => submit(true)} className="rounded-xl bg-lagoon px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-breeze-800 disabled:opacity-50">{t("publish")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
