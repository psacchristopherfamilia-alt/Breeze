import { describe, expect, it } from "vitest";
import { checkMove, movesWholeGroup, type MoveContext, type MovableAppt, type MovePro } from "@/lib/agenda/move";
import { occupancyOfDay, occupancyStep, weekDays, weekStartKey } from "@/lib/agenda/occupancy";
import { atLocal } from "@/lib/time";

// Martes 10 de noviembre de 2026 (hora de Turks and Caicos). "Ahora" = 10:15.
const DAY = "2026-11-10";
const T = (hhmm: string, day = DAY) => atLocal(day, hhmm);
const iso = (hhmm: string, day = DAY) => T(hhmm, day).toISOString();
const NOW = T("10:15");
const weekdays: MovePro["hours"] = { 1: [["09:00", "17:00"]], 2: [["09:00", "17:00"]], 3: [["09:00", "17:00"]], 4: [["09:00", "17:00"]], 5: [["09:00", "17:00"]] };
const marcus: MovePro = { id: "m", firstName: "Marcus", lastName: "Taylor", serviceIds: ["cut", "fade"], hours: weekdays };
const dana: MovePro = { id: "d", firstName: "Dana", lastName: "Rolle", serviceIds: ["cut"], hours: { 2: [["09:00", "12:00"], ["13:00", "17:00"]] } };

function appt(id: string, pro: string, start: string, mins = 30, over: Partial<MovableAppt> = {}): MovableAppt {
  const s = T(start);
  return {
    id, groupId: over.groupId ?? id, professionalId: pro, serviceId: "cut", status: "booked",
    startsAt: s.toISOString(), endsAt: new Date(s.getTime() + mins * 60_000).toISOString(), blockedUntil: new Date(s.getTime() + (mins + 10) * 60_000).toISOString(),
    ...over,
  };
}
const ctx = (appointments: MovableAppt[], blocked: MoveContext["blocked"] = []): MoveContext => ({ appointments, pros: [marcus, dana], blocked, now: NOW });
const move = (c: MoveContext, a: MovableAppt, pro: string, start: string, dur = 30, day = DAY) => checkMove(c, a, { professionalId: pro, startsAt: T(start, day), durationMin: dur });

describe("checkMove", () => {
  const a = appt("a", "m", "11:00");
  it("un hueco libre dentro del horario es válido", () => {
    expect(move(ctx([a]), a, "m", "14:00")).toBeNull();
  });
  it("no se mueve una cita que ya empezó, está hecha o cancelada", () => {
    const started = appt("s", "m", "10:00");
    expect(move(ctx([started]), started, "m", "14:00")?.key).toBe("started");
    const done = appt("x", "m", "11:00", 30, { status: "completed" });
    expect(move(ctx([done]), done, "m", "14:00")?.key).toBe("not_booked");
  });
  it("no se mueve al pasado", () => {
    expect(move(ctx([a]), a, "m", "09:30")?.key).toBe("past");
  });
  it("respeta el horario, los días libres y los tramos partidos", () => {
    expect(move(ctx([a]), a, "m", "16:45")?.key).toBe("outside_hours"); // 16:45 + 30 + 10 > 17:00
    expect(move(ctx([a]), a, "m", "16:20")).toBeNull();
    expect(move(ctx([a]), a, "m", "11:00", 30, "2026-11-14")?.key).toBe("day_off"); // sábado
    const d = appt("dd", "d", "14:00");
    expect(move(ctx([d]), d, "d", "11:45")?.key).toBe("outside_hours"); // cruza el descanso de 12:00 a 13:00
    expect(move(ctx([d]), d, "d", "13:00")).toBeNull();
  });
  it("el tiempo entre servicios también ocupa hueco", () => {
    const other = appt("o", "m", "13:00"); // ocupa hasta 13:40
    expect(move(ctx([a, other]), a, "m", "13:30")?.key).toBe("overlap");
    expect(move(ctx([a, other]), a, "m", "13:40")).toBeNull();
    expect(move(ctx([a, other]), a, "m", "12:20")).toBeNull(); // termina 12:50 (+10 = 13:00)
    expect(move(ctx([a, other]), a, "m", "12:30")?.key).toBe("overlap");
  });
  it("las citas canceladas no estorban", () => {
    const gone = appt("g", "m", "13:00", 30, { status: "cancelled" });
    expect(move(ctx([a, gone]), a, "m", "13:00")).toBeNull();
  });
  it("cambiar de profesional exige que ofrezca el servicio", () => {
    const fade = appt("f", "m", "11:00", 45, { serviceId: "fade" });
    expect(move(ctx([fade]), fade, "d", "14:00", 45)?.key).toBe("not_offered");
    expect(move(ctx([a]), a, "d", "14:00")).toBeNull();
  });
  it("respeta los días libres y cierres", () => {
    const blocked = [{ professionalId: "m", start: T("13:00"), end: T("15:00") }];
    expect(move(ctx([a], blocked), a, "m", "14:00")?.key).toBe("blocked");
    expect(move(ctx([a], blocked), a, "d", "14:00")).toBeNull();
  });
  it("el mismo cliente no puede estar en dos sitios a la vez", () => {
    const mine = appt("a", "m", "11:00", 30, { customerId: "juan" });
    const elsewhere = appt("e", "d", "14:00", 30, { customerId: "juan" });
    expect(move(ctx([mine, elsewhere]), mine, "m", "14:10")?.key).toBe("overlap");
  });
  it("alargar la duración no puede chocar con la siguiente", () => {
    const next = appt("n", "m", "12:00");
    expect(move(ctx([a, next]), a, "m", "11:00", 60)?.key).toBe("overlap");
    expect(move(ctx([a, next]), a, "m", "11:00", 45)).toBeNull();
  });
});

