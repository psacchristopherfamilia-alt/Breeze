import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captchaEnabled, clientIp, verifyCaptcha } from "@/lib/captcha";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("captcha (Turnstile)", () => {
  it("sin clave secreta está desactivado: todo pasa y no se llama a Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(captchaEnabled()).toBe(false);
    expect(await verifyCaptcha(undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con clave: sin token o con un token enorme no pasa (ni se llama a Cloudflare)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    expect(captchaEnabled()).toBe(true);
    expect(await verifyCaptcha(undefined)).toBe(false);
    expect(await verifyCaptcha("")).toBe(false);
    expect(await verifyCaptcha("x".repeat(3000))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envía el secreto, el token y la IP; pasa solo si Cloudflare dice success:true", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    expect(await verifyCaptcha("tok", "1.2.3.4")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const sent = init.body as URLSearchParams;
    expect(sent.get("secret")).toBe("secreto");
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("remoteip")).toBe("1.2.3.4");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
    expect(await verifyCaptcha("malo")).toBe(false);
  });

  it("falla cerrado: error de red, respuesta no válida o 5xx → no pasa", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secreto");
    fetchMock.mockRejectedValueOnce(new Error("sin red"));
    expect(await verifyCaptcha("tok")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await verifyCaptcha("tok")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await verifyCaptcha("tok")).toBe(false);
  });

  it("la IP sale de la primera dirección de x-forwarded-for y se valida", () => {
    expect(clientIp("203.0.113.5, 10.0.0.1")).toBe("203.0.113.5");
    expect(clientIp("2001:db8::1")).toBe("2001:db8::1");
    expect(clientIp("no es una ip; drop table")).toBeNull();
    expect(clientIp(null)).toBeNull();
    expect(clientIp("")).toBeNull();
  });
});
