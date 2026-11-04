import { describe, expect, it } from "vitest";
import { MAX_DEVICE_TOKENS, addToken, parseTokens, removeTokens } from "@/lib/booking/device";

const tok = (n: number) => n.toString(16).padStart(64, "0");

describe("citas de invitado en este dispositivo", () => {
  it("lee una lista válida y descarta lo que no es un token", () => {
    expect(parseTokens(JSON.stringify([tok(1), "falso", 42, null, tok(255).toUpperCase(), tok(3)]))).toEqual([tok(1), tok(3)]);
  });

  it("datos vacíos, rotos o de otro tipo → lista vacía (nunca lanza)", () => {
    for (const raw of [null, undefined, "", "no es json", "{}", '"texto"', "123"]) expect(parseTokens(raw)).toEqual([]);
  });

  it("quita repetidos y respeta el máximo", () => {
    expect(parseTokens(JSON.stringify([tok(1), tok(1), tok(2)]))).toEqual([tok(1), tok(2)]);
    const many = Array.from({ length: 50 }, (_, i) => tok(i + 1));
    expect(parseTokens(JSON.stringify(many))).toHaveLength(MAX_DEVICE_TOKENS);
  });

  it("añadir pone el nuevo primero, sin repetirlo", () => {
    expect(addToken([tok(1), tok(2)], tok(3))).toEqual([tok(3), tok(1), tok(2)]);
    expect(addToken([tok(1), tok(2)], tok(2))).toEqual([tok(2), tok(1)]);
  });

  it("un token inválido no se guarda", () => {
    expect(addToken([tok(1)], "abc")).toEqual([tok(1)]);
    expect(addToken([tok(1)], `${tok(2)}x`)).toEqual([tok(1)]);
  });

  it("al pasar el máximo se pierde el más antiguo", () => {
    const full = Array.from({ length: MAX_DEVICE_TOKENS }, (_, i) => tok(i + 1));
    const next = addToken(full, tok(99));
    expect(next).toHaveLength(MAX_DEVICE_TOKENS);
    expect(next[0]).toBe(tok(99));
    expect(next).not.toContain(tok(MAX_DEVICE_TOKENS));
  });

  it("olvidar quita solo los indicados", () => {
    expect(removeTokens([tok(1), tok(2), tok(3)], [tok(2), tok(9)])).toEqual([tok(1), tok(3)]);
  });
});
