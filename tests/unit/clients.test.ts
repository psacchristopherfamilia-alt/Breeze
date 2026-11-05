import { describe, expect, it } from "vitest";
import { initialsOf, prettyPhone, relativeAge } from "@/lib/panel/clients";

const now = new Date("2026-11-05T15:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("clientes", () => {
  it("dice hace cuánto fue la última visita en la unidad que mejor se lee", () => {
    expect(relativeAge(ago(0), now)).toEqual({ unit: "today", n: 0 });
    expect(relativeAge(ago(1), now)).toEqual({ unit: "yesterday", n: 1 });
    expect(relativeAge(ago(5), now)).toEqual({ unit: "days", n: 5 });
    expect(relativeAge(ago(21), now)).toEqual({ unit: "weeks", n: 3 });
    expect(relativeAge(ago(95), now)).toEqual({ unit: "months", n: 3 });
    expect(relativeAge(ago(800), now)).toEqual({ unit: "years", n: 2 });
    // Una fecha futura no es "hace" nada: cuenta como hoy.
    expect(relativeAge(new Date(now.getTime() + 86_400_000), now)).toEqual({ unit: "today", n: 0 });
  });

  it("da formato a los teléfonos de Turks and Caicos y respeta los demás", () => {
    expect(prettyPhone("+16492314455")).toBe("+1 649 231 4455");
    expect(prettyPhone("+447911123456")).toBe("+447911123456");
    expect(prettyPhone(null)).toBe("");
  });

  it("saca las iniciales aunque falte el apellido", () => {
    expect(initialsOf("ashley", "taylor")).toBe("AT");
    expect(initialsOf("Cher", "")).toBe("C");
    expect(initialsOf("", "")).toBe("?");
  });
});
