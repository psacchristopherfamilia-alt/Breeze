"use client";
import { BellRing, Maximize, Moon, Radio, Sparkles, Sun, Volume2, VolumeX, Wind, WifiOff, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { withAlpha } from "@/lib/colors";
import { formatDayLong, formatLiveWhen, formatTime } from "@/lib/time";

/** Profesional en pantalla pública: nombre + inicial ("Carlos M."), iniciales y color. */
export interface LivePro {
  id: string;
  publicName: string;
  initials: string;
  colorHex: string;
}
/** Cita en pantalla pública: YA saneada ("Juan P."). */
export interface LiveItem {
  id: string;
  groupId: string;
  professionalId: string;
  customer: string;
  serviceNameEn: string;
  serviceNameEs: string;
  startsAt: string;
  endsAt: string;
  status: "booked" | "completed" | "cancelled" | "no_show";
}
export interface LiveAlert {
  key: string;
  item: LiveItem;
}

export const ALERT_MS = 12_000;

function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  [784, 1175, 1568].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const s = t + i * 0.13;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.22, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.8);
    o.connect(g).connect(ctx.destination);
    o.start(s);
    o.stop(s + 0.85);
  });
}

/** Alertas que desaparecen solas + sonido opcional (los navegadores exigen un toque para activarlo). */
export function useLiveAlerts() {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    if (!alerts.length) return;
    const id = setTimeout(() => setAlerts((a) => a.slice(0, -1)), ALERT_MS);
    return () => clearTimeout(id);
  }, [alerts]);

  const push = useCallback((item: LiveItem) => {
    setAlerts((prev) => [{ key: `${item.id}-${Date.now()}`, item }, ...prev].slice(0, 3));
    if (soundRef.current && audioRef.current) chime(audioRef.current);
  }, []);

  const toggleSound = useCallback(() => {
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume();
    setSound((s) => {
      if (!s && audioRef.current) chime(audioRef.current);
      return !s;
    });
  }, []);

  return { alerts, push, sound, toggleSound };
}

