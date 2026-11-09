/** Módulo 6: confirmaciones, recordatorios y avisos — se encolan solos y los envía un worker. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { addDaysKey, atLocal, localDateKey, weekdayOf } from "../../src/lib/time";
import { ID, anon, asSuperuser, attempt, attemptMsg, makePool, serviceRole, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

function nextWednesday(): string {
  let k = addDaysKey(localDateKey(new Date()), 3);
  while (weekdayOf(k) !== 3) k = addDaysKey(k, 1);
  return k;
}
const DAY = nextWednesday();
const at = (hhmm: string) => atLocal(DAY, hhmm).toISOString();

let c: pg.PoolClient;
let BEARD: string;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at) values ($1, 'studio', 'trialing', now() + interval '10 days')
     on conflict (organization_id) do update set status = 'trialing', trial_ends_at = excluded.trial_ends_at`,
    [ID.orgA],
  );
  await c.query("delete from public.working_hours where professional_id = $1", [ID.carlos]);
  await c.query("insert into public.working_hours (professional_id, weekday, start_time, end_time) select $1, d, '09:00', '18:00' from generate_series(1, 6) d", [ID.carlos]);
  BEARD = (await c.query(`insert into public.services (salon_id, category_code, name_en, name_es, duration_min, buffer_min, price_cents) values ($1, 'beard', 'Beard trim', 'Arreglo de barba', 20, 5, 1500) returning id`, [ID.salonA1])).rows[0].id;
  await c.query("insert into public.professional_services (professional_id, service_id, salon_id) values ($1, $2, $3)", [ID.carlos, BEARD, ID.salonA1]);
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const guest = { first_name: "Ashley", last_name: "Taylor", phone: "649 555 0001", email: "ashley@example.com", locale: "es", whatsapp_opt_in: true };
const bookGuest = async (items: { service_id: string; professional_id: string }[] = [{ service_id: ID.cutA1, professional_id: ID.carlos }], start = at("10:00")) => {
  await switchTo(c, anon);
  const r = (await c.query("select public.book_appointment($1, $2::jsonb, $3, $4::jsonb) as r", [ID.salonA1, JSON.stringify(items), start, JSON.stringify(guest)])).rows[0].r;
  await asSuperuser(c);
  return r as { booking_group_id: string; guest_token: string; appointment_ids: string[] };
};
const jobs = async (group: string) =>
  (await c.query("select kind, status, channel, locale, scheduled_for from public.notification_jobs where booking_group_id = $1 order by created_at, scheduled_for", [group])).rows;

describe("encolar", () => {
  it("una reserva crea 1 confirmación + recordatorios 24 h y 2 h antes (uno por reserva, no por servicio)", async () => {
    const r = await bookGuest([{ service_id: ID.cutA1, professional_id: ID.carlos }, { service_id: BEARD, professional_id: ID.carlos }]);
    const j = await jobs(r.booking_group_id);
    expect(j.map((x) => x.kind).sort()).toEqual(["confirmation", "reminder", "reminder"]);
    const reminders = j.filter((x) => x.kind === "reminder").map((x) => x.scheduled_for.toISOString()).sort();
    expect(reminders).toEqual([new Date(Date.parse(at("10:00")) - 1440 * 60_000).toISOString(), new Date(Date.parse(at("10:00")) - 120 * 60_000).toISOString()]);
    expect(j.every((x) => x.channel === "whatsapp" && x.locale === "es")).toBe(true);
  });

  it("los recordatorios siguen la configuración del salón y no se crean en el pasado", async () => {
    await c.query("update public.salons set reminder_offsets_min = '{60}', min_lead_time_min = 0 where id = $1", [ID.salonA1]);
    const r = await bookGuest();
    expect((await jobs(r.booking_group_id)).filter((x) => x.kind === "reminder")).toHaveLength(1);
  });

  it("canal según el cliente: WhatsApp si lo aceptó; si no, correo; si no, SMS", async () => {
    await c.query("update public.salons set reminder_offsets_min = '{}' where id = $1", [ID.salonA1]);
    const noWa = { ...guest, whatsapp_opt_in: false };
    await switchTo(c, anon);
    const r1 = (await c.query("select public.book_appointment($1, $2::jsonb, $3, $4::jsonb) as r", [ID.salonA1, JSON.stringify([{ service_id: ID.cutA1, professional_id: ID.carlos }]), at("11:00"), JSON.stringify(noWa)])).rows[0].r;
    const r2 = (await c.query("select public.book_appointment($1, $2::jsonb, $3, $4::jsonb) as r", [ID.salonA1, JSON.stringify([{ service_id: ID.cutA1, professional_id: ID.carlos }]), at("12:00"), JSON.stringify({ ...noWa, phone: "649 555 0009", email: null })])).rows[0].r;
    await asSuperuser(c);
    expect((await jobs(r1.booking_group_id))[0].channel).toBe("email");
    expect((await jobs(r2.booking_group_id))[0].channel).toBe("sms");
  });

  it("cancelar anula los recordatorios y encola un aviso de cancelación", async () => {
    const r = await bookGuest();
    await switchTo(c, anon);
    await c.query("select public.cancel_by_guest_token($1)", [r.guest_token]);
    await asSuperuser(c);
    const j = await jobs(r.booking_group_id);
    expect(j.filter((x) => x.kind === "reminder").every((x) => x.status === "skipped")).toBe(true);
    expect(j.filter((x) => x.kind === "cancellation" && x.status === "pending")).toHaveLength(1);
  });

  it("reprogramar recalcula los recordatorios y avisa una sola vez (aunque haya 2 servicios)", async () => {
    const r = await bookGuest([{ service_id: ID.cutA1, professional_id: ID.carlos }, { service_id: BEARD, professional_id: ID.carlos }]);
    await switchTo(c, anon);
    await c.query("select public.reschedule_by_guest_token($1, $2)", [r.guest_token, at("14:00")]);
    await asSuperuser(c);
    const j = await jobs(r.booking_group_id);
    const pendingReminders = j.filter((x) => x.kind === "reminder" && x.status === "pending").map((x) => x.scheduled_for.toISOString()).sort();
    expect(pendingReminders).toEqual([new Date(Date.parse(at("14:00")) - 1440 * 60_000).toISOString(), new Date(Date.parse(at("14:00")) - 120 * 60_000).toISOString()]);
    expect(j.filter((x) => x.kind === "reschedule")).toHaveLength(1);
  });
});

describe("worker (service_role)", () => {
  it("reclama los vencidos con todo lo necesario para el mensaje, incluido el enlace del invitado", async () => {
    const r = await bookGuest();
    await switchTo(c, anon);
    expect((await c.query("select public.attach_guest_link($1) as n", [r.guest_token])).rows[0].n).toBe(3);
    await switchTo(c, serviceRole);
    const claimed = (await c.query("select public.claim_notification_jobs(10) as j")).rows.map((x) => x.j);
    expect(claimed).toHaveLength(1); // solo la confirmación vence ya
    const job = claimed[0];
    expect(job.kind).toBe("confirmation");
    expect(job.link_token).toBe(r.guest_token);
    expect(job.customer).toMatchObject({ first_name: "Ashley", phone: "+16495550001", whatsapp_opt_in: true });
    expect(job.salon.name).toBe("Coral Barber");
    expect(job.items[0]).toMatchObject({ service_name_es: "Corte clásico", professional: "Carlos M." });
    // Reclamado: otro worker no lo vuelve a coger
    expect((await c.query("select public.claim_notification_jobs(10) as j")).rowCount).toBe(0);

    await c.query("select public.complete_notification_job($1, true, 'whatsapp', 'twilio', 'SM123')", [job.job_id]);
    await asSuperuser(c);
    const row = (await c.query("select status, provider_message_id, link_token, sent_at is not null as sent from public.notification_jobs where id = $1", [job.job_id])).rows[0];
    expect(row).toEqual({ status: "sent", provider_message_id: "SM123", link_token: null, sent: true });
  });

  it("los fallos se reintentan con espera y al 3.º intento quedan como 'failed'", async () => {
    const r = await bookGuest();
    await switchTo(c, serviceRole);
    for (let i = 1; i <= 3; i++) {
      await asSuperuser(c);
      await c.query("update public.notification_jobs set locked_until = null where booking_group_id = $1 and kind = 'confirmation'", [r.booking_group_id]);
      await switchTo(c, serviceRole);
      const job = (await c.query("select public.claim_notification_jobs(10) as j")).rows[0].j;
      const status = (await c.query("select public.complete_notification_job($1, false, null, 'twilio', null, 'timeout') as s", [job.job_id])).rows[0].s;
      expect(status).toBe(i < 3 ? "pending" : "failed");
    }
  });

  it("un mensaje sin ningún canal posible queda 'skipped' al instante (sin reintentos ni fallo)", async () => {
    const r = await bookGuest();
    await switchTo(c, serviceRole);
    const job = (await c.query("select public.claim_notification_jobs(10) as j")).rows[0].j;
    const status = (await c.query("select public.complete_notification_job($1, false, null, null, null, 'no_channel_available') as s", [job.job_id])).rows[0].s;
    expect(status).toBe("skipped");
    await asSuperuser(c);
    const row = (await c.query("select status, error, link_token from public.notification_jobs where id = $1", [job.job_id])).rows[0];
    expect(row).toEqual({ status: "skipped", error: "no_channel_available", link_token: null });
    // y no vuelve a reclamarse
    await switchTo(c, serviceRole);
    expect((await c.query("select public.claim_notification_jobs(10) as j")).rows.every((x) => x.j.job_id !== job.job_id)).toBe(true);
    expect(r.booking_group_id).toBeTruthy();
  });

  it("no envía recordatorios de reservas canceladas", async () => {
    const r = await bookGuest();
    await c.query("update public.notification_jobs set scheduled_for = now() - interval '1 minute' where booking_group_id = $1", [r.booking_group_id]);
    await c.query("update public.appointments set status = 'cancelled', cancelled_at = now() where booking_group_id = $1", [r.booking_group_id]);
    // Simulamos un recordatorio que se quedó pendiente
    await c.query("update public.notification_jobs set status = 'pending' where booking_group_id = $1 and kind = 'reminder'", [r.booking_group_id]);
    await switchTo(c, serviceRole);
    const kinds = (await c.query("select public.claim_notification_jobs(10) as j")).rows.map((x) => x.j.kind);
    expect(kinds).toEqual(["cancellation"]);
  });

  it("solo service_role puede reclamar o cerrar trabajos", async () => {
    for (const who of [anon, user(ID.ownerA), user(ID.juanUser)]) {
      await switchTo(c, who);
      expect(await attempt(c, () => c.query("select public.claim_notification_jobs(10)"))).toBe("42501");
    }
  });
});

describe("privacidad", () => {
  it("el dueño ve el historial de mensajes de su salón pero NUNCA el enlace privado del invitado", async () => {
    const r = await bookGuest();
    await switchTo(c, anon);
    await c.query("select public.attach_guest_link($1)", [r.guest_token]);
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("select kind from public.notification_jobs where booking_group_id = $1", [r.booking_group_id])).rowCount).toBe(3);
    expect(await attempt(c, () => c.query("select link_token from public.notification_jobs"))).toBe("42501");
    await switchTo(c, user(ID.ownerB));
    expect((await c.query("select 1 from public.notification_jobs where booking_group_id = $1", [r.booking_group_id])).rowCount).toBe(0);
  });

  it("un token falso no adjunta nada", async () => {
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => c.query("select public.attach_guest_link('nope')"))).toBe("not_found");
  });
});
