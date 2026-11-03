"use client";
import { CalendarX, Eye, EyeOff, Loader2, MonitorPlay, Plus, Trash2, Tv } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addClosure, deleteClosure, pairLiveDevice, revokeLiveDevice, saveSettings, setPublished } from "@/app/dashboard/actions";
import { useAppLocale } from "@/components/Providers";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { addDaysKey, atLocal, formatDayShort, formatTime } from "@/lib/time";
import { ZONES } from "@/lib/validation/auth";
import { Toggle } from "./LiveProfessionals";

type BT = "barbershop" | "salon" | "spa";
interface Settings {
  id: string;
  slug: string;
  isPublished: boolean;
  name: string;
  address: string;
  phone: string;
  zone: string;
  businessTypes: BT[];
  slotStepMin: number;
  minLeadTimeMin: number;
  maxAdvanceDays: number;
  cancellationWindowHours: number;
  noShowBlockEnabled: boolean;
  noShowThreshold: number;
}

export function LiveSettings({
  salon,
  closures,
  devices,
}: {
  salon: Settings;
  closures: { id: string; start: string; end: string; reason: string | null }[];
  devices: { id: string; name: string; pairedAt: string; lastSeenAt: string | null }[];
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const [f, setF] = useState(salon);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [closure, setClosure] = useState({ from: "", to: "", reason: "" });
  const [pair, setPair] = useState({ code: "", name: "" });

  const report = (r: { ok: boolean; error?: string }, okText: string) => {
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: t(`panel.errors.${r.error ?? "generic"}`) });
    if (r.ok) router.refresh();
  };
  const numField = (k: "minLeadTimeMin" | "maxAdvanceDays" | "cancellationWindowHours" | "noShowThreshold", label: string, hint: string) => (
    <label className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <input type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" />
      <span className="mt-1 block text-xs text-ink/40">{hint}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <h1 className="text-2xl font-extrabold">{t("settings.title")}</h1>

      {msg && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${msg.ok ? "bg-breeze-50 text-lagoon" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      {/* Publicar */}
      <section className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5 ring-1 ${salon.isPublished ? "bg-breeze-50 ring-breeze-200" : "bg-amber-50 ring-amber-100"}`}>
        <div className="flex items-center gap-3">
          {salon.isPublished ? <Eye className="size-6 text-lagoon" /> : <EyeOff className="size-6 text-amber-700" />}
          <div>
            <p className="font-bold">{t(salon.isPublished ? "settings.published" : "settings.hidden")}</p>
            <p className="text-sm text-ink/60">{t(salon.isPublished ? "settings.publishedHint" : "settings.hiddenHint")}</p>
            {salon.isPublished && <Link href={`/s/${salon.slug}`} target="_blank" className="text-sm font-semibold text-lagoon underline">/s/{salon.slug}</Link>}
          </div>
        </div>
        <button disabled={pending} onClick={() => start(async () => report(await setPublished(salon.id, !salon.isPublished), t(salon.isPublished ? "settings.unpublishedOk" : "settings.publishedOk")))}
          className={`rounded-xl px-4 py-2 text-sm font-bold ${salon.isPublished ? "bg-white text-ink ring-1 ring-breeze-200" : "bg-lagoon text-white"}`}>
          {t(salon.isPublished ? "settings.unpublish" : "settings.publish")}
        </button>
      </section>

      {/* Datos y políticas */}
      <section className="mt-5 space-y-4 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
        <h2 className="font-bold">{t("settings.business")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["name", "address", "phone"] as const).map((k) => (
            <label key={k} className={`block ${k === "name" ? "sm:col-span-2" : ""}`}>
              <span className="text-xs font-bold text-ink/60">{t(`settings.fields.${k}`)}</span>
              <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100" />
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-bold text-ink/60">{t("auth.fields.zone")}</span>
            <select value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100">
              {ZONES.map((z) => <option key={z} value={z}>{t(`zones.${z}`)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-ink/60">{t("settings.fields.slotStep")}</span>
            <select value={f.slotStepMin} onChange={(e) => setF({ ...f, slotStepMin: Number(e.target.value) })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100">
              {[5, 10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["barbershop", "salon", "spa"] as const).map((ty) => {
            const on = f.businessTypes.includes(ty);
            return (
              <button key={ty} aria-pressed={on} onClick={() => setF({ ...f, businessTypes: on ? f.businessTypes.filter((x) => x !== ty) : [...f.businessTypes, ty] })}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 text-xs font-bold ring-1 ${on ? "bg-breeze-50 ring-2 ring-breeze-500" : "bg-foam ring-breeze-100"}`}>
                <TypeIcon type={ty} className="size-5 text-lagoon" /> {t(`types.${ty}`)}
              </button>
            );
          })}
        </div>

        <h2 className="pt-2 font-bold">{t("settings.policies")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {numField("cancellationWindowHours", t("settings.fields.cancellationWindow"), t("settings.hints.cancellationWindow"))}
          {numField("minLeadTimeMin", t("settings.fields.minLead"), t("settings.hints.minLead"))}
          {numField("maxAdvanceDays", t("settings.fields.maxAdvance"), t("settings.hints.maxAdvance"))}
        </div>
        <Toggle label={t("settings.fields.noShowBlock")} checked={f.noShowBlockEnabled} onChange={(v) => setF({ ...f, noShowBlockEnabled: v })} />
        {f.noShowBlockEnabled && numField("noShowThreshold", t("settings.fields.noShowThreshold"), t("settings.hints.noShowThreshold"))}

        <button disabled={pending}
          onClick={() => start(async () => report(await saveSettings(salon.id, {
            name: f.name, address: f.address || null, phone: f.phone || null, zone: f.zone as (typeof ZONES)[number], businessTypes: f.businessTypes,
            slotStepMin: f.slotStepMin as 15, minLeadTimeMin: f.minLeadTimeMin, maxAdvanceDays: f.maxAdvanceDays,
            cancellationWindowHours: f.cancellationWindowHours, noShowBlockEnabled: f.noShowBlockEnabled, noShowThreshold: f.noShowThreshold,
          }), t("settings.saved")))}
          className="inline-flex items-center gap-2 rounded-xl bg-lagoon px-5 py-2.5 font-bold text-white disabled:opacity-50">
          {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
        </button>
      </section>

      {/* Cierres */}
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
        <h2 className="flex items-center gap-2 font-bold"><CalendarX className="size-4 text-lagoon" /> {t("settings.closures")}</h2>
        <p className="text-sm text-ink/60">{t("settings.closuresHint")}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {closures.length === 0 && <li className="text-ink/40">—</li>}
          {closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl bg-foam px-3 py-2">
              <span>{formatDayShort(new Date(c.start), locale)} → {formatDayShort(new Date(new Date(c.end).getTime() - 1), locale)}{c.reason && <span className="text-ink/50"> · {c.reason}</span>}</span>
              <button aria-label={t("common.delete")} onClick={() => start(async () => report(await deleteClosure(c.id), t("settings.saved")))} className="text-ink/40 hover:text-red-600"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] [&>input]:min-w-0">
          <input type="date" aria-label={t("pros.from")} value={closure.from} onChange={(e) => setClosure({ ...closure, from: e.target.value, to: closure.to || e.target.value })} className="rounded-xl bg-foam px-3 py-2 ring-1 ring-breeze-100" />
          <input type="date" aria-label={t("pros.to")} value={closure.to} onChange={(e) => setClosure({ ...closure, to: e.target.value })} className="rounded-xl bg-foam px-3 py-2 ring-1 ring-breeze-100" />
          <input placeholder={t("settings.closureReason")} value={closure.reason} onChange={(e) => setClosure({ ...closure, reason: e.target.value })} className="rounded-xl bg-foam px-3 py-2 ring-1 ring-breeze-100" />
          <button disabled={pending || !closure.from || !closure.to}
            onClick={() => start(async () => {
              const r = await addClosure(salon.id, atLocal(closure.from, "00:00").toISOString(), atLocal(addDaysKey(closure.to, 1), "00:00").toISOString(), closure.reason);
              report(r, t("settings.saved"));
              if (r.ok) setClosure({ from: "", to: "", reason: "" });
            })}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            <Plus className="size-4" /> {t("settings.addClosure")}
          </button>
        </div>
      </section>

      {/* Pantallas Breeze Live */}
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
        <h2 className="flex items-center gap-2 font-bold"><MonitorPlay className="size-4 text-lagoon" /> {t("settings.screens.title")}</h2>
        <p className="text-sm text-ink/60">{t("settings.screens.hint", { url: `/live/${salon.slug}` })}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {devices.length === 0 && <li className="text-ink/40">{t("settings.screens.none")}</li>}
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl bg-foam px-3 py-2">
              <span className="inline-flex items-center gap-2">
                <Tv className="size-4 text-lagoon" /> <b>{d.name}</b>
                <span className="text-ink/50">
                  · {d.lastSeenAt ? t("settings.screens.lastSeen", { when: `${formatDayShort(new Date(d.lastSeenAt), locale)} ${formatTime(new Date(d.lastSeenAt))}` }) : t("settings.screens.neverSeen")}
                </span>
              </span>
              <button onClick={() => start(async () => report(await revokeLiveDevice(d.id), t("settings.screens.revoked")))} className="text-xs font-semibold text-red-600 hover:underline">
                {t("settings.screens.revoke")}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
          <input inputMode="numeric" maxLength={7} placeholder="123 456" aria-label={t("settings.screens.code")} value={pair.code}
            onChange={(e) => setPair({ ...pair, code: e.target.value })} className="min-w-0 rounded-xl bg-foam px-3 py-2 text-center font-mono text-lg tracking-widest ring-1 ring-breeze-100" />
          <input placeholder={t("settings.screens.namePlaceholder")} aria-label={t("settings.screens.name")} value={pair.name}
            onChange={(e) => setPair({ ...pair, name: e.target.value })} className="min-w-0 rounded-xl bg-foam px-3 py-2 ring-1 ring-breeze-100" />
          <button disabled={pending || pair.code.replace(/\D/g, "").length !== 6}
            onClick={() => start(async () => {
              const r = await pairLiveDevice(salon.id, pair.code, pair.name);
              report(r, t("settings.screens.paired"));
              if (r.ok) setPair({ code: "", name: "" });
            })}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            <Plus className="size-4" /> {t("settings.screens.pair")}
          </button>
        </div>
      </section>
    </div>
  );
}
