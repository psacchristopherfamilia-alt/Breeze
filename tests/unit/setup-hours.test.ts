import { describe, expect, it } from "vitest";
import { buildHours, validRange } from "@/lib/panel/setup";

describe("horario del asistente", () => {
  it("el mismo tramo para cada día elegido, de lunes a domingo y sin repetidos", () => {
    expect(buildHours([0, 6, 1, 1], "09:00", "18:00")).toEqual([
      { weekday: 1, start: "09:00", end: "18:00" },
      { weekday: 6, start: "09:00", end: "18:00" },
      { weekday: 0, start: "09:00", end: "18:00" },
    ]);
  });

  it("ignora días que no existen y no devuelve nada sin días", () => {
    expect(buildHours([9, -1, 2.5], "09:00", "18:00")).toEqual([]);
    expect(buildHours([], "09:00", "18:00")).toEqual([]);
  });

  it("solo acepta tramos que abren antes de cerrar", () => {
    expect(validRange("09:00", "18:00")).toBe(true);
    expect(validRange("18:00", "09:00")).toBe(false);
    expect(validRange("09:00", "09:00")).toBe(false);
    expect(validRange("9:00", "18:00")).toBe(false);
    expect(validRange("09:00", "24:00")).toBe(false);
  });
});
