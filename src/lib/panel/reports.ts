import { addDaysKey } from "../time";

/** Lo que devuelve la RPC `staff_report`. Dinero en centavos. */
export interface ReportTotals {
  revenue_cents: number;
  appointments: number;
  avg_ticket_cents: number;
  booked_min: number;
  open_min: number;
  occupancy_pct: number;
}
export interface StaffReport {
  current: ReportTotals;
  previous: ReportTotals;
  by_pro: { id: string; name: string; color_hex: string; revenue_cents: number; appointments: number; occupancy_pct: number }[];
  by_service: { name_en: string; name_es: string; appointments: number; revenue_cents: number }[];
  /** dow: 0 = domingo; hour: hora local (0–23). */
  heatmap: { dow: number; hour: number; count: number }[];
  clients: { new: number; returning: number };
  /** Solo dueño y administradores (null para el profesional). */
  lapsed: { customer_id: string; name: string; last_visit: string }[] | null;
}

export const PERIODS = [7, 30] as const;
export type PeriodDays = (typeof PERIODS)[number];
export const parsePeriod = (v: string | undefined): PeriodDays => (v === "30" ? 30 : 7);

/** «Últimos N días» (hoy incluido): desde `fromKey` hasta `toKeyExclusive`, en días locales de TCI. */
export function periodKeys(todayKey: string, days: number): { fromKey: string; toKeyExclusive: string } {
  return { fromKey: addDaysKey(todayKey, 1 - days), toKeyExclusive: addDaysKey(todayKey, 1) };
}

export interface Delta {
  /** Porcentaje (o puntos) con un decimal; null si el periodo anterior no tiene con qué comparar. */
  value: number | null;
  dir: "up" | "down" | "flat";
}

/** Cambio frente al periodo anterior. `pts` = diferencia de puntos porcentuales (para la ocupación). */
export function delta(current: number, previous: number, kind: "pct" | "pts" = "pct"): Delta {
  let value: number | null;
  if (kind === "pts") value = Math.round((current - previous) * 10) / 10;
  else if (previous > 0) value = Math.round(((current - previous) / previous) * 1000) / 10;
  else value = null;
  if (value === null) return { value, dir: "flat" };
  return { value, dir: Math.abs(value) < 0.5 ? "flat" : value > 0 ? "up" : "down" };
}

/** Lunes primero; el domingo al final. */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export interface HeatGrid {
  hours: number[];
  /** rows[i][j]: citas a la hora hours[i] el día DOW_ORDER[j]. */
  rows: number[][];
  max: number;
  best: { dow: number; hour: number; count: number } | null;
}

/** Cuadrícula día × hora. Siempre cubre al menos de 9:00 a 17:59 para que no cambie de forma de un periodo a otro. */
export function heatGrid(heatmap: StaffReport["heatmap"]): HeatGrid {
  const hoursPresent = heatmap.map((h) => h.hour);
  const lo = Math.min(9, ...hoursPresent);
  const hi = Math.max(17, ...hoursPresent);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const rows = hours.map((h) => DOW_ORDER.map((d) => heatmap.filter((x) => x.hour === h && x.dow === d).reduce((s, x) => s + x.count, 0)));
  let best: HeatGrid["best"] = null;
  heatmap.forEach((x) => {
    if (!best || x.count > best.count) best = { dow: x.dow, hour: x.hour, count: x.count };
  });
  return { hours, rows, max: Math.max(0, ...rows.flat()), best };
}

/** Escalón 1–5 de la rampa de color: 0 citas y pocas citas comparten el más claro. */
export function heatStep(count: number, max: number): 1 | 2 | 3 | 4 | 5 {
  if (count <= 0 || max <= 0) return 1;
  return Math.min(5, Math.max(1, Math.ceil((count / max) * 5))) as 1 | 2 | 3 | 4 | 5;
}

/** Dinero en dólares con separador de miles: 268200 → "$2,682"; 3624 → "$36.24" (sin decimales si son redondos). */
export function formatMoney(cents: number): string {
  const whole = cents % 100 === 0;
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Parte de un total en porcentaje entero (0 si el total es 0). */
export const share = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
