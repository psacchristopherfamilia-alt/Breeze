"use client";
import { CalendarClock, CalendarX2, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/Providers";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { ProBadge } from "@/components/ui/ProBadge";
import { formatPrice, proById, salonById, serviceById, serviceName, type Appointment } from "@/lib/mock/data";
import { setStatus, useAppointments } from "@/lib/mock/store";
import { formatDayLong, formatTime } from "@/lib/time";

export default function MyBookings() {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const { now, appointments, ready } = useAppointments();

  const groups = new Map<string, Appointment[]>();
  appointments.filter((a) => a.mine).forEach((a) => groups.set(a.groupId, [...(groups.get(a.groupId) ?? []), a]));
  const list = [...groups.values()].sort((a, b) => a[0].startsAt.localeCompare(b[0].startsAt));
  const upcoming = list.filter((g) => g[0].status === "booked" && now && new Date(g[0].startsAt) > now);
  const other = list.filter((g) => !upcoming.includes(g));

  return (
    <div className="min-h-dvh bg-foam/40">
      <ClientHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-extrabold">{t("me.title")}</h1>
        {!ready ? (
          <div className="mt-6 h-32 animate-pulse rounded-3xl bg-white" />
        ) : list.length === 0 ? (
          <div className="mt-6 rounded-3xl bg-white p-10 text-center ring-1 ring-breeze-100">
            <p className="text-ink/60">{t("me.empty")}</p>
            <Link href="/explore" className="mt-4 inline-flex items-center gap-1 rounded-2xl bg-lagoon px-5 py-3 font-bold text-white">
              <Plus className="size-4" /> {t("me.bookNow")}
            </Link>
          </div>
        ) : (
          <>
            <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">{t("me.upcoming")}</h2>
            <div className="mt-2 space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-ink/50">{t("me.noneUpcoming")}</p>}
              {upcoming.map((g) => (
                <BookingCard key={g[0].groupId} group={g} now={now!} locale={locale} />
              ))}
            </div>
            {other.length > 0 && (
              <>
                <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-ink/50">{t("me.history")}</h2>
                <div className="mt-2 space-y-3 opacity-70">
                  {other.map((g) => (
                    <BookingCard key={g[0].groupId} group={g} now={now!} locale={locale} />
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

function BookingCard({ group, now, locale }: { group: Appointment[]; now: Date; locale: "en" | "es" }) {
  const t = useTranslations();
  const first = group[0];
  const salon = salonById(first.salonId)!;
  const pro = proById(first.professionalId)!;
  const start = new Date(first.startsAt);
  const hoursLeft = (start.getTime() - now.getTime()) / 3_600_000;
  const active = first.status === "booked" && hoursLeft > 0;
  const canChange = active && hoursLeft >= salon.cancellationWindowHours;
  const total = group.reduce((s, a) => s + serviceById(a.serviceId)!.priceCents, 0);

  return (
    <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold first-letter:uppercase">{formatDayLong(start, locale)}</p>
          <p className="text-2xl font-extrabold text-lagoon">{formatTime(start)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            first.status === "cancelled" ? "bg-red-50 text-red-700" : active ? "bg-breeze-50 text-lagoon" : "bg-ink/5 text-ink/60"
          }`}
        >
          {t(`status.${first.status}`)}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold">{salon.name}</p>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <ProBadge pro={pro} size="sm" showName />
        <span className="text-ink/40">·</span>
        <span className="text-ink/70">{group.map((a) => serviceName(serviceById(a.serviceId)!, locale)).join(" + ")}</span>
      </div>
      <p className="mt-1 text-sm text-ink/60">{formatPrice(total)} · {t("me.payAtSalon")}</p>

      {active && (
        <div className="mt-4 border-t border-breeze-100 pt-4">
          {canChange ? (
            <div className="flex gap-2">
              <Link
                href={`/s/${salon.slug}?reschedule=${first.groupId}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-breeze-50 py-2.5 text-sm font-bold text-lagoon hover:bg-breeze-100"
              >
                <CalendarClock className="size-4" /> {t("me.reschedule")}
              </Link>
              <button
                onClick={() => confirm(t("me.cancelConfirm")) && setStatus(group.map((a) => a.id), "cancelled")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-red-600 ring-1 ring-red-100 hover:bg-red-50"
              >
                <CalendarX2 className="size-4" /> {t("me.cancel")}
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Phone className="size-4 shrink-0" />
              {t("me.windowPassed", { hours: salon.cancellationWindowHours, phone: salon.phone })}
            </p>
          )}
          <p className="mt-2 text-xs text-ink/40">{t("me.windowInfo", { hours: salon.cancellationWindowHours })}</p>
        </div>
      )}
    </article>
  );
}
