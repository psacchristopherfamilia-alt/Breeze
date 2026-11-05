"use client";
import { Flag, Loader2, MessageSquareReply } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { replyReview, reportReview } from "@/app/dashboard/actions";
import { useAppLocale } from "@/components/Providers";
import { Stars } from "@/components/reviews/Stars";
import { authorLabel, type StaffReview } from "@/lib/reviews";
import { formatDayShort } from "@/lib/time";

type Filter = "all" | "unanswered" | "low";

export function ReviewsPanel({ reviews, isManager }: { reviews: StaffReview[]; isManager: boolean }) {
  const t = useTranslations("reviewsPanel");
  const tt = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<{ id: string; kind: "reply" | "report" } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = reviews.filter((r) => (filter === "all" ? true : filter === "unanswered" ? !r.reply : r.rating <= 3));
  const unanswered = reviews.filter((r) => !r.reply).length;

  const begin = (id: string, kind: "reply" | "report", initial = "") => {
    setOpen({ id, kind });
    setText(initial);
    setError(null);
  };
  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setOpen(null);
        router.refresh();
      } else setError(r.error ?? "generic");
    });

  const filters: [Filter, string][] = [["all", t("all")], ["unanswered", `${t("unanswered")} (${unanswered})`], ["low", t("low")]];
  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="mt-1 text-sm text-ink/70">{t(isManager ? "subtitleManager" : "subtitlePro")}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("title")}>
        {filters.map(([k, label]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${filter === k ? "bg-lagoon text-white ring-lagoon" : "bg-white text-ink ring-breeze-100 hover:bg-breeze-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-10 text-center text-ink/70 ring-1 ring-breeze-100">{t(reviews.length === 0 ? "empty" : "noMatch")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((r) => {
            const service = locale === "es" ? r.service_es || r.service_en : r.service_en || r.service_es;
            const editing = open?.id === r.id;
            return (
              <li key={r.id} className="rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{authorLabel(r.author, locale)}</p>
                  <Stars rating={r.rating} label={tt("reviews.starsLabel", { count: r.rating })} />
                </div>
                <p className="text-xs text-ink/70">
                  {[service, r.pro_name && (locale === "es" ? `con ${r.pro_name}` : `with ${r.pro_name}`), formatDayShort(new Date(r.created_at), locale)].filter(Boolean).join(" · ")}
                </p>
                {r.comment && <p className="mt-2 whitespace-pre-line break-words">{r.comment}</p>}
                {r.reply && !(editing && open?.kind === "reply") && (
                  <div className="mt-3 rounded-r-xl border-l-4 border-lagoon bg-breeze-50 px-3 py-2 text-sm">
                    <p className="text-xs font-bold text-lagoon">{t("yourReply")}</p>
                    <p className="whitespace-pre-line break-words">{r.reply}</p>
                  </div>
                )}
                {r.status === "reported" && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                    {t("reported")}{r.reported_reason ? ` · ${t("reportedReason", { reason: r.reported_reason })}` : ""}
                  </p>
                )}

                {isManager && !editing && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => begin(r.id, "reply", r.reply ?? "")} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-lagoon ring-1 ring-lagoon hover:bg-breeze-50">
                      <MessageSquareReply className="size-4" aria-hidden="true" /> {r.reply ? t("editReply") : t("reply")}
                    </button>
                    {r.status === "visible" && (
                      <button onClick={() => begin(r.id, "report")} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-breeze-50">
                        <Flag className="size-4" aria-hidden="true" /> {t("report")}
                      </button>
                    )}
                  </div>
                )}

                {editing && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit(() => (open.kind === "reply" ? replyReview(r.id, text) : reportReview(r.id, text)));
                    }}
                  >
                    <label htmlFor={`f-${r.id}`} className="block text-sm font-bold">{open.kind === "reply" ? t("yourReply") : t("reportTitle")}</label>
                    {open.kind === "report" && <p className="text-xs text-ink/70">{t("reportHint")}</p>}
                    <textarea id={`f-${r.id}`} value={text} rows={3} maxLength={open.kind === "reply" ? 500 : 300} onChange={(e) => setText(e.target.value)}
                      placeholder={open.kind === "reply" ? t("replyPlaceholder") : t("reportPlaceholder")}
                      className="w-full rounded-2xl bg-foam px-4 py-3 outline-none ring-1 ring-breeze-100 focus:ring-2 focus:ring-breeze-400" />
                    {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{tt(`panel.errors.${error}`)}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={pending || (open.kind === "report" && text.trim().length < 3)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                        {open.kind === "reply" ? t("send") : t("sendReport")}
                      </button>
                      {open.kind === "reply" && r.reply && (
                        <button type="button" disabled={pending} onClick={() => submit(() => replyReview(r.id, ""))} className="rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">{t("remove")}</button>
                      )}
                      <button type="button" onClick={() => setOpen(null)} className="rounded-xl px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-breeze-50">{t("cancel")}</button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