export function LiveBoardView({
  salonName,
  pros,
  items,
  clock,
  alerts,
  sound,
  onToggleSound,
  connected = true,
  demo,
}: {
  salonName: string;
  pros: LivePro[];
  items: LiveItem[];
  clock: Date | null;
  alerts: LiveAlert[];
  sound: boolean;
  onToggleSound: () => void;
  connected?: boolean;
  /** Solo prototipo: botones para simular citas. */
  demo?: { auto: boolean; onToggleAuto: () => void; onSimulate: () => void };
}) {
  const t = useTranslations("live");
  const { locale } = useAppLocale();
  const [dark, setDark] = useState(false);
  const bg = dark ? "bg-[#06232a] text-white" : "bg-breeze-sky text-ink";
  const card = dark ? "bg-white/[0.06] ring-white/10" : "bg-white ring-breeze-100";
  const muted = dark ? "text-white/50" : "text-ink/70";
  const active = items.filter((i) => i.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const svc = (i: LiveItem) => (locale === "es" ? i.serviceNameEs : i.serviceNameEn);

  return (
    <div className={`flex h-dvh flex-col overflow-hidden ${bg}`}>
      <header className="flex items-center justify-between gap-4 px-6 py-4 lg:px-10">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-breeze-500 text-white shadow">
            <Wind className="size-7" strokeWidth={2.4} />
          </span>
          <div>
            <p className={`text-xs font-bold uppercase tracking-[0.25em] ${dark ? "text-breeze-300" : "text-breeze-600"}`}>Breeze Live</p>
            <h1 className="text-2xl font-extrabold leading-tight lg:text-3xl">{salonName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 hidden items-center gap-1 sm:flex">
            <CtrlButton dark={dark} on={sound} onClick={onToggleSound} label={sound ? t("soundOn") : t("soundOff")}>
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </CtrlButton>
            {demo && (
              <>
                <CtrlButton dark={dark} on={demo.auto} onClick={demo.onToggleAuto} label={t("autoDemo")}>
                  <Radio className="size-4" />
                </CtrlButton>
                <CtrlButton dark={dark} onClick={demo.onSimulate} label={t("simulate")}>
                  <Zap className="size-4" />
                </CtrlButton>
              </>
            )}
            <CtrlButton dark={dark} onClick={() => setDark(!dark)} label={t("theme")}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </CtrlButton>
            <CtrlButton dark={dark} onClick={() => document.documentElement.requestFullscreen?.()} label={t("fullscreen")}>
              <Maximize className="size-4" />
            </CtrlButton>
            <LocaleSwitcher invert={dark} />
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold tabular-nums lg:text-5xl">{clock ? formatTime(clock) : "—"}</p>
            <p className={`text-sm font-semibold first-letter:uppercase ${muted}`}>{clock ? formatDayLong(clock, locale) : ""}</p>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-4 lg:px-10">
        {pros.map((p) => (
          <ProColumn key={p.id} pro={p} items={active.filter((i) => i.professionalId === p.id)} now={clock} dark={dark} card={card} muted={muted} svc={svc} />
        ))}
      </main>

      <footer className={`flex items-center justify-between px-6 pb-4 text-xs lg:px-10 ${muted}`}>
        <span className="inline-flex items-center gap-1.5">
          {connected ? (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-green-500" />
            </span>
          ) : (
            <WifiOff className="size-3.5 text-amber-500" />
          )}
          {connected ? t("connected") : t("reconnecting")} · {t("privacy")}
        </span>
        {demo && (
          <>
            <span className="sm:hidden">
              <button onClick={demo.onSimulate} className="font-bold underline">{t("simulate")}</button>
            </span>
            <span className="hidden sm:inline">{t("hint")}</span>
          </>
        )}
      </footer>

      <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex w-[min(92vw,560px)] flex-col-reverse gap-3 lg:right-10">
        {alerts.map(({ key, item }) => {
          const pro = pros.find((p) => p.id === item.professionalId);
          if (!pro) return null;
          const first = pro.publicName.split(" ")[0];
          return (
            <div key={key} role="status" className="relative flex overflow-hidden rounded-3xl bg-white text-ink shadow-2xl ring-1 ring-black/5 animate-slide-in">
              <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 text-white" style={{ backgroundColor: pro.colorHex }}>
                <span className="grid size-14 place-items-center rounded-full bg-white text-xl font-extrabold" style={{ color: pro.colorHex }}>
                  {pro.initials}
                </span>
                <span className="px-1 text-center text-xs font-bold">{first}</span>
              </div>
              <div className="flex-1 p-5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: pro.colorHex }}>
                  <BellRing className="size-4" /> {t("newBooking")}
                </p>
                <p className="mt-1 text-xl font-bold leading-snug lg:text-2xl">
                  {t.rich("alert", {
                    customer: item.customer,
                    pro: first,
                    when: formatLiveWhen(new Date(item.startsAt), locale),
                    b: (chunks) => <b style={{ color: pro.colorHex }}>{chunks}</b>,
                  })}
                </p>
                <p className="mt-1 text-sm text-ink/70">{svc(item)}</p>
              </div>
              <span className="absolute bottom-0 left-0 h-1 origin-left" style={{ backgroundColor: pro.colorHex, width: "100%", animation: `shrink ${ALERT_MS}ms linear forwards` }} />
            </div>
          );
        })}
      </div>
      <style>{`@keyframes shrink { from { transform: scaleX(1) } to { transform: scaleX(0) } }`}</style>
    </div>
  );
}

function CtrlButton({ children, onClick, label, on, dark }: { children: React.ReactNode; onClick: () => void; label: string; on?: boolean; dark: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`grid size-9 place-items-center rounded-full transition ${
        on ? "bg-breeze-500 text-white" : dark ? "bg-white/10 text-white/80 hover:bg-white/20" : "bg-white text-ink/70 ring-1 ring-breeze-100 hover:text-lagoon"
      }`}
    >
      {children}
    </button>
  );
}

function ProColumn({
  pro,
  items,
  now,
  dark,
  card,
  muted,
  svc,
}: {
  pro: LivePro;
  items: LiveItem[];
  now: Date | null;
  dark: boolean;
  card: string;
  muted: string;
  svc: (i: LiveItem) => string;
}) {
  const t = useTranslations("live");
  const c = pro.colorHex;
  const nowMs = now?.getTime() ?? 0;
  const nextIdx = items.findIndex((i) => new Date(i.startsAt).getTime() > nowMs && i.status === "booked");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector("[data-focus='true']")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nextIdx, items.length]);

  return (
    <section className={`flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-3xl ring-1 ${card}`}>
      <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ backgroundColor: c }}>
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-xl font-extrabold" style={{ color: c }}>
          {pro.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-2xl font-extrabold leading-tight">{pro.publicName}</p>
          <p className="text-sm font-semibold text-white/80">{t("count", { count: items.length })}</p>
        </div>
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 no-scrollbar">
        {items.length === 0 && (
          <li className={`flex flex-col items-center gap-2 py-10 text-center text-sm font-semibold ${muted}`}>
            <Sparkles className="size-6" /> {t("free")}
          </li>
        )}
        {items.map((i, idx) => {
          const s = new Date(i.startsAt).getTime();
          const e = new Date(i.endsAt).getTime();
          const current = nowMs >= s && nowMs < e && i.status !== "no_show";
          const past = nowMs >= e || i.status === "completed" || i.status === "no_show";
          const isNext = idx === nextIdx;
          return (
            <li
              key={i.id}
              data-focus={current || (isNext && !items.some((x) => nowMs >= new Date(x.startsAt).getTime() && nowMs < new Date(x.endsAt).getTime()))}
              className={`rounded-2xl p-3 transition ${past && !current ? "opacity-40" : ""}`}
              style={{
                backgroundColor: current ? c : withAlpha(c, dark ? 0.18 : 0.08),
                color: current ? "white" : undefined,
                ...(current ? { animation: "var(--animate-pulse-ring)", ["--ring-color" as string]: withAlpha(c, 0.5) } : {}),
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-extrabold tabular-nums" style={{ color: current ? "white" : c }}>
                  {formatTime(new Date(i.startsAt))}
                </span>
                {current && <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold uppercase">{t("now")}</span>}
                {isNext && !current && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase text-white" style={{ backgroundColor: c }}>
                    {t("next")}
                  </span>
                )}
              </div>
              <p className="text-base font-bold">{i.customer}</p>
              <p className={`text-sm ${current ? "text-white/80" : muted}`}>{svc(i)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
