import { describe, expect, it } from "vitest";
import { fieldErrors, formToObject, salonSignUpSchema, signUpSchema } from "@/lib/validation/auth";

const base = { fullName: "Lucía Fernández", email: " Lucia@Example.com ", phone: "649 555 1234", password: "secreta123", locale: "es" };

describe("registro de cliente", () => {
  it("normaliza correo y teléfono", () => {
    const r = signUpSchema.parse(base);
    expect(r.email).toBe("lucia@example.com");
    expect(r.phone).toBe("+16495551234");
  });

  it("devuelve claves de error traducibles por campo", () => {
    const r = signUpSchema.safeParse({ ...base, email: "x", phone: "12", password: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ email: "invalidEmail", phone: "invalidPhone", password: "passwordTooShort" });
  });

  it("un idioma desconocido cae a inglés", () => {
    expect(signUpSchema.parse({ ...base, locale: "fr" }).locale).toBe("en");
  });
});

describe("alta de salón", () => {
  it("exige al menos un tipo de negocio y una zona válida", () => {
    const fd = new FormData();
    Object.entries({ ...base, orgName: "Coral", salonName: "Coral Nails", zone: "atlantis" }).forEach(([k, v]) => fd.append(k, v));
    const r = salonSignUpSchema.safeParse(formToObject(fd, ["businessTypes"]));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toMatchObject({ businessTypes: "pickBusinessType", zone: "pickZone" });
  });

  it("acepta varios tipos de negocio (barbería + salón)", () => {
    const fd = new FormData();
    Object.entries({ ...base, orgName: "Tradewinds", salonName: "Tradewinds Five Cays", zone: "five_cays" }).forEach(([k, v]) => fd.append(k, v));
    fd.append("businessTypes", "barbershop");
    fd.append("businessTypes", "salon");
    const r = salonSignUpSchema.parse(formToObject(fd, ["businessTypes"]));
    expect(r.businessTypes).toEqual(["barbershop", "salon"]);
    expect(r.salonPhone).toBeUndefined();
  });
});
