"use client";
import { CheckCircle2, Clock, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { submitReview } from "@/app/review-actions";
import { useAppLocale } from "@/components/Providers";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { MAX_COMMENT, type ReviewRequest } from "@/lib/reviews";
import { formatDayLong } from "@/lib/time";
import { Stars } from "./Stars";

/** Pantalla pública para dejar (o editar) la reseña de una cita. */
export function ReviewForm({ reflink, request }: { reflink: string; request: ReviewRequest }) {
  const t = useTranslations("reviews");
  const { locale } = useAppLocale();
  const [rating, setRating] = useState(request.review?.rating ?? 0);
  const [comment, setComment] = useState(request.review?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const service = locale === "es" ? request.service_es || request.service_en : request.service_en || request.service_es;
  const needsComment = rating > 0 && rating <= 2;
  const canSend = rating > 0 && (!needsComment || comment.trim().length > 0);
  const salonHref = `/s/${request.salon.slug}`;

  const send = () =>
    start(async () => {
      setError(null);
      const r = await submitReview(reflink, rating, comment);
      if (r.ok) setSent(true);
      else setError(r.error);
    });

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-breeze-sky">
      <ClientHeader />
      <main className="mx-auto max-w-md px-4 py-8">{children}</main>
    </div>
  );

  if (sent)
    return shell(
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-breeze-100">
        <CheckCircle2 className="mx-auto size-12 text-breeze-500" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-extrabold">{t("thanksTitle")}</h1>
        <p className="mt-1 text-ink/70">{t("thanksBody", { salon: request.salon.name })}</p>
        <Stars rating={rating} label={t("starsLabel", { count: rating })} className="mt-4 size-6" />
        <Link href={salonHref} className="mt-6 inline-block rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">{t("seePage")}</Link>
      </div>,
    );

  if (request.state !== "ok")
    return shell(
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-breeze-100">
        <Clock className="mx-auto size-12 text-breeze-500" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-extrabold">{t(`state.${request.state}.title`)}</h1>
        <p className="mt-1 text-ink/70">{t(`state.${request.state}.body`, { salon: request.salon.name })}</p>
        <Link href={salonHref} className="mt-6 inline-block rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">{request.salon.name}</Link>
      </div>,
    );

  const labels = ["", t("rating.1"), t("rating.2"), t("rating.3"), t("rating.4"), t("rating.5")];
  return shell(
    <form onSubmit={(e) => { e.preventDefault(); if (canSend) send(); }} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100">
      <p className="text-center text-xs font-bold uppercase tracking-wide text-lagoon">{request.salon.name}</p>
      <h1 className="mt-1 text-center text-2xl font-extrabold">
        {request.pro_name ? t("titleWithPro", { pro: request.pro_name }) : t("title")}
      </h1>
      <p className="mt-1 text-center text-sm text-ink/70">
        {[service, formatDayLong(new Date(request.starts_at), locale)].filter(Boolean).join(" · ")}
      </p>

      <fieldset className="mt-5">
        <legend className="sr-only">{t("ratingLegend")}</legend>
        <div className="flex justify-center gap-1" role="radiogroup" aria-label={t("ratingLegend")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t("starsLabel", { count: n })}
              onClick={() => setRating(n)}
              className="rounded-xl p-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-lagoon"
            >
              <Star className={`size-10 ${n <= rating ? "fill-amber-400 text-amber-500" : "fill-transparent text-ink/30"}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="mt-1 min-h-6 text-center text-sm font-semibold text-ink/70" aria-live="polite">
          {rating ? labels[rating] : t("tapStar")}
        </p>
      </fieldset>

      <label htmlFor="review-comment" className="mt-4 block text-sm font-bold">
        {needsComment ? t("commentRequired") : t("commentOptional")}
      </label>
      <textarea
        id="review-comment"
        value={comment}
        maxLength={MAX_COMMENT}
        rows={4}
        onChange={(e) => setComment(e.target.value)}
        placeholder={needsComment ? t("placeholderLow") : t("placeholder")}
        className="mt-1 w-full rounded-2xl bg-foam px-4 py-3 outline-none ring-1 ring-breeze-100 focus:ring-2 focus:ring-breeze-400"
      />
      <p className="mt-1 text-right text-xs text-ink/70">{comment.length}/{MAX_COMMENT}</p>

      <p className="mt-3 text-xs text-ink/70">
        {t("publicNote", { name: request.customer_display || t("anonymous") })}
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t(`errors.${error}`)}</p>}
      <button
        type="submit"
        disabled={!canSend || pending}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-lagoon py-3.5 font-bold text-white hover:bg-breeze-800 disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {request.review ? t("update") : t("publish")}
      </button>
    </form>,
  );
}
