"use client";
import { BellRing, Maximize, Moon, Radio, Sparkles, Sun, Volume2, VolumeX, Wind, Zap } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppLocale } from "@/components/Providers";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { getAvailableSlots } from "@/lib/availability";
import { colorOf, withAlpha } from "@/lib/colors";
import {
  FAKE_CUSTOMERS,
  hoursFor,
  proById,
  prosOf,
  salonBySlug,
  serviceById,
  serviceName,
  type Appointment,
  type Professional,
} from "@/lib/mock/data";
import { addBookings, useAppointments, useNow, type StoreEvent } from "@/lib/mock/store";
import { initials, shortName } from "@/lib/privacy";
import { addDaysKey, addMinutes, formatDayLong, formatLiveWhen, formatTime, localDateKey } from "@/lib/time";

/**
 * Lo ÚNICO que la pantalla pública puede mostrar de una cita.
 * En producción este recorte lo hace la base de datos (get_live_board + Broadcast saneado).
 */
interface LiveItem {
  id: string;
  professionalId: string;
  customer: string; // "Juan P."
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: Appointment["status"];
}
const toLiveItem = (a: Appointment): LiveItem => ({
  id: a.id,
  professionalId: a.professionalId,
  customer: shortName(a.customerFirst, a.customerLast),
  serviceId: a.serviceId,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
  status: a.status,
});

interface Alert {
  key: string;
  item: LiveItem;
}

const ALERT_MS = 12_000;

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

