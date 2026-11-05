/** Enlaces y archivos para llevarse la cita: calendario (.ics / Google), mapa y teléfono. */

export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  description?: string | null;
}

/** 2026-11-05T17:30:00.000Z → 20261105T173000Z (siempre en UTC: el calendario del teléfono lo pasa a su hora). */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Las líneas de un .ics no pasan de 75 bytes: se parten con CRLF + espacio (sin cortar caracteres a la mitad). */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // las continuaciones llevan un espacio delante
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(ev: CalendarEvent, uid: string, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Breeze//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@breeze`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${escapeIcsText(ev.title)}`,
    ...(ev.location ? [`LOCATION:${escapeIcsText(ev.location)}`] : []),
    ...(ev.description ? [`DESCRIPTION:${escapeIcsText(ev.description)}`] : []),
    // Aviso 1 hora antes (el calendario del cliente lo muestra aunque no haya internet).
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Breeze",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${icsDate(ev.start)}/${icsDate(ev.end)}` });
  if (ev.location) q.set("location", ev.location);
  if (ev.description) q.set("details", ev.description);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Enlace de Google Maps (abre la app de mapas en cualquier teléfono). Null si no hay dirección. */
export function mapsUrl(name: string, address: string | null | undefined): string | null {
  const a = address?.trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${a}`)}`;
}

/** "+1 (649) 000-0101" → "tel:+16490000101". Null si no parece un teléfono. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = phone?.trim() ?? "";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  return `tel:${raw.startsWith("+") ? "+" : ""}${digits}`;
}
