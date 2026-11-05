import { alertText, type AlertRow } from "./alerts";

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDeps {
  /** Envía un push. Debe lanzar un error con `statusCode` si el servicio de push lo rechaza. */
  send(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<unknown>;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Suscripciones que ya no existen (404/410): hay que borrarlas. */
  gone: string[];
}

/** Lo que se muestra en el teléfono. `url` abre la agenda del día de la cita. */
export function pushPayload(alert: AlertRow, locale: "en" | "es") {
  const t = alertText(alert, locale);
  return { title: t.title, body: t.body, url: `/dashboard?date=${t.dateKey}`, tag: alert.id };
}

/** Envía un aviso a todos los teléfonos de una persona; un fallo en uno no afecta a los demás. */
export async function sendAlertPush(alert: AlertRow, locale: "en" | "es", subs: PushSub[], deps: PushDeps): Promise<PushResult> {
  const payload = JSON.stringify(pushPayload(alert, locale));
  const result: PushResult = { sent: 0, failed: 0, gone: [] };
  await Promise.all(
    subs.map(async (s) => {
      try {
        await deps.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        result.sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) result.gone.push(s.id);
        else result.failed += 1;
      }
    }),
  );
  return result;
}
