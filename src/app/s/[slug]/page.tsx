"use client";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Globe2,
  MapPin,
  MessageCircle,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { ProBadge } from "@/components/ui/ProBadge";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { useAppLocale } from "@/components/Providers";
import { getAvailableSlots } from "@/lib/availability";
import { colorOf } from "@/lib/colors";
import {
  CATEGORIES,
  formatPrice,
  hoursFor,
  proById,
  prosOf,
  salonBySlug,
  serviceById,
  serviceName,
  servicesOf,
  type Appointment,
  type CategoryCode,
  type Professional,
} from "@/lib/mock/data";
import { addBookings, setStatus, useAppointments } from "@/lib/mock/store";
import { formatDuration } from "@/lib/format";
import { addDaysKey, addMinutes, atLocal, formatDayLong, formatDayShort, formatTime, localDateKey, toTZ } from "@/lib/time";

type Step = "services" | "pro" | "time" | "details" | "done";
const STEPS: Step[] = ["services", "pro", "time", "details"];
const DAYS_AHEAD = 14;

export default function SalonPage() {
  return (
    <Suspense>
      <Booking />
    </Suspense>
  );
}

function Booking() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const rescheduleGroup = params.get("reschedule");
  const t = useTranslations();
  const { locale } = useAppLocale();
  const salon = salonBySlug(slug);
  const { now, appointments, ready } = useAppointments();

  const [step, setStep] = useState<Step>("services");
  const [selected, setSelected] = useState<string[]>([]);
  const [proId, setProId] = useState<string | "any">("any");
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; proId: string } | null>(null);
  const [mode, setMode] = useState<"guest" | "account">("guest");
  const [form, setForm] = useState({ first: "", last: "", phone: "", email: "", whatsapp: true });
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment[] | null>(null);

  // Reprogramar: precarga servicios y profesional de la reserva original.
  const oldGroup = useMemo(
    () => (rescheduleGroup ? appointments.filter((a) => a.groupId === rescheduleGroup) : []),
    [appointments, rescheduleGroup],
  );
  useEffect(() => {
    if (oldGroup.length && selected.length === 0) {
      setSelected(oldGroup.map((a) => a.serviceId));
      setProId(oldGroup[0].professionalId);
      setForm((f) => ({ ...f, first: oldGroup[0].customerFirst, last: oldGroup[0].customerLast, phone: oldGroup[0].customerPhone }));
      setStep("time");
    }
  }, [oldGroup, selected.length]);

  useEffect(() => {
    if (now && !dateKey) setDateKey(localDateKey(now));
  }, [now, dateKey]);

  const services = salon ? servicesOf(salon.id) : [];
  const chosen = selected.map((id) => serviceById(id)!).filter(Boolean);
  const totalMin = chosen.reduce((s, v) => s + v.durationMin + v.bufferMin, 0);
  const serviceMin = chosen.reduce((s, v) => s + v.durationMin, 0);
  const totalCents = chosen.reduce((s, v) => s + v.priceCents, 0);
  const eligible: Professional[] = salon
    ? prosOf(salon.id).filter((p) => selected.every((id) => p.serviceIds.includes(id)))
    : [];
  const candidatePros = proId === "any" ? eligible : eligible.filter((p) => p.id === proId);

  const slotsFor = (key: string) => {
    if (!salon || !now) return [] as { start: Date; proId: string }[];
    const map = new Map<number, string>();
    for (const p of candidatePros) {
      const busy = appointments
        .filter((a) => a.professionalId === p.id && a.status !== "cancelled" && a.groupId !== rescheduleGroup)
        .map((a) => ({ start: new Date(a.startsAt), end: new Date(a.blockedUntil) }));
      const slots = getAvailableSlots({
        dateKey: key,
        workingHours: hoursFor(p, key),
        busy,
        totalMin,
        stepMin: salon.slotStepMin,
        now,
        minLeadMin: salon.minLeadMin,
      });
      for (const s of slots) if (!map.has(s.getTime())) map.set(s.getTime(), p.id);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([ms, pid]) => ({ start: new Date(ms), proId: pid }));
  };

  if (!salon) {
    return (
      <div className="min-h-dvh">
        <ClientHeader />
        <p className="p-10 text-center">{t("booking.notFound")}</p>
      </div>
    );
  }

  const days = now ? Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysKey(localDateKey(now), i)) : [];
  const daySlots = dateKey && step === "time" ? slotsFor(dateKey) : [];
  const groups = {
    morning: daySlots.filter((s) => toTZ(s.start).getHours() < 12),
    afternoon: daySlots.filter((s) => toTZ(s.start).getHours() >= 12 && toTZ(s.start).getHours() < 17),
    evening: daySlots.filter((s) => toTZ(s.start).getHours() >= 17),
  };

  const byCategory = services.reduce<Record<string, typeof services>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const formValid = form.first.trim() && form.last.trim() && form.phone.replace(/\D/g, "").length >= 7;

  function confirm() {
    if (!slot || !salon || !now) return;
    let t0 = slot.start;
    const groupId = `g-${Date.now()}`;
    const apps: Appointment[] = chosen.map((v, i) => {
      const start = t0;
      const end = addMinutes(start, v.durationMin);
      const blocked = addMinutes(end, v.bufferMin);
      t0 = blocked;
      return {
        id: `${groupId}-${i}`,
        groupId,
        salonId: salon.id,
        professionalId: slot.proId,
        serviceId: v.id,
        customerFirst: form.first.trim(),
        customerLast: form.last.trim(),
        customerPhone: form.phone.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        blockedUntil: blocked.toISOString(),
        status: "booked",
        source: "online",
        createdAt: new Date().toISOString(),
        mine: true,
      };
    });
    const current = appointments.filter((a) => a.groupId !== rescheduleGroup);
    if (addBookings(apps, current) === "conflict") {
      setError(t("booking.conflict"));
      setSlot(null);
      setStep("time");
      return;
    }
    if (oldGroup.length) setStatus(oldGroup.map((a) => a.id), "cancelled");
    setBooked(apps);
    setStep("done");
  }

  const stepIndex = STEPS.indexOf(step);
  const canContinue =
    (step === "services" && selected.length > 0) ||
    (step === "pro" && eligible.length > 0) ||
    (step === "time" && !!slot) ||
    (step === "details" && !!formValid);

  const next = () => {
    setError(null);
    if (step === "details") return confirm();
    setStep(STEPS[stepIndex + 1]);
  };
  const back = () => {
    setError(null);
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  // ─────────────────────────── Confirmación ───────────────────────────
  if (step === "done" && booked) {
    const pro = proById(booked[0].professionalId)!;
    return (
      <div className="min-h-dvh bg-breeze-sky">
        <ClientHeader />
        <main className="mx-auto max-w-md px-4 py-10 text-center animate-fade-up">
          <CheckCircle2 className="mx-auto size-16 text-breeze-500" />
          <h1 className="mt-4 text-3xl font-extrabold">{t("booking.doneTitle")}</h1>
          <p className="mt-2 text-ink/60">{t("booking.doneSubtitle")}</p>
          <div className="mt-6 rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-breeze-100">
            <p className="font-bold">{salon.name}</p>
            <p className="text-sm text-ink/60">{salon.address}</p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: colorOf(pro.color).hex + "14" }}>
              <ProBadge pro={pro} size="md" />
              <div>
                <p className="font-semibold">{pro.firstName} {pro.lastName.charAt(0)}.</p>
                <p className="text-sm text-ink/60">{t(`titles.${pro.title}`)}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {booked.map((a) => (
                <li key={a.id} className="flex justify-between text-sm">
                  <span>
                    <b>{formatTime(new Date(a.startsAt))}</b> · {serviceName(serviceById(a.serviceId)!, locale)}
                  </span>
                  <span className="text-ink/60">{formatPrice(serviceById(a.serviceId)!.priceCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-breeze-100 pt-3 text-sm font-semibold first-letter:uppercase">
              {formatDayLong(new Date(booked[0].startsAt), locale)}
            </p>
            <p className="text-xs text-ink/50">{t("booking.tzNote")}</p>
          </div>
          <div className="mt-4 rounded-2xl bg-white/70 p-4 text-left text-sm text-ink/70 ring-1 ring-breeze-100">
            <p className="inline-flex items-center gap-2 font-semibold text-ink">
              <MessageCircle className="size-4 text-green-600" /> {t("booking.reminderTitle")}
            </p>
            <p className="mt-1">{t("booking.reminderBody", { hours: salon.cancellationWindowHours })}</p>
            <p className="mt-2 text-xs italic text-ink/50">— Breeze</p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/me" className="rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">
              {t("booking.manage")}
            </Link>
            <Link href={`/live/${salon.slug}`} className="rounded-2xl px-5 py-3 text-sm font-semibold text-lagoon hover:bg-white">
              {t("booking.seeLive")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────── Flujo ───────────────────────────
  return (
    <div className="min-h-dvh bg-foam/40 pb-32">
      <ClientHeader />
      <div
        className="h-32 sm:h-40"
        style={{ background: `linear-gradient(135deg, ${salon.cover[0]}, ${salon.cover[1]})` }}
      />
      <main className="mx-auto -mt-12 max-w-2xl px-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100">
          <div className="flex flex-wrap gap-1.5">
            {salon.businessTypes.map((ty) => (
              <span key={ty} className="inline-flex items-center gap-1 rounded-full bg-breeze-50 px-2.5 py-1 text-xs font-bold text-lagoon">
                <TypeIcon type={ty} className="size-3.5" /> {t(`types.${ty}`)}
              </span>
            ))}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold">{salon.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/60">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t(`zones.${salon.zone}`)}</span>
            <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {salon.rating} ({salon.reviews})</span>
          </p>
          {rescheduleGroup && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{t("booking.rescheduling")}</p>
          )}
        </section>

        {/* Indicador de pasos */}
        <ol className="mt-5 flex items-center gap-2 text-xs font-bold">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${
                  i < stepIndex ? "bg-breeze-500 text-white" : i === stepIndex ? "bg-lagoon text-white" : "bg-white text-ink/40 ring-1 ring-breeze-100"
                }`}
              >
                {i < stepIndex ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={`hidden sm:inline ${i === stepIndex ? "text-ink" : "text-ink/40"}`}>{t(`booking.steps.${s}`)}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-breeze-200" />}
            </li>
          ))}
        </ol>

        <div className="mt-5 flex items-center gap-2">
          {stepIndex > 0 && (
            <button onClick={back} className="grid size-9 place-items-center rounded-full bg-white ring-1 ring-breeze-100 hover:bg-breeze-50" aria-label={t("common.back")}>
              <ArrowLeft className="size-4" />
            </button>
          )}
          <h2 className="text-xl font-bold">{t(`booking.headings.${step}`)}</h2>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

        {/* Paso 1: servicios */}
        {step === "services" && (
          <div className="mt-4 space-y-6 animate-fade-up">
            <p className="text-sm text-ink/60">{t("booking.multiHint")}</p>
            {Object.entries(byCategory).map(([cat, list]) => (
              <section key={cat}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink/50">
                  <TypeIcon type={CATEGORIES[cat as CategoryCode]} className="size-3.5" />
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
                        <span className="flex-1">
                          <span className="block font-semibold">{serviceName(v, locale)}</span>
                          <span className="inline-flex items-center gap-1 text-sm text-ink/50">
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
          </div>
        )}

        {/* Paso 2: profesional */}
        {step === "pro" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 animate-fade-up">
            {eligible.length === 0 && (
              <p className="col-span-full rounded-2xl bg-white p-6 text-center text-ink/60 ring-1 ring-breeze-100">{t("booking.noPro")}</p>
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
                  <span className="text-sm text-ink/50">{t("booking.anyProHint")}</span>
                </span>
              </button>
            )}
            {eligible.map((p) => {
              const c = colorOf(p.color);
              const on = proId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setProId(p.id)}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-breeze-100 transition hover:ring-breeze-300"
                  style={on ? { boxShadow: `0 0 0 2px ${c.hex}`, backgroundColor: c.hex + "0D" } : undefined}
                >
                  <ProBadge pro={p} size="lg" />
                  <span>
                    <span className="block font-bold">{p.firstName} {p.lastName.charAt(0)}.</span>
                    <span className="text-sm text-ink/50">{t(`titles.${p.title}`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Paso 3: día y hora */}
        {step === "time" && (
          <div className="mt-4 animate-fade-up">
            {!ready ? (
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
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink/50">
                  <Globe2 className="size-3.5" /> {t("booking.tzNote")} · {t("booking.blockNote", { min: totalMin })}
                </p>

                {daySlots.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-white p-6 text-center text-ink/60 ring-1 ring-breeze-100">{t("booking.noSlots")}</p>
                ) : (
                  (["morning", "afternoon", "evening"] as const).map(
                    (g) =>
                      groups[g].length > 0 && (
                        <section key={g} className="mt-4">
                          <h3 className="mb-2 text-sm font-bold text-ink/50">{t(`booking.${g}`)}</h3>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {groups[g].map((s) => {
                              const on = slot?.start.getTime() === s.start.getTime();
                              const p = proById(s.proId)!;
                              return (
                                <button
                                  key={s.start.toISOString()}
                                  onClick={() => setSlot(s)}
                                  className={`relative rounded-xl py-2.5 text-sm font-bold transition ${
                                    on ? "bg-lagoon text-white shadow" : "bg-white ring-1 ring-breeze-100 hover:ring-breeze-400"
                                  }`}
                                >
                                  {formatTime(s.start)}
                                  {proId === "any" && (
                                    <ProBadge pro={p} size="xs" className="absolute -right-1.5 -top-1.5" />
                                  )}
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

        {/* Paso 4: datos */}
        {step === "details" && slot && (
          <div className="mt-4 space-y-4 animate-fade-up">
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
              <ProBadge pro={proById(slot.proId)!} size="md" />
              <div className="text-sm">
                <p className="font-bold first-letter:uppercase">{formatDayLong(slot.start, locale)} · {formatTime(slot.start)}</p>
                <p className="text-ink/60">
                  {t("booking.with", { name: `${proById(slot.proId)!.firstName}` })} · {formatDuration(serviceMin)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 rounded-2xl bg-white p-1 ring-1 ring-breeze-100">
              {(["guest", "account"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    if (m === "account") setForm({ first: "Juan", last: "Pérez", phone: "+1 649 231 4455", email: "juan@example.com", whatsapp: true });
                  }}
                  className={`rounded-xl py-2 text-sm font-bold ${mode === m ? "bg-lagoon text-white" : "text-ink/60"}`}
                >
                  {t(`booking.mode.${m}`)}
                </button>
              ))}
            </div>
            {mode === "account" ? (
              <div className="flex items-center gap-3 rounded-2xl bg-breeze-50 p-4 text-sm">
                <UserRound className="size-8 text-lagoon" />
                <div>
                  <p className="font-bold">Juan Pérez</p>
                  <p className="text-ink/60">juan@example.com · +1 649 231 4455</p>
                  <p className="mt-1 text-xs text-ink/50">{t("booking.demoAccount")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
                <p className="text-sm text-ink/60">{t("booking.guestHint")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("booking.first")} value={form.first} onChange={(v) => setForm({ ...form, first: v })} autoComplete="given-name" />
                  <Field label={t("booking.last")} value={form.last} onChange={(v) => setForm({ ...form, last: v })} autoComplete="family-name" />
                </div>
                <Field label={t("booking.phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" placeholder="+1 649 …" autoComplete="tel" />
                <Field label={t("booking.email")} value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" autoComplete="email" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })} className="size-4 accent-[#0e7c86]" />
                  {t("booking.whatsappOptIn")}
                </label>
              </div>
            )}
            <p className="text-xs text-ink/50">{t("booking.policy", { hours: salon.cancellationWindowHours })}</p>
          </div>
        )}
      </main>

      {/* Barra inferior */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-breeze-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <div className="text-sm">
            <p className="font-bold">
              {selected.length ? t("booking.summary", { count: selected.length }) : t("booking.pickServices")}
            </p>
            {selected.length > 0 && (
              <p className="text-ink/60">
                {formatDuration(serviceMin)} · <b className="text-ink">{formatPrice(totalCents)}</b>
              </p>
            )}
          </div>
          <button
            onClick={next}
            disabled={!canContinue}
            className="rounded-2xl bg-lagoon px-6 py-3 font-bold text-white shadow transition hover:bg-breeze-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step === "details" ? t("booking.confirm") : t("common.continue")}
          </button>
        </div>
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
      <span className="text-xs font-bold text-ink/60">{label}</span>
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
