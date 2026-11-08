import type { WeeklyHours } from "../availability";
import { localDateKey, minutesOfDay, weekdayOf } from "../time";

/**
 * Comprobaciones de la agenda ANTES de mover una cita (para pintar verde/rojo mientras se arrastra).
 * Son las mismas reglas que aplica `staff_move_appointment` en la base de datos, pero la base de datos
 * siempre tiene la última palabra (alguien pudo reservar ese hueco hace un segundo).
 */

export interface MovableAppt {
  id: string;
  groupId: string;
  professionalId: string;
  serviceId?: string;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  status: "booked" | "completed" | "cancelled" | "no_show";
  customerId?: string;
}
export interface MovePro {
  id: string;
  firstName: string;
  lastName: string;
  serviceIds: string[];
  hours: WeeklyHours;
}
export interface MoveContext {
  /** Todas las citas visibles (de cualquier profesional); las canceladas se ignoran. */
  appointments: MovableAppt[];
  pros: MovePro[];
  /** Días libres y cierres como rangos. */
  blocked: { professionalId: string; start: Date; end: Date }[];
  now: Date;
}
export interface MoveTarget {
  professionalId: string;
  startsAt: Date;
  durationMin: number;
}
/** `key` es una clave de panel.move.reasons.* */
export interface MoveProblem {
  key: "not_booked" | "started" | "past" | "not_offered" | "day_off" | "outside_hours" | "blocked" | "overlap";
  params?: Record<string, string>;
}

const MIN = 60_000;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const proName = (p: MovePro | undefined) => (p ? `${p.firstName} ${p.lastName.charAt(0)}.`.trim() : "");
const bufferOf = (a: MovableAppt) => (new Date(a.blockedUntil).getTime() - new Date(a.endsAt).getTime()) / MIN;
const durationOf = (a: MovableAppt) => Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / MIN);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** ¿Es una reserva con varios servicios que se mueve entera? (mismo profesional y misma duración) */
export function movesWholeGroup(ctx: MoveContext, appt: MovableAppt, t: MoveTarget): boolean {
  if (t.professionalId !== appt.professionalId || t.durationMin !== durationOf(appt)) return false;
  return ctx.appointments.filter((a) => a.groupId === appt.groupId && a.status === "booked").length > 1;
}

/** Comprueba que `item` cabe en (profesional, inicio, duración), ignorando las citas de `ignore`. */
function checkPlacement(
  ctx: MoveContext,
  item: MovableAppt,
  proId: string,
  start: Date,
  durationMin: number,
  ignore: Set<string>,
): MoveProblem | null {
  const pro = ctx.pros.find((p) => p.id === proId);
  if (!pro) return { key: "day_off", params: { pro: "" } };
  const name = proName(pro);
  if (proId !== item.professionalId && item.serviceId && !pro.serviceIds.includes(item.serviceId)) {
    return { key: "not_offered", params: { pro: name } };
  }
  const buffer = bufferOf(item);
  const blockedEnd = new Date(start.getTime() + (durationMin + buffer) * MIN);
  const shifts = pro.hours[weekdayOf(localDateKey(start))] ?? [];
  if (shifts.length === 0) return { key: "day_off", params: { pro: name } };
  const startMin = minutesOfDay(start);
  const endMin = startMin + durationMin + buffer;
  if (!shifts.some(([a, b]) => startMin >= toMin(a) && endMin <= toMin(b))) {
    return { key: "outside_hours", params: { pro: name, from: shifts[0][0], to: shifts[shifts.length - 1][1] } };
  }
  for (const b of ctx.blocked) {
    if (b.professionalId === proId && start < b.end && b.start < blockedEnd) return { key: "blocked", params: { pro: name } };
  }
  for (const o of ctx.appointments) {
    if (ignore.has(o.id) || o.status === "cancelled") continue;
    const oStart = new Date(o.startsAt);
    const oEnd = new Date(o.blockedUntil);
    if (!(start < oEnd && oStart < blockedEnd)) continue;
    if (o.professionalId === proId) return { key: "overlap", params: { time: hhmm(minutesOfDay(oStart)) } };
    // El mismo cliente no puede estar en dos sitios a la vez.
    if (item.customerId && o.customerId === item.customerId) return { key: "overlap", params: { time: hhmm(minutesOfDay(oStart)) } };
  }
  return null;
}

/** Devuelve el motivo por el que NO se puede mover la cita así, o null si parece posible. */
export function checkMove(ctx: MoveContext, appt: MovableAppt, t: MoveTarget): MoveProblem | null {
  if (appt.status !== "booked") return { key: "not_booked" };
  if (new Date(appt.startsAt) <= ctx.now) return { key: "started" };
  if (t.startsAt < ctx.now) return { key: "past" };

  if (movesWholeGroup(ctx, appt, t)) {
    // La reserva entera se desplaza lo mismo que la cita arrastrada; cada servicio conserva su profesional.
    const delta = t.startsAt.getTime() - new Date(appt.startsAt).getTime();
    const members = ctx.appointments.filter((a) => a.groupId === appt.groupId && a.status === "booked");
    const ids = new Set(members.map((m) => m.id));
    for (const m of members) {
      const s = new Date(new Date(m.startsAt).getTime() + delta);
      const p = checkPlacement(ctx, m, m.professionalId, s, durationOf(m), ids);
      if (p) return p;
    }
    return null;
  }
  return checkPlacement(ctx, appt, t.professionalId, t.startsAt, t.durationMin, new Set([appt.id]));
}
