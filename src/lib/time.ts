import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";

/** Zona horaria oficial de Breeze. Todo se guarda en UTC y se muestra aquí. */
export const TZ = "America/Grand_Turk";

export type AppLocale = "en" | "es";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const dfLocale = (l: AppLocale) => (l === "es" ? es : enUS);

/** Convierte un instante UTC a un objeto fecha que "piensa" en hora de TCI. */
export function toTZ(d: Date | number | string): TZDate {
  return new TZDate(new Date(d).getTime(), TZ);
}

/** Clave de día local de TCI: "2026-11-10". */
export function localDateKey(d: Date | number): string {
  return format(toTZ(d), "yyyy-MM-dd");
}

/** Instante UTC que corresponde a una hora local de TCI ("15:00") en un día dado. */
export function atLocal(dateKey: string, hhmm: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, h, mi, 0, 0, TZ).getTime());
}

/** Día de la semana (0 = domingo) de una clave de día local. */
export function weekdayOf(dateKey: string): number {
  return toTZ(atLocal(dateKey, "12:00")).getDay();
}

/** Suma días a una clave local (usa el mediodía para ser seguro ante cambios de hora). */
export function addDaysKey(dateKey: string, n: number): string {
  return localDateKey(atLocal(dateKey, "12:00").getTime() + n * DAY);
}

export const addMinutes = (d: Date, min: number) => new Date(d.getTime() + min * MINUTE);

/** "3:00 PM" en ambos idiomas (formato habitual en TCI). */
export function formatTime(d: Date | number): string {
  return format(toTZ(d), "h:mm a", { locale: enUS });
}

/** "Tue, Nov 10" / "mar 10 nov." */
export function formatDayShort(d: Date | number, locale: AppLocale): string {
  return locale === "es"
    ? format(toTZ(d), "EEE d MMM", { locale: es }) + "."
    : format(toTZ(d), "EEE, MMM d", { locale: enUS });
}

/** "Tuesday, November 10" / "martes, 10 de noviembre" */
export function formatDayLong(d: Date | number, locale: AppLocale): string {
  return locale === "es"
    ? format(toTZ(d), "EEEE, d 'de' MMMM", { locale: es })
    : format(toTZ(d), "EEEE, MMMM d", { locale: enUS });
}

/** Texto de la alerta de Breeze Live: "Tue, Nov 10 at 3:00 PM" / "el martes 10 de nov. a las 3:00 PM". */
export function formatLiveWhen(d: Date | number, locale: AppLocale): string {
  const z = toTZ(d);
  return locale === "es"
    ? `el ${format(z, "EEEE d 'de' MMM", { locale: es })}. a las ${formatTime(d)}`
    : `${format(z, "EEE, MMM d", { locale: enUS })} at ${formatTime(d)}`;
}

/** Minutos desde medianoche local (para posicionar bloques en la agenda). */
export function minutesOfDay(d: Date | number): number {
  const z = toTZ(d);
  return z.getHours() * 60 + z.getMinutes();
}
