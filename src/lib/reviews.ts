/** Reseñas verificadas (solo quien tuvo la cita). Los datos públicos salen de la RPC `get_salon_reviews`. */

/** Con menos reseñas no se muestra promedio: una sola de 5 estrellas no dice nada. */
export const MIN_REVIEWS_TO_SHOW = 3;
export const MAX_COMMENT = 500;
export const REVIEW_WINDOW_DAYS = 14;

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  /** "Juan P."; vacío si esa cuenta se eliminó. */
  author: string;
  service_en: string;
  service_es: string;
  pro_name: string;
  created_at: string;
  reply: string | null;
  replied_at: string | null;
}

/** Lo que ve el panel del salón: añade el estado y el motivo si fue reportada. */
export interface StaffReview extends PublicReview {
  status: "visible" | "reported";
  reported_reason: string | null;
}

export interface SalonReviews {
  count: number;
  avg: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  pros: { id: string; avg: number; count: number }[];
  reviews: PublicReview[];
}

export type ReviewState = "ok" | "reviewed" | "too_early" | "not_reviewable" | "expired";

export interface ReviewRequest {
  state: ReviewState;
  salon: { name: string; slug: string };
  pro_name: string;
  service_en: string;
  service_es: string;
  starts_at: string;
  customer_display: string;
  review: { rating: number; comment: string | null; status: string } | null;
}

/** ¿Se muestra el promedio? (a partir de MIN_REVIEWS_TO_SHOW reseñas) */
export function showRating(count: number | null | undefined): boolean {
  return (count ?? 0) >= MIN_REVIEWS_TO_SHOW;
}

/** Promedio con un decimal para mostrar ("4.8"); null si todavía no se debe mostrar. */
export function ratingLabel(avg: number | string | null | undefined, count: number | null | undefined): string | null {
  if (!showRating(count) || avg === null || avg === undefined) return null;
  const n = Number(avg);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

export function authorLabel(author: string, locale: "en" | "es"): string {
  return author.trim() || (locale === "es" ? "Cliente" : "Customer");
}

/** Traduce los errores de las RPC de reseñas a claves reviews.errors.* */
export function reviewErrorKey(e: { code?: string; message?: string } | null | undefined): string {
  const known = [
    "not_found", "too_early", "not_reviewable", "expired", "invalid_rating", "comment_required", "comment_too_long", "review_hidden",
  ];
  return known.includes(e?.message ?? "") ? (e!.message as string) : "generic";
}

/** Un enlace de reseña es el token del invitado (64 hex) o el id de una reserva propia. */
export function isReviewRef(ref: string): boolean {
  return /^[0-9a-f]{64}$/.test(ref) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
}
