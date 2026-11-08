"use client";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, MonitorPlay, MoveRight, Phone, Plus, Users, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import { checkMove, type MoveContext, type MoveProblem } from "@/lib/agenda/move";
import { occupancyOfDay, occupancyStep, weekDays } from "@/lib/agenda/occupancy";
import { getAvailableSlots, type WeeklyHours } from "@/lib/availability";
import { withAlpha } from "@/lib/colors";
import { formatDuration } from "@/lib/format";
import { formatPrice } from "@/lib/mock/data";
import { addDaysKey, atLocal, formatDayLong, formatDayShort, formatTime, localDateKey, minutesOfDay, weekdayOf } from "@/lib/time";

const START_H = 7;
const END_H = 21;
const PX = 1.15; // píxeles por minuto
const RAMP = ["#e3f3f5", "#a9dbe0", "#5fb7c1", "#1f8f9c", "#075560"]; // ocupación: de poco a mucho (una sola rampa turquesa)

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
  /** Solo con datos reales: para comprobar que otro profesional ofrece el servicio al mover la cita. */
  serviceId?: string;
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
export interface MoveInput {
  appointmentId: string;
  professionalId: string;
  /** ISO UTC. */
  startsAt: string;
  durationMin: number;
  /** Avisar al cliente del cambio. */
  notify: boolean;
}
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
  move(input: MoveInput): Promise<ActionResult>;
}

export type AgendaMode = "day" | "week" | "team";

export interface AgendaViewProps {
  salon: { name: string; slug: string; slotStepMin: number };
  pros: AgendaPro[];
  services: AgendaService[];
  /** Citas NO canceladas del rango visible (un día en la vista de día, la semana en las otras dos). */
  appointments: AgendaAppt[];
  /** Días libres / cierres del rango (para no ofrecer esas horas ni dejar soltar citas encima). */
  blocked: { professionalId: string; start: Date; end: Date }[];
  /** Día seleccionado; en semana y equipo, cualquier día de esa semana. */
  dateKey: string;
  now: Date | null;
  view: AgendaMode;
  /** Profesional de la vista de semana. */
  proId?: string | null;
  onNavigate(n: { view?: AgendaMode; dateKey?: string; proId?: string }): void;
  /** Profesional: solo ve y gestiona su propia columna. */
  onlyProfessionalId?: string | null;
  actions: AgendaActions;
}

interface GridCol {
  key: string;
  proId: string;
  dateKey: string;
  header: React.ReactNode;
  colorHex: string;
  widthClass: string;
  work: [string, string][];
  apps: AgendaAppt[];
  off: { start: Date; end: Date }[];
  isToday: boolean;
}
interface Target {
  proId: string;
  dateKey: string;
  startMin: number;
  durationMin: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const durOf = (a: AgendaAppt) => Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000);
const targetStart = (t: Target) => atLocal(t.dateKey, hhmm(t.startMin));

