"use client";
import { Bell, CalendarPlus, CalendarX2, CalendarClock, Star, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { alertText, type AlertKind, type AlertRow } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/client";
import { PushSetup } from "./PushSetup";

const ICON: Record<AlertKind, typeof Bell> = { booked: CalendarPlus, rescheduled: CalendarClock, cancelled: CalendarX2, review: Star };
const SOUND_KEY = "breeze-alert-sound";
const COLS = "id, kind, customer_display, service_en, service_es, pro_name, starts_at, rating, created_at, read_at";

/** Dos notas suaves. Los navegadores solo dejan sonar tras algún toque del usuario; si no, se ignora. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* sin sonido */
  }
}

/** Campana de avisos del panel: reservas nuevas, cambios y cancelaciones, en tiempo real. */
export function AlertsBell({ userId }: { userId: string }) {
  const t = useTranslations("alerts");
  const { locale } = useAppLocale();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [sound, setSound] = useState(true);
  const supabase = useRef(createClient());
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SOUND_KEY) !== "off";
      setSound(v);
      soundRef.current = v;
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.current.from("staff_alerts").select(COLS).order("created_at", { ascending: false }).limit(30);
    const rows = (data ?? []) as AlertRow[];
    // La primera carga no suena: solo lo que llegue después.
    if (known.current && rows.some((r) => !known.current!.has(r.id) && !r.read_at) && soundRef.current && document.visibilityState === "visible") chime();
    known.current = new Set(rows.map((r) => r.id));
    setAlerts(rows);
  }, []);

  useEffect(() => {
    void load();
    let channel: ReturnType<typeof supabase.current.channel> | null = null;
    let cancelled = false;
    (async () => {
      await supabase.current.realtime.setAuth();
      if (cancelled) return;
      channel = supabase.current
        .channel(`alerts:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "alert" }, () => void load())
        .subscribe();
    })();
    const poll = setInterval(() => void load(), 60_000); // respaldo si se cae la conexión en tiempo real
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.current.removeChannel(channel);
    };
  }, [userId, load]);

  // Cerrar con Escape o al tocar fuera.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unread = alerts.filter((a) => !a.read_at).length;
  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString();
    setAlerts((prev) => prev.map((a) => (!a.read_at && (!ids || ids.includes(a.id)) ? { ...a, read_at: now } : a)));
    let q = supabase.current.from("staff_alerts").update({ read_at: now }).is("read_at", null);
    if (ids) q = q.in("id", ids);
    await q;
  };
  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    soundRef.current = v;
    try {
      localStorage.setItem(SOUND_KEY, v ? "on" : "off");
    } catch {
      /* sin almacenamiento */
    }
    if (v) chime();
  };

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? t("labelUnread", { count: unread }) : t("label")}
        className="relative grid size-10 place-items-center rounded-xl bg-white text-lagoon ring-1 ring-breeze-100 hover:bg-breeze-50"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-orange-700 px-1 text-xs font-bold leading-5 text-white" aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t("title")} className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-breeze-200 lg:left-0 lg:right-auto">
          <header className="flex items-center justify-between gap-2 border-b border-breeze-100 px-4 py-3">
            <h2 className="font-extrabold">{t("title")}</h2>
            <div className="flex items-center gap-3">
              <button onClick={toggleSound} aria-pressed={sound} aria-label={t(sound ? "soundOn" : "soundOff")} className="text-lagoon hover:text-breeze-800">
                {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              {unread > 0 && <button onClick={() => void markRead()} className="text-xs font-bold text-lagoon hover:underline">{t("markAll")}</button>}
            </div>
          </header>
          <ul className="max-h-[50vh] overflow-y-auto">
            {alerts.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink/70">{t("empty")}</li>}
            {alerts.map((a) => {
              const txt = alertText(a, locale);
              const Icon = ICON[a.kind];
              return (
                <li key={a.id} className={`border-b border-breeze-50 last:border-0 ${a.read_at ? "" : "bg-breeze-50/60"}`}>
                  <Link href={txt.href} onClick={() => { void markRead([a.id]); setOpen(false); }} className="flex gap-3 px-4 py-3 hover:bg-breeze-50">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-breeze-50 text-lagoon"><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-bold">{txt.title}{!a.read_at && <span className="sr-only"> ({t("unread")})</span>}</span>
                      <span className="block break-words text-ink/70">{txt.body}</span>
                    </span>
                    {!a.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-orange-700" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>
          <PushSetup />
        </div>
      )}
    </div>
  );
}
