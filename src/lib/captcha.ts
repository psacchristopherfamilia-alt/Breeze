/**
 * Captcha de Cloudflare Turnstile para reservas de INVITADO (anti-bots).
 * Sin las claves (NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY) queda desactivado y no estorba.
 * Solo servidor: el secreto nunca va al navegador.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const captchaEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

/** true = pasa (o el captcha está desactivado). Falla cerrado: sin token, o si Cloudflare no responde, no se reserva. */
export async function verifyCaptcha(token: string | undefined | null, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/** Primera IP del encabezado x-forwarded-for (detrás del proxy de Vercel). */
export function clientIp(forwardedFor: string | null | undefined): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first && /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : null;
}
