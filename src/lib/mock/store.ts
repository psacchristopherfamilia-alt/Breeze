"use client";
/**
 * Almacén SIMULADO del prototipo: guarda en localStorage las reservas nuevas y los cambios de estado,
 * y los emite por BroadcastChannel para que Breeze Live (en otra pestaña) reaccione "en tiempo real".
 * En la Fase 4 esto lo sustituyen las RPC de Supabase + Realtime Broadcast.
 */
import { useEffect, useMemo, useState } from "react";
import { overlaps } from "../availability";
import { seedAppointments, type Appointment, type AppointmentStatus } from "./data";

const KEY = "breeze-proto-v1";
const CHANNEL = "breeze-live";

export type StoreEvent =
  | { type: "booked"; appointments: Appointment[] }
  | { type: "status"; ids: string[]; status: AppointmentStatus };

interface Stored {
  added: Appointment[];
  status: Record<string, AppointmentStatus>;
}

const empty = (): Stored => ({ added: [], status: {} });

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado: el prototipo sigue funcionando en memoria */
  }
}

const listeners = new Set<(e: StoreEvent) => void>();
let channel: BroadcastChannel | null = null;

function getChannel() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (m) => listeners.forEach((l) => l(m.data as StoreEvent));
  }
  return channel;
}

function emit(e: StoreEvent) {
  listeners.forEach((l) => l(e));
  getChannel()?.postMessage(e);
}

export function subscribe(fn: (e: StoreEvent) => void) {
  getChannel();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Inserta reservas comprobando solapes (simula la exclusion constraint de Postgres).
 * Devuelve "conflict" si algún hueco acaba de ocuparse.
 */
export function addBookings(apps: Appointment[], current: Appointment[]): "ok" | "conflict" {
  const active = current.filter((a) => a.status !== "cancelled");
  for (const a of apps) {
    const range = { start: new Date(a.startsAt), end: new Date(a.blockedUntil) };
    const clash = active.some(
      (b) =>
        b.professionalId === a.professionalId &&
        overlaps(range, { start: new Date(b.startsAt), end: new Date(b.blockedUntil) }),
    );
    if (clash) return "conflict";
  }
  const s = read();
  s.added.push(...apps);
  write(s);
  emit({ type: "booked", appointments: apps });
  return "ok";
}

export function setStatus(ids: string[], status: AppointmentStatus) {
  const s = read();
  ids.forEach((id) => (s.status[id] = status));
  write(s);
  emit({ type: "status", ids, status });
}

export function resetPrototype() {
  write(empty());
  emit({ type: "status", ids: [], status: "booked" });
}

/** Reloj que solo existe en el navegador (evita diferencias entre servidor y cliente). */
export function useNow(intervalMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Citas de ejemplo + reservas creadas en el prototipo, con estados aplicados. */
export function useAppointments(onEvent?: (e: StoreEvent) => void) {
  const now = useNow();
  const [version, setVersion] = useState(0);
  const [seedAt, setSeedAt] = useState<Date | null>(null);

  useEffect(() => {
    setSeedAt(new Date());
    return subscribe((e) => {
      setVersion((v) => v + 1);
      onEvent?.(e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appointments = useMemo(() => {
    if (!seedAt) return [];
    const s = read();
    const all = [...seedAppointments(seedAt), ...s.added];
    return all.map((a) => (s.status[a.id] ? { ...a, status: s.status[a.id] } : a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedAt, version]);

  return { now, appointments, ready: !!seedAt && !!now };
}
