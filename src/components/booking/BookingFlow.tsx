"use client";
import { ArrowLeft, Check, CheckCircle2, Clock, Globe2, Loader2, LogIn, MapPin, MessageCircle, Star, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { LegalConsent } from "@/components/legal/LegalConsent";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { WHATSAPP_REMINDERS } from "@/lib/notifications/channels";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { ProBadge } from "@/components/ui/ProBadge";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { planSequence, slotsForPros, totalBlockMinutes, type BusyRange } from "@/lib/availability";
import { withAlpha } from "@/lib/colors";
import type { BookingData, ConfirmRequest, ConfirmResult, PublicService } from "@/lib/booking/types";
import { formatDuration } from "@/lib/format";
import { CATEGORIES, formatPrice } from "@/lib/mock/data";
import { addDaysKey, atLocal, formatDayLong, formatDayShort, formatTime, localDateKey, toTZ } from "@/lib/time";
import { ConfirmActions } from "./ConfirmActions";
import { PaymentInfo } from "./PaymentInfo";
import { Turnstile } from "./Turnstile";
import { useAppHref } from "@/lib/demo/useDemo";

type Step = "services" | "pro" | "time" | "details";
const STEPS: Step[] = ["services", "pro", "time", "details"];
const DAYS_AHEAD = 14;

export interface Account {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface BookingFlowProps {
  data: BookingData;
  /** Rangos ocupados (UTC). Al reprogramar NO incluyen los de la propia reserva. */
  busy: BusyRange[];
  now: Date | null;
  /** Cliente con sesión (datos reales). */
  account: Account | null;
  /** Prototipo: botón "Iniciar sesión" que rellena una cuenta de demostración. */
  demoAccount?: Account;
  /** Enlace para iniciar sesión (datos reales). */
  loginHref?: string;
  /** Reprogramar una reserva existente: se salta servicios, profesional y datos. */
  reschedule?: { serviceIds: string[]; professionalId: string } | null;
  onConfirm: (req: ConfirmRequest, proId: string) => Promise<ConfirmResult>;
  /** A dónde lleva "Gestionar mi cita" tras reservar. */
  manageHref: (r: Extract<ConfirmResult, { ok: true }>) => string;
  /** Datos reales: tras reservar como invitado se ofrece crear cuenta (la cita ya quedó guardada en este dispositivo). */
  accountPrompt?: { href: string };
  /** Clave pública de Cloudflare Turnstile: si existe, el invitado debe pasar el captcha antes de reservar. */
  captchaSiteKey?: string;
}

const svcName = (s: PublicService, locale: "en" | "es") => (locale === "es" ? s.nameEs : s.nameEn);

export function BookingFlow({
  data,
  busy,
  now,
  account,
  demoAccount,
  loginHref,
  reschedule,
  onConfirm,
  manageHref,
  accountPrompt,
  captchaSiteKey,
}: BookingFlowProps) {
  const t = useTranslations();
  const appHref = useAppHref();
  const { locale } = useAppLocale();
  const { salon, services, pros } = data;
  const isReschedule = !!reschedule;

  const [step, setStep] = useState<Step>(isReschedule ? "time" : "services");
  const [selected, setSelected] = useState<string[]>(reschedule?.serviceIds ?? []);
  const [proId, setProId] = useState<string | "any">(reschedule?.professionalId ?? "any");
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; proId: string } | null>(null);
  const [mode, setMode] = useState<"guest" | "account">(account ? "account" : "guest");
  const [form, setForm] = useState({ first: "", last: "", phone: "", email: "", whatsapp: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [done, setDone] = useState<Extract<ConfirmResult, { ok: true }> | null>(null);

  useEffect(() => {
    if (now && !dateKey) setDateKey(localDateKey(now));
  }, [now, dateKey]);

  const chosen = selected.map((id) => services.find((s) => s.id === id)).filter((s): s is PublicService => !!s);
  const totalMin = totalBlockMinutes(chosen);
  const serviceMin = chosen.reduce((s, v) => s + v.durationMin, 0);
  const totalCents = chosen.reduce((s, v) => s + v.priceCents, 0);
  const eligible = pros.filter((p) => selected.every((id) => p.serviceIds.includes(id)));
  const candidates = proId === "any" ? eligible : eligible.filter((p) => p.id === proId);
  const proOf = (id: string) => pros.find((p) => p.id === id)!;

  const slotsFor = (key: string) =>
    now
      ? slotsForPros({ dateKey: key, pros: candidates, busy, totalMin, stepMin: salon.slotStepMin, now, minLeadMin: salon.minLeadMin })
      : [];

  const days = useMemo(
    () => (now ? Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysKey(localDateKey(now), i)) : []),
    [now],
  );
  // Al llegar a «hora», si el día elegido (hoy, por defecto) no tiene huecos —domingo, fuera de horario, todo
  // ocupado— se salta al primer día que sí los tenga. Solo una vez por combinación de servicios y profesional:
  // si después la persona toca un día sin huecos, se respeta.
  const autoDay = useRef("");
  useEffect(() => {
    if (step !== "time" || !now || !dateKey) return;
    const key = `${selected.join(",")}|${proId}`;
    if (autoDay.current === key) return;
    autoDay.current = key;
    if (slotsFor(dateKey).length > 0) return;
    const first = days.find((k) => slotsFor(k).length > 0);
    if (first) setDateKey(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, now, dateKey, selected, proId]);
  const daySlots = dateKey && step === "time" ? slotsFor(dateKey) : [];
  const groups = {
    morning: daySlots.filter((s) => toTZ(s.start).getHours() < 12),
    afternoon: daySlots.filter((s) => toTZ(s.start).getHours() >= 12 && toTZ(s.start).getHours() < 17),
    evening: daySlots.filter((s) => toTZ(s.start).getHours() >= 17),
  };
  const byCategory = services.reduce<Record<string, PublicService[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const useAccount = mode === "account" && (account ?? demoAccount);
  const needsCaptcha = !!captchaSiteKey && !account && !useAccount;
  const formValid = !!useAccount || (form.first.trim() && form.phone.replace(/\D/g, "").length >= 7 && (!needsCaptcha || !!captchaToken));

  async function confirm() {
    if (!slot) return;
    setPending(true);
    setError(null);
    const acc = account ?? (mode === "account" ? demoAccount : undefined);
    const [first, ...rest] = (acc?.name ?? "").split(" ");
    const req: ConfirmRequest = {
      items: chosen.map((s) => ({ serviceId: s.id, professionalId: slot.proId })),
      startsAt: slot.start.toISOString(),
      captchaToken: needsCaptcha ? (captchaToken ?? undefined) : undefined,
      guest:
        account
          ? undefined
          : acc
            ? { firstName: first, lastName: rest.join(" "), phone: acc.phone ?? "", email: acc.email ?? undefined, whatsapp: WHATSAPP_REMINDERS, locale }
            : { firstName: form.first, lastName: form.last, phone: form.phone, email: form.email || undefined, whatsapp: WHATSAPP_REMINDERS && form.whatsapp, locale },
    };
    try {
      const r = await onConfirm(req, slot.proId);
      if (r.ok) setDone(r);
      else {
        setError(r.error);
        if (needsCaptcha) setCaptchaReset((n) => n + 1); // el token ya se usó: pedimos otro
        if (r.error === "slot_taken" || r.error === "outside_working_hours" || r.error === "too_soon") {
          setSlot(null);
          setStep("time");
        }
      }
    } catch {
      setError("generic");
    } finally {
      setPending(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const canContinue =
    (step === "services" && selected.length > 0) ||
    (step === "pro" && eligible.length > 0) ||
    (step === "time" && !!slot) ||
    (step === "details" && !!formValid);

  const next = () => {
    setError(null);
    if (step === "details" || (isReschedule && step === "time")) return void confirm();
    setStep(STEPS[stepIndex + 1]);
  };
  const back = () => {
    setError(null);
    if (stepIndex > 0 && !isReschedule) setStep(STEPS[stepIndex - 1]);
  };

  // ─────────────────────────── Confirmación ───────────────────────────
  if (done && slot) {
    const pro = proOf(slot.proId);
    const plan = planSequence(slot.start, chosen);
    return (
      <div className="min-h-dvh bg-breeze-sky">
        <ClientHeader />
        <main className="mx-auto max-w-md px-4 py-10 text-center animate-fade-up">
          <CheckCircle2 className="mx-auto size-16 text-breeze-500" />
          <h1 className="mt-4 text-3xl font-extrabold">{t(isReschedule ? "booking.rescheduledTitle" : "booking.doneTitle")}</h1>
          <p className="mt-2 text-ink/70">{t("booking.doneSubtitle")}</p>
          <div className="mt-6 rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-breeze-100">
            <p className="font-bold">{salon.name}</p>
            {salon.address && <p className="text-sm text-ink/70">{salon.address}</p>}
            <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: withAlpha(pro.colorHex, 0.08) }}>
              <ProBadge pro={pro} size="md" photoUrl={pro.photoUrl} />
              <div>
                <p className="font-semibold">{pro.firstName} {pro.lastName.charAt(0)}.</p>
                <p className="text-sm text-ink/70">{t(`titles.${pro.title}`)}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {chosen.map((s, i) => (
                <li key={s.id} className="flex justify-between text-sm">
                  <span>
                    <b>{formatTime(plan[i].start)}</b> · {svcName(s, locale)}
                  </span>
                  <span className="text-ink/70">{formatPrice(s.priceCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-breeze-100 pt-3 text-sm font-semibold first-letter:uppercase">{formatDayLong(slot.start, locale)}</p>
            <p className="text-xs text-ink/70">{t("booking.tzNote")}</p>
          </div>
          <ConfirmActions
            event={{
              title: `${chosen.map((s) => svcName(s, locale)).join(" + ")} · ${salon.name}`,
              start: plan[0].start,
              end: plan[plan.length - 1].end,
              location: [salon.name, salon.address].filter(Boolean).join(", "),
              description: `${pro.firstName} ${pro.lastName.charAt(0)}. — Breeze`,
            }}
            uid={`${salon.id}-${slot.start.getTime()}-${pro.id}`}
            salonName={salon.name}
            address={salon.address}
            phone={salon.phone}
          />
          <div className="mt-4 text-left">
            <PaymentInfo payment={pro.payment} name={pro.firstName} />
          </div>
          <div className="mt-4 rounded-2xl bg-white/70 p-4 text-left text-sm text-ink/70 ring-1 ring-breeze-100">
            <p className="inline-flex items-center gap-2 font-semibold text-ink">
              <MessageCircle className="size-4 text-green-600" /> {t("booking.reminderTitle")}
            </p>
            <p className="mt-1">{t("booking.reminderBody", { hours: salon.cancellationWindowHours })}</p>
            {done.guestToken && <p className="mt-2 font-semibold text-ink">{t("booking.guestLinkNote")}</p>}
            <p className="mt-2 text-xs italic text-ink/70">— Breeze</p>
          </div>
          {done.guestToken && accountPrompt && (
            <div className="mt-4 rounded-2xl bg-breeze-50 p-4 text-left text-sm text-ink/80 ring-1 ring-breeze-100">
              <p>
                <b className="text-ink">{t("booking.deviceSaved")}</b> {t("booking.deviceSavedHint")}
              </p>
              <Link href={accountPrompt.href} className="mt-3 block rounded-xl bg-white py-2.5 text-center font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-100">
                {t("booking.createAccountCta")}
              </Link>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Link href={appHref(manageHref(done))} className="rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">
              {t("booking.manage")}
            </Link>
            <Link href={appHref(`/live/${salon.slug}`)} className="rounded-2xl px-5 py-3 text-sm font-semibold text-lagoon hover:bg-white">
              {t("booking.seeLive")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────── Flujo ───────────────────────────
  const visibleSteps = isReschedule ? (["time"] as Step[]) : STEPS;
  return (
    <div className="min-h-dvh bg-foam/40 pb-32">
      <ClientHeader />
      <div className="relative h-32 overflow-hidden sm:h-40" style={{ background: `linear-gradient(135deg, ${salon.cover[0]}, ${salon.cover[1]})` }}>
        {salon.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={salon.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <main className="mx-auto -mt-12 max-w-2xl px-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100">
          <div className="flex flex-wrap gap-1.5">
            {salon.businessTypes.map((ty) => (
              <span key={ty} className="inline-flex items-center gap-1 rounded-full bg-breeze-50 px-2.5 py-1 text-xs font-bold text-lagoon">
                <TypeIcon type={ty} className="size-3.5" /> {t(`types.${ty}`)}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            {salon.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={salon.logoUrl} alt="" className="size-12 shrink-0 rounded-2xl object-cover ring-1 ring-breeze-100" />
            )}
            <h1 className="text-2xl font-extrabold">{salon.name}</h1>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/70">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t(`zones.${salon.zone}`)}</span>
            {salon.rating !== undefined && (
              <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {salon.rating} ({salon.reviews})</span>
            )}
            {salon.rating === undefined && data.reviews && (
              <span className="rounded-full bg-breeze-50 px-2 py-0.5 text-xs font-bold text-lagoon">{t("reviews.new")}</span>
            )}
          </p>
          {!isReschedule && salon.gallery && salon.gallery.length > 1 && (
            <ul className="-mx-5 mt-4 flex snap-x gap-2 overflow-x-auto px-5 pb-1 no-scrollbar" aria-label={t("photos.galleryLabel", { name: salon.name })}>
              {salon.gallery.map((u, i) => (
                <li key={u} className="shrink-0 snap-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={t("photos.photoOf", { name: salon.name, n: i + 1 })} loading="lazy" className="h-24 w-32 rounded-xl object-cover ring-1 ring-breeze-100" />
                </li>
              ))}
            </ul>
          )}
          {isReschedule && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{t("booking.rescheduling")}</p>}
        </section>

        {!isReschedule && (
          <ol className="mt-5 flex items-center gap-2 text-xs font-bold">
            {visibleSteps.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full ${
                    i < stepIndex ? "bg-breeze-500 text-white" : i === stepIndex ? "bg-lagoon text-white" : "bg-white text-ink/70 ring-1 ring-breeze-100"
                  }`}
                >
                  {i < stepIndex ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={`hidden sm:inline ${i === stepIndex ? "text-ink" : "text-ink/70"}`}>{t(`booking.steps.${s}`)}</span>
                {i < visibleSteps.length - 1 && <span className="h-px flex-1 bg-breeze-200" />}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 flex items-center gap-2">
          {stepIndex > 0 && !isReschedule && (
            <button onClick={back} className="grid size-9 place-items-center rounded-full bg-white ring-1 ring-breeze-100 hover:bg-breeze-50" aria-label={t("common.back")}>
              <ArrowLeft className="size-4" />
            </button>
          )}
          <h2 className="text-xl font-bold">{t(`booking.headings.${step}`)}</h2>
        </div>

        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{t(`booking.errors.${error}`)}</p>}

        {step === "services" && (
          <div className="mt-4 space-y-6 animate-fade-up">
            <p className="text-sm text-ink/70">{t("booking.multiHint")}</p>
            {services.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-ink/70 ring-1 ring-breeze-100">{t("booking.noServices")}</p>}
            {Object.entries(byCategory).map(([cat, list]) => (
              <section key={cat}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink/70">
                  <TypeIcon type={CATEGORIES[cat as keyof typeof CATEGORIES]} className="size-3.5" />
                  {t(`categories.${cat}`)}
                </h3>
                <div className="space-y-2">
                  {list.map((v) => {
                    const on = selected.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelected((s) => (on ? s.filter((x) => x !== v.id) : [...s, v.id]))}
                        aria-pressed={on}
                        className={`flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 transition ${
                          on ? "ring-2 ring-breeze-500 shadow-sm" : "ring-breeze-100 hover:ring-breeze-300"
                        }`}
                      >
                        <span className={`grid size-6 shrink-0 place-items-center rounded-lg ${on ? "bg-breeze-500 text-white" : "ring-1 ring-breeze-200"}`}>
                          {on && <Check className="size-4" />}
                        </span>
                        {v.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.photoUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl object-cover" />
                        )}
                        <span className="flex-1">
                          <span className="block font-semibold">{svcName(v, locale)}</span>
                          <span className="inline-flex items-center gap-1 text-sm text-ink/70">
                            <Clock className="size-3.5" /> {formatDuration(v.durationMin)}
                          </span>
                        </span>
                        <span className="font-bold">{formatPrice(v.priceCents)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {data.reviews && <ReviewsList salonId={salon.id} reviews={data.reviews} />}
          </div>
        )}

        {step === "pro" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 animate-fade-up">
            {eligible.length === 0 && (
              <p className="col-span-full rounded-2xl bg-white p-6 text-center text-ink/70 ring-1 ring-breeze-100">{t("booking.noPro")}</p>
            )}
            {eligible.length > 0 && (
              <button
                onClick={() => setProId("any")}
                className={`flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 transition ${
                  proId === "any" ? "ring-2 ring-breeze-500" : "ring-breeze-100 hover:ring-breeze-300"
                }`}
              >
                <span className="grid size-14 place-items-center rounded-full bg-breeze-50 text-lagoon">
                  <Users className="size-6" />
                </span>
                <span>
                  <span className="block font-bold">{t("booking.anyPro")}</span>
                  <span className="text-sm text-ink/70">{t("booking.anyProHint")}</span>
                </span>
              </button>
            )}
            {eligible.map((p) => {
              const on = proId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setProId(p.id)}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-breeze-100 transition hover:ring-breeze-300"
                  style={on ? { boxShadow: `0 0 0 2px ${p.colorHex}`, backgroundColor: withAlpha(p.colorHex, 0.05) } : undefined}
                >
                  <ProBadge pro={p} size="lg" photoUrl={p.photoUrl} />
                  <span>
                    <span className="block font-bold">{p.firstName} {p.lastName.charAt(0)}.</span>
                    <span className="text-sm text-ink/70">{t(`titles.${p.title}`)}</span>
                    {p.rating && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-ink/70">
                        <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" /> {p.rating.avg.toFixed(1)} ({p.rating.count})
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === "time" && (
          <div className="mt-4 animate-fade-up">
            {!now ? (
              <div className="h-40 animate-pulse rounded-3xl bg-white" />
            ) : (
              <>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
                  {days.map((k) => {
                    const d = atLocal(k, "12:00");
                    const on = k === dateKey;
                    const has = slotsFor(k).length > 0;
                    return (
                      <button
                        key={k}
                        onClick={() => {
                          setDateKey(k);
                          setSlot(null);
                        }}
                        className={`flex w-16 shrink-0 flex-col items-center rounded-2xl py-2.5 transition ${
                          on ? "bg-lagoon text-white shadow" : "bg-white ring-1 ring-breeze-100 hover:ring-breeze-300"
                        } ${!has && !on ? "opacity-40" : ""}`}
                      >
                        <span className="text-[11px] font-bold uppercase">{formatDayShort(d, locale).split(/[ ,]/)[0]}</span>
                        <span className="text-xl font-extrabold">{toTZ(d).getDate()}</span>
                        <span className={`mt-0.5 size-1.5 rounded-full ${has ? (on ? "bg-white" : "bg-breeze-500") : "bg-transparent"}`} />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink/70">
                  <Globe2 className="size-3.5" /> {t("booking.tzNote")} · {t("booking.blockNote", { min: totalMin })}
                </p>
                {daySlots.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-white p-6 text-center text-ink/70 ring-1 ring-breeze-100">{t("booking.noSlots")}</p>
                ) : (
                  (["morning", "afternoon", "evening"] as const).map(
                    (g) =>
                      groups[g].length > 0 && (
                        <section key={g} className="mt-4">
                          <h3 className="mb-2 text-sm font-bold text-ink/70">{t(`booking.${g}`)}</h3>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {groups[g].map((s) => {
                              const on = slot?.start.getTime() === s.start.getTime();
                              return (
                                <button
                                  key={s.start.toISOString()}
                                  onClick={() => setSlot(s)}
                                  className={`relative rounded-xl py-2.5 text-sm font-bold transition ${
                                    on ? "bg-lagoon text-white shadow" : "bg-white ring-1 ring-breeze-100 hover:ring-breeze-400"
                                  }`}
                                >
                                  {formatTime(s.start)}
                                  {proId === "any" && <ProBadge pro={proOf(s.proId)} size="xs" className="absolute -right-1.5 -top-1.5" />}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ),
                  )
                )}
              </>
            )}
          </div>
        )}

        {step === "details" && slot && (
          <div className="mt-4 space-y-4 animate-fade-up">
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
              <ProBadge pro={proOf(slot.proId)} size="md" photoUrl={proOf(slot.proId).photoUrl} />
              <div className="text-sm">
                <p className="font-bold first-letter:uppercase">{formatDayLong(slot.start, locale)} · {formatTime(slot.start)}</p>
                <p className="text-ink/70">{t("booking.with", { name: proOf(slot.proId).firstName })} · {formatDuration(serviceMin)}</p>
              </div>
            </div>

            <PaymentInfo payment={proOf(slot.proId).payment} name={proOf(slot.proId).firstName} />

            {account ? (
              <AccountCard account={account} note={t("booking.signedIn")} />
            ) : (
              <>
                <div className="grid grid-cols-2 rounded-2xl bg-white p-1 ring-1 ring-breeze-100">
                  {(["guest", "account"] as const).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={`rounded-xl py-2 text-sm font-bold ${mode === m ? "bg-lagoon text-white" : "text-ink/70"}`}>
                      {t(`booking.mode.${m}`)}
                    </button>
                  ))}
                </div>
                {mode === "account" ? (
                  demoAccount ? (
                    <AccountCard account={demoAccount} note={t("booking.demoAccount")} />
                  ) : (
                    <Link href={loginHref ?? "/login"} className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 font-bold text-lagoon ring-1 ring-breeze-100">
                      <LogIn className="size-4" /> {t("booking.goLogin")}
                    </Link>
                  )
                ) : (
                  <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
                    <p className="text-sm text-ink/70">{t("booking.guestHint")}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("booking.first")} value={form.first} onChange={(v) => setForm({ ...form, first: v })} autoComplete="given-name" />
                      <Field label={t("booking.last")} value={form.last} onChange={(v) => setForm({ ...form, last: v })} autoComplete="family-name" />
                    </div>
                    <Field label={t("booking.phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" placeholder="+1 649 …" autoComplete="tel" />
                    <Field label={t("booking.email")} value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" autoComplete="email" />
                    <p className="-mt-1 text-xs text-ink/70">{t("booking.emailHint")}</p>
                    {WHATSAPP_REMINDERS && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })} className="size-4 accent-[#0e7c86]" />
                        {t("booking.whatsappOptIn")}
                      </label>
                    )}
                    {captchaSiteKey && <Turnstile siteKey={captchaSiteKey} onToken={setCaptchaToken} resetKey={captchaReset} lang={locale} />}
                  </div>
                )}
              </>
            )}
            <p className="text-xs text-ink/70">{t("booking.policy", { hours: salon.cancellationWindowHours })}</p>
            {!isReschedule && !useAccount && <p className="text-xs text-ink/70"><LegalConsent kind="booking" /></p>}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-breeze-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <div className="text-sm">
            <p className="font-bold">{selected.length ? t("booking.summary", { count: selected.length }) : t("booking.pickServices")}</p>
            {selected.length > 0 && (
              <p className="text-ink/70">
                {formatDuration(serviceMin)} · <b className="text-ink">{formatPrice(totalCents)}</b>
              </p>
            )}
          </div>
          <button
            onClick={next}
            disabled={!canContinue || pending}
            className="inline-flex items-center gap-2 rounded-2xl bg-lagoon px-6 py-3 font-bold text-white shadow transition hover:bg-breeze-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {step === "details" ? t("booking.confirm") : isReschedule ? t("booking.confirmReschedule") : t("common.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountCard({ account, note }: { account: Account; note: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-breeze-50 p-4 text-sm">
      <UserRound className="size-8 text-lagoon" />
      <div>
        <p className="font-bold">{account.name}</p>
        <p className="text-ink/70">{[account.email, account.phone].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 text-xs text-ink/70">{note}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink/70">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 outline-none ring-1 ring-breeze-100 focus:ring-2 focus:ring-breeze-400"
      />
    </label>
  );
}
