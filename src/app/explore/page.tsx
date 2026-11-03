"use client";
import { MapPin, Search, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { ProBadge } from "@/components/ui/ProBadge";
import { TypeIcon } from "@/components/ui/TypeIcon";
import {
  BUSINESS_TYPES,
  SALONS,
  ZONES,
  formatPrice,
  prosOf,
  servicesOf,
  type BusinessType,
  type Zone,
} from "@/lib/mock/data";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function ExplorePage() {
  const t = useTranslations();
  const [q, setQ] = useState("");
  const [type, setType] = useState<BusinessType | "all">("all");
  const [zone, setZone] = useState<Zone | "all">("all");

  const results = useMemo(() => {
    const nq = norm(q.trim());
    return SALONS.filter((s) => {
      if (type !== "all" && !s.businessTypes.includes(type)) return false;
      if (zone !== "all" && s.zone !== zone) return false;
      if (!nq) return true;
      const haystack = [s.name, ...servicesOf(s.id).flatMap((v) => [v.nameEn, v.nameEs])].map(norm).join(" ");
      return haystack.includes(nq);
    });
  }, [q, type, zone]);

  return (
    <div className="min-h-dvh bg-foam/40">
      <ClientHeader />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <section className="pt-8">
          <h1 className="text-3xl font-extrabold tracking-tight">{t("explore.title")}</h1>
          <p className="mt-1 text-ink/60">{t("explore.subtitle")}</p>

          <label className="mt-5 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-breeze-100 focus-within:ring-2 focus-within:ring-breeze-400">
            <Search className="size-5 text-breeze-600" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("explore.searchPlaceholder")}
              className="w-full bg-transparent text-base outline-none placeholder:text-ink/40"
            />
          </label>

          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
            {(["all", ...BUSINESS_TYPES] as const).map((ty) => (
              <button
                key={ty}
                onClick={() => setType(ty)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  type === ty ? "bg-lagoon text-white shadow" : "bg-white text-ink/70 ring-1 ring-breeze-100 hover:bg-breeze-50"
                }`}
              >
                {ty !== "all" && <TypeIcon type={ty} />}
                {ty === "all" ? t("explore.allTypes") : t(`types.${ty}`)}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <MapPin className="size-4 text-breeze-600" />
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as Zone | "all")}
              className="rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-breeze-100 outline-none focus:ring-2 focus:ring-breeze-400"
              aria-label={t("explore.zone")}
            >
              <option value="all">{t("explore.allZones")}</option>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {t(`zones.${z}`)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <p className="mt-6 text-sm font-medium text-ink/50">{t("explore.results", { count: results.length })}</p>

        <section className="mt-3 grid gap-4 sm:grid-cols-2">
          {results.map((s) => {
            const pros = prosOf(s.id);
            const from = Math.min(...servicesOf(s.id).map((v) => v.priceCents));
            return (
              <Link
                key={s.id}
                href={`/s/${s.slug}`}
                className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-breeze-100 transition hover:-translate-y-0.5 hover:shadow-lg animate-fade-up"
              >
                <div
                  className="relative h-28"
                  style={{ background: `linear-gradient(135deg, ${s.cover[0]}, ${s.cover[1]})` }}
                >
                  <div className="absolute inset-x-0 bottom-0 flex gap-1.5 p-3">
                    {s.businessTypes.map((ty) => (
                      <span key={ty} className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-ink">
                        <TypeIcon type={ty} className="size-3.5" /> {t(`types.${ty}`)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold leading-tight group-hover:text-lagoon">{s.name}</h2>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold">
                      <Star className="size-4 fill-amber-400 text-amber-400" /> {s.rating.toFixed(1)}
                      <span className="font-normal text-ink/40">({s.reviews})</span>
                    </span>
                  </div>
                  <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink/60">
                    <MapPin className="size-3.5" /> {t(`zones.${s.zone}`)}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {pros.map((p) => (
                        <ProBadge key={p.id} pro={p} size="sm" />
                      ))}
                    </div>
                    <span className="text-sm text-ink/60">
                      {t("explore.from")} <b className="text-ink">{formatPrice(from)}</b>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
          {results.length === 0 && (
            <div className="col-span-full rounded-3xl bg-white p-10 text-center text-ink/60 ring-1 ring-breeze-100">
              {t("explore.empty")}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
