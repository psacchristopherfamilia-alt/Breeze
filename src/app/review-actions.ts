"use server";
import { MAX_COMMENT, isReviewRef, reviewErrorKey } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/server";

/** Deja o edita una reseña. `ref` es el enlace privado del invitado o el id de una reserva propia (con sesión). */
export async function submitReview(ref: string, rating: number, comment: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isReviewRef(ref)) return { ok: false, error: "not_found" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "invalid_rating" };
  if (comment.length > MAX_COMMENT) return { ok: false, error: "comment_too_long" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_review", { p_ref: ref, p_rating: rating, p_comment: comment.trim() || undefined });
  return error ? { ok: false, error: reviewErrorKey(error) } : { ok: true };
}

/** Más reseñas públicas de un salón (paginación del botón «Ver más»). */
export async function loadMoreReviews(salonId: string, offset: number) {
  if (!/^[0-9a-f-]{36}$/i.test(salonId) || !Number.isInteger(offset) || offset < 0 || offset > 1000) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_salon_reviews", { p_salon_id: salonId, p_limit: 10, p_offset: offset });
  return ((data as unknown as import("@/lib/reviews").SalonReviews | null)?.reviews ?? []);
}
