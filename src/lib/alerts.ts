import { formatDayShort, formatTime, localDateKey } from "./time";

export type AlertKind = "booked" | "rescheduled" | "cancelled" | "review";

export interface AlertRow {
  id: string;
  kind: AlertKind;
  customer_display: string;
  service_en: string;
  service_es: string;
  pro_name: string;
  starts_at: string;
  /** Solo en los avisos de reseña (1 a 5). */
  rating?: number | null;
  created_at: string;
  read_at: string | null;
}

const TITLES: Record<"en" | "es", Record<AlertKind, string>> = {
  en: { booked: "New booking", rescheduled: "Booking changed", cancelled: "Booking cancelled", review: "New review" },
  es: { booked: "Reserva nueva", rescheduled: "Reserva cambiada", cancelled: "Reserva cancelada", review: "Reseña nueva" },
};

/** Texto del aviso (campana y notificación del teléfono). Solo datos públicos: "Juan P.", servicio, profesional y hora. */
export function alertText(a: Pick<AlertRow, "kind" | "customer_display" | "service_en" | "service_es" | "pro_name" | "starts_at"> & { rating?: number | null }, locale: "en" | "es") {
  const start = new Date(a.starts_at);
  const service = (locale === "es" ? a.service_es || a.service_en : a.service_en || a.service_es).trim();
  const who = a.customer_display.trim();
  const withPro = a.pro_name.trim() ? (locale === "es" ? `con ${a.pro_name.trim()}` : `with ${a.pro_name.trim()}`) : "";
  const what = [service, withPro].filter(Boolean).join(" ");
  const when = `${formatDayShort(start, locale)}, ${formatTime(start)}`;
  // Reseña: «Reseña nueva ★★★★★» y quién, qué servicio y con quién (la hora de la cita es solo contexto).
  if (a.kind === "review") {
    const stars = a.rating ? `${"★".repeat(a.rating)}${"☆".repeat(5 - a.rating)}` : "";
    return {
      title: [TITLES[locale].review, stars].filter(Boolean).join(" "),
      body: [who, what].filter(Boolean).join(" · "),
      dateKey: localDateKey(start),
      href: "/dashboard/reviews",
    };
  }
  return {
    title: TITLES[locale][a.kind],
    body: [who, what, when].filter(Boolean).join(" · "),
    /** Día de la cita (hora de Turks and Caicos), para abrir la agenda de ese día. */
    dateKey: localDateKey(start),
    href: `/dashboard?date=${localDateKey(start)}`,
  };
}
