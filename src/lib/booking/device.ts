"use client";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Citas de invitado recordadas en ESTE navegador.
 *
 * Cada reserva de invitado tiene un enlace privado (token de 64 hex). Lo guardamos aquí para que,
 * al volver, el cliente vea su botón "Mis citas" sin crear cuenta. Se reconoce el dispositivo por
 * ese código y no por la IP: en un hotel o una wifi compartida la IP es de muchas personas.
 */
const KEY = "breeze-guest-bookings";
const EVENT = "breeze:device-bookings";
const TOKEN = /^[0-9a-f]{64}$/;
export const MAX_DEVICE_TOKENS = 20;

/** Lee la lista guardada: ignora lo que no sea un token válido y quita repetidos. */
export function parseTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const ok = v.filter((t): t is string => typeof t === "string" && TOKEN.test(t));
    return [...new Set(ok)].slice(0, MAX_DEVICE_TOKENS);
  } catch {
    return [];
  }
}

/** El más reciente primero; sin repetidos y con un máximo. Un token inválido no se guarda. */
export function addToken(list: string[], token: string): string[] {
  if (!TOKEN.test(token)) return list;
  return [token, ...list.filter((t) => t !== token)].slice(0, MAX_DEVICE_TOKENS);
}

export const removeTokens = (list: string[], remove: string[]): string[] => list.filter((t) => !remove.includes(t));

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return ""; // modo privado o datos bloqueados: la app funciona igual, solo no recuerda
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export const saveDeviceToken = (token: string) => write(addToken(parseTokens(readRaw()), token));
export const forgetDeviceTokens = (tokens: string[]) => write(removeTokens(parseTokens(readRaw()), tokens));

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // otra pestaña
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Tokens de este dispositivo. `undefined` mientras la página aún no se ha hidratado. */
export function useDeviceTokens(): string[] | undefined {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parseTokens(raw)), [raw]);
}
