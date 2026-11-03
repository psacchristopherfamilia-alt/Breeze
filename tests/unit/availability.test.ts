/**
 * ★ Test obligatorio: cálculo de disponibilidad.
 * duración + buffer del servicio + horario del profesional + citas existentes,
 * en UTC internamente y en hora de Turks and Caicos (America/Grand_Turk, con horario de verano).
 */
import { describe, expect, it } from "vitest";
import { getAvailableSlots, planSequence, slotsForPros, totalBlockMinutes, weeklyHoursFromRows } from "@/lib/availability";
import { atLocal, formatTime } from "@/lib/time";

const DAY = "2026-11-10"; // martes, EST (UTC-5)
const L = (hhmm: string, day = DAY) => atLocal(day, hhmm);
const times = (slots: Date[]) => slots.map((d) => formatTime(d));
const longAgo = new Date("2026-01-01T00:00:00Z");

const base = { dateKey: DAY, busy: [], totalMin: 30, stepMin: 15, now: longAgo, minLeadMin: 0 };

describe("getAvailableSlots", () => {
  it("ofrece todos los huecos donde cabe la reserva completa", () => {
    const s = getAvailableSlots({ ...base, workingHours: [["09:00", "11:00"]] });
    expect(times(s)).toEqual(["9:00 AM", "9:15 AM", "9:30 AM", "9:45 AM", "10:00 AM", "10:15 AM", "10:30 AM"]);
  });

  it("la reserva + buffer debe terminar antes del cierre", () => {
    // 30 min + 10 de limpieza = 40 → el último hueco hasta las 11:00 es 10:15 (termina 10:55)
    const s = getAvailableSlots({ ...base, totalMin: 40, workingHours: [["09:00", "11:00"]] });
    expect(times(s).at(-1)).toBe("10:15 AM");
  });

  it("respeta citas existentes incluyendo su buffer, con bordes semiabiertos", () => {
    const busy = [{ start: L("10:00"), end: L("10:40") }]; // cita 10:00–10:30 + 10 de limpieza
    const s = times(getAvailableSlots({ ...base, workingHours: [["09:00", "12:00"]], busy }));
    expect(s).toContain("9:30 AM"); // 9:30–10:00 toca el borde: permitido
    expect(s).not.toContain("9:45 AM"); // 9:45–10:15 se solapa
    expect(s).not.toContain("10:30 AM"); // dentro del buffer
    expect(s).toContain("10:45 AM"); // después del buffer (paso de 15)
  });

  it("no cruza la pausa del mediodía en un horario partido", () => {
    const s = times(getAvailableSlots({ ...base, totalMin: 60, workingHours: [["09:00", "13:00"], ["14:00", "18:00"]] }));
    expect(s).toContain("12:00 PM");
    expect(s).not.toContain("12:15 PM"); // acabaría a las 13:15, en la pausa
    expect(s).not.toContain("1:00 PM");
    expect(s[s.indexOf("12:00 PM") + 1]).toBe("2:00 PM");
  });

  it("aplica la antelación mínima respecto a ahora", () => {
    const now = L("09:20");
    const s = times(getAvailableSlots({ ...base, now, minLeadMin: 60, workingHours: [["09:00", "12:00"]] }));
    expect(s[0]).toBe("10:30 AM"); // primer paso ≥ 10:20
  });

  it("un día sin horario (día libre) no tiene huecos", () => {
    expect(getAvailableSlots({ ...base, workingHours: [] })).toEqual([]);
  });

  it("respeta días libres parciales y cierres como rangos ocupados", () => {
    const busy = [{ start: L("09:00"), end: L("11:00") }];
    expect(times(getAvailableSlots({ ...base, workingHours: [["09:00", "12:00"]], busy }))[0]).toBe("11:00 AM");
  });

  it("devuelve instantes UTC correctos (EST, UTC-5, en noviembre)", () => {
    const [first] = getAvailableSlots({ ...base, workingHours: [["09:00", "10:00"]] });
    expect(first.toISOString()).toBe("2026-11-10T14:00:00.000Z");
  });
});

