import { describe, expect, it } from "vitest";
import { computeSetupStatus, type SetupInput } from "@/lib/panel/setup";

const base: SetupInput = { isPublished: false, activeServiceIds: [], activeProfessionalIds: [], links: [], professionalIdsWithHours: [] };

describe("computeSetupStatus", () => {
  it("sucursal vacía: nada hecho", () => {
    expect(computeSetupStatus(base)).toEqual({ hasService: false, hasProfessional: false, hasAssignment: false, hasHours: false, isPublished: false });
  });

  it("caso real: profesional + servicio asignado, pero sin horario → solo falta el horario", () => {
    const s = computeSetupStatus({ ...base, activeServiceIds: ["s1"], activeProfessionalIds: ["p1"], links: [{ professional_id: "p1", service_id: "s1" }] });
    expect(s).toMatchObject({ hasService: true, hasProfessional: true, hasAssignment: true, hasHours: false });
  });

  it("con horario → listo para publicar", () => {
    const s = computeSetupStatus({
      ...base, activeServiceIds: ["s1"], activeProfessionalIds: ["p1"], links: [{ professional_id: "p1", service_id: "s1" }], professionalIdsWithHours: ["p1"],
    });
    expect(s).toMatchObject({ hasAssignment: true, hasHours: true });
  });

  it("horario en un profesional y servicio en otro NO basta (como exige la BD)", () => {
    const s = computeSetupStatus({
      ...base, activeServiceIds: ["s1"], activeProfessionalIds: ["p1", "p2"], links: [{ professional_id: "p2", service_id: "s1" }], professionalIdsWithHours: ["p1"],
    });
    expect(s.hasAssignment).toBe(true);
    expect(s.hasHours).toBe(false);
  });

  it("ignora servicios inactivos y profesionales inactivos", () => {
    const s = computeSetupStatus({
      ...base, activeServiceIds: [], activeProfessionalIds: ["p1"], links: [{ professional_id: "p1", service_id: "s-inactivo" }], professionalIdsWithHours: ["p-inactivo"],
    });
    expect(s).toMatchObject({ hasService: false, hasProfessional: true, hasAssignment: false, hasHours: false });
  });

  it("sin asignaciones todavía, el horario ya cuenta para no bloquear el orden de los pasos", () => {
    expect(computeSetupStatus({ ...base, activeProfessionalIds: ["p1"], professionalIdsWithHours: ["p1"] }).hasHours).toBe(true);
  });

  it("refleja si ya está publicada", () => {
    expect(computeSetupStatus({ ...base, isPublished: true }).isPublished).toBe(true);
  });
});
