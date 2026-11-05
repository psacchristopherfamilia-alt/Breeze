import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine, googleCalendarUrl, icsDate, mapsUrl, telHref } from "@/lib/booking/calendar";

const ev = {
  title: "Corte clásico · Island Fade",
  start: new Date("2026-11-05T17:30:00Z"),
  end: new Date("2026-11-05T18:00:00Z"),
  location: "Island Fade, Leeward Hwy; Providenciales",
  description: "Con Carlos M.\nReservado con Breeze",
};

describe("calendario", () => {
  it("las fechas van en UTC sin separadores", () => {
    expect(icsDate(ev.start)).toBe("20261105T173000Z");
  });

  it("escapa comas, punto y coma, barras y saltos de línea", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });

  it("el .ics tiene los campos clave, CRLF y aviso de 1 hora antes", () => {
    const ics = buildIcs(ev, "abc123", new Date("2026-11-01T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:abc123@breeze");
    expect(ics).toContain("DTSTART:20261105T173000Z");
    expect(ics).toContain("DTEND:20261105T180000Z");
    expect(ics).toContain("LOCATION:Island Fade\\, Leeward Hwy\; Providenciales");
    expect(ics).toContain("DESCRIPTION:Con Carlos M.\\nReservado con Breeze");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });

  it("parte las líneas largas a 75 bytes sin cortar caracteres", () => {
    const folded = foldIcsLine("SUMMARY:" + "ñ".repeat(80));
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    for (const [i, l] of lines.entries()) expect(enc.encode(l).length).toBeLessThanOrEqual(i === 0 ? 75 : 75); // incluye el espacio inicial
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe("SUMMARY:" + "ñ".repeat(80));
  });

  it("el enlace de Google Calendar lleva título, fechas y lugar", () => {
    const u = new URL(googleCalendarUrl(ev));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261105T173000Z/20261105T180000Z");
    expect(u.searchParams.get("text")).toBe(ev.title);
    expect(u.searchParams.get("location")).toBe(ev.location);
  });

  it("el mapa usa nombre y dirección, y no existe sin dirección", () => {
    const u = new URL(mapsUrl("Island Fade", "Leeward Hwy, Providenciales")!);
    expect(u.hostname).toBe("www.google.com");
    expect(u.searchParams.get("query")).toBe("Island Fade, Leeward Hwy, Providenciales");
    expect(mapsUrl("X", "  ")).toBeNull();
    expect(mapsUrl("X", null)).toBeNull();
  });

  it("el teléfono se limpia y se ignora si es inválido", () => {
    expect(telHref("+1 (649) 000-0101")).toBe("tel:+16490000101");
    expect(telHref("649 231 4455")).toBe("tel:6492314455");
    expect(telHref("12")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});