describe("cambios de hora en Turks and Caicos (America/Grand_Turk)", () => {
  const hours: [string, string][] = [["09:00", "11:00"]];

  it("antes y después de adelantar la hora (8 de marzo de 2026): 9:00 local cambia de UTC-5 a UTC-4", () => {
    const sat = getAvailableSlots({ ...base, dateKey: "2026-03-07", workingHours: hours });
    const sun = getAvailableSlots({ ...base, dateKey: "2026-03-08", workingHours: hours });
    expect(sat[0].toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(sun[0].toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(times(sun)).toEqual(times(sat)); // el cliente ve las mismas horas
  });

  it("antes y después de atrasar la hora (1 de noviembre de 2026): de UTC-4 a UTC-5", () => {
    const sat = getAvailableSlots({ ...base, dateKey: "2026-10-31", workingHours: hours });
    const sun = getAvailableSlots({ ...base, dateKey: "2026-11-01", workingHours: hours });
    expect(sat[0].toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(sun[0].toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(times(sun)).toEqual(["9:00 AM", "9:15 AM", "9:30 AM", "9:45 AM", "10:00 AM", "10:15 AM", "10:30 AM"]);
  });

  it("una cita creada en horario de verano bloquea la hora local correcta el día del cambio", () => {
    // Cita el 1 de noviembre a las 10:00 EST (15:00 UTC)
    const busy = [{ start: new Date("2026-11-01T15:00:00Z"), end: new Date("2026-11-01T15:40:00Z") }];
    const s = times(getAvailableSlots({ ...base, dateKey: "2026-11-01", workingHours: [["09:00", "12:00"]], busy }));
    expect(s).not.toContain("10:00 AM");
    expect(s).toContain("9:30 AM");
    expect(s).toContain("10:45 AM");
  });
});

describe("varios servicios y varios profesionales", () => {
  it("planSequence encadena servicios: fin + buffer = inicio del siguiente (igual que la BD)", () => {
    const plan = planSequence(L("10:00"), [
      { durationMin: 30, bufferMin: 10 },
      { durationMin: 20, bufferMin: 5 },
    ]);
    expect(plan.map((p) => [formatTime(p.start), formatTime(p.end), formatTime(p.blockedUntil)])).toEqual([
      ["10:00 AM", "10:30 AM", "10:40 AM"],
      ["10:40 AM", "11:00 AM", "11:05 AM"],
    ]);
    expect(totalBlockMinutes([{ durationMin: 30, bufferMin: 10 }, { durationMin: 20, bufferMin: 5 }])).toBe(65);
  });

  it("'cualquier profesional' une los huecos y asigna al primero libre", () => {
    const hours = weeklyHoursFromRows([
      { weekday: 2, start: "09:00", end: "11:00" },
    ]);
    const s = slotsForPros({
      dateKey: DAY,
      pros: [{ id: "carlos", hours }, { id: "andre", hours }],
      busy: [{ professionalId: "carlos", start: L("10:00"), end: L("10:40") }],
      totalMin: 30, stepMin: 30, now: longAgo, minLeadMin: 0,
    });
    expect(s.map((x) => [formatTime(x.start), x.proId])).toEqual([
      ["9:00 AM", "carlos"],
      ["9:30 AM", "carlos"],
      ["10:00 AM", "andre"], // Carlos está ocupado → Andre
      ["10:30 AM", "andre"], // Carlos sigue en su buffer
    ]);
  });

  it("si nadie está libre, no hay huecos", () => {
    const hours = weeklyHoursFromRows([{ weekday: 2, start: "09:00", end: "10:00" }]);
    const busy = ["a", "b"].map((id) => ({ professionalId: id, start: L("09:00"), end: L("10:00") }));
    expect(slotsForPros({ dateKey: DAY, pros: [{ id: "a", hours }, { id: "b", hours }], busy, totalMin: 30, stepMin: 15, now: longAgo, minLeadMin: 0 })).toEqual([]);
  });
});
