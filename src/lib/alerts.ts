import { formatDayShort, formatTime, localDateKey } from "./time";

export type AlertKind = "booked" | "rescheduled" | "cancelled";

export interface AlertRow {
  id: string;
  kind: AlertKind;
  customer_display: string;
  service_en: string;
  service_es: string;
  pro_name: string;
  starts_at: string;
  created_at: string;
  read_at: string | null;
}

const TITLES: Record<"en" | "es", Record<AlertKind, string>> = {
  en: { booked: "New booking", rescheduled: "Booking changed", cancelled: "Booking cancelled" },
  es: { booked: "Reserva nueva", rescheduled: "Reserva cambiada", cancelled: "Reserva cancelada" },
};

/** Texto del aviso (campana y notificación del teléfono). Solo datos públicos: "Juan P.", servicio, profesional y hora. */
export function alertText(a: Pick<AlertRow, "kind" | "customer_display" | "service_en" | "service_es" | "pro_name" | "starts_at">, locale: "en" | "es") {
  const start = new Date(a.starts_at);
  const service = (locale === "es" ? a.service_es || a.service_en : a.service_en || a.service_es).trim();
  const who = a.customer_display.trim();
  const withPro = a.pro_name.trim() ? (locale === "es" ? `con ${a.pro_name.trim()}` : `with ${a.pro_name.trim()}`) : "";
  const what = [service, withPro].filter(Boolean).join(" ");
  const when = `${formatDayShort(start, locale)}, ${formatTime(start)}`;
  return {
    title: TITLES[locale][a.kind],
    body: [who, what, when].filter(Boolean).join(" · "),
    /** Día de la cita (hora de Turks and Caicos), para abrir la agenda de ese día. */
    dateKey: localDateKey(start),
  };
}
