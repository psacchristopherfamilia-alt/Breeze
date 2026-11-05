"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { moderateReview } from "@/app/admin/actions";
import { useAppLocale } from "@/components/Providers";
import { Stars } from "@/components/reviews/Stars";
import { authorLabel, type StaffReview } from "@/lib/reviews";
import { formatDayShort } from "@/lib/time";

export type ReportedReview = StaffReview & { salon_name: string; reported_at: string };

/** Cola de reseñas reportadas por los salones. Ocultar no borra nada y deja constancia en la auditoría. */
export function ReportedReviews({ reviews }: { reviews: ReportedReview[] }) {
  const t = useTranslations("admin.reviews");
  const tt = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (id: string, action: "hide" | "keep") =>
    start(async () => {
      const r = await moderateReview(id, action);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else setError(r.error);
    });

  return (
    <section className="mt-8" aria-labelledby="reported-title">
      <h2 id="reported-title" className="text-lg font-extrabold">{t("title")} <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{reviews.length}</span></h2>
      <p className="text-sm text-ink/70">{t("hint")}</p>
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{tt(`admin.errors.${error}`)}</p>}
      {reviews.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-5 text-sm text-ink/70 ring-1 ring-breeze-100">{t("empty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{authorLabel(r.author, locale)} → {r.salon_name}</p>
                <Stars rating={r.rating} label={tt("reviews.starsLabel", { count: r.rating })} />
              </div>
              <p className="text-xs text-ink/70">{t("reportedOn", { date: formatDayShort(new Date(r.reported_at), locale) })}</p>
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm"><b>{t("reason")}:</b> {r.reported_reason}</p>
              {r.comment ? <p className="mt-2 whitespace-pre-line break-words">{r.comment}</p> : <p className="mt-2 text-sm text-ink/70">{t("noComment")}</p>}
              {r.reply && <p className="mt-2 border-l-4 border-lagoon pl-3 text-sm"><b>{t("salonReply")}:</b> {r.reply}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={pending} onClick={() => act(r.id, "hide")} className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} {t("hide")}
                </button>
                <button disabled={pending} onClick={() => act(r.id, "keep")} className="rounded-xl px-4 py-2 text-sm font-bold text-lagoon ring-1 ring-lagoon hover:bg-breeze-50 disabled:opacity-50">{t("keep")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
