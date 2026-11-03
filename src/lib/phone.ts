/**
 * Teléfono a formato internacional E.164 ("+16495551234").
 * Misma regla que private.normalize_phone() en la base de datos (Turks and Caicos = +1 649).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  let e164: string;
  if (raw.startsWith("+")) e164 = `+${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 7) e164 = `+1649${digits}`;
  else e164 = `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}
