"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ClientHeader } from "@/components/ui/ClientHeader";
import type { BookingSummary } from "@/lib/booking/types";
import { useNow } from "@/lib/mock/store";
import { BookingCard } from "./BookingCard";
import { ClaimDeviceBookings } from "./ClaimDeviceBookings";
import { MyPrivacy } from "./MyPrivacy";

export function LiveMyBookings({ bookings, reviewStates = {} }: { bookings: BookingSummary[]; reviewStates?: Record<string, { state: "ok" | "reviewed"; rating: number | null }> }) {
  const t = useTranslations();
  const now = useNow();
  const isUpcoming = (b: BookingSummary) => !!now && b.items.some((i) => i.status === "booked" && new Date(i.starts_at) > now);
  const upcoming = bookings.filter(isUpcoming).sort((a, b) => a.items[0].starts_at.localeCompare(b.items[0].starts_at));
  const history = bookings.filter((b) => !isUpcoming(b));

  return (
    <div className="min-h-dvh bg-foam/40">
      <ClientHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-extrabold">{t("me.title")}</h1>
        <ClaimDeviceBookings />
        {!now ? (
          <div className="mt-6 h-32 animate-pulse rounded-3xl bg-white" />
        ) : bookings.length === 0 ? (
          <div className="mt-6 rounded-3xl bg-white p-10 text-center ring-1 ring-breeze-100">
            <p className="text-ink/70">{t("me.empty")}</p>
            <Link href="/explore" className="mt-4 inline-flex items-center gap-1 rounded-2xl bg-lagoon px-5 py-3 font-bold text-white">
              <Plus className="size-4" /> {t("me.bookNow")}
            </Link>
          </div>
        ) : (
          <>
            <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-ink/70">{t("me.upcoming")}</h2>
            <div className="mt-2 space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-ink/70">{t("me.noneUpcoming")}</p>}
              {upcoming.map((b) => (
                <BookingCard key={b.booking_group_id} booking={b} now={now} review={reviewStates[b.booking_group_id]} />
              ))}
            </div>
            {history.length > 0 && (
              <>
                <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-ink/70">{t("me.history")}</h2>
                <div className="mt-2 space-y-3 opacity-70">
                  {history.map((b) => (
                    <BookingCard key={b.booking_group_id} booking={b} now={now} review={reviewStates[b.booking_group_id]} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <MyPrivacy />
      </main>
    </div>
  );
}
