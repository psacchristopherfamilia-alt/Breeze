import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/redirect";

describe("safeNext (sin redirecciones abiertas)", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/invite/abc?x=1", "/invite/abc?x=1"],
    ["//evil.com", null],
    ["/\\evil.com", null],
    ["https://evil.com", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => expect(safeNext(input)).toBe(expected));
});
