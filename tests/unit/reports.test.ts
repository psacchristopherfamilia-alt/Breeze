import { describe, expect, it } from "vitest";
import { delta, formatMoney, heatGrid, heatStep, parsePeriod, periodKeys, share } from "@/lib/panel/reports";

describe("dinero", () => {
  it("separador de miles, y decimales solo cuando hacen falta", () => {
    expect(formatMoney(268200)).toBe("$2,682");
    expect(formatMoney(3624)).toBe("$36.24");
    expect(formatMoney(3500)).toBe("$35");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(123456789)).toBe("$1,234,567.89");
    expect(formatMoney(5)).toBe("$0.05");
  });
});

describe("periodos", () => {
  it("«últimos N días» incluye hoy y termina mañana (sin incluir)", () => {
    expect(periodKeys("2026-11-10", 7)).toEqual({ fromKey: "2026-11-04", toKeyExclusive: "2026-11-11" });
    expect(periodKeys("2026-11-10", 30)).toEqual({ fromKey: "2026-10-12", toKeyExclusive: "2026-11-11" });
  });
  it("cruza el cambio de horario sin perder ni repetir días", () => {
    expect(periodKeys("2026-03-10", 7)).toEqual({ fromKey: "2026-03-04", toKeyExclusive: "2026-03-11" });
  });
  it("solo 7 o 30; cualquier otra cosa vale 7", () => {
    expect([parsePeriod("30"), parsePeriod("7"), parsePeriod(undefined), parsePeriod("999"), parsePeriod("abc")]).toEqual([30, 7, 7, 7, 7]);
  });
});

describe("cambio frente al periodo anterior", () => {
  it("porcentaje con un decimal y dirección", () => {
    expect(delta(2682, 2410)).toEqual({ value: 11.3, dir: "up" });
    expect(delta(36.2, 36.5)).toEqual({ value: -0.8, dir: "down" });
    expect(delta(100, 100)).toEqual({ value: 0, dir: "flat" });
    expect(delta(1004, 1000).dir).toBe("flat"); // +0,4 % es ruido
  });
  it("sin periodo anterior no se inventa un porcentaje", () => {
    expect(delta(500, 0)).toEqual({ value: null, dir: "flat" });
    expect(delta(0, 0)).toEqual({ value: null, dir: "flat" });
  });
  it("la ocupación se compara en puntos, también con anterior 0", () => {
    expect(delta(68, 61, "pts")).toEqual({ value: 7, dir: "up" });
    expect(delta(50, 0, "pts")).toEqual({ value: 50, dir: "up" });
    expect(delta(40, 45, "pts")).toEqual({ value: -5, dir: "down" });
  });
});

describe("horas pico", () => {
  const heat = [
    { dow: 6, hour: 10, count: 5 },
    { dow: 6, hour: 11, count: 8 },
    { dow: 2, hour: 11, count: 3 },
    { dow: 0, hour: 12, count: 1 },
  ];
  it("lunes primero, domingo al final, y suma por celda", () => {
    const g = heatGrid(heat);
    expect(g.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    const row11 = g.rows[g.hours.indexOf(11)];
    expect(row11).toEqual([0, 3, 0, 0, 0, 8, 0]); // mar = 3, sáb = 8
    expect(g.rows[g.hours.indexOf(12)][6]).toBe(1); // el domingo es la última columna
    expect(g.max).toBe(8);
    expect(g.best).toEqual({ dow: 6, hour: 11, count: 8 });
  });
  it("amplía el rango si hay citas fuera de 9 a 17 y no cambia de forma si no las hay", () => {
    expect(heatGrid([{ dow: 1, hour: 7, count: 2 }, { dow: 1, hour: 20, count: 1 }]).hours).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(heatGrid([]).hours).toHaveLength(9);
    expect(heatGrid([])).toMatchObject({ max: 0, best: null });
  });
  it("escalones de color", () => {
    expect([0, 1, 2, 4, 5, 8].map((n) => heatStep(n, 8))).toEqual([1, 1, 2, 3, 4, 5]);
    expect(heatStep(3, 0)).toBe(1);
  });
});

describe("porcentajes", () => {
  it("reparte sin dividir entre cero", () => {
    expect(share(17, 61)).toBe(28);
    expect(share(0, 0)).toBe(0);
  });
});
