import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { z } from "zod";
import { isCronAuthorized } from "@/lib/cron-auth";
import type { AlertRow } from "@/lib/alerts";
import { sendAlertPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envía el aviso (push) de una reserva a los teléfonos de quien lo recibe.
 * Lo llama la base de datos (pg_net) justo después de crear el aviso, con:  Authorization: Bearer <CRON_SECRET>
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });

  const body = z.object({ alert_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "supabase_admin_not_configured" }, { status: 503 });
  }

  const { data: alert } = await supabase
    .from("staff_alerts")
    .select("id, user_id, kind, customer_display, service_en, service_es, pro_name, starts_at, created_at, read_at")
    .eq("id", body.data.alert_id)
    .maybeSingle();
  if (!alert) return NextResponse.json({ sent: 0, reason: "alert_not_found" });

  const [{ data: subs }, { data: profile }] = await Promise.all([
    supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", alert.user_id),
    supabase.from("profiles").select("locale").eq("id", alert.user_id).maybeSingle(),
  ]);
  if (!subs?.length) return NextResponse.json({ sent: 0, reason: "no_subscriptions" });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://breeze-wheat.vercel.app", pub, priv);
  const result = await sendAlertPush(alert as AlertRow, profile?.locale === "es" ? "es" : "en", subs, {
    send: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "high" }),
  });
  if (result.gone.length) await supabase.from("push_subscriptions").delete().in("id", result.gone);
  return NextResponse.json({ sent: result.sent, failed: result.failed, removed: result.gone.length });
}
