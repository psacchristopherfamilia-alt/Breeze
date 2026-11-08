import type { WeeklyHours } from "../availability";
import { addDaysKey, atLocal, weekdayOf } from "../time";

const MIN = 60_000;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Lunes de la semana que contiene `dateKey` (las semanas de Breeze empiezan en lunes). */
export function weekStartKey(dateKey: string): string {
  return addDaysKey(dateKey, -((weekdayOf(dateKey) + 6) % 7));
}

/** Los 7 días (lunes a domingo) de la semana que contiene `dateKey`. */
export function weekDays(dateKey: string): string[] {
  const start = weekStartKey(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

export interface OccupancyDay {
  count: number;
  bookedMin: number;
  /** Minutos de horario sin contar días libres ni cierres. */
  openMin: number;
  /** 0–100, redondeado; 0 si no hay horario. */
  pct: number;
  freeMin: number;
  /** El profesional no trabaja ese día. */
  closed: boolean;
}

/** Ocupación de un profesional en un día: minutos con cita ÷ minutos de horario (menos días libres y cierres). */
export function occupancyOfDay(
  hours: WeeklyHours,
  dateKey: string,
  appts: { startsAt: string; endsAt: string; status: string }[],
  blocked: { start: Date; end: Date }[],
): OccupancyDay {
  const shifts = hours[weekdayOf(dateKey)] ?? [];
  const list = appts.filter((a) => a.status !== "cancelled");
  if (shifts.length === 0) return { count: list.length, bookedMin: 0, openMin: 0, pct: 0, freeMin: 0, closed: true };
  let openMin = 0;
  for (const [a, b] of shifts) {
    const s = atLocal(dateKey, a).getTime();
    const e = atLocal(dateKey, b).getTime();
    // Unión de los bloqueos que tocan este tramo.
    const cuts = blocked
      .map((x) => [Math.max(s, x.start.getTime()), Math.min(e, x.end.getTime())] as const)
      .filter(([x, y]) => y > x)
      .sort((p, q) => p[0] - q[0]);
    let cut = 0;
    let cursor = s;
    for (const [x, y] of cuts) {
      const from = Math.max(x, cursor);
      if (y > from) cut += y - from;
      cursor = Math.max(cursor, y);
    }
    openMin += Math.max(0, (e - s - cut) / MIN);
  }
  const bookedMin = list.reduce((sum, a) => sum + (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / MIN, 0);
  const pct = openMin > 0 ? Math.min(100, Math.round((bookedMin / openMin) * 100)) : 0;
  return { count: list.length, bookedMin, openMin, pct, freeMin: Math.max(0, Math.round(openMin - bookedMin)), closed: false };
}

/** Escalón 1–5 para la rampa de color (0–19 %, 20–39 %…). */
export function occupancyStep(pct: number): 1 | 2 | 3 | 4 | 5 {
  return pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1;
}

export const toHM = toMin;
