"use client";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/Providers";
import { initialsOf, prettyPhone, relativeAge, type Age } from "@/lib/panel/clients";
import { formatDayShort } from "@/lib/time";

interface Row {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  visits: number;
  lastVisit: string | null;
  nextVisit: string | null;
}

export function ClientsList({ clients, q, isManager }: { clients: Row[]; q: string; isManager: boolean }) {
  const t = useTranslations("clients");
  const { locale } = useAppLocale();
  const ago = (a: Age) => (a.unit === "today" || a.unit === "yesterday" ? t(`ago.${a.unit}`) : t(`ago.${a.unit}`, { count: a.n }));

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="mt-1 text-sm text-ink/70">{t(isManager ? "subtitleManager" : "subtitlePro")}</p>

      <form method="get" action="/dashboard/clients" role="search" className="mt-4">
        <label className="flex items-center gap-3 rounded-2xl bg-white px-4 ring-1 ring-breeze-100 focus-within:ring-2 focus-within:ring-breeze-400">
          <Search className="size-4 shrink-0 text-ink/70" aria-hidden />
          <span className="sr-only">{t("search")}</span>
          <input type="search" name="q" defaultValue={q} placeholder={t("search")} autoComplete="off" className="w-full min-w-0 bg-transparent py-3 outline-none" />
        </label>
      </form>

      <p className="mt-3 text-sm font-semibold text-ink/70" aria-live="polite">{q ? t("resultsFor", { count: clients.length, q }) : t("count", { count: clients.length })}</p>

      {clients.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-10 text-center text-ink/70 ring-1 ring-breeze-100">{t(q ? "noMatches" : "empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-breeze-100 hover:ring-breeze-300">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lagoon text-sm font-extrabold text-white" aria-hidden>{initialsOf(c.firstName, c.lastName)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{`${c.firstName} ${c.lastName}`.trim()}</span>
                  <span className="block truncate text-sm text-ink/70">{prettyPhone(c.phone)}</span>
                  <span className="block text-xs text-ink/70">
                    {t("visits", { count: c.visits })}
                    {c.lastVisit && ` · ${t("lastVisit", { when: ago(relativeAge(new Date(c.lastVisit))) })}`}
                    {c.nextVisit && ` · ${t("nextVisit", { when: formatDayShort(new Date(c.nextVisit), locale) })}`}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink/70" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
