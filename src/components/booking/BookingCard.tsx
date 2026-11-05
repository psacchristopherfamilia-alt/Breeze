"use client";
import { CalendarClock, CalendarX2, Loader2, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelBookingAction } from "@/app/booking-actions";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import type { BookingSummary } from "@/lib/booking/types";
import { formatPrice } from "@/lib/mock/data";
import { formatDayLong, formatTime } from "@/lib/time";

/** Tarjeta de una reserva real con cancelar / reprogramar (respeta la ventana de cancelación). */
export function BookingCard({ booking, token, now }: { booking: BookingSummary; token?: string; now: Date }) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const [state, action] = useActionState(cancelBookingAction, undefined);
  const items = booking.items;
  const first = items[0];
  const start = new Date(first.starts_at);
  const active = items.some((i) => i.status === "booked") && start > now && !state?.done;
  const status = state?.done ? "cancelled" : first.status;
  const pro = first.professional;
  const [pf, ...pl] = pro.public_name.split(" ");
  const total = items.reduce((s, i) => s + i.price_cents, 0);
  const rescheduleHref = `/s/${booking.salon.slug}?${token ? `rt=${token}` : `reschedule=${booking.booking_group_id}`}`;

  return (
    <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold first-letter:uppercase">{formatDayLong(start, locale)}</p>
          <p className="text-2xl font-extrabold text-lagoon">{formatTime(start)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            status === "cancelled" ? "bg-red-50 text-red-700" : active ? "bg-breeze-50 text-lagoon" : "bg-ink/5 text-ink/70"
          }`}
        >
          {t(`status.${status}`)}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold">{booking.salon.name}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <ProBadge pro={{ firstName: pf, lastName: pl.join(" "), colorHex: pro.color_hex }} size="sm" showName />
        <span className="text-ink/70">·</span>
        <span className="text-ink/70">{items.map((i) => (locale === "es" ? i.service_name_es : i.service_name_en)).join(" + ")}</span>
      </div>
      <p className="mt-1 text-sm text-ink/70">{formatPrice(total)} · {t("me.payAtSalon")}</p>

      {state?.error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t(`booking.errors.${state.error}`)}</p>}

      {active && (
        <div className="mt-4 border-t border-breeze-100 pt-4">
          {booking.can_change ? (
            <form action={action} className="flex gap-2">
              {token ? <input type="hidden" name="token" value={token} /> : <input type="hidden" name="groupId" value={booking.booking_group_id} />}
              <Link href={rescheduleHref} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-breeze-50 py-2.5 text-sm font-bold text-lagoon hover:bg-breeze-100">
                <CalendarClock className="size-4" /> {t("me.reschedule")}
              </Link>
              <CancelButton label={t("me.cancel")} confirmText={t("me.cancelConfirm")} />
            </form>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Phone className="size-4 shrink-0" />
              {t("me.windowPassed", { hours: booking.salon.cancellation_window_hours, phone: booking.salon.phone ?? "" })}
            </p>
          )}
          <p className="mt-2 text-xs text-ink/70">{t("me.windowInfo", { hours: booking.salon.cancellation_window_hours })}</p>
        </div>
      )}
    </article>
  );
}

function CancelButton({ label, confirmText }: { label: string; confirmText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarX2 className="size-4" />} {label}
    </button>
  );
}
