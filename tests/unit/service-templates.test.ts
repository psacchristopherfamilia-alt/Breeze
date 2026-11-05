import { describe, expect, it } from "vitest";
import { SERVICE_TEMPLATES, templatesFor } from "@/lib/panel/service-templates";

describe("plantillas de servicios", () => {
  it("cada plantilla es válida para la base de datos (duración, prep y nombres)", () => {
    const keys = new Set<string>();
    for (const x of SERVICE_TEMPLATES) {
      expect(x.durationMin).toBeGreaterThanOrEqual(5);
      expect(x.durationMin).toBeLessThanOrEqual(480);
      expect(x.bufferMin).toBeGreaterThanOrEqual(0);
      expect(x.bufferMin).toBeLessThanOrEqual(120);
      expect(x.nameEn.length).toBeGreaterThanOrEqual(2);
      expect(x.nameEs.length).toBeGreaterThanOrEqual(2);
      expect(x.priceCents).toBeGreaterThan(0);
      expect(keys.has(x.key)).toBe(false);
      keys.add(x.key);
    }
  });

  it("hay plantillas para los tres tipos de negocio", () => {
    for (const type of ["barbershop", "salon", "spa"] as const) {
      expect(templatesFor([type]).length).toBeGreaterThan(5);
    }
  });

  it("solo ofrece las del tipo del negocio y no repite las que ya existen", () => {
    const barber = templatesFor(["barbershop"]);
    expect(barber.every((x) => x.type === "barbershop")).toBe(true);
    const sin = templatesFor(["barbershop"], [{ nameEn: "haircut", nameEs: "otro" }]);
    expect(sin.some((x) => x.nameEn === "Haircut")).toBe(false);
    expect(sin.length).toBe(barber.length - 1);
  });
});
