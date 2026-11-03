"use client";
import { Check, Clock, Lock, Plus, Scissors } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSalon } from "@/components/agenda/DashboardShell";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import { PRO_COLORS, colorOf, withAlpha, type ProColorKey } from "@/lib/colors";
import { prosOf, servicesOf, serviceName, type Professional, type ProTitle } from "@/lib/mock/data";
import { initials } from "@/lib/privacy";

const TITLES: ProTitle[] = ["barber", "stylist", "nail_tech", "makeup_artist", "esthetician", "massage_therapist"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export default function ProfessionalsPage() {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const { salon } = useSalon();
  const [pros, setPros] = useState<Professional[]>(prosOf(salon.id));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ first: "", last: "", title: "barber" as ProTitle, color: null as ProColorKey | null, services: [] as string[] });

  useEffect(() => {
    setPros(prosOf(salon.id));
    setAdding(false);
  }, [salon.id]);

  const taken = new Map(pros.map((p) => [p.color, p]));
  const services = servicesOf(salon.id);
  const valid = draft.first.trim() && draft.last.trim() && draft.color && !taken.has(draft.color);

  function save() {
    if (!valid || !draft.color) return;
    setPros((ps) => [
      ...ps,
      {
        id: `new-${Date.now()}`,
        salonId: salon.id,
        firstName: draft.first.trim(),
        lastName: draft.last.trim(),
        title: draft.title,
        color: draft.color!,
        serviceIds: draft.services,
        hours: { 1: [["09:00", "17:00"]], 2: [["09:00", "17:00"]], 3: [["09:00", "17:00"]], 4: [["09:00", "17:00"]], 5: [["09:00", "17:00"]] },
      },
    ]);
    setDraft({ first: "", last: "", title: "barber", color: null, services: [] });
    setAdding(false);
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/50">{salon.name}</p>
          <h1 className="text-2xl font-extrabold">{t("pros.title")}</h1>
          <p className="mt-1 text-sm text-ink/60">{t("pros.subtitle")}</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800">
            <Plus className="size-4" /> {t("pros.add")}
          </button>
        )}
      </div>

      {adding && (
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input label={t("booking.first")} value={draft.first} onChange={(v) => setDraft({ ...draft, first: v })} />
                <Input label={t("booking.last")} value={draft.last} onChange={(v) => setDraft({ ...draft, last: v })} />
              </div>
              <label className="block">
                <span className="text-xs font-bold text-ink/60">{t("pros.role")}</span>
                <select value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value as ProTitle })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100">
                  {TITLES.map((ti) => (
                    <option key={ti} value={ti}>{t(`titles.${ti}`)}</option>
                  ))}
                </select>
              </label>

              <div>
                <p className="text-xs font-bold text-ink/60">{t("pros.color")}</p>
                <p className="text-xs text-ink/40">{t("pros.colorHint")}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                  {PRO_COLORS.map((c) => {
                    const owner = taken.get(c.key);
                    const on = draft.color === c.key;
                    return (
                      <button
                        key={c.key}
                        disabled={!!owner}
                        onClick={() => setDraft({ ...draft, color: c.key })}
                        className="relative flex items-center gap-2 rounded-xl p-2 text-left text-xs font-semibold ring-1 ring-breeze-100 transition enabled:hover:ring-2 disabled:cursor-not-allowed"
                        style={on ? { boxShadow: `0 0 0 2px ${c.hex}`, backgroundColor: withAlpha(c.hex, 0.08) } : undefined}
                        aria-pressed={on}
                        title={owner ? t("pros.takenBy", { name: `${owner.firstName} ${owner.lastName}` }) : c[locale]}
                      >
                        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white ${owner ? "opacity-35" : ""}`} style={{ backgroundColor: c.hex }}>
                          {owner ? initials(owner.firstName, owner.lastName) : on ? <Check className="size-4" /> : ""}
                        </span>
                        <span className={owner ? "text-ink/35" : ""}>
                          {c[locale]}
                          {owner && (
                            <span className="flex items-center gap-0.5 text-[10px] font-normal">
                              <Lock className="size-2.5" /> {owner.firstName}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-ink/60">{t("pros.services")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {services.map((v) => {
                    const on = draft.services.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => setDraft({ ...draft, services: on ? draft.services.filter((x) => x !== v.id) : [...draft.services, v.id] })}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${on ? "bg-lagoon text-white ring-lagoon" : "ring-breeze-100 hover:bg-breeze-50"}`}
                      >
                        {serviceName(v, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Vista previa: así se verá en agenda y en Breeze Live */}
            <aside className="rounded-2xl bg-foam p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/40">{t("pros.preview")}</p>
              {draft.color ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <ProBadge pro={{ firstName: draft.first || "?", lastName: draft.last || "?", color: draft.color }} size="lg" />
                    <div>
                      <p className="font-bold">{draft.first || t("pros.namePlaceholder")} {draft.last.charAt(0)}{draft.last && "."}</p>
                      <p className="text-xs text-ink/50">{t(`titles.${draft.title}`)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border-l-4 px-2 py-1.5 text-xs" style={{ borderColor: colorOf(draft.color).hex, backgroundColor: withAlpha(colorOf(draft.color).hex, 0.13) }}>
                    <p className="font-bold" style={{ color: colorOf(draft.color).hex }}>3:00 PM</p>
                    <p className="font-semibold">Juan Pérez</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink/50">{t("pros.pickColor")}</p>
              )}
            </aside>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-foam">
              {t("common.cancel")}
            </button>
            <button onClick={save} disabled={!valid} className="rounded-xl bg-lagoon px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
              {t("pros.save")}
            </button>
          </div>
          <p className="mt-2 text-right text-xs text-ink/40">{t("pros.inviteNote")}</p>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pros.map((p) => {
          const c = colorOf(p.color);
          return (
            <article key={p.id} className="overflow-hidden rounded-3xl bg-white ring-1 ring-breeze-100 animate-fade-up">
              <div className="h-2" style={{ backgroundColor: c.hex }} />
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <ProBadge pro={p} size="lg" />
                  <div>
                    <p className="text-lg font-bold">{p.firstName} {p.lastName}</p>
                    <p className="text-sm text-ink/50">{t(`titles.${p.title}`)}</p>
                  </div>
                  <span className="ml-auto rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: c.hex, backgroundColor: withAlpha(c.hex, 0.1) }}>
                    {c[locale]}
                  </span>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/40">
                  <Scissors className="size-3.5" /> {t("pros.services")} ({p.serviceIds.length})
                </p>
                <p className="mt-1 text-sm text-ink/70">
                  {p.serviceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean).map((s) => serviceName(s!, locale)).join(" · ") || "—"}
                </p>
                <p className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/40">
                  <Clock className="size-3.5" /> {t("pros.hours")}
                </p>
                <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px]">
                  {WEEKDAYS.map((d) => {
                    const h = p.hours[d];
                    return (
                      <div key={d} className={`rounded-lg py-1.5 ${h ? "font-bold" : "text-ink/30"}`} style={h ? { backgroundColor: withAlpha(c.hex, 0.1), color: c.hex } : { backgroundColor: "#f2fbfb" }}>
                        {t(`weekdays.${d}`)}
                        <span className="block font-normal">{h ? h[0][0].replace(":00", "") + "–" + h[h.length - 1][1].replace(":00", "") : t("pros.off")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 outline-none ring-1 ring-breeze-100 focus:ring-2 focus:ring-breeze-400" />
    </label>
  );
}
