import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { isReviewRef, type ReviewRequest } from "@/lib/reviews";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** El enlace es privado: nunca se indexa. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** /r/[ref]: dejar la reseña de una cita (enlace del invitado o id de reserva con sesión). */
export default async function ReviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!isSupabaseConfigured() || !isReviewRef(ref)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_review_request", { p_ref: ref });
  if (error || !data) notFound();
  return <ReviewForm reflink={ref} request={data as unknown as ReviewRequest} />;
}
