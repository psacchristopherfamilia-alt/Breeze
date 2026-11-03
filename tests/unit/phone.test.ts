import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone (idéntica a private.normalize_phone en la BD)", () => {
  it.each([
    ["+1 (649) 555-1234", "+16495551234"],
    ["1-649-555-1234", "+16495551234"],
    ["649 555 1234", "+16495551234"],
    ["555-1234", "+16495551234"],
    ["+44 20 7946 0958", "+442079460958"],
    ["12", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