describe("reserva con varios servicios", () => {
  const g1 = appt("g1", "m", "11:00", 30, { groupId: "G" });
  const g2 = appt("g2", "m", "11:40", 20, { groupId: "G" });
  it("mover la hora mueve toda la reserva y se comprueban todos los servicios", () => {
    expect(movesWholeGroup(ctx([g1, g2]), g1, { professionalId: "m", startsAt: T("14:00"), durationMin: 30 })).toBe(true);
    expect(move(ctx([g1, g2]), g1, "m", "14:00")).toBeNull();
    const wall = appt("w", "m", "14:45");
    // el segundo servicio caería en 14:40–15:00 y choca con la cita de 14:45
    expect(move(ctx([g1, g2, wall]), g1, "m", "14:00")?.key).toBe("overlap");
  });
  it("cambiar de profesional o de duración trata solo esa cita", () => {
    expect(movesWholeGroup(ctx([g1, g2]), g1, { professionalId: "d", startsAt: T("14:00"), durationMin: 30 })).toBe(false);
    expect(movesWholeGroup(ctx([g1, g2]), g1, { professionalId: "m", startsAt: T("14:00"), durationMin: 45 })).toBe(false);
  });
});

describe("semana y ocupación", () => {
  it("la semana empieza el lunes", () => {
    expect(weekStartKey("2026-11-10")).toBe("2026-11-09");
    expect(weekStartKey("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(weekStartKey("2026-11-09")).toBe("2026-11-09");
    expect(weekDays("2026-11-12")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  });
  it("cruza bien el cambio de horario de verano (noviembre 2026)", () => {
    expect(weekDays("2026-11-01")).toHaveLength(7);
    expect(new Set(weekDays("2026-03-08")).size).toBe(7);
  });
  it("ocupación = minutos con cita ÷ minutos de horario", () => {
    const appts = [
      { startsAt: iso("09:00"), endsAt: iso("09:30"), status: "booked" },
      { startsAt: iso("10:00"), endsAt: iso("11:00"), status: "completed" },
      { startsAt: iso("12:00"), endsAt: iso("12:30"), status: "cancelled" },
    ];
    const o = occupancyOfDay(weekdays, DAY, appts, []);
    expect(o).toMatchObject({ count: 2, bookedMin: 90, openMin: 480, pct: 19, freeMin: 390, closed: false });
  });
  it("los días libres y cierres restan horario, sin contarse dos veces si se solapan", () => {
    const blocked = [
      { start: T("12:00"), end: T("14:00") },
      { start: T("13:00"), end: T("15:00") }, // solapa con el anterior
    ];
    const o = occupancyOfDay(weekdays, DAY, [], blocked);
    expect(o.openMin).toBe(480 - 180); // 12:00 a 15:00 fuera
  });
  it("un día sin horario es «libre» y no divide entre cero", () => {
    const o = occupancyOfDay(weekdays, "2026-11-14", [], []);
    expect(o).toMatchObject({ closed: true, openMin: 0, pct: 0 });
    expect(occupancyOfDay({ 2: [["09:00", "10:00"]] }, DAY, [{ startsAt: iso("09:00"), endsAt: iso("11:00"), status: "booked" }], []).pct).toBe(100);
  });
  it("escalones de color", () => {
    expect([0, 19, 20, 59, 60, 79, 80, 100].map(occupancyStep)).toEqual([1, 1, 2, 3, 4, 4, 5, 5]);
  });
});
