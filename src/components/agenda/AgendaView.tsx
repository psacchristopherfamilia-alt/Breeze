"use client";
import { ChevronLeft, ChevronRight, Loader2, MonitorPlay, Phone, Plus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import { getAvailableSlots, type WeeklyHours } from "@/lib/availability";
import { withAlpha } from "@/lib/colors";
import { formatDuration } from "@/lib/format";
import { formatPrice } from "@/lib/mock/data";
import { addDaysKey, atLocal, formatDayLong, formatTime, localDateKey, minutesOfDay, weekdayOf } from "@/lib/time";

const START_H = 7;
const END_H = 21;
const PX = 1.15; // píxeles por minuto

/** Datos de la agenda del personal (aquí SÍ hay nombre completo y teléfono: solo lo ve el salón). */
export interface AgendaPro {
  id: string;
  firstName: string;
  lastName: string;
  colorHex: string;
  title: string;
  serviceIds: string[];
  hours: WeeklyHours;
}
export interface AgendaService {
  id: string;
  nameEn: string;
  nameEs: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
}
export type ApptStatus = "booked" | "completed" | "cancelled" | "no_show";
export type ApptSource = "online" | "phone" | "walk_in";
export interface AgendaAppt {
  id: string;
  groupId: string;
  professionalId: string;
  serviceNameEn: string;
  serviceNameEs: string;
  priceCents: number;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  status: ApptStatus;
  source: ApptSource;
  customerName: string;
  customerPhone: string;
  /** Solo con datos reales: abre la ficha del cliente. */
  customerId?: string;
}
export type ActionResult = { ok: true } | { ok: false; error: string };
export interface AgendaActions {
  create(input: {
    professionalId: string;
    serviceId: string;
    startsAt: string;
    source: Exclude<ApptSource, "online">;
    customer: { firstName: string; lastName: string; phone: string };
  }): Promise<ActionResult>;
  mark(appointmentId: string, status: "completed" | "no_show"): Promise<ActionResult>;
  cancel(groupId: string): Promise<ActionResult>;
}

export interface AgendaViewProps {
  salon: { name: string; slug: string; slotStepMin: number };
  pros: AgendaPro[];
  services: AgendaService[];
  /** Citas NO canceladas del día visible. */
  appointments: AgendaAppt[];
  /** Días libres / cierres del día (para no ofrecer esas horas al agendar por teléfono). */
  blocked: { professionalId: string; start: Date; end: Date }[];
  dateKey: string;
  now: Date | null;
  onDateChange(dateKey: string): void;
  /** Profesional: solo ve y gestiona su propia columna. */
  onlyProfessionalId?: string | null;
  actions: AgendaActions;
}

export function AgendaView(props: AgendaViewProps) {
  const { salon, services, appointments, dateKey, now, onDateChange, onlyProfessionalId, actions } = props;
  const t = useTranslations();
  const { locale } = useAppLocale();
  const pros = onlyProfessionalId ? props.pros.filter((p) => p.id === onlyProfessionalId) : props.pros;
  const [hidden, setHidden] = useState<string[]>([]);
  const [detail, setDetail] = useState<AgendaAppt | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => setHidden([]), [salon.slug]);

  if (!now) return <div className="m-6 h-96 animate-pulse rounded-3xl bg-white" />;

  const visible = pros.filter((p) => !hidden.includes(p.id));
  const dayApps = appointments.filter((a) => a.status !== "cancelled" && pros.some((p) => p.id === a.professionalId));
  const isToday = dateKey === localDateKey(now);
  const revenue = dayApps.filter((a) => a.status !== "no_show").reduce((s, a) => s + a.priceCents, 0);
  const online = dayApps.filter((a) => a.source === "online").length;
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const nowTop = (minutesOfDay(now) - START_H * 60) * PX;
  const weekday = weekdayOf(dateKey);
  const svcName = (a: { serviceNameEn: string; serviceNameEs: string }) => (locale === "es" ? a.serviceNameEs : a.serviceNameEn);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/70">{salon.name}</p>
          <h1 className="text-2xl font-extrabold first-letter:uppercase">{formatDayLong(atLocal(dateKey, "12:00"), locale)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-white ring-1 ring-breeze-100">
            <button onClick={() => onDateChange(addDaysKey(dateKey, -1))} className="p-2 hover:text-lagoon" aria-label={t("panel.prevDay")}>
              <ChevronLeft className="size-5" />
            </button>
            <button onClick={() => onDateChange(localDateKey(now))} className={`px-3 text-sm font-bold ${isToday ? "text-lagoon" : "text-ink/70 hover:text-ink"}`}>
              {t("panel.today")}
            </button>
            <button onClick={() => onDateChange(addDaysKey(dateKey, 1))} className="p-2 hover:text-lagoon" aria-label={t("panel.nextDay")}>
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
            disabled={pros.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800 disabled:opacity-40"
          >
            <Plus className="size-4" /> {t("panel.newBooking")}
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("panel.kpi.bookings"), dayApps.length],
          [t("panel.kpi.online"), dayApps.length ? `${Math.round((online / dayApps.length) * 100)}%` : "—"],
          [t("panel.kpi.revenue"), formatPrice(revenue)],
          [t("panel.kpi.noShows"), dayApps.filter((a) => a.status === "no_show").length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
            <p className="text-xs font-semibold text-ink/70">{label}</p>
            <p className="mt-1 text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      {pros.length > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink/70">{t("panel.filter")}</span>
          {pros.map((p) => {
            const on = !hidden.includes(p.id);
            const count = dayApps.filter((a) => a.professionalId === p.id).length;
            return (
              <button
                key={p.id}
                onClick={() => setHidden((h) => (on ? [...h, p.id] : h.filter((x) => x !== p.id)))}
                aria-pressed={on}
                className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold transition"
                style={
                  on
                    ? { backgroundColor: withAlpha(p.colorHex, 0.1), boxShadow: `inset 0 0 0 1.5px ${p.colorHex}`, color: p.colorHex }
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
      )}

      {pros.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-10 text-center text-ink/70 ring-1 ring-breeze-100">{t("panel.noPros")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-3xl bg-white ring-1 ring-breeze-100">
          <div className="flex min-w-fit">
            <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-breeze-100 bg-white">
              <div className="h-16 border-b border-breeze-100" />
              <div className="relative" style={{ height: (END_H - START_H) * 60 * PX }}>
                {hours.map((h) => (
                  <span key={h} className="absolute right-2 -translate-y-2 text-[11px] font-semibold text-ink/70" style={{ top: (h - START_H) * 60 * PX }}>
                    {h > 12 ? h - 12 : h} {h >= 12 ? "PM" : "AM"}
                  </span>
                ))}
              </div>
            </div>

            {visible.map((p) => {
              const work = p.hours[weekday] ?? [];
              const apps = dayApps.filter((a) => a.professionalId === p.id);
              const off = props.blocked.filter((b) => b.professionalId === p.id);
              return (
                <div key={p.id} className="w-52 shrink-0 border-r border-breeze-100 last:border-r-0 sm:w-60">
                  <div className="sticky top-0 flex h-16 items-center gap-2 border-b-4 px-3" style={{ borderColor: p.colorHex, backgroundColor: withAlpha(p.colorHex, 0.06) }}>
                    <ProBadge pro={p} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.firstName} {p.lastName.charAt(0)}.</p>
                      <p className="truncate text-xs text-ink/70">{t(`titles.${p.title}`)} · {apps.length}</p>
                    </div>
                  </div>
                  <div className="relative bg-ink/[0.035]" style={{ height: (END_H - START_H) * 60 * PX }}>
                    {work.map(([a, b]) => {
                      const top = (minutesOfDay(atLocal(dateKey, a)) - START_H * 60) * PX;
                      const h = (minutesOfDay(atLocal(dateKey, b)) - minutesOfDay(atLocal(dateKey, a))) * PX;
                      return <div key={a} className="absolute inset-x-0 bg-white" style={{ top, height: h }} />;
                    })}
                    {off.map((o, i) => {
                      const top = Math.max(0, (minutesOfDay(o.start) - START_H * 60) * PX);
                      const end = localDateKey(o.end) === dateKey ? minutesOfDay(o.end) : END_H * 60;
                      const startMin = localDateKey(o.start) === dateKey ? minutesOfDay(o.start) : START_H * 60;
                      return (
                        <div key={i} className="bg-buffer absolute inset-x-0 z-[1] grid place-items-start bg-ink/5 p-1 text-[10px] font-bold text-ink/70"
                          style={{ top: localDateKey(o.start) === dateKey ? top : 0, height: Math.max(0, (end - startMin) * PX) }}>
                          {t("panel.dayOff")}
                        </div>
                      );
                    })}
                    {work.length === 0 && off.length === 0 && (
                      <p className="absolute inset-x-0 top-6 text-center text-xs font-semibold text-ink/70">{t("panel.dayOff")}</p>
                    )}
                    {hours.map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-dashed border-breeze-100" style={{ top: (h - START_H) * 60 * PX }} />
                    ))}
                    {apps.map((a) => {
                      const s = new Date(a.startsAt);
                      const durMin = (new Date(a.endsAt).getTime() - s.getTime()) / 60_000;
                      const bufMin = (new Date(a.blockedUntil).getTime() - new Date(a.endsAt).getTime()) / 60_000;
                      const top = (minutesOfDay(s) - START_H * 60) * PX;
                      const h = durMin * PX;
                      const done = a.status === "completed" || a.status === "no_show";
                      return (
                        <div key={a.id} className="absolute inset-x-1.5 z-[2]" style={{ top }}>
                          <button
                            onClick={() => setDetail(a)}
                            className={`block w-full overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:shadow-md ${done ? "opacity-55" : ""}`}
                            style={{ height: h - 2, borderColor: p.colorHex, backgroundColor: withAlpha(p.colorHex, 0.13) }}
                          >
                            <p className="font-bold" style={{ color: p.colorHex }}>
                              {formatTime(s)} {a.source !== "online" && <Phone className="inline size-3" />}
                              {a.status === "no_show" && <span className="ml-1 rounded bg-red-600 px-1 text-[9px] text-white">NO-SHOW</span>}
                            </p>
                            <p className="truncate font-semibold text-ink">{a.customerName}</p>
                            {h > 44 && <p className="truncate text-ink/70">{svcName(a)}</p>}
                          </button>
                          {bufMin > 0 && <div className="bg-buffer mx-1 rounded-b" style={{ height: bufMin * PX - 1 }} title={t("panel.buffer")} />}
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
      )}
      <p className="mt-3 flex items-center gap-2 text-xs text-ink/70">
        <span className="bg-buffer inline-block h-3 w-6 rounded ring-1 ring-ink/10" /> {t("panel.bufferLegend")} ·
        <Phone className="size-3" /> {t("panel.phoneLegend")}
      </p>

      {detail && (
        <DetailModal
          a={detail}
          pro={props.pros.find((p) => p.id === detail.professionalId)!}
          now={now}
          actions={actions}
          onClose={() => setDetail(null)}
        />
      )}
      {creating && (
        <NewBookingModal
          dateKey={dateKey}
          now={now}
          pros={pros}
          services={services}
          appointments={dayApps}
          blocked={props.blocked}
          stepMin={salon.slotStepMin}
          actions={actions}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

function DetailModal({ a, pro, now, actions, onClose }: { a: AgendaAppt; pro: AgendaPro; now: Date; actions: AgendaActions; onClose: () => void }) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = new Date(a.startsAt);
  const durMin = (new Date(a.endsAt).getTime() - s.getTime()) / 60_000;
  const started = s <= now;

  const run = async (fn: () => Promise<ActionResult>) => {
    setPending(true);
    setError(null);
    const r = await fn();
    setPending(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Modal title={a.customerName} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: withAlpha(pro.colorHex, 0.08) }}>
          <ProBadge pro={pro} size="md" />
          <div>
            <p className="font-bold">{locale === "es" ? a.serviceNameEs : a.serviceNameEn}</p>
            <p className="text-ink/70">
              {formatTime(s)} – {formatTime(new Date(a.endsAt))} · {formatDuration(durMin)} · {formatPrice(a.priceCents)}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-ink/70">{t("panel.detail.phone")}</dt>
          <dd className="font-semibold">{a.customerPhone || "—"}</dd>
          <dt className="text-ink/70">{t("panel.detail.source")}</dt>
          <dd className="font-semibold">{t(`sources.${a.source}`)}</dd>
          <dt className="text-ink/70">{t("panel.detail.status")}</dt>
          <dd className="font-semibold">{t(`status.${a.status}`)}</dd>
          <dt className="text-ink/70">{t("panel.detail.with")}</dt>
          <dd className="font-semibold">{pro.firstName} {pro.lastName}</dd>
        </dl>
        {a.customerId && (
          <Link href={`/dashboard/clients/${a.customerId}`} className="block rounded-xl bg-white px-3 py-2.5 text-center font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50">
            {t("panel.detail.viewClient")}
          </Link>
        )}
        <p className="rounded-xl bg-breeze-50 px-3 py-2 text-xs text-ink/70">{t("panel.detail.privacy")}</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
        {a.status === "booked" && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button disabled={pending || !started} onClick={() => run(() => actions.mark(a.id, "completed"))} className="rounded-xl bg-lagoon py-2.5 font-bold text-white disabled:opacity-40">
              {t("panel.detail.complete")}
            </button>
            <button disabled={pending || !started} onClick={() => run(() => actions.mark(a.id, "no_show"))} className="rounded-xl bg-amber-50 py-2.5 font-bold text-amber-800 disabled:opacity-40">
              {t("panel.detail.noShow")}
            </button>
            <button disabled={pending || started} onClick={() => run(() => actions.cancel(a.groupId))} className="rounded-xl py-2.5 font-bold text-red-600 ring-1 ring-red-100 disabled:opacity-40">
              {pending ? <Loader2 className="mx-auto size-4 animate-spin" /> : t("panel.detail.cancel")}
            </button>
          </div>
        )}
        {a.status === "booked" && <p className="text-xs text-ink/70">{started ? t("panel.detail.startedHint") : t("panel.detail.futureHint")}</p>}
      </div>
    </Modal>
  );
}

function NewBookingModal({
  dateKey,
  now,
  pros,
  services,
  appointments,
  blocked,
  stepMin,
  actions,
  onClose,
}: {
  dateKey: string;
  now: Date;
  pros: AgendaPro[];
  services: AgendaService[];
  appointments: AgendaAppt[];
  blocked: { professionalId: string; start: Date; end: Date }[];
  stepMin: number;
  actions: AgendaActions;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const [proId, setProId] = useState(pros[0]?.id);
  const pro = pros.find((p) => p.id === proId)!;
  const offered = services.filter((s) => pro?.serviceIds.includes(s.id));
  const [serviceId, setServiceId] = useState<string | undefined>(offered[0]?.id);
  const [slot, setSlot] = useState<number | null>(null);
  const [source, setSource] = useState<"phone" | "walk_in">("phone");
  const [form, setForm] = useState({ first: "", last: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const svc = offered.find((s) => s.id === serviceId) ?? offered[0];

  const slots = svc
    ? getAvailableSlots({
        dateKey,
        workingHours: pro.hours[weekdayOf(dateKey)] ?? [],
        busy: [
          ...appointments.filter((a) => a.professionalId === proId).map((a) => ({ start: new Date(a.startsAt), end: new Date(a.blockedUntil) })),
          ...blocked.filter((b) => b.professionalId === proId),
        ],
        totalMin: svc.durationMin + svc.bufferMin,
        stepMin,
        now,
        minLeadMin: 0,
      })
    : [];
  const valid = slot !== null && svc && form.first.trim() && form.phone.trim();

  async function save() {
    if (slot === null || !svc) return;
    setPending(true);
    setError(null);
    const r = await actions.create({
      professionalId: proId,
      serviceId: svc.id,
      startsAt: new Date(slot).toISOString(),
      source,
      customer: { firstName: form.first.trim(), lastName: form.last.trim(), phone: form.phone.trim() },
    });
    setPending(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <Modal title={t("panel.new.title")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 rounded-xl bg-foam p-1">
          {(["phone", "walk_in"] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)} className={`rounded-lg py-1.5 font-bold ${source === s ? "bg-white shadow-sm" : "text-ink/70"}`}>
              {t(`sources.${s}`)}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-ink/70">{t("panel.new.pro")}</p>
          <div className="flex flex-wrap gap-2">
            {pros.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProId(p.id);
                  setServiceId(services.find((s) => p.serviceIds.includes(s.id))?.id);
                  setSlot(null);
                }}
                className={`rounded-full py-1 pl-1 pr-3 ring-1 ${proId === p.id ? "ring-2" : "ring-breeze-100"}`}
                style={proId === p.id ? { boxShadow: `inset 0 0 0 2px ${p.colorHex}` } : undefined}
              >
                <ProBadge pro={p} size="sm" showName />
              </button>
            ))}
          </div>
        </div>
        {offered.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-amber-800">{t("panel.new.noServices")}</p>
        ) : (
          <label className="block">
            <span className="text-xs font-bold text-ink/70">{t("panel.new.service")}</span>
            <select
              value={svc?.id}
              onChange={(e) => {
                setServiceId(e.target.value);
                setSlot(null);
              }}
              className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100"
            >
              {offered.map((v) => (
                <option key={v.id} value={v.id}>
                  {locale === "es" ? v.nameEs : v.nameEn} · {formatDuration(v.durationMin)} · {formatPrice(v.priceCents)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <p className="mb-1.5 text-xs font-bold text-ink/70">
            {t("panel.new.time")} · <span>{formatDayLong(atLocal(dateKey, "12:00"), locale)}</span>
          </p>
          {slots.length === 0 ? (
            <p className="rounded-xl bg-foam p-3 text-ink/70">{t("booking.noSlots")}</p>
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
          <input aria-label={t("booking.first")} placeholder={t("booking.first")} value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} className="rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" />
          <input aria-label={t("booking.last")} placeholder={t("booking.last")} value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} className="rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" />
          <input aria-label={t("booking.phone")} placeholder={t("booking.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="col-span-2 rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" type="tel" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
        <button onClick={save} disabled={!valid || pending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lagoon py-3 font-bold text-white disabled:opacity-40">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("panel.new.save")}
        </button>
      </div>
    </Modal>
  );
}
