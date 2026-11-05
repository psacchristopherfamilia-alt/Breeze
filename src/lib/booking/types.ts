import type { BusyRange, WeeklyHours } from "../availability";
import type { BusinessType, CategoryCode, ProTitle, Zone } from "../mock/data";
import type { SalonReviews } from "../reviews";

/** Datos que necesita la pantalla de reserva, vengan del prototipo o de Supabase. */
export interface PublicSalon {
  id: string;
  slug: string;
  name: string;
  businessTypes: BusinessType[];
  zone: Zone;
  address: string | null;
  phone: string | null;
  rating?: number;
  reviews?: number;
  cover: [string, string];
  /** Fotos reales del salón (URL pública). Sin ellas se usa el degradado `cover`. */
  coverUrl?: string | null;
  logoUrl?: string | null;
  gallery?: string[];
  cancellationWindowHours: number;
  slotStepMin: number;
  minLeadMin: number;
  maxAdvanceDays: number;
}

export interface PublicService {
  id: string;
  category: CategoryCode;
  nameEn: string;
  nameEs: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  photoUrl?: string | null;
}

/** Profesional tal como lo ve el público: nombre + inicial del apellido, nunca más. */
/** Cómo cobra el profesional. Breeze no procesa pagos: solo se muestra al cliente al reservar. */
export interface ProPayment {
  cash: boolean;
  card: boolean;
  transfer: boolean;
  /** Datos para transferir (banco, cuenta, a quién enviar el comprobante). Obligatorio si acepta transferencia. */
  note: string | null;
}

export interface PublicPro {
  id: string;
  firstName: string;
  lastName: string; // en datos reales solo la inicial
  colorHex: string;
  title: ProTitle;
  serviceIds: string[];
  hours: WeeklyHours;
  payment: ProPayment;
  photoUrl?: string | null;
  /** Promedio de sus reseñas (solo desde 3). */
  rating?: { avg: number; count: number };
}

export interface BookingData {
  salon: PublicSalon;
  services: PublicService[];
  pros: PublicPro[];
  /** Reseñas verificadas (solo datos reales). */
  reviews?: SalonReviews;
}

export interface ConfirmRequest {
  items: { serviceId: string; professionalId: string }[];
  startsAt: string; // ISO UTC
  /** Token del captcha (solo reservas de invitado cuando el captcha está activado). */
  captchaToken?: string;
  guest?: { firstName: string; lastName: string; phone: string; email?: string; whatsapp: boolean; locale: "en" | "es" };
}

export type ConfirmResult =
  | { ok: true; bookingGroupId: string; guestToken?: string | null }
  | { ok: false; error: string };

export interface ExistingBooking {
  /** Para reprogramar: reserva actual (sus rangos no cuentan como ocupados). */
  serviceIds: string[];
  professionalId: string;
  ranges: BusyRange[];
}

/** Portada provisional (degradado) estable por salón hasta que suban fotos. */
const COVERS: [string, string][] = [
  ["#0E7C86", "#2563EB"],
  ["#F59E8B", "#BE185D"],
  ["#7DD7D4", "#047857"],
  ["#FBBF24", "#C2410C"],
  ["#4F46E5", "#0E7490"],
  ["#2BB3B1", "#7C3AED"],
];
export function coverFor(id: string): [string, string] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

/** Traduce los errores de las RPC (mensajes como 'too_soon' o el código 23P01) a claves booking.errors.* */
export function bookingErrorKey(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "generic";
  if (e.code === "23P01") return "slot_taken";
  const known = [
    "too_soon", "too_far", "outside_working_hours", "salon_not_bookable", "guest_limit", "customer_blocked",
    "phone_required", "name_required", "service_not_offered", "invalid_items", "outside_change_window",
    "nothing_to_cancel", "nothing_to_reschedule", "not_found", "captcha_failed",
  ];
  return known.includes(e.message ?? "") ? (e.message as string) : "generic";
}

/** Reserva tal como la devuelven my_bookings() / get_guest_booking(). */
export interface BookingSummary {
  booking_group_id: string;
  source: "online" | "phone" | "walk_in";
  can_change: boolean;
  customer_display: string;
  salon: { id: string; name: string; slug: string; phone: string | null; address: string | null; cancellation_window_hours: number };
  items: {
    appointment_id: string;
    service_id: string | null;
    service_name_en: string;
    service_name_es: string;
    price_cents: number;
    starts_at: string;
    ends_at: string;
    status: "booked" | "completed" | "cancelled" | "no_show";
    professional: { id: string; public_name: string; initials: string; color_hex: string };
  }[];
}
