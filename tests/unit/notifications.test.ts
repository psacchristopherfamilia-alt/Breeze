import { describe, expect, it, vi } from "vitest";
import { consoleProvider, providersFromEnv, resendProvider, twilioProvider } from "@/lib/notifications/providers";
import { SIGNATURE, renderMessage } from "@/lib/notifications/templates";
import type { JobPayload, Provider } from "@/lib/notifications/types";
import { channelOrder, runNotificationBatch } from "@/lib/notifications/worker";

const job = (over: Partial<JobPayload> = {}): JobPayload => ({
  job_id: "j1",
  kind: "confirmation",
  channel: "whatsapp",
  locale: "es",
  attempts: 1,
  link_token: "a".repeat(64),
  customer: { first_name: "Ashley", phone: "+16495550001", email: "ashley@example.com", whatsapp_opt_in: true },
  salon: { name: "Coral Barber", slug: "coral-barber", phone: "+16490000101", address: "Grace Bay Rd", cancellation_window_hours: 24 },
  items: [
    { service_name_en: "Classic cut", service_name_es: "Corte clásico", starts_at: "2026-11-11T15:00:00Z", ends_at: "2026-11-11T15:30:00Z", professional: "Carlos M." },
  ],
  ...over,
});

describe("plantillas", () => {
  it("confirmación en español: hora de TCI, enlace privado, política y firma Breeze", () => {
    const m = renderMessage(job(), "https://breeze.tc/");
    expect(m.subject).toBe("Tu cita está confirmada · Coral Barber");
    expect(m.text).toContain("¡Hola Ashley! Tu cita en Coral Barber está confirmada:");
    expect(m.text).toContain("el miércoles 11 de nov. a las 10:00 AM"); // 15:00 UTC = 10:00 en TCI (EST)
    expect(m.text).toContain("• 10:00 AM Corte clásico con Carlos M.");
    expect(m.text).toContain("Gestiona tu cita: https://breeze.tc/b/" + "a".repeat(64));
    expect(m.text).toContain("Cancelación gratis hasta 24 h antes.");
    expect(m.text.trim().endsWith(SIGNATURE)).toBe(true);
  });

  it("recordatorio en inglés sin enlace → ofrece llamar al salón", () => {
    const m = renderMessage(job({ kind: "reminder", locale: "en", link_token: null }), "https://breeze.tc");
    expect(m.subject).toBe("Appointment reminder · Coral Barber");
    expect(m.text).toContain("Wed, Nov 11 at 10:00 AM");
    expect(m.text).toContain("Need to change it? Call +16490000101.");
    expect(m.text).not.toContain("/b/");
    expect(m.text).toContain("— Breeze");
  });

  it("cancelación: invita a reservar de nuevo y no incluye el enlace privado", () => {
    const m = renderMessage(job({ kind: "cancellation" }), "https://breeze.tc");
    expect(m.text).toContain("Reserva de nuevo: https://breeze.tc/s/coral-barber");
    expect(m.text).not.toContain("/b/");
  });

  it("el HTML escapa el contenido y enlaza las URLs", () => {
    const m = renderMessage(job({ customer: { ...job().customer, first_name: "<script>" } }), "https://breeze.tc");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain('<a href="https://breeze.tc/b/');
  });

  it("varios servicios: una línea por servicio", () => {
    const items = [...job().items, { service_name_en: "Beard", service_name_es: "Barba", starts_at: "2026-11-11T15:40:00Z", ends_at: "2026-11-11T16:00:00Z", professional: "Carlos M." }];
    expect(renderMessage(job({ items }), "https://x").text).toContain("• 10:40 AM Barba con Carlos M.");
  });
});

