"use client";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { loadMoreReviews } from "@/app/review-actions";
import { useAppLocale } from "@/components/Providers";
import { authorLabel, ratingLabel, showRating, type PublicReview, type SalonReviews } from "@/lib/reviews";
import { formatDayShort } from "@/lib/time";
import { Stars } from "./Stars";

/** Reseñas verificadas en la página pública del salón: resumen (desde 3 reseñas) y lista con la respuesta del salón. */
export function ReviewsList({ salonId, reviews }: { salonId: string; reviews: SalonReviews }) {
  const t = useTranslations("reviews");
  const tt = useTranslations();
  const { locale } = useAppLocale();
  const [list, setList] = useState<PublicReview[]>(reviews.reviews);
  const [done, setDone] = useState(reviews.reviews.length >= reviews.count);
  const [pending, start] = useTransition();
  if (reviews.count === 0) return null;
  const label = ratingLabel(reviews.avg, reviews.count);
  const max = Math.max(1, ...Object.values(reviews.distribution));

  const more = () =>
    start(async () => {
      const next = await loadMoreReviews(salonId, list.length);
      setList((l) => [...l, ...next]);
      if (next.length < 10) setDone(true);
    });

  return (
    <section className="mt-8" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="text-xl font-bold">{t("title2")}</h2>
      <p className="text-sm text-ink/70">{t("fromClients")}</p>

      <div className="mt-3 flex flex-wrap items-center gap-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
        {label ? (
          <>
            <div className="text-center">
              <p className="text-4xl font-extrabold">{label}</p>
              <Stars rating={Number(reviews.avg)} label={tt("reviews.starsLabel", { count: Math.round(Number(reviews.avg)) })} />
              <p className="mt-0.5 text-xs text-ink/70">{t("summary", { count: reviews.count })}</p>
            </div>
            <ul className="min-w-40 flex-1 space-y-1 text-xs" aria-label={t("title2")}>
              {([5, 4, 3, 2, 1] as const).map((n) => {
                const c = reviews.distribution[String(n) as "1"] ?? 0;
                return (
                  <li key={n} className="grid grid-cols-[1rem_1fr_1.5rem] items-center gap-2">
                    <span className="font-bold">{n}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-breeze-100"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(c / max) * 100}%` }} /></span>
                    <span className="text-right text-ink/70">{c}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-sm"><span className="mr-2 rounded-full bg-breeze-50 px-2.5 py-1 text-xs font-bold text-lagoon">{t("new")}</span>{t("summary", { count: reviews.count })}</p>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {list.map((r) => {
          const service = locale === "es" ? r.service_es || r.service_en : r.service_en || r.service_es;
          return (
            <li key={r.id} className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{authorLabel(r.author, locale)}</p>
                <Stars rating={r.rating} label={tt("reviews.starsLabel", { count: r.rating })} />
              </div>
              <p className="text-xs text-ink/70">
                {[service, r.pro_name && (locale === "es" ? `con ${r.pro_name}` : `with ${r.pro_name}`), formatDayShort(new Date(r.created_at), locale)].filter(Boolean).join(" · ")}
              </p>
              {r.comment && <p className="mt-2 whitespace-pre-line break-words">{r.comment}</p>}
              {r.reply && (
                <div className="mt-3 rounded-r-xl border-l-4 border-lagoon bg-breeze-50 px-3 py-2 text-sm">
                  <p className="text-xs font-bold text-lagoon">{t("reply")}</p>
                  <p className="whitespace-pre-line break-words">{r.reply}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!done && (
        <button onClick={more} disabled={pending} className="mt-3 w-full rounded-2xl bg-white py-3 text-sm font-bold text-lagoon ring-1 ring-breeze-100 hover:bg-breeze-50 disabled:opacity-50">
          {t("more")}
        </button>
      )}
    </section>
  );
}
