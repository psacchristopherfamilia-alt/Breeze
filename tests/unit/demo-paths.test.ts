import { describe, expect, it } from "vitest";
import { demoHref, isDemoPath } from "@/lib/demo/paths";

describe("isDemoPath", () => {
  it("reconoce /demo y sus rutas", () => {
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/dashboard")).toBe(true);
    expect(isDemoPath("/demonio")).toBe(false);
    expect(isDemoPath("/dashboard")).toBe(false);
    expect(isDemoPath(null)).toBe(false);
  });
});

describe("demoHref", () => {
  it("fuera de la demo no cambia nada", () => {
    expect(demoHref("/dashboard", false)).toBe("/dashboard");
  });
  it("lleva las rutas del prototipo a /demo", () => {
    expect(demoHref("/explore", true)).toBe("/demo/explore");
    expect(demoHref("/s/coral-salon?reschedule=1", true)).toBe("/demo/s/coral-salon?reschedule=1");
    expect(demoHref("/me", true)).toBe("/demo/me");
    expect(demoHref("/dashboard", true)).toBe("/demo/dashboard");
    expect(demoHref("/dashboard/professionals", true)).toBe("/demo/dashboard/professionals");
    expect(demoHref("/live/coral-salon", true)).toBe("/demo/live/coral-salon");
  });
  it("deja igual lo que no existe en la demo", () => {
    expect(demoHref("/login", true)).toBe("/login");
    expect(demoHref("/negocios", true)).toBe("/negocios");
    expect(demoHref("/dashboard/clients/1", true)).toBe("/dashboard/clients/1");
    expect(demoHref("/r/abc", true)).toBe("/r/abc");
    expect(demoHref("https://wa.me/1", true)).toBe("https://wa.me/1");
  });
  it("no duplica el prefijo", () => {
    expect(demoHref("/demo/explore", true)).toBe("/demo/explore");
  });
});
