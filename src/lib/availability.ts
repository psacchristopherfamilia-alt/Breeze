import { atLocal, weekdayOf } from "./time";

/**
 * Cálculo de disponibilidad (puro, sin red). Decide qué horas OFRECER al cliente.
 * La garantía real contra la doble reserva es la exclusion constraint de Postgres,
 * y la validación final (horario, días libres, cierres) la repite book_appointment().
 */

export interface Interval {
  start: Date;
  end: Date;
}

/** Horario semanal en hora local: clave 0 = domingo … 6 = sábado. */
export type WeeklyHours = Partial<Record<number, [string, string][]>>;

export interface SlotQuery {
  /** Día local de TCI, "2026-11-10". */
  dateKey: string;
  /** Tramos laborales en hora local, p. ej. [["09:00","13:00"],["14:00","18:00"]]. */
  workingHours: [string, string][];
  /** Rangos ocupados en UTC (citas existentes + su buffer, días libres, cierres). */
  busy: Interval[];
  /** Minutos que bloquea la reserva: duración de todos los servicios + buffers. */
  totalMin: number;
  /** Paso entre horas ofrecidas (15 min por defecto). */
  stepMin: number;
  /** Momento actual (inyectado para poder testear). */
  now: Date;
  /** Antelación mínima para reservar en línea. */
  minLeadMin: number;
}

const MIN = 60_000;

/**
 * Huecos libres de un profesional en un día.
 * slot válido ⇔ [inicio, inicio + totalMin) cabe ENTERO en un tramo laboral,
 *               empieza después de ahora + antelación,
 *               y no se solapa con ningún rango ocupado (rangos semiabiertos [inicio, fin)).
 */
export function getAvailableSlots(q: SlotQuery): Date[] {
  const slots: Date[] = [];
  const earliest = q.now.getTime() + q.minLeadMin * MIN;
  const dur = q.totalMin * MIN;
  const step = q.stepMin * MIN;
  const busy = q.busy.map((b) => [b.start.getTime(), b.end.getTime()] as const);

  for (const [from, to] of q.workingHours) {
    const ws = atLocal(q.dateKey, from).getTime();
    const we = atLocal(q.dateKey, to).getTime();
    for (let t = ws; t + dur <= we; t += step) {
      if (t < earliest) continue;
      const end = t + dur;
      if (busy.some(([bs, be]) => t < be && end > bs)) continue;
      slots.push(new Date(t));
    }
  }
  return slots;
}

/** ¿Se solapan dos rangos semiabiertos? */
export const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

export interface ServiceTiming {
  durationMin: number;
  bufferMin: number;
}

/** Minutos que bloquea una reserva de varios servicios en secuencia. */
export const totalBlockMinutes = (items: ServiceTiming[]) => items.reduce((s, i) => s + i.durationMin + i.bufferMin, 0);

/**
 * Horas de cada servicio de una reserva: cada uno empieza cuando acaba el anterior + su buffer.
 * Misma regla que private.plan_items() en la base de datos.
 */
export function planSequence(start: Date, items: ServiceTiming[]) {
  let t = start.getTime();
  return items.map((i) => {
    const s = t;
    const end = s + i.durationMin * MIN;
    const blockedUntil = end + i.bufferMin * MIN;
    t = blockedUntil;
    return { start: new Date(s), end: new Date(end), blockedUntil: new Date(blockedUntil) };
  });
}

export interface ProSchedule {
  id: string;
  hours: WeeklyHours;
}

export interface BusyRange {
  professionalId: string;
  start: Date;
  end: Date;
}

/** Filas de working_hours ({weekday, start, end}) → WeeklyHours. */
export function weeklyHoursFromRows(rows: { weekday: number; start: string; end: string }[]): WeeklyHours {
  const out: WeeklyHours = {};
  for (const r of rows) (out[r.weekday] ??= []).push([r.start, r.end]);
  return out;
}

/**
 * Huecos de un día para uno o varios profesionales ("cualquiera").
 * Si varios están libres a la misma hora, se asigna el primero de la lista (orden del salón).
 */
export function slotsForPros(q: {
  dateKey: string;
  pros: ProSchedule[];
  busy: BusyRange[];
  totalMin: number;
  stepMin: number;
  now: Date;
  minLeadMin: number;
}): { start: Date; proId: string }[] {
  const byTime = new Map<number, string>();
  const weekday = weekdayOf(q.dateKey);
  for (const p of q.pros) {
    const slots = getAvailableSlots({
      dateKey: q.dateKey,
      workingHours: p.hours[weekday] ?? [],
      busy: q.busy.filter((b) => b.professionalId === p.id),
      totalMin: q.totalMin,
      stepMin: q.stepMin,
      now: q.now,
      minLeadMin: q.minLeadMin,
    });
    for (const s of slots) if (!byTime.has(s.getTime())) byTime.set(s.getTime(), p.id);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([ms, proId]) => ({ start: new Date(ms), proId }));
}
