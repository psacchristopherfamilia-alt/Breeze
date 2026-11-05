"use client";
import { CalendarSearch } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ClientHeader } from "@/components/ui/ClientHeader";
import type { BookingSummary } from "@/lib/booking/types";
import { useNow } from "@/lib/mock/store";
import { BookingCard } from "./BookingCard";

export function GuestBooking({ booking, token, review }: { booking: BookingSummary | null; token: string; review?: { state: "ok" | "reviewed"; rating?: number | null } }) {
  const t = useTranslations("guest");
  const now = useNow();
  return (
    <div className="min-h-dvh bg-breeze-sky">
      <ClientHeader />
      <main className="mx-auto max-w-md px-4 py-8">
        {booking ? (
          <>
            <h1 className="text-2xl font-extrabold">{t("title", { name: booking.customer_display })}</h1>
            <p className="mt-1 text-sm text-ink/70">{t("subtitle")}</p>
            <div className="mt-5">{now && <BookingCard booking={booking} token={token} now={now} review={review} />}</div>
            <p className="mt-4 text-xs text-ink/70">{t("keepLink")}</p>
          </>
        ) : (
          <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-breeze-100">
            <CalendarSearch className="mx-auto size-12 text-breeze-500" />
            <h1 className="mt-3 text-xl font-extrabold">{t("notFoundTitle")}</h1>
            <p className="mt-1 text-sm text-ink/70">{t("notFoundBody")}</p>
            <Link href="/explore" className="mt-5 inline-block rounded-2xl bg-lagoon px-5 py-3 font-bold text-white">{t("explore")}</Link>
          </div>
        )}
      </main>
    </div>
  );
}
