"use client";
import { Loader2, MonitorPlay, Wind } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { useNow } from "@/lib/mock/store";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/time";
import { LiveBoardView, useLiveAlerts, type LiveItem, type LivePro } from "./LiveBoardView";

interface BoardJson {
  salon: { id: string; name: string };
  professionals: { id: string; public_name: string; initials: string; color_hex: string }[];
  appointments: LiveAppointmentJson[];
}
interface LiveAppointmentJson {
  id: string;
  booking_group_id: string;
  professional_id: string;
  customer_display: string;
  service_name_en: string;
  service_name_es: string;
  starts_at: string;
  ends_at: string;
  status: LiveItem["status"];
}

const toItem = (a: LiveAppointmentJson): LiveItem => ({
  id: a.id,
  groupId: a.booking_group_id,
  professionalId: a.professional_id,
  customer: a.customer_display,
  serviceNameEn: a.service_name_en,
  serviceNameEs: a.service_name_es,
  startsAt: a.starts_at,
  endsAt: a.ends_at,
  status: a.status,
});

export type Phase =
  | { kind: "loading" }
  | { kind: "pairing"; code: string; salonName: string; expiresAt: number }
  | { kind: "board"; salonId: string }
  | { kind: "error"; key: "notFound" | "anonDisabled" | "generic" | "tooManyPending" };

const REFRESH_MS = 5 * 60_000;

/**
 * Breeze Live con datos reales.
 * 1) Sesión anónima de Supabase (solo sirve para pantallas; la BD bloquea todo lo demás).
 * 2) Si no está emparejada, muestra un código: el salón lo escribe en Panel → Ajustes → Pantallas.
 * 3) Agenda del día saneada (get_live_board) + canal privado de Realtime live:<salon>.
 */
