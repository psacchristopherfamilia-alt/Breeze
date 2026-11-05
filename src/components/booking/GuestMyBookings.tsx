"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { forgetDeviceTokens, useDeviceTokens } from "@/lib/booking/device";
import type { BookingSummary } from "@/lib/booking/types";
import { useNow } from "@/lib/mock/store";
import { createClient } from "@/lib/supabase/client";
import { BookingCard } from "./BookingCard";

interface Item {
  token: string;
  booking: BookingSummary;
}

/**
 * "Mis citas" para quien no tiene cuenta: las reservas de invitado de ESTE navegador
 * (cada una con su enlace privado guardado aquí). Con una cuenta se verían en cualquier dispositivo.
 */
export function GuestMyBookings() {
  const t = useTranslations();
  const now = useNow();
  const tokens = useDeviceTokens();
  const key = tokens?.join(",");
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    if (tokens === undefined) return;
    if (tokens.length === 0) {
      setItems([]);
      return;
    }
    let live = true;
    (async () => {
      const supabase = createClient();
      const results = await Promise.all(
        tokens.map(async (token) => {
          const { data, error } = await supabase.rpc("get_guest_booking", { p_token: token });
          return { token, booking: (data as BookingSummary | null) ?? null, gone: error?.message === "not_found" };
        }),
      );
      if (!live) return;
      const gone = results.filter((r) => r.gone).map((r) => r.token);
      if (gone.length > 0) forgetDeviceTokens(gone); // enlaces que ya no existen
      setItems(results.flatMap((r) => (r.booking ? [{ token: r.token, booking: r.booking }] : [])));
    })();
    return () => {
      live = false;
    };
    // `key` resume el contenido de `tokens` (el array cambia de identidad en cada lectura).
  }, [key]);

  const isUpcoming = (b: BookingSummary) => !!now && b.items.some((i) => i.status === "booked" && new Date(i.starts_at) > now);
  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => a.booking.items[0].starts_at.localeCompare(b.booking.items[0].starts_at)), [items]);
  const upcoming = sorted.filter((i) => isUpcoming(i.booking));
  const history = sorted.filter((i) => !isUpcoming(i.booking)).reverse();

  return (
    <div className="min-h-dvh bg-foam/40">
      <ClientHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-extrabold">{t("me.title")}</h1>

        {items === null || !now ? (
          <div className="mt-6 h-32 animate-pulse rounded-3xl bg-white" />
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-3xl bg-white p-10 text-center ring-1 ring-breeze-100">
            <p className="text-ink/70">{t("me.guestEmpty")}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Link href="/explore" className="inline-flex items-center gap-1 rounded-2xl bg-lagoon px-5 py-3 font-bold text-white">
                <Plus className="size-4" /> {t("me.bookNow")}
              </Link>
              <Link href="/login?next=/me" className="rounded-2xl px-5 py-3 font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50">
                {t("client.signIn")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-2xl bg-breeze-50 p-4 text-sm text-ink/80 ring-1 ring-breeze-100">
              <p>
                <b>{t("me.guestOnlyHere")}</b> {t("me.guestSaveHint")}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-bold text-lagoon">
                <Link href="/signup?next=/me" className="underline underline-offset-2">{t("me.guestCreateAccount")}</Link>
                <Link href="/login?next=/me" className="underline underline-offset-2">{t("me.guestHaveAccount")}</Link>
              </div>
            </div>

            <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-ink/70">{t("me.upcoming")}</h2>
            <div className="mt-2 space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-ink/70">{t("me.noneUpcoming")}</p>}
              {upcoming.map((i) => (
                <BookingCard key={i.booking.booking_group_id} booking={i.booking} token={i.token} now={now} />
              ))}
            </div>
            {history.length > 0 && (
              <>
                <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-ink/70">{t("me.history")}</h2>
                <div className="mt-2 space-y-3 opacity-70">
                  {history.map((i) => (
                    <BookingCard key={i.booking.booking_group_id} booking={i.booking} token={i.token} now={now} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
