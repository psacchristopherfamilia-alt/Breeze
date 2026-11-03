import { formatLiveWhen, formatTime } from "../time";
import type { JobPayload, RenderedMessage } from "./types";

/**
 * Textos de los mensajes. Cortos (sirven para WhatsApp/SMS), en el idioma del cliente,
 * con la hora de Turks and Caicos y SIEMPRE firmados como "— Breeze".
 */
export const SIGNATURE = "— Breeze";

const T = {
  en: {
    confirmation: { subject: "Your booking is confirmed", intro: (n: string, s: string) => `Hi ${n}! Your booking at ${s} is confirmed:` },
    reminder: { subject: "Appointment reminder", intro: (n: string, s: string) => `Hi ${n}, this is a reminder of your appointment at ${s}:` },
    reschedule: { subject: "Your booking was moved", intro: (n: string, s: string) => `Hi ${n}, your booking at ${s} has a new time:` },
    cancellation: { subject: "Your booking was cancelled", intro: (n: string, s: string) => `Hi ${n}, your booking at ${s} has been cancelled:` },
    manage: "Manage your booking:",
    call: (p: string) => `Need to change it? Call ${p}.`,
    policy: (h: number) => `Free cancellation up to ${h} h before.`,
    rebook: "Book again:",
    with: "with",
  },
  es: {
    confirmation: { subject: "Tu cita está confirmada", intro: (n: string, s: string) => `¡Hola ${n}! Tu cita en ${s} está confirmada:` },
    reminder: { subject: "Recordatorio de tu cita", intro: (n: string, s: string) => `Hola ${n}, te recordamos tu cita en ${s}:` },
    reschedule: { subject: "Tu cita cambió de hora", intro: (n: string, s: string) => `Hola ${n}, tu cita en ${s} tiene nueva hora:` },
    cancellation: { subject: "Tu cita fue cancelada", intro: (n: string, s: string) => `Hola ${n}, tu cita en ${s} fue cancelada:` },
    manage: "Gestiona tu cita:",
    call: (p: string) => `¿Necesitas cambiarla? Llama al ${p}.`,
    policy: (h: number) => `Cancelación gratis hasta ${h} h antes.`,
    rebook: "Reserva de nuevo:",
    with: "con",
  },
} as const;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderMessage(job: JobPayload, appUrl: string): RenderedMessage {
  const L = job.locale === "es" ? "es" : "en";
  const t = T[L];
  const k = t[job.kind];
  const base = appUrl.replace(/\/$/, "");
  const first = job.items[0];

  const lines: string[] = [k.intro(job.customer.first_name, job.salon.name)];
  if (first) lines.push(formatLiveWhen(new Date(first.starts_at), L));
  for (const i of job.items) {
    lines.push(`• ${formatTime(new Date(i.starts_at))} ${L === "es" ? i.service_name_es : i.service_name_en} ${t.with} ${i.professional}`);
  }
  if (job.salon.address && job.kind !== "cancellation") lines.push(`📍 ${job.salon.address}`);

  if (job.kind === "cancellation") {
    lines.push(`${t.rebook} ${base}/s/${job.salon.slug}`);
  } else {
    if (job.link_token) lines.push(`${t.manage} ${base}/b/${job.link_token}`);
    else if (job.salon.phone) lines.push(t.call(job.salon.phone));
    if (job.kind === "confirmation") lines.push(t.policy(job.salon.cancellation_window_hours));
  }
  lines.push(SIGNATURE);

  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f2a33">${lines
    .map((l) => `<p style="margin:0 0 8px">${escapeHtml(l).replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#0e7c86">$1</a>')}</p>`)
    .join("")}</div>`;
  return { subject: `${k.subject} · ${job.salon.name}`, text, html };
}