export function AgendaView(props: AgendaViewProps) {
  const { salon, services, appointments, dateKey, now, view, onNavigate, onlyProfessionalId, actions } = props;
  const t = useTranslations();
  const { locale } = useAppLocale();
  const pros = onlyProfessionalId ? props.pros.filter((p) => p.id === onlyProfessionalId) : props.pros;
  const [hidden, setHidden] = useState<string[]>([]);
  const [detail, setDetail] = useState<AgendaAppt | null>(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<{ appt: AgendaAppt; draft?: Target } | null>(null);
  const [toast, setToast] = useState<{ text: string; ok?: boolean; undo?: () => void } | null>(null);
  useEffect(() => setHidden([]), [salon.slug]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 10_000 : 5_000);
    return () => clearTimeout(id);
  }, [toast]);
  const ctx = useMemo<MoveContext | null>(
    () => (now ? { appointments, pros: props.pros, blocked: props.blocked, now } : null),
    [appointments, props.pros, props.blocked, now],
  );

  if (!now || !ctx) return <div className="m-6 h-96 animate-pulse rounded-3xl bg-white" />;

  const days = view === "day" ? [dateKey] : weekDays(dateKey);
  const todayKey = localDateKey(now);
  const visible = pros.filter((p) => !hidden.includes(p.id));
  const weekPro = pros.find((p) => p.id === props.proId) ?? pros[0];
  const rangeApps = appointments.filter((a) => a.status !== "cancelled" && pros.some((p) => p.id === a.professionalId));
  const isToday = days.includes(todayKey);
  const revenue = rangeApps.filter((a) => a.status !== "no_show").reduce((s, a) => s + a.priceCents, 0);
  const online = rangeApps.filter((a) => a.source === "online").length;
  const svcName = (a: { serviceNameEn: string; serviceNameEs: string }) => (locale === "es" ? a.serviceNameEs : a.serviceNameEn);
  const canMove = (a: AgendaAppt) =>
    a.status === "booked" && new Date(a.startsAt) > now && (!onlyProfessionalId || a.professionalId === onlyProfessionalId);
  const canChangePro = !onlyProfessionalId;

  const buildCol = (p: AgendaPro, key: string, header: React.ReactNode, widthClass: string): GridCol => {
    const dayStart = atLocal(key, "00:00");
    const dayEnd = atLocal(addDaysKey(key, 1), "00:00");
    return {
      key: `${p.id}|${key}`,
      proId: p.id,
      dateKey: key,
      header,
      colorHex: p.colorHex,
      widthClass,
      work: p.hours[weekdayOf(key)] ?? [],
      apps: rangeApps.filter((a) => a.professionalId === p.id && localDateKey(new Date(a.startsAt)) === key),
      off: props.blocked.filter((b) => b.professionalId === p.id && b.start < dayEnd && b.end > dayStart),
      isToday: key === todayKey,
    };
  };
  const cols: GridCol[] =
    view === "day"
      ? visible.map((p) =>
          buildCol(
            p,
            dateKey,
            <div className="flex items-center gap-2">
              <ProBadge pro={p} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{p.firstName} {p.lastName.charAt(0)}.</p>
                <p className="truncate text-xs text-ink/70">
                  {t(`titles.${p.title}`)} · {rangeApps.filter((a) => a.professionalId === p.id).length}
                </p>
              </div>
            </div>,
            "w-52 sm:w-60",
          ),
        )
      : view === "week" && weekPro
        ? days.map((key) =>
            buildCol(
              weekPro,
              key,
              <div className="min-w-0">
                <p className={`truncate text-sm font-bold first-letter:uppercase ${key === todayKey ? "underline decoration-2 underline-offset-4" : ""}`}>{formatDayShort(atLocal(key, "12:00"), locale)}</p>
                <p className="truncate text-xs text-ink/70">
                  {rangeApps.filter((a) => a.professionalId === weekPro.id && localDateKey(new Date(a.startsAt)) === key).length} {t("panel.views.apptsShort")}
                </p>
              </div>,
              "w-40 sm:w-44",
            ),
          )
        : [];

  const title =
    view === "day"
      ? formatDayLong(atLocal(dateKey, "12:00"), locale)
      : t("panel.weekTitle", { from: formatDayShort(atLocal(days[0], "12:00"), locale), to: formatDayShort(atLocal(days[6], "12:00"), locale) });
  const step = view === "day" ? 1 : 7;
  const modes: { id: AgendaMode; label: string; icon: React.ReactNode }[] = [
    { id: "day", label: t("panel.views.day"), icon: <CalendarDays className="size-4" /> },
    { id: "week", label: t("panel.views.week"), icon: <CalendarDays className="size-4" /> },
    ...(pros.length > 1 ? [{ id: "team" as const, label: t("panel.views.team"), icon: <Users className="size-4" /> }] : []),
  ];

  const afterMove = (appt: AgendaAppt, next: Target, notify: boolean) => {
    const prev: MoveInput = { appointmentId: appt.id, professionalId: appt.professionalId, startsAt: appt.startsAt, durationMin: durOf(appt), notify };
    const nextStart = targetStart(next);
    const moved = next.proId !== appt.professionalId || nextStart.getTime() !== new Date(appt.startsAt).getTime();
    const proName = props.pros.find((p) => p.id === next.proId);
    const text =
      t("panel.move.moved", { name: appt.customerName, when: `${formatDayShort(nextStart, locale)}, ${formatTime(nextStart)}`, pro: proName ? `${proName.firstName} ${proName.lastName.charAt(0)}.` : "" }) +
      (moved ? ` · ${t(notify ? "panel.move.notified" : "panel.move.notNotified")}` : "");
    setToast({
      text,
      ok: true,
      undo: async () => {
        const r = await actions.move(prev);
        setToast(r.ok ? { text: t("panel.move.undone"), ok: true } : { text: t(`panel.errors.${r.error}`) });
      },
    });
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/70">{salon.name}</p>
          <h1 className="text-2xl font-extrabold first-letter:uppercase">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-white ring-1 ring-breeze-100">
            <button onClick={() => onNavigate({ dateKey: addDaysKey(dateKey, -step) })} className="p-2 hover:text-lagoon" aria-label={t(view === "day" ? "panel.prevDay" : "panel.prevWeek")}>
              <ChevronLeft className="size-5" />
            </button>
            <button onClick={() => onNavigate({ dateKey: todayKey })} className={`px-3 text-sm font-bold ${isToday ? "text-lagoon" : "text-ink/70 hover:text-ink"}`}>
              {t(view === "day" ? "panel.today" : "panel.thisWeek")}
            </button>
            <button onClick={() => onNavigate({ dateKey: addDaysKey(dateKey, step) })} className="p-2 hover:text-lagoon" aria-label={t(view === "day" ? "panel.nextDay" : "panel.nextWeek")}>
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

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t("panel.views.label")}>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onNavigate({ view: m.id })}
            aria-pressed={view === m.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${view === m.id ? "bg-lagoon text-white ring-lagoon" : "bg-white text-ink ring-breeze-100 hover:bg-breeze-50"}`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("panel.kpi.bookings"), rangeApps.length],
          [t("panel.kpi.online"), rangeApps.length ? `${Math.round((online / rangeApps.length) * 100)}%` : "—"],
          [t("panel.kpi.revenue"), formatPrice(revenue)],
          [t("panel.kpi.noShows"), rangeApps.filter((a) => a.status === "no_show").length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
            <p className="text-xs font-semibold text-ink/70">{label}</p>
            <p className="mt-1 text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      {view === "day" && pros.length > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink/70">{t("panel.filter")}</span>
          {pros.map((p) => {
            const on = !hidden.includes(p.id);
            const count = rangeApps.filter((a) => a.professionalId === p.id).length;
            return (
              <button
                key={p.id}
                onClick={() => setHidden((h) => (on ? [...h, p.id] : h.filter((x) => x !== p.id)))}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold transition ${on ? "text-ink" : "text-ink/70"}`}
                style={
                  on
                    ? { backgroundColor: withAlpha(p.colorHex, 0.1), boxShadow: `inset 0 0 0 1.5px ${p.colorHex}` }
                    : { backgroundColor: "white", boxShadow: "inset 0 0 0 1px #d5f4f2" }
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

      {view === "week" && pros.length > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label={t("panel.weekPro")}>
          <span className="text-xs font-bold uppercase tracking-wide text-ink/70">{t("panel.weekPro")}</span>
          {pros.map((p) => (
            <button
              key={p.id}
              onClick={() => onNavigate({ proId: p.id })}
              aria-pressed={weekPro?.id === p.id}
              className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold ring-1 ring-breeze-100"
              style={weekPro?.id === p.id ? { backgroundColor: withAlpha(p.colorHex, 0.1), boxShadow: `inset 0 0 0 1.5px ${p.colorHex}` } : { backgroundColor: "white" }}
            >
              <ProBadge pro={p} size="sm" />
              {p.firstName} {p.lastName.charAt(0)}.
            </button>
          ))}
        </div>
      )}

      {pros.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-10 text-center text-ink/70 ring-1 ring-breeze-100">{t("panel.noPros")}</p>
      ) : view === "team" ? (
        <TeamWeek pros={pros} days={days} appointments={rangeApps} blocked={props.blocked} todayKey={todayKey} onOpen={(proId, key) => onNavigate({ view: "week", proId, dateKey: key })} />
      ) : (
        <AgendaGrid
          cols={cols}
          ctx={ctx}
          now={now}
          stepMin={Math.max(5, salon.slotStepMin)}
          canMove={canMove}
          svcName={svcName}
          onOpen={setDetail}
          onPropose={(appt, draft) => setMoving({ appt, draft })}
        />
      )}
      {view !== "team" && (
        <>
          <p className="mt-3 flex items-center gap-2 text-xs text-ink/70">
            <span className="bg-buffer inline-block h-3 w-6 rounded ring-1 ring-ink/10" /> {t("panel.bufferLegend")} ·
            <Phone className="size-3" /> {t("panel.phoneLegend")}
          </p>
          <p className="mt-1 text-xs text-ink/70">{t("panel.move.dragHint")}</p>
        </>
      )}

      {detail && (
        <DetailModal
          a={detail}
          pro={props.pros.find((p) => p.id === detail.professionalId)!}
          now={now}
          actions={actions}
          onClose={() => setDetail(null)}
          onMove={canMove(detail) ? () => { setMoving({ appt: detail }); setDetail(null); } : undefined}
        />
      )}
      {moving && (
        <MoveSheet
          appt={moving.appt}
          draft={moving.draft}
          pros={pros}
          ctx={ctx}
          stepMin={Math.max(5, salon.slotStepMin)}
          canChangePro={canChangePro}
          todayKey={todayKey}
          actions={actions}
          onClose={() => setMoving(null)}
          onDone={afterMove}
        />
      )}
      {creating && (
        <NewBookingModal
          dateKey={dateKey}
          now={now}
          pros={pros}
          services={services}
          appointments={rangeApps.filter((a) => localDateKey(new Date(a.startsAt)) === dateKey)}
          blocked={props.blocked}
          stepMin={salon.slotStepMin}
          actions={actions}
          onClose={() => setCreating(false)}
        />
      )}
      {toast && (
        <div role="status" className={`fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.ok ? "bg-ink" : "bg-red-700"}`}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={() => { const u = toast.undo; setToast(null); void u?.(); }} className="shrink-0 underline underline-offset-2">
              {t("panel.move.undo")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Texto de por qué no se puede mover una cita (claves panel.move.reasons.*). */
function problemText(t: ReturnType<typeof useTranslations>, p: MoveProblem) {
  return t(`panel.move.reasons.${p.key}`, p.params ?? {});
}

function AgendaGrid({
  cols,
  ctx,
  now,
  stepMin,
  canMove,
  svcName,
  onOpen,
  onPropose,
}: {
  cols: GridCol[];
  ctx: MoveContext;
  now: Date;
  stepMin: number;
  canMove: (a: AgendaAppt) => boolean;
  svcName: (a: { serviceNameEn: string; serviceNameEs: string }) => string;
  onOpen: (a: AgendaAppt) => void;
  onPropose: (a: AgendaAppt, t: Target) => void;
}) {
  const t = useTranslations();
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const height = (END_H - START_H) * 60 * PX;
  const colEls = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<{
    appt: AgendaAppt;
    kind: "move" | "resize";
    pointerId: number;
    x: number;
    y: number;
    grab: number;
    active: boolean;
    colKey: string;
    target: Target | null;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const suppress = useRef<string | null>(null);
  const [ghost, setGhost] = useState<{ colKey: string; startMin: number; durationMin: number; ok: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null);

  // Mientras se arrastra con el dedo, la página no debe desplazarse.
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (drag.current?.active && e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);

  const finish = () => {
    if (drag.current?.timer) clearTimeout(drag.current.timer);
    drag.current = null;
    setGhost(null);
    setDragId(null);
    setHint(null);
  };

  const evaluate = (appt: AgendaAppt, tg: Target): MoveProblem | null =>
    checkMove(ctx, appt, { professionalId: tg.proId, startsAt: targetStart(tg), durationMin: tg.durationMin });

  const begin = (el: HTMLElement) => {
    const d = drag.current;
    if (!d) return;
    d.active = true;
    try {
      el.setPointerCapture(d.pointerId);
    } catch {
      /* el navegador ya capturó el puntero */
    }
    setDragId(d.appt.id);
  };

  const onDown = (e: React.PointerEvent<HTMLButtonElement>, a: AgendaAppt, col: GridCol) => {
    if (!canMove(a) || (e.button && e.button > 0)) return;
    const resize = (e.target as HTMLElement).dataset.rz === "1";
    const el = e.currentTarget;
    drag.current = {
      appt: a,
      kind: resize ? "resize" : "move",
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      grab: e.clientY - el.getBoundingClientRect().top,
      active: false,
      colKey: col.key,
      target: null,
      timer: null,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignorar */
    }
    if (resize) {
      begin(el);
      e.preventDefault();
    } else if (e.pointerType === "touch") {
      // En el teléfono, mantener pulsado para arrastrar (si no, el gesto es desplazar la página).
      drag.current.timer = setTimeout(() => {
        if (drag.current && !drag.current.active) begin(el);
      }, 380);
    }
  };

  const onMoveEv = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (e.pointerType === "touch") {
        if (dist > 8) finish();
        return;
      }
      if (dist <= 5) return;
      begin(e.currentTarget);
    }
    const a = d.appt;
    let tg: Target;
    if (d.kind === "resize") {
      const top = e.currentTarget.getBoundingClientRect().top;
      const dur = Math.max(5, Math.min(480, Math.round((e.clientY - top) / PX / 5) * 5));
      const col = cols.find((c) => c.key === d.colKey)!;
      tg = { proId: a.professionalId, dateKey: col.dateKey, startMin: minutesOfDay(new Date(a.startsAt)), durationMin: dur };
    } else {
      let col = cols.find((c) => {
        const r = colEls.current.get(c.key)?.getBoundingClientRect();
        return r && e.clientX >= r.left && e.clientX < r.right;
      });
      col ??= cols.find((c) => c.key === d.colKey)!;
      d.colKey = col.key;
      const rect = colEls.current.get(col.key)!.getBoundingClientRect();
      const dur = durOf(a);
      const raw = START_H * 60 + Math.round((e.clientY - d.grab - rect.top) / PX / stepMin) * stepMin;
      tg = { proId: col.proId, dateKey: col.dateKey, startMin: Math.max(START_H * 60, Math.min(END_H * 60 - dur, raw)), durationMin: dur };
    }
    d.target = tg;
    const problem = evaluate(a, tg);
    setGhost({ colKey: d.kind === "resize" ? d.colKey : `${tg.proId}|${tg.dateKey}`, startMin: tg.startMin, durationMin: tg.durationMin, ok: !problem });
    setHint(
      problem
        ? { ok: false, text: problemText(t, problem) }
        : { ok: true, text: `${formatTime(targetStart(tg))} – ${formatTime(new Date(targetStart(tg).getTime() + tg.durationMin * 60_000))}` },
    );
  };

  const onUp = (a: AgendaAppt) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      finish();
      return;
    }
    const tg = d.target;
    suppress.current = a.id; // el clic que sigue al soltar no debe abrir la ficha
    setTimeout(() => (suppress.current = null), 0);
    finish();
    if (!tg) return;
    const unchanged = tg.proId === a.professionalId && tg.durationMin === durOf(a) && targetStart(tg).getTime() === new Date(a.startsAt).getTime();
    if (unchanged) return;
    const problem = evaluate(a, tg);
    if (problem) {
      setHint({ ok: false, text: problemText(t, problem) });
      setTimeout(() => setHint(null), 4000);
      return;
    }
    onPropose(a, tg);
  };

  return (
    <>
      <div tabIndex={0} role="region" aria-label={t("panel.agendaRegion")} className="mt-4 overflow-x-auto rounded-3xl bg-white ring-1 ring-breeze-100 focus-visible:outline-2 focus-visible:outline-lagoon">
        <div className="flex min-w-fit select-none">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-breeze-100 bg-white">
            <div className="h-16 border-b border-breeze-100" />
            <div className="relative" style={{ height }}>
              {hours.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-2 text-[11px] font-semibold text-ink/70" style={{ top: (h - START_H) * 60 * PX }}>
                  {h > 12 ? h - 12 : h} {h >= 12 ? "PM" : "AM"}
                </span>
              ))}
            </div>
          </div>

          {cols.map((col) => {
            const nowTop = (minutesOfDay(now) - START_H * 60) * PX;
            return (
              <div key={col.key} className={`${col.widthClass} shrink-0 border-r border-breeze-100 last:border-r-0`}>
                <div className="sticky top-0 flex h-16 items-center border-b-4 px-3" style={{ borderColor: col.colorHex, backgroundColor: withAlpha(col.colorHex, col.isToday ? 0.12 : 0.06) }}>
                  {col.header}
                </div>
                <div
                  ref={(el) => {
                    if (el) colEls.current.set(col.key, el);
                    else colEls.current.delete(col.key);
                  }}
                  className="relative bg-ink/[0.035]"
                  style={{ height }}
                >
                  {col.work.map(([a, b]) => {
                    const top = (minutesOfDay(atLocal(col.dateKey, a)) - START_H * 60) * PX;
                    const h = (minutesOfDay(atLocal(col.dateKey, b)) - minutesOfDay(atLocal(col.dateKey, a))) * PX;
                    return <div key={a} className="absolute inset-x-0 bg-white" style={{ top, height: h }} />;
                  })}
                  {col.off.map((o, i) => {
                    const startMin = localDateKey(o.start) === col.dateKey ? minutesOfDay(o.start) : START_H * 60;
                    const endMin = localDateKey(o.end) === col.dateKey ? minutesOfDay(o.end) : END_H * 60;
                    return (
                      <div
                        key={i}
                        className="bg-buffer absolute inset-x-0 z-[1] grid place-items-start bg-ink/5 p-1 text-[10px] font-bold text-ink/70"
                        style={{ top: Math.max(0, (startMin - START_H * 60) * PX), height: Math.max(0, (endMin - startMin) * PX) }}
                      >
                        {t("panel.dayOff")}
                      </div>
                    );
                  })}
                  {col.work.length === 0 && col.off.length === 0 && (
                    <p className="absolute inset-x-0 top-6 text-center text-xs font-semibold text-ink/70">{t("panel.dayOff")}</p>
                  )}
                  {hours.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-dashed border-breeze-100" style={{ top: (h - START_H) * 60 * PX }} />
                  ))}
                  {col.apps.map((a) => {
                    const s = new Date(a.startsAt);
                    const durMin = durOf(a);
                    const bufMin = (new Date(a.blockedUntil).getTime() - new Date(a.endsAt).getTime()) / 60_000;
                    const top = (minutesOfDay(s) - START_H * 60) * PX;
                    const h = durMin * PX;
                    const done = a.status === "completed" || a.status === "no_show";
                    const movable = canMove(a);
                    return (
                      <div key={a.id} className={`absolute inset-x-1.5 z-[2] ${dragId === a.id ? "opacity-50" : ""}`} style={{ top }}>
                        <button
                          onClick={() => {
                            if (suppress.current === a.id) return;
                            onOpen(a);
                          }}
                          onPointerDown={(e) => onDown(e, a, col)}
                          onPointerMove={onMoveEv}
                          onPointerUp={() => onUp(a)}
                          onPointerCancel={finish}
                          onContextMenu={(e) => {
                            if (drag.current) e.preventDefault();
                          }}
                          className={`relative block w-full overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:shadow-md ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
                          style={{ height: h - 2, borderColor: col.colorHex, backgroundColor: withAlpha(col.colorHex, done ? 0.05 : 0.13) }}
                        >
                          <p className="font-bold text-ink">
                            {done && a.status === "completed" && <span aria-hidden="true">✓ </span>}
                            {formatTime(s)} {a.source !== "online" && <Phone className="inline size-3" />}
                            {a.status === "no_show" && <span className="ml-1 rounded bg-red-600 px-1 text-[9px] text-white">NO-SHOW</span>}
                          </p>
                          <p className="truncate font-semibold text-ink">{a.customerName}</p>
                          {h > 44 && <p className="truncate text-ink/70">{svcName(a)}</p>}
                          {movable && <span data-rz="1" aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3 cursor-ns-resize touch-none" />}
                        </button>
                        {bufMin > 0 && <div className="bg-buffer mx-1 rounded-b" style={{ height: bufMin * PX - 1 }} title={t("panel.buffer")} />}
                      </div>
                    );
                  })}
                  {ghost && ghost.colKey === col.key && (
                    <div
                      className={`pointer-events-none absolute inset-x-1 z-[5] rounded-lg border-2 border-dashed px-2 py-1 text-xs font-bold ${ghost.ok ? "border-emerald-600 bg-emerald-500/20 text-emerald-900" : "border-red-600 bg-red-500/20 text-red-900"}`}
                      style={{ top: (ghost.startMin - START_H * 60) * PX, height: ghost.durationMin * PX - 2 }}
                    >
                      {formatTime(atLocal(col.dateKey, hhmm(ghost.startMin)))}
                    </div>
                  )}
                  {col.isToday && nowTop > 0 && nowTop < height && (
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
      <p aria-live="polite" className={`mt-2 min-h-6 text-sm font-semibold ${hint ? (hint.ok ? "text-emerald-800" : "text-red-700") : ""}`}>
        {hint ? `${hint.ok ? "✓" : "✕"} ${hint.text}` : ""}
      </p>
    </>
  );
}

function TeamWeek({
  pros,
  days,
  appointments,
  blocked,
  todayKey,
  onOpen,
}: {
  pros: AgendaPro[];
  days: string[];
  appointments: AgendaAppt[];
  blocked: { professionalId: string; start: Date; end: Date }[];
  todayKey: string;
  onOpen: (proId: string, dateKey: string) => void;
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  return (
    <section className="mt-4 rounded-3xl bg-white p-4 ring-1 ring-breeze-100" aria-labelledby="team-title">
      <h2 id="team-title" className="text-lg font-bold">{t("panel.team.title")}</h2>
      <p className="text-sm text-ink/70">{t("panel.team.hint")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-1 text-left text-xs font-bold uppercase tracking-wide text-ink/70">{t("panel.team.pro")}</th>
              {days.map((d) => (
                <th key={d} scope="col" className={`p-1 text-left text-xs font-bold uppercase tracking-wide ${d === todayKey ? "text-lagoon" : "text-ink/70"}`}>
                  {formatDayShort(atLocal(d, "12:00"), locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pros.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="p-1 text-left">
                  <span className="inline-flex items-center gap-2 font-bold">
                    <ProBadge pro={p} size="sm" />
                    {p.firstName} {p.lastName.charAt(0)}.
                  </span>
                </th>
                {days.map((d) => {
                  const dayApps = appointments.filter((a) => a.professionalId === p.id && localDateKey(new Date(a.startsAt)) === d);
                  const o = occupancyOfDay(p.hours, d, dayApps, blocked.filter((b) => b.professionalId === p.id));
                  if (o.closed)
                    return (
                      <td key={d} className="rounded-xl bg-ink/[0.04] p-2 align-top text-xs font-semibold text-ink/70">
                        {t("panel.team.off")}
                      </td>
                    );
                  const step = occupancyStep(o.pct);
                  const free = `${Math.floor(o.freeMin / 60)} h${o.freeMin % 60 ? ` ${o.freeMin % 60} min` : ""}`;
                  return (
                    <td key={d} className="p-0 align-top">
                      <button onClick={() => onOpen(p.id, d)} className="flex w-full min-w-24 flex-col gap-1 rounded-xl p-2 text-left ring-1 ring-breeze-100 hover:bg-breeze-50">
                        <span className="sr-only">{`${p.firstName} ${p.lastName.charAt(0)}., ${formatDayShort(atLocal(d, "12:00"), locale)}: `}</span>
                        <b>{t("panel.team.count", { count: o.count })}</b>
                        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                          <i className="block h-full rounded-full" style={{ width: `${o.pct}%`, background: RAMP[step - 1] }} />
                        </span>
                        <span className="text-xs text-ink/70">{t("panel.team.free", { pct: o.pct, free })}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/70">
        {RAMP.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm ring-1 ring-ink/10" style={{ background: c }} />
            {t(`panel.team.step${i + 1}`)}
          </span>
        ))}
      </div>
    </section>
  );
}

function MoveSheet({
  appt,
  draft,
  pros,
  ctx,
  stepMin,
  canChangePro,
  todayKey,
  actions,
  onClose,
  onDone,
}: {
  appt: AgendaAppt;
  draft?: Target;
  pros: AgendaPro[];
  ctx: MoveContext;
  stepMin: number;
  canChangePro: boolean;
  todayKey: string;
  actions: AgendaActions;
  onClose: () => void;
  onDone: (appt: AgendaAppt, next: Target, notify: boolean) => void;
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const s0 = new Date(appt.startsAt);
  const cur: Target = { proId: appt.professionalId, dateKey: localDateKey(s0), startMin: minutesOfDay(s0), durationMin: durOf(appt) };
  const init = draft ?? cur;
  const [proId, setProId] = useState(init.proId);
  const [dateKey, setDateKey] = useState(init.dateKey);
  const [startMin, setStartMin] = useState(init.startMin);
  const [durationMin, setDurationMin] = useState(init.durationMin);
  const [notify, setNotify] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next: Target = { proId, dateKey, startMin, durationMin };
  const moved = proId !== cur.proId || dateKey !== cur.dateKey || startMin !== cur.startMin;
  const changed = moved || durationMin !== cur.durationMin;
  const problem = changed ? checkMove(ctx, appt, { professionalId: proId, startsAt: targetStart(next), durationMin }) : null;
  const times = useMemo(() => {
    const set = new Set<number>([cur.startMin, init.startMin, startMin]);
    for (let m = START_H * 60; m < END_H * 60; m += stepMin) set.add(m);
    return [...set].sort((a, b) => a - b);
  }, [cur.startMin, init.startMin, startMin, stepMin]);
  const durations = useMemo(() => {
    const set = new Set<number>([cur.durationMin, init.durationMin, durationMin]);
    for (let m = 5; m <= 240; m += 5) set.add(m);
    return [...set].sort((a, b) => a - b);
  }, [cur.durationMin, init.durationMin, durationMin]);
  const proLabel = (p: AgendaPro) => `${p.firstName} ${p.lastName.charAt(0)}.`;
  const curPro = pros.find((p) => p.id === cur.proId);

  const confirm = async () => {
    setPending(true);
    setError(null);
    const r = await actions.move({ appointmentId: appt.id, professionalId: proId, startsAt: targetStart(next).toISOString(), durationMin, notify: moved ? notify : false });
    setPending(false);
    if (r.ok) {
      onDone(appt, next, moved ? notify : false);
      onClose();
    } else setError(r.error);
  };

  const field = "mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100";
  return (
    <Modal title={t("panel.move.title", { name: appt.customerName })} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-ink/70">
          {t("panel.move.current", {
            when: `${formatDayShort(s0, locale)}, ${formatTime(s0)} – ${formatTime(new Date(appt.endsAt))}`,
            pro: curPro ? proLabel(curPro) : "",
          })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {canChangePro && (
            <label className="block">
              <span className="text-xs font-bold text-ink/70">{t("panel.move.pro")}</span>
              <select value={proId} onChange={(e) => setProId(e.target.value)} className={field}>
                {pros.map((p) => (
                  <option key={p.id} value={p.id}>{proLabel(p)}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-xs font-bold text-ink/70">{t("panel.move.day")}</span>
            <input type="date" value={dateKey} min={todayKey} onChange={(e) => e.target.value && setDateKey(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-ink/70">{t("panel.move.time")}</span>
            <select value={startMin} onChange={(e) => setStartMin(Number(e.target.value))} className={field}>
              {times.map((m) => (
                <option key={m} value={m}>{formatTime(atLocal(dateKey, hhmm(m)))}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-ink/70">{t("panel.move.duration")}</span>
            <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={field}>
              {durations.map((m) => (
                <option key={m} value={m}>{formatDuration(m)}</option>
              ))}
            </select>
          </label>
        </div>
        <p aria-live="polite" className={`min-h-6 font-semibold ${!changed ? "text-ink/70" : problem ? "text-red-700" : "text-emerald-800"}`}>
          {!changed ? t("panel.move.pick") : problem ? `✕ ${problemText(t, problem)}` : `✓ ${t("panel.move.ok")}`}
        </p>
        {moved && (
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 size-5 accent-[#0e7c86]" />
            <span>
              <b>{t("panel.move.notify")}</b>
              <span className="block text-xs text-ink/70">{t("panel.move.notifyHint")}</span>
            </span>
          </label>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 font-bold text-ink/70 hover:bg-breeze-50">{t("common.cancel")}</button>
          <button
            onClick={confirm}
            disabled={!changed || !!problem || pending}
            className="inline-flex items-center gap-2 rounded-xl bg-lagoon px-5 py-2.5 font-bold text-white disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MoveRight className="size-4" aria-hidden="true" />}
            {t("panel.move.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl animate-fade-up sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
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

function DetailModal({ a, pro, now, actions, onClose, onMove }: { a: AgendaAppt; pro: AgendaPro; now: Date; actions: AgendaActions; onClose: () => void; onMove?: () => void }) {
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
        {onMove && (
          <button onClick={onMove} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 font-bold text-lagoon ring-1 ring-lagoon hover:bg-breeze-50">
            <MoveRight className="size-4" aria-hidden="true" /> {t("panel.move.button")}
          </button>
        )}
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
