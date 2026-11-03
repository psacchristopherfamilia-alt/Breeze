import { atLocal } from "./time";

export interface Interval {
  start: Date;
  end: Date;
}

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
 * slot válido ⇔ [inicio, inicio + totalMin) cabe en un tramo laboral,
 *               empieza después de ahora + antelación,
 *               y no se solapa con ningún rango ocupado (rangos semiabiertos [inicio, fin)).
 *
 * Nota: esto solo decide qué horas OFRECER. La garantía real contra la doble reserva
 * es la exclusion constraint de Postgres (Fase 4).
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
