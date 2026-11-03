"use client";
import { ChevronLeft, ChevronRight, MonitorPlay, Phone, Plus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useSalon } from "@/components/agenda/DashboardShell";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import { getAvailableSlots } from "@/lib/availability";
import { colorOf, withAlpha } from "@/lib/colors";
import { formatDuration } from "@/lib/format";
import {
  formatPrice,
  hoursFor,
  proById,
  prosOf,
  serviceById,
  serviceName,
  type Appointment,
  type AppointmentStatus,
  type BookingSource,
} from "@/lib/mock/data";
import { addBookings, setStatus, useAppointments } from "@/lib/mock/store";
import { addDaysKey, addMinutes, atLocal, formatDayLong, formatTime, localDateKey, minutesOfDay } from "@/lib/time";

const START_H = 8;
const END_H = 20;
const PX = 1.15; // píxeles por minuto

export default function AgendaPage() {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const { salon } = useSalon();
  const { now, appointments, ready } = useAppointments();
  const pros = prosOf(salon.id);

  const [dateKey, setDateKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (now && !dateKey) setDateKey(localDateKey(now));
  }, [now, dateKey]);
  useEffect(() => setHidden([]), [salon.id]);

  const dayApps = useMemo(
    () =>
      dateKey
        ? appointments.filter(
            (a) => a.salonId === salon.id && localDateKey(new Date(a.startsAt)) === dateKey && a.status !== "cancelled",
          )
        : [],
    [appointments, dateKey, salon.id],
  );

  if (!ready || !dateKey || !now) return <div className="m-6 h-96 animate-pulse rounded-3xl bg-white" />;

  const visible = pros.filter((p) => !hidden.includes(p.id));
  const isToday = dateKey === localDateKey(now);
  const revenue = dayApps.filter((a) => a.status !== "no_show").reduce((s, a) => s + serviceById(a.serviceId)!.priceCents, 0);
  const online = dayApps.filter((a) => a.source === "online").length;
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const nowTop = (minutesOfDay(now) - START_H * 60) * PX;

  return (
    <div className="p-4 lg:p-8">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/50">{salon.name}</p>
          <h1 className="text-2xl font-extrabold first-letter:uppercase">{formatDayLong(atLocal(dateKey, "12:00"), locale)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-white ring-1 ring-breeze-100">
            <button onClick={() => setDateKey(addDaysKey(dateKey, -1))} className="p-2 hover:text-lagoon" aria-label={t("panel.prevDay")}>
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => setDateKey(localDateKey(now))}
              className={`px-3 text-sm font-bold ${isToday ? "text-lagoon" : "text-ink/60 hover:text-ink"}`}
            >
              {t("panel.today")}
            </button>
            <button onClick={() => setDateKey(addDaysKey(dateKey, 1))} className="p-2 hover:text-lagoon" aria-label={t("panel.nextDay")}>
              <ChevronRight className="size-5" />
            </button>
          </div>
          <Link
            href={`/live/${salon.slug}`}
            target="_blank"
            className="hidden items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-ink/70 ring-1 ring-breeze-100 hover:text-lagoon sm:inline-flex"
          >
            <MonitorPlay className="size-4" /> Live
          </Link>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800"
          >
            <Plus className="size-4" /> {t("panel.newBooking")}
          </button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("panel.kpi.bookings"), dayApps.length],
          [t("panel.kpi.online"), dayApps.length ? `${Math.round((online / dayApps.length) * 100)}%` : "—"],
          [t("panel.kpi.revenue"), formatPrice(revenue)],
          [t("panel.kpi.noShows"), dayApps.filter((a) => a.status === "no_show").length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
            <p className="text-xs font-semibold text-ink/50">{label}</p>
            <p className="mt-1 text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      {/* Filtro por profesional / color (siempre con nombre) */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink/40">{t("panel.filter")}</span>
        {pros.map((p) => {
          const on = !hidden.includes(p.id);
          const c = colorOf(p.color);
          const count = dayApps.filter((a) => a.professionalId === p.id).length;
          return (
            <button
              key={p.id}
              onClick={() => setHidden((h) => (on ? [...h, p.id] : h.filter((x) => x !== p.id)))}
              aria-pressed={on}
              className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold ring-1 transition"
              style={
                on
                  ? { backgroundColor: withAlpha(c.hex, 0.1), boxShadow: `inset 0 0 0 1.5px ${c.hex}`, color: c.hex }
                  : { backgroundColor: "white", color: "rgba(15,42,51,.4)", boxShadow: "inset 0 0 0 1px #d5f4f2" }
              }
            >
              <span className={on ? "" : "opacity-40 grayscale"}>
                <ProBadge pro={p} size="sm" />
              </span>
              {p.firstName} {p.lastName.charAt(0)}.
              <span className="rounded-full bg-white/80 px-1.5 text-xs">{count}</span>
            </button>
          );
        })}
        {hidden.length > 0 && (
          <button onClick={() => setHidden([])} className="text-xs font-semibold text-lagoon underline">
            {t("panel.showAll")}
          </button>
        )}
      </div>

      {/* Agenda por columnas */}
      <div className="mt-4 overflow-x-auto rounded-3xl bg-white ring-1 ring-breeze-100">
        <div className="flex min-w-fit">
          {/* Columna de horas */}
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-breeze-100 bg-white">
            <div className="h-16 border-b border-breeze-100" />
            <div className="relative" style={{ height: (END_H - START_H) * 60 * PX }}>
              {hours.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-2 text-[11px] font-semibold text-ink/40" style={{ top: (h - START_H) * 60 * PX }}>
                  {h > 12 ? h - 12 : h} {h >= 12 ? "PM" : "AM"}
                </span>
              ))}
            </div>
          </div>

          {visible.map((p) => {
            const c = colorOf(p.color);
            const work = hoursFor(p, dateKey);
            const apps = dayApps.filter((a) => a.professionalId === p.id);
            return (
              <div key={p.id} className="w-52 shrink-0 border-r border-breeze-100 last:border-r-0 sm:w-60">
                <div className="sticky top-0 flex h-16 items-center gap-2 border-b-4 px-3" style={{ borderColor: c.hex, backgroundColor: withAlpha(c.hex, 0.06) }}>
                  <ProBadge pro={p} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.firstName} {p.lastName.charAt(0)}.</p>
                    <p className="truncate text-xs text-ink/50">{t(`titles.${p.title}`)} · {apps.length}</p>
                  </div>
                </div>
                <div className="relative bg-ink/[0.035]" style={{ height: (END_H - START_H) * 60 * PX }}>
                  {/* Horario laboral en blanco */}
                  {work.map(([a, b]) => {
                    const top = (minutesOfDay(atLocal(dateKey, a)) - START_H * 60) * PX;
                    const h = (minutesOfDay(atLocal(dateKey, b)) - minutesOfDay(atLocal(dateKey, a))) * PX;
                    return <div key={a} className="absolute inset-x-0 bg-white" style={{ top, height: h }} />;
                  })}
                  {work.length === 0 && (
                    <p className="absolute inset-x-0 top-6 text-center text-xs font-semibold text-ink/40">{t("panel.dayOff")}</p>
                  )}
                  {hours.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-dashed border-breeze-100" style={{ top: (h - START_H) * 60 * PX }} />
                  ))}
                  {apps.map((a) => {
                    const s = new Date(a.startsAt);
                    const svc = serviceById(a.serviceId)!;
                    const top = (minutesOfDay(s) - START_H * 60) * PX;
                    const h = svc.durationMin * PX;
                    const done = a.status === "completed" || a.status === "no_show";
                    return (
                      <div key={a.id} className="absolute inset-x-1.5" style={{ top }}>
                        <button
                          onClick={() => setDetail(a)}
                          className={`block w-full overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:shadow-md ${done ? "opacity-55" : ""}`}
                          style={{ height: h - 2, borderColor: c.hex, backgroundColor: withAlpha(c.hex, 0.13) }}
                        >
                          <p className="font-bold" style={{ color: c.hex }}>
                            {formatTime(s)} {a.source !== "online" && <Phone className="inline size-3" />}
                            {a.status === "no_show" && <span className="ml-1 rounded bg-red-600 px-1 text-[9px] text-white">NO-SHOW</span>}
                          </p>
                          <p className="truncate font-semibold text-ink">{a.customerFirst} {a.customerLast}</p>
                          {h > 44 && <p className="truncate text-ink/60">{serviceName(svc, locale)}</p>}
                        </button>
                        {svc.bufferMin > 0 && (
                          <div className="bg-buffer mx-1 rounded-b" style={{ height: svc.bufferMin * PX - 1 }} title={t("panel.buffer")} />
                        )}
                      </div>
                    );
                  })}
                  {isToday && nowTop > 0 && nowTop < (END_H - START_H) * 60 * PX && (
                    <div className="absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: nowTop }}>
                      <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-ink/50">
        <span className="bg-buffer inline-block h-3 w-6 rounded ring-1 ring-ink/10" /> {t("panel.bufferLegend")} ·
        <Phone className="size-3" /> {t("panel.phoneLegend")}
      </p>

      {detail && <DetailModal a={detail} onClose={() => setDetail(null)} />}
      {creating && (
        <NewBookingModal dateKey={dateKey} now={now} appointments={appointments} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl animate-fade-up sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-breeze-50" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DetailModal({ a, onClose }: { a: Appointment; onClose: () => void }) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const pro = proById(a.professionalId)!;
  const svc = serviceById(a.serviceId)!;
  const s = new Date(a.startsAt);
  const act = (status: AppointmentStatus) => {
    setStatus([a.id], status);
    onClose();
  };
  return (
    <Modal title={`${a.customerFirst} ${a.customerLast}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: withAlpha(colorOf(pro.color).hex, 0.08) }}>
          <ProBadge pro={pro} size="md" />
          <div>
            <p className="font-bold">{serviceName(svc, locale)}</p>
            <p className="text-ink/60">
              {formatTime(s)} – {formatTime(new Date(a.endsAt))} · {formatDuration(svc.durationMin)} · {formatPrice(svc.priceCents)}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-ink/50">{t("panel.detail.phone")}</dt>
          <dd className="font-semibold">{a.customerPhone}</dd>
          <dt className="text-ink/50">{t("panel.detail.source")}</dt>
          <dd className="font-semibold">{t(`sources.${a.source}`)}</dd>
          <dt className="text-ink/50">{t("panel.detail.status")}</dt>
          <dd className="font-semibold">{t(`status.${a.status}`)}</dd>
          <dt className="text-ink/50">{t("panel.detail.with")}</dt>
          <dd className="font-semibold">{pro.firstName} {pro.lastName}</dd>
        </dl>
        <p className="rounded-xl bg-breeze-50 px-3 py-2 text-xs text-ink/60">{t("panel.detail.privacy")}</p>
        {a.status === "booked" && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button onClick={() => act("completed")} className="rounded-xl bg-lagoon py-2.5 font-bold text-white">{t("panel.detail.complete")}</button>
            <button onClick={() => act("no_show")} className="rounded-xl bg-amber-50 py-2.5 font-bold text-amber-800">{t("panel.detail.noShow")}</button>
            <button onClick={() => act("cancelled")} className="rounded-xl py-2.5 font-bold text-red-600 ring-1 ring-red-100">{t("panel.detail.cancel")}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NewBookingModal({
  dateKey,
  now,
  appointments,
  onClose,
}: {
  dateKey: string;
  now: Date;
  appointments: Appointment[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const { salon } = useSalon();
  const pros = prosOf(salon.id);
  const [proId, setProId] = useState(pros[0].id);
  const pro = proById(proId)!;
  const [serviceId, setServiceId] = useState(pro.serviceIds[0]);
  const [slot, setSlot] = useState<number | null>(null);
  const [source, setSource] = useState<BookingSource>("phone");
  const [form, setForm] = useState({ first: "", last: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const svc = serviceById(serviceId) ?? serviceById(pro.serviceIds[0])!;

  const slots = getAvailableSlots({
    dateKey,
    workingHours: hoursFor(pro, dateKey),
    busy: appointments
      .filter((a) => a.professionalId === proId && a.status !== "cancelled")
      .map((a) => ({ start: new Date(a.startsAt), end: new Date(a.blockedUntil) })),
    totalMin: svc.durationMin + svc.bufferMin,
    stepMin: salon.slotStepMin,
    now,
    minLeadMin: 0, // el salón puede agendar para "ya mismo"
  });

  const valid = slot !== null && form.first.trim() && form.phone.trim();

  function save() {
    if (slot === null) return;
    const start = new Date(slot);
    const end = addMinutes(start, svc.durationMin);
    const id = `staff-${Date.now()}`;
    const res = addBookings(
      [
        {
          id,
          groupId: id,
          salonId: salon.id,
          professionalId: proId,
          serviceId: svc.id,
          customerFirst: form.first.trim(),
          customerLast: form.last.trim(),
          customerPhone: form.phone.trim(),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          blockedUntil: addMinutes(end, svc.bufferMin).toISOString(),
          status: "booked",
          source,
          createdAt: new Date().toISOString(),
        },
      ],
      appointments,
    );
    if (res === "conflict") return setError(t("booking.conflict"));
    onClose();
  }

  return (
    <Modal title={t("panel.new.title")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 rounded-xl bg-foam p-1">
          {(["phone", "walk_in"] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)} className={`rounded-lg py-1.5 font-bold ${source === s ? "bg-white shadow-sm" : "text-ink/50"}`}>
              {t(`sources.${s}`)}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-ink/60">{t("panel.new.pro")}</p>
          <div className="flex flex-wrap gap-2">
            {pros.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProId(p.id);
                  setServiceId(p.serviceIds[0]);
                  setSlot(null);
                }}
                className={`rounded-full py-1 pl-1 pr-3 ring-1 ${proId === p.id ? "ring-2" : "ring-breeze-100"}`}
                style={proId === p.id ? { boxShadow: `inset 0 0 0 2px ${colorOf(p.color).hex}` } : undefined}
              >
                <ProBadge pro={p} size="sm" showName />
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-ink/60">{t("panel.new.service")}</span>
          <select
            value={svc.id}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot(null);
            }}
            className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100"
          >
            {pro.serviceIds.map((id) => {
              const v = serviceById(id)!;
              return (
                <option key={id} value={id}>
                  {serviceName(v, locale)} · {formatDuration(v.durationMin)} · {formatPrice(v.priceCents)}
                </option>
              );
            })}
          </select>
        </label>
        <div>
          <p className="mb-1.5 text-xs font-bold text-ink/60">
            {t("panel.new.time")} · <span>{formatDayLong(atLocal(dateKey, "12:00"), locale)}</span>
          </p>
          {slots.length === 0 ? (
            <p className="rounded-xl bg-foam p-3 text-ink/60">{t("booking.noSlots")}</p>
          ) : (
            <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
              {slots.map((s) => (
                <button
                  key={s.getTime()}
                  onClick={() => setSlot(s.getTime())}
                  className={`rounded-lg py-1.5 font-bold ${slot === s.getTime() ? "bg-lagoon text-white" : "bg-foam hover:bg-breeze-100"}`}
                >
                  {formatTime(s)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder={t("booking.first")} value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} className="rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" />
          <input placeholder={t("booking.last")} value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} className="rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" />
          <input placeholder={t("booking.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="col-span-2 rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" type="tel" />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-700">{error}</p>}
        <button onClick={save} disabled={!valid} className="w-full rounded-xl bg-lagoon py-3 font-bold text-white disabled:opacity-40">
          {t("panel.new.save")}
        </button>
      </div>
    </Modal>
  );
}