export function RealLive({ slug }: { slug: string }) {
  const t = useTranslations("live");
  const supabase = useMemo(() => createClient(), []);
  const clock = useNow(1000);
  const { alerts, push, sound, toggleSound } = useLiveAlerts();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [salonName, setSalonName] = useState("");
  const [pros, setPros] = useState<LivePro[]>([]);
  const [items, setItems] = useState<LiveItem[]>([]);
  const [connected, setConnected] = useState(false);
  const alerted = useRef(new Set<string>());

  const loadBoard = useCallback(
    async (salonId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("get_live_board", { p_salon_id: salonId });
      if (error || !data) return false;
      const b = data as unknown as BoardJson;
      setSalonName(b.salon.name);
      setPros(b.professionals.map((p) => ({ id: p.id, publicName: p.public_name, initials: p.initials, colorHex: p.color_hex })));
      setItems(b.appointments.map(toItem));
      return true;
    },
    [supabase],
  );

  // ¿Quién soy para esta sucursal? (personal, pantalla emparejada, pendiente o nada)
  const resolve = useCallback(async () => {
    const { data, error } = await supabase.rpc("live_device_status", { p_salon_slug: slug });
    if (error) return setPhase({ kind: "error", key: error.message === "not_found" ? "notFound" : "generic" });
    const s = data as { status: string; salon_id: string; salon_name: string };
    setSalonName(s.salon_name);
    if (s.status === "staff" || s.status === "paired") {
      if (await loadBoard(s.salon_id)) return setPhase({ kind: "board", salonId: s.salon_id });
    }
    const r = await supabase.rpc("request_live_pairing", { p_salon_slug: slug });
    if (r.error) return setPhase({ kind: "error", key: r.error.message === "too_many_pending" ? "tooManyPending" : "generic" });
    const p = r.data as { code: string; salon_name: string; expires_at: string };
    setPhase({ kind: "pairing", code: p.code, salonName: p.salon_name, expiresAt: new Date(p.expires_at).getTime() });
  }, [supabase, slug, loadBoard]);

  // 1) Sesión (anónima si hace falta) y estado inicial
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) return setPhase({ kind: "error", key: "anonDisabled" });
      }
      await resolve();
    })();
  }, [supabase, resolve]);

  // 2) Mientras se empareja: comprobar cada 4 s; pedir código nuevo al caducar
  useEffect(() => {
    if (phase.kind !== "pairing") return;
    const id = setInterval(async () => {
      if (Date.now() > phase.expiresAt) return void resolve();
      const { data } = await supabase.rpc("live_device_status", { p_salon_slug: slug });
      const s = data as { status: string } | null;
      if (s?.status === "paired") void resolve();
    }, 4000);
    return () => clearInterval(id);
  }, [phase, supabase, slug, resolve]);

  // 3) Tiempo real + recarga periódica (y al cambiar de día)
  const salonId = phase.kind === "board" ? phase.salonId : null;
  useEffect(() => {
    if (!salonId) return;
    let cancelled = false;
    const channelName = `live:${salonId}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(channelName, { config: { private: true } })
        .on("broadcast", { event: "appointment" }, ({ payload }) => {
          const p = payload as { type: string; appointment: LiveAppointmentJson };
          const item = toItem(p.appointment);
          const isToday = localDateKey(new Date(item.startsAt)) === localDateKey(new Date());
          setItems((prev) => {
            const rest = prev.filter((i) => i.id !== item.id);
            return p.type === "cancelled" || !isToday ? rest : [...rest, item];
          });
          // Una alerta por reserva (aunque tenga varios servicios)
          if (p.type === "booked" && !alerted.current.has(item.groupId)) {
            alerted.current.add(item.groupId);
            push(item);
          }
        })
        .subscribe((status) => {
          setConnected(status === "SUBSCRIBED");
          if (status === "CHANNEL_ERROR") void resolve(); // p. ej. pantalla desvinculada
        });
    })();
    const refresh = setInterval(async () => {
      if (!(await loadBoard(salonId))) void resolve();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [salonId, supabase, loadBoard, push, resolve]);

  const today = clock ? localDateKey(clock) : null;
  const lastDay = useRef(today);
  useEffect(() => {
    if (salonId && today && lastDay.current && today !== lastDay.current) void loadBoard(salonId);
    lastDay.current = today;
  }, [today, salonId, loadBoard]);

  if (phase.kind === "board") {
    return (
      <LiveBoardView
        salonName={salonName}
        pros={pros}
        items={items.filter((i) => today && localDateKey(new Date(i.startsAt)) === today)}
        clock={clock}
        alerts={alerts}
        sound={sound}
        onToggleSound={toggleSound}
        connected={connected}
      />
    );
  }

  return <LiveStatusScreen phase={phase} />;
}

/** Pantalla de carga / código de emparejamiento / error (sin datos de la agenda). */
export function LiveStatusScreen({ phase }: { phase: Exclude<Phase, { kind: "board" }> }) {
  const t = useTranslations("live");
  return (
    <div className="bg-breeze-sky flex min-h-dvh flex-col items-center justify-center p-8 text-center text-ink">
      <div className="absolute right-6 top-6"><LocaleSwitcher /></div>
      <span className="grid size-16 place-items-center rounded-3xl bg-breeze-500 text-white shadow"><Wind className="size-9" /></span>
      <p className="mt-4 text-sm font-bold uppercase tracking-[0.3em] text-breeze-600">Breeze Live</p>
      {phase.kind === "loading" && <Loader2 className="mt-10 size-10 animate-spin text-breeze-500" />}
      {phase.kind === "pairing" && (
        <>
          <h1 className="mt-2 text-3xl font-extrabold lg:text-4xl">{phase.salonName}</h1>
          <p className="mt-6 max-w-xl text-lg text-ink/70">{t("pair.instructions")}</p>
          <div className="mt-8 flex gap-3" aria-label={t("pair.codeLabel")}>
            {phase.code.split("").map((d, i) => (
              <span key={i} className="grid h-24 w-16 place-items-center rounded-2xl bg-white text-5xl font-extrabold tabular-nums shadow ring-1 ring-breeze-100 lg:h-32 lg:w-24 lg:text-7xl">
                {d}
              </span>
            ))}
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-ink/70"><MonitorPlay className="size-4" /> {t("pair.waiting")}</p>
        </>
      )}
      {phase.kind === "error" && <p className="mt-8 max-w-md text-lg font-semibold text-ink/70">{t(`pair.errors.${phase.key}`)}</p>}
    </div>
  );
}
