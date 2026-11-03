import type { Channel, Provider, ProviderSet, RenderedMessage } from "./types";

/**
 * Proveedores intercambiables. Sin SDKs: llamadas HTTP directas.
 *   NOTIFICATIONS_PROVIDER=console → todo se imprime en el log (desarrollo).
 *   NOTIFICATIONS_PROVIDER=live    → Resend (correo) y Twilio (SMS / WhatsApp) si sus claves existen.
 */

export function consoleProvider(channel: Channel, log: (s: string) => void = console.log): Provider {
  return {
    name: "console",
    channel,
    async send(to, m) {
      log(`[breeze:${channel}] → ${to}\n${m.subject}\n${m.text}`);
      return { id: `console-${Date.now()}` };
    },
  };
}

export function resendProvider(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Provider {
  return {
    name: "resend",
    channel: "email",
    async send(to, m: RenderedMessage) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: m.subject, text: m.text, html: m.html }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { id: ((await res.json()) as { id: string }).id };
    },
  };
}

/** Twilio Messages API. WhatsApp usa el prefijo "whatsapp:" en origen y destino. */
export function twilioProvider(
  channel: "sms" | "whatsapp",
  accountSid: string,
  authToken: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): Provider {
  const wa = (n: string) => (channel === "whatsapp" && !n.startsWith("whatsapp:") ? `whatsapp:${n}` : n);
  return {
    name: "twilio",
    channel,
    async send(to, m) {
      const body = new URLSearchParams({ From: wa(from), To: wa(to), Body: m.text });
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) throw new Error(`twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { id: ((await res.json()) as { sid: string }).sid };
    },
  };
}

/** Construye los proveedores disponibles a partir de las variables de entorno. */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): ProviderSet {
  if ((env.NOTIFICATIONS_PROVIDER ?? "console") === "console") {
    return { whatsapp: consoleProvider("whatsapp"), sms: consoleProvider("sms"), email: consoleProvider("email") };
  }
  const set: ProviderSet = {};
  if (env.RESEND_API_KEY && env.EMAIL_FROM) set.email = resendProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    if (env.TWILIO_SMS_FROM) set.sms = twilioProvider("sms", env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_SMS_FROM);
    if (env.TWILIO_WHATSAPP_FROM) set.whatsapp = twilioProvider("whatsapp", env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_WHATSAPP_FROM);
  }
  return set;
}