describe("orden de canales", () => {
  const all = { whatsapp: consoleProvider("whatsapp", () => {}), sms: consoleProvider("sms", () => {}), email: consoleProvider("email", () => {}) };

  it("WhatsApp → SMS → correo cuando el cliente aceptó WhatsApp", () => {
    expect(channelOrder(job(), all).map((r) => r.channel)).toEqual(["whatsapp", "sms", "email"]);
  });

  it("sin consentimiento de WhatsApp nunca se usa WhatsApp", () => {
    const j = job({ channel: "email", customer: { ...job().customer, whatsapp_opt_in: false } });
    expect(channelOrder(j, all).map((r) => r.channel)).toEqual(["email", "sms"]);
  });

  it("solo canales con proveedor configurado y con destino", () => {
    const j = job({ customer: { ...job().customer, email: null } });
    expect(channelOrder(j, { email: all.email, sms: all.sms }).map((r) => r.channel)).toEqual(["sms"]);
  });
});

describe("worker", () => {
  const failing = (channel: "whatsapp" | "sms" | "email"): Provider => ({ name: "x", channel, send: async () => { throw new Error("down"); } });
  const ok = (channel: "whatsapp" | "sms" | "email", id = "OK1"): Provider => ({ name: "twilio", channel, send: vi.fn(async () => ({ id })) });

  it("si WhatsApp falla, cae a SMS y marca el trabajo como enviado por SMS", async () => {
    const complete = vi.fn(async () => {});
    const sms = ok("sms", "SM1");
    const r = await runNotificationBatch({ claim: async () => [job()], complete, providers: { whatsapp: failing("whatsapp"), sms }, appUrl: "https://x" });
    expect(r).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(complete).toHaveBeenCalledWith("j1", { ok: true, channel: "sms", provider: "twilio", providerMessageId: "SM1" });
    expect((sms.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("+16495550001");
  });

  it("si todo falla, lo deja para reintentar con el detalle del error", async () => {
    const complete = vi.fn(async () => {});
    const r = await runNotificationBatch({ claim: async () => [job()], complete, providers: { whatsapp: failing("whatsapp"), email: failing("email") }, appUrl: "https://x" });
    expect(r.failed).toBe(1);
    expect(complete).toHaveBeenCalledWith("j1", { ok: false, error: "whatsapp: down | email: down" });
  });

  it("sin ningún canal posible lo indica claramente", async () => {
    const complete = vi.fn(async () => {});
    await runNotificationBatch({ claim: async () => [job()], complete, providers: {}, appUrl: "https://x" });
    expect(complete).toHaveBeenCalledWith("j1", { ok: false, error: "no_channel_available" });
  });
});

describe("proveedores (HTTP simulado)", () => {
  const msg = renderMessage(job(), "https://x");

  it("Resend recibe remitente, destinatario, asunto, texto y HTML", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const r = await resendProvider("re_key", "Breeze <hola@breeze.tc>", fetchMock as unknown as typeof fetch).send("ashley@example.com", msg);
    expect(r.id).toBe("em_1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Breeze <hola@breeze.tc>", to: ["ashley@example.com"], subject: msg.subject });
  });

  it("Twilio WhatsApp añade el prefijo whatsapp: y usa autenticación básica", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: "SM9" }), { status: 201 }));
    await twilioProvider("whatsapp", "AC1", "tok", "+16490001111", fetchMock as unknown as typeof fetch).send("+16495550001", msg);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get("From")).toBe("whatsapp:+16490001111");
    expect(body.get("To")).toBe("whatsapp:+16495550001");
    expect(body.get("Body")).toContain("— Breeze");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
  });

  it("un error HTTP del proveedor se convierte en excepción (para caer al siguiente canal)", async () => {
    const fetchMock = vi.fn(async () => new Response("bad number", { status: 400 }));
    await expect(twilioProvider("sms", "AC1", "tok", "+1", fetchMock as unknown as typeof fetch).send("+1", msg)).rejects.toThrow("twilio 400");
  });

  it("configuración: 'console' por defecto; 'live' solo activa lo que tiene claves", () => {
    expect(Object.keys(providersFromEnv({}))).toEqual(["whatsapp", "sms", "email"]);
    expect(providersFromEnv({}).email?.name).toBe("console");
    const live = providersFromEnv({ NOTIFICATIONS_PROVIDER: "live", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" });
    expect(Object.keys(live)).toEqual(["email"]);
  });
});
