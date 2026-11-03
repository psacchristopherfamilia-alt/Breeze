import { renderMessage } from "./templates";
import type { Channel, JobPayload, ProviderSet } from "./types";

/**
 * Orden de canales para un mensaje: el preferido primero; luego WhatsApp → SMS → correo.
 * WhatsApp solo si el cliente lo aceptó. Solo canales con proveedor configurado y destino.
 */
export function channelOrder(job: JobPayload, providers: ProviderSet): { channel: Channel; to: string }[] {
  const c = job.customer;
  const dest: Record<Channel, string | null> = {
    whatsapp: c.whatsapp_opt_in ? c.phone : null,
    sms: c.phone,
    email: c.email,
  };
  const order: Channel[] = [job.channel, "whatsapp", "sms", "email"];
  const seen = new Set<Channel>();
  const out: { channel: Channel; to: string }[] = [];
  for (const ch of order) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    const to = dest[ch];
    if (to && providers[ch]) out.push({ channel: ch, to });
  }
  return out;
}

export interface WorkerDeps {
  claim(limit: number): Promise<JobPayload[]>;
  complete(
    jobId: string,
    r: { ok: boolean; channel?: Channel; provider?: string; providerMessageId?: string; error?: string },
  ): Promise<void>;
  providers: ProviderSet;
  appUrl: string;
}

/** Procesa un lote: reclama, redacta, envía (con caída al siguiente canal) y cierra cada trabajo. */
export async function runNotificationBatch(deps: WorkerDeps, limit = 25) {
  const jobs = await deps.claim(limit);
  const summary = { claimed: jobs.length, sent: 0, failed: 0 };
  for (const job of jobs) {
    const message = renderMessage(job, deps.appUrl);
    const routes = channelOrder(job, deps.providers);
    const errors: string[] = [];
    let done = false;
    for (const { channel, to } of routes) {
      const provider = deps.providers[channel]!;
      try {
        const { id } = await provider.send(to, message);
        await deps.complete(job.job_id, { ok: true, channel, provider: provider.name, providerMessageId: id });
        summary.sent++;
        done = true;
        break;
      } catch (e) {
        errors.push(`${channel}: ${(e as Error).message}`);
      }
    }
    if (!done) {
      await deps.complete(job.job_id, { ok: false, error: errors.join(" | ") || "no_channel_available" });
      summary.failed++;
    }
  }
  return summary;
}