export default function LivePage() {
  const { salonId } = useParams<{ salonId: string }>();
  const salon = salonBySlug(salonId);
  const t = useTranslations("live");
  const { locale } = useAppLocale();
  const clock = useNow(1000);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sound, setSound] = useState(false);
  const [dark, setDark] = useState(false);
  const [auto, setAuto] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const onEvent = useCallback(
    (e: StoreEvent) => {
      if (e.type !== "booked" || !salon) return;
      const first = e.appointments.find((a) => a.salonId === salon.id);
      if (!first) return;
      const item = toLiveItem(first);
      setAlerts((prev) => [{ key: `${item.id}-${Date.now()}`, item }, ...prev].slice(0, 3));
      if (soundRef.current && audioRef.current) chime(audioRef.current);
    },
    [salon],
  );
  const { appointments, ready } = useAppointments(onEvent);

  // Las alertas desaparecen solas.
  useEffect(() => {
    if (!alerts.length) return;
    const id = setTimeout(() => setAlerts((a) => a.slice(0, -1)), ALERT_MS);
    return () => clearTimeout(id);
  }, [alerts]);

  const simulate = useCallback(() => {
    if (!salon) return;
    const now = new Date();
    const pros = prosOf(salon.id);
    for (let attempt = 0; attempt < 20; attempt++) {
      const pro = pros[Math.floor(Math.random() * pros.length)];
      const svc = serviceById(pro.serviceIds[Math.floor(Math.random() * pro.serviceIds.length)])!;
      const key = addDaysKey(localDateKey(now), Math.floor(Math.random() * 6));
      const slots = getAvailableSlots({
        dateKey: key,
        workingHours: hoursFor(pro, key),
        busy: appointments
          .filter((a) => a.professionalId === pro.id && a.status !== "cancelled")
          .map((a) => ({ start: new Date(a.startsAt), end: new Date(a.blockedUntil) })),
        totalMin: svc.durationMin + svc.bufferMin,
        stepMin: 15,
        now,
        minLeadMin: salon.minLeadMin,
      });
      if (!slots.length) continue;
      const start = slots[Math.floor(Math.random() * Math.min(slots.length, 8))];
      const end = addMinutes(start, svc.durationMin);
      const [first, last] = FAKE_CUSTOMERS[Math.floor(Math.random() * FAKE_CUSTOMERS.length)];
      const id = `sim-${Date.now()}`;
      const res = addBookings(
        [
          {
            id,
            groupId: id,
            salonId: salon.id,
            professionalId: pro.id,
            serviceId: svc.id,
            customerFirst: first,
            customerLast: last,
            customerPhone: "+1 649 000 0000",
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            blockedUntil: addMinutes(end, svc.bufferMin).toISOString(),
            status: "booked",
            source: "online",
            createdAt: now.toISOString(),
          },
        ],
        appointments,
      );
      if (res === "ok") return;
    }
  }, [salon, appointments]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(simulate, 9000);
    return () => clearInterval(id);
  }, [auto, simulate]);

  const toggleSound = () => {
    // Los navegadores exigen un toque antes de reproducir audio.
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume();
    if (!sound) chime(audioRef.current);
    setSound(!sound);
  };

  if (!salon) return <p className="p-10 text-center">Salon not found</p>;

  const today = clock ? localDateKey(clock) : null;
  const pros = prosOf(salon.id);
  const items = ready && today
    ? appointments
        .filter((a) => a.salonId === salon.id && a.status !== "cancelled" && localDateKey(new Date(a.startsAt)) === today)
        .map(toLiveItem)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    : [];

  const bg = dark ? "bg-[#06232a] text-white" : "bg-breeze-sky text-ink";
  const card = dark ? "bg-white/[0.06] ring-white/10" : "bg-white ring-breeze-100";
  const muted = dark ? "text-white/50" : "text-ink/50";

  return (
    <div className={`flex h-dvh flex-col overflow-hidden ${bg}`}>
      {/* Cabecera */}
      <header className="flex items-center justify-between gap-4 px-6 py-4 lg:px-10">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-breeze-500 text-white shadow">
            <Wind className="size-7" strokeWidth={2.4} />
          </span>
          <div>
            <p className={`text-xs font-bold uppercase tracking-[0.25em] ${dark ? "text-breeze-300" : "text-breeze-600"}`}>Breeze Live</p>
            <h1 className="text-2xl font-extrabold leading-tight lg:text-3xl">{salon.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="mr-2 hidden items-center gap-1 sm:flex">
            <CtrlButton dark={dark} on={sound} onClick={toggleSound} label={sound ? t("soundOn") : t("soundOff")}>
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </CtrlButton>
            <CtrlButton dark={dark} on={auto} onClick={() => setAuto(!auto)} label={t("autoDemo")}>
              <Radio className="size-4" />
            </CtrlButton>
            <CtrlButton dark={dark} onClick={simulate} label={t("simulate")}>
              <Zap className="size-4" />
            </CtrlButton>
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

      {/* Columnas por profesional */}
      <main className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-4 lg:px-10">
        {pros.map((p) => (
          <ProColumn key={p.id} pro={p} items={items.filter((i) => i.professionalId === p.id)} now={clock} dark={dark} card={card} muted={muted} />
        ))}
      </main>

      <footer className={`flex items-center justify-between px-6 pb-4 text-xs lg:px-10 ${muted}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          {t("connected")} · {t("privacy")}
        </span>
        <span className="sm:hidden">
          <button onClick={simulate} className="font-bold underline">{t("simulate")}</button>
        </span>
        <span className="hidden sm:inline">{t("hint")}</span>
      </footer>

      {/* Alertas de nuevas citas */}
      <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex w-[min(92vw,560px)] flex-col-reverse gap-3 lg:right-10">
        {alerts.map(({ key, item }) => {
          const pro = proById(item.professionalId)!;
          const c = colorOf(pro.color);
          return (
            <div
              key={key}
              role="status"
              className="relative flex overflow-hidden rounded-3xl bg-white text-ink shadow-2xl ring-1 ring-black/5 animate-slide-in"
            >
              <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 text-white" style={{ backgroundColor: c.hex }}>
                <span className="grid size-14 place-items-center rounded-full bg-white text-xl font-extrabold" style={{ color: c.hex }}>
                  {initials(pro.firstName, pro.lastName)}
                </span>
                <span className="px-1 text-center text-xs font-bold">{pro.firstName}</span>
              </div>
              <div className="flex-1 p-5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: c.hex }}>
                  <BellRing className="size-4" /> {t("newBooking")}
                </p>
                <p className="mt-1 text-xl font-bold leading-snug lg:text-2xl">
                  {t.rich("alert", {
                    customer: item.customer,
                    pro: pro.firstName,
                    when: formatLiveWhen(new Date(item.startsAt), locale),
                    b: (chunks) => <b style={{ color: c.hex }}>{chunks}</b>,
                  })}
                </p>
                <p className="mt-1 text-sm text-ink/50">{serviceName(serviceById(item.serviceId)!, locale)}</p>
              </div>
              <span className="absolute bottom-0 left-0 h-1 origin-left" style={{ backgroundColor: c.hex, width: "100%", animation: `shrink ${ALERT_MS}ms linear forwards` }} />
            </div>
          );
        })}
      </div>
      <style>{`@keyframes shrink { from { transform: scaleX(1) } to { transform: scaleX(0) } }`}</style>
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  label,
  on,
  dark,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  on?: boolean;
  dark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`grid size-9 place-items-center rounded-full transition ${
        on
          ? "bg-breeze-500 text-white"
          : dark
            ? "bg-white/10 text-white/80 hover:bg-white/20"
            : "bg-white text-ink/60 ring-1 ring-breeze-100 hover:text-lagoon"
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
}: {
  pro: Professional;
  items: LiveItem[];
  now: Date | null;
  dark: boolean;
  card: string;
  muted: string;
}) {
  const t = useTranslations("live");
  const { locale } = useAppLocale();
  const c = colorOf(pro.color);
  const nowMs = now?.getTime() ?? 0;
  const nextIdx = items.findIndex((i) => new Date(i.startsAt).getTime() > nowMs && i.status === "booked");
  const listRef = useRef<HTMLUListElement>(null);

  // Mantiene visible la cita actual / siguiente.
  useEffect(() => {
    listRef.current?.querySelector("[data-focus='true']")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nextIdx, items.length]);

  return (
    <section className={`flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-3xl ring-1 ${card}`}>
      <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ backgroundColor: c.hex }}>
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-xl font-extrabold" style={{ color: c.hex }}>
          {initials(pro.firstName, pro.lastName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-2xl font-extrabold leading-tight">{shortName(pro.firstName, pro.lastName)}</p>
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
                backgroundColor: current ? c.hex : withAlpha(c.hex, dark ? 0.18 : 0.08),
                color: current ? "white" : undefined,
                ...(current ? { animation: "var(--animate-pulse-ring)", ["--ring-color" as string]: withAlpha(c.hex, 0.5) } : {}),
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-extrabold tabular-nums" style={{ color: current ? "white" : c.hex }}>
                  {formatTime(new Date(i.startsAt))}
                </span>
                {current && <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold uppercase">{t("now")}</span>}
                {isNext && !current && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase text-white" style={{ backgroundColor: c.hex }}>
                    {t("next")}
                  </span>
                )}
              </div>
              <p className="text-base font-bold">{i.customer}</p>
              <p className={`text-sm ${current ? "text-white/80" : muted}`}>{serviceName(serviceById(i.serviceId)!, locale)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
