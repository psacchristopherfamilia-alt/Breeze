/**
 * Integración: el worker de TypeScript contra las funciones reales de Postgres.
 * Reserva → claim_notification_jobs → plantilla → proveedor (falso) → complete_notification_job.
 */
import { afterAll, describe, expect, it } from "vitest";
import { consoleProvider } from "../../src/lib/notifications/providers";
import type { JobPayload } from "../../src/lib/notifications/types";
import { runNotificationBatch } from "../../src/lib/notifications/worker";
import { addDaysKey, atLocal, localDateKey, weekdayOf } from "../../src/lib/time";
import { ID, anon, as, makePool, serviceRole } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

describe("worker de recordatorios contra Postgres", () => {
  it("envía la confirmación del invitado con su enlace y la marca como enviada", async () => {
    let day = addDaysKey(localDateKey(new Date()), 3);
    while (weekdayOf(day) !== 4) day = addDaysKey(day, 1);
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        `insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at) values ($1, 'studio', 'trialing', now() + interval '10 days')
         on conflict (organization_id) do update set status = 'trialing', trial_ends_at = excluded.trial_ends_at`,
        [ID.orgA],
      );
      await c.query("insert into public.working_hours (professional_id, weekday, start_time, end_time) values ($1, 4, '09:00', '18:00')", [ID.andre]);
      await c.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
      await c.query("set local role anon");
      const r = (
        await c.query("select public.book_appointment($1, $2::jsonb, $3, $4::jsonb) as r", [
          ID.salonA1,
          JSON.stringify([{ service_id: ID.cutA1, professional_id: ID.andre }]),
          atLocal(day, "11:00").toISOString(),
          JSON.stringify({ first_name: "Lucía", last_name: "Fernández", phone: "649 555 7777", locale: "es", whatsapp_opt_in: true }),
        ])
      ).rows[0].r;
      await c.query("select public.attach_guest_link($1)", [r.guest_token]);
      await c.query("reset role");
      await c.query("commit");

      const sent: string[] = [];
      const summary = await as(pool, serviceRole, (sc) =>
        runNotificationBatch({
          appUrl: "https://breeze.tc",
          providers: { whatsapp: consoleProvider("whatsapp", (s) => sent.push(s)) },
          claim: async (limit) => (await sc.query("select public.claim_notification_jobs($1) as j", [limit])).rows.map((x) => x.j as JobPayload),
          complete: async (id, res) => {
            await sc.query("select public.complete_notification_job($1, $2, $3, $4, $5, $6)", [id, res.ok, res.channel ?? null, res.provider ?? null, res.providerMessageId ?? null, res.error ?? null]);
          },
        }).then(async (s) => {
          const row = (await sc.query("select status, channel, provider, link_token from public.notification_jobs where booking_group_id = $1 and kind = 'confirmation'", [r.booking_group_id])).rows[0];
          return { s, row };
        }),
      );

      expect(summary.s.sent).toBeGreaterThanOrEqual(1);
      expect(summary.row).toEqual({ status: "sent", channel: "whatsapp", provider: "console", link_token: null });
      const msg = sent.find((m) => m.includes("Lucía"))!;
      expect(msg).toContain("→ +16495557777");
      expect(msg).toContain("¡Hola Lucía! Tu cita en Coral Barber está confirmada:");
      expect(msg).toContain(`https://breeze.tc/b/${r.guest_token}`);
      expect(msg).toContain("Corte clásico con Andre W.");
      expect(msg.trim().endsWith("— Breeze")).toBe(true);
    } finally {
      // Limpieza de lo confirmado
      await pool.query(`delete from public.booking_groups where customer_id in (select id from public.customers where phone = '+16495557777')`);
      await pool.query(`delete from public.customers where phone = '+16495557777'`);
      await pool.query(`delete from public.working_hours where professional_id = $1 and weekday = 4`, [ID.andre]);
      await pool.query(`delete from public.subscriptions where organization_id = $1`, [ID.orgA]);
      c.release();
    }
  });
});
