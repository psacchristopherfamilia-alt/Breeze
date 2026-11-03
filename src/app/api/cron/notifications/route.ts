import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { providersFromEnv } from "@/lib/notifications/providers";
import type { JobPayload } from "@/lib/notifications/types";
import { runNotificationBatch } from "@/lib/notifications/worker";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Worker de confirmaciones y recordatorios. Lo llama pg_cron (vía pg_net) o el cron del hosting
 * cada 5 minutos con:  Authorization: Bearer <CRON_SECRET>
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "supabase_admin_not_configured" }, { status: 503 });
  }
  const summary = await runNotificationBatch({
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin,
    providers: providersFromEnv(),
    async claim(limit) {
      const { data, error } = await supabase.rpc("claim_notification_jobs", { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as unknown as JobPayload[];
    },
    async complete(jobId, r) {
      const { error } = await supabase.rpc("complete_notification_job", {
        p_job_id: jobId,
        p_ok: r.ok,
        p_channel: r.channel,
        p_provider: r.provider,
        p_provider_message_id: r.providerMessageId,
        p_error: r.error,
      });
      if (error) throw error;
    },
  });
  return NextResponse.json(summary);
}

export const GET = handle; // Vercel Cron usa GET
export const POST = handle; // pg_net / otros usan POST
