/** Módulo 5: Breeze Live — emparejar la TV, agenda saneada y avisos en tiempo real. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, asSuperuser, attempt, attemptMsg, book, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
let tv: string; // usuario anónimo de la TV
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  tv = await createAuthUser(c, { anonymous: true });
  // Breeze Live exige un plan vigente (ver billing.test.ts para los estados del plan).
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, current_period_end)
     values ($1, 'studio', 'active', now() + interval '20 days'), ($2, 'studio', 'active', now() + interval '20 days')
     on conflict (organization_id) do update set status = 'active', current_period_end = excluded.current_period_end`,
    [ID.orgA, ID.orgB],
  );
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

async function pairTv(): Promise<string> {
  await switchTo(c, user(tv));
  const code = (await c.query("select public.request_live_pairing('coral-barber') as r")).rows[0].r.code as string;
  await switchTo(c, user(ID.ownerA));
  await c.query("select public.pair_live_device($1, $2, 'TV recepción')", [ID.salonA1, code]);
  return code;
}

describe("emparejar una pantalla", () => {
  it("la TV pide un código de 6 dígitos y queda pendiente", async () => {
    await switchTo(c, user(tv));
    expect((await c.query("select public.live_device_status('coral-barber') as s")).rows[0].s.status).toBe("none");
    const r = (await c.query("select public.request_live_pairing('coral-barber') as r")).rows[0].r;
    expect(r.code).toMatch(/^\d{6}$/);
    expect((await c.query("select public.live_device_status('coral-barber') as s")).rows[0].s.status).toBe("pending");
    // Pedir otro código reutiliza la misma pantalla
    await c.query("select public.request_live_pairing('coral-barber')");
    await asSuperuser(c);
    expect((await c.query("select count(*)::int n from public.live_devices where user_id = $1", [tv])).rows[0].n).toBe(1);
  });

  it("el dueño escribe el código → la TV pasa a 'paired' con rol display", async () => {
    await pairTv();
    await switchTo(c, user(tv));
    expect((await c.query("select public.live_device_status('coral-barber') as s")).rows[0].s.status).toBe("paired");
    expect((await c.query("select role from public.my_context()")).rows).toEqual([{ role: "display" }]);
  });

  it("un código incorrecto, caducado o de otra sucursal no sirve", async () => {
    await switchTo(c, user(tv));
    const code = (await c.query("select public.request_live_pairing('coral-barber') as r")).rows[0].r.code;
    await switchTo(c, user(ID.ownerA));
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await attemptMsg(c, () => c.query("select public.pair_live_device($1, $2)", [ID.salonA1, wrong]))).toBe("invalid_code");
    expect(await attemptMsg(c, () => c.query("select public.pair_live_device($1, $2)", [ID.salonA2, code]))).toBe("invalid_code");
    await asSuperuser(c);
    await c.query("update public.live_devices set pairing_expires_at = now() - interval '1 second' where user_id = $1", [tv]);
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.pair_live_device($1, $2)", [ID.salonA1, code]))).toBe("invalid_code");
  });

  it("solo dueño/admin de ESA sucursal pueden emparejar", async () => {
    await switchTo(c, user(tv));
    const code = (await c.query("select public.request_live_pairing('coral-barber') as r")).rows[0].r.code;
    for (const who of [ID.carlosUser, ID.ownerB, ID.adminA2, ID.juanUser]) {
      await switchTo(c, user(who));
      expect(await attemptMsg(c, () => c.query("select public.pair_live_device($1, $2)", [ID.salonA1, code]))).toBe("forbidden");
    }
  });

  it("como mucho 5 pantallas esperando código por sucursal (antiabuso)", async () => {
    for (let i = 0; i < 5; i++) {
      await asSuperuser(c);
      const other = await createAuthUser(c, { anonymous: true });
      await switchTo(c, user(other));
      await c.query("select public.request_live_pairing('coral-barber')");
    }
    await switchTo(c, user(tv));
    expect(await attemptMsg(c, () => c.query("select public.request_live_pairing('coral-barber')"))).toBe("too_many_pending");
  });

  it("al desvincularla deja de ver la agenda al instante", async () => {
    await pairTv();
    await asSuperuser(c);
    const dev = (await c.query("select id from public.live_devices where user_id = $1", [tv])).rows[0].id;
    await switchTo(c, user(ID.ownerA));
    await c.query("select public.revoke_live_device($1)", [dev]);
    await switchTo(c, user(tv));
    expect(await attemptMsg(c, () => c.query("select public.get_live_board($1)", [ID.salonA1]))).toBe("forbidden");
  });
});

describe("agenda de la pantalla", () => {
  it("muestra solo 'Nombre I.', servicio y hora — nunca teléfono, correo ni apellido", async () => {
    await asSuperuser(c);
    const today = (await c.query("select (now() at time zone 'America/Grand_Turk')::date as d")).rows[0].d as Date;
    const day = today.toISOString().slice(0, 10);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: `${day}T23:00:00-05:00`, minutes: 30, buffer: 0 });
    await pairTv();
    await switchTo(c, user(tv));
    const b = (await c.query("select public.get_live_board($1, $2::date) as b", [ID.salonA1, day])).rows[0].b;
    expect(b.salon.name).toBe("Coral Barber");
    expect(b.professionals.map((p: { public_name: string }) => p.public_name).sort()).toEqual(["Andre W.", "Carlos M."]);
    expect(b.appointments).toHaveLength(1);
    expect(b.appointments[0].customer_display).toBe("Juan P.");
    const json = JSON.stringify(b);
    expect(json).not.toMatch(/Pérez|Martínez|Williams|\+1649|example\.com|phone|email/);
  });

  it("la TV sigue sin poder leer citas ni clientes directamente", async () => {
    await pairTv();
    await switchTo(c, user(tv));
    expect((await c.query("select 1 from public.appointments")).rowCount).toBe(0);
    expect((await c.query("select 1 from public.customers")).rowCount).toBe(0);
  });

  it("una pantalla sin emparejar o de otra sucursal no recibe nada", async () => {
    await switchTo(c, user(tv));
    expect(await attemptMsg(c, () => c.query("select public.get_live_board($1)", [ID.salonA1]))).toBe("forbidden");
    await pairTv();
    await switchTo(c, user(tv));
    expect(await attemptMsg(c, () => c.query("select public.get_live_board($1)", [ID.salonB1]))).toBe("forbidden");
  });

  it("el personal con sesión normal ve Live sin emparejar ('staff')", async () => {
    await switchTo(c, user(ID.carlosUser));
    expect((await c.query("select public.live_device_status('coral-barber') as s")).rows[0].s.status).toBe("staff");
    expect(await attemptMsg(c, () => c.query("select public.get_live_board($1)", [ID.salonA1]))).toBeNull();
  });
});

describe("tiempo real", () => {
  it("cada cita nueva se emite al canal privado live:<salon> con datos saneados", async () => {
    await asSuperuser(c);
    await c.query("delete from realtime.test_sent");
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-04-06T10:00:00-04:00" });
    const sent = (await c.query("select payload, event, topic, private from realtime.test_sent where topic like 'live:%'")).rows;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ event: "appointment", topic: `live:${ID.salonA1}`, private: true });
    expect(sent[0].payload.type).toBe("booked");
    expect(sent[0].payload.appointment.customer_display).toBe("Juan P.");
    expect(JSON.stringify(sent[0].payload)).not.toMatch(/Pérez|\+1649|phone|email|customer_id|price/);
  });

  it("cancelar y reprogramar también se emiten", async () => {
    await asSuperuser(c);
    const id = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-04-06T10:00:00-04:00" });
    await c.query("delete from realtime.test_sent");
    await c.query("update public.appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour', blocked_until = blocked_until + interval '1 hour' where id = $1", [id]);
    await c.query("update public.appointments set status = 'cancelled', cancelled_at = now() where id = $1", [id]);
    const types = (await c.query("select payload->>'type' t from realtime.test_sent where topic like 'live:%' order by id")).rows.map((r) => r.t);
    expect(types).toEqual(["rescheduled", "cancelled"]);
  });

  it("el canal de una sucursal solo lo autoriza esa sucursal (live_topic_salon)", async () => {
    const r = await c.query("select private.live_topic_salon($1) a, private.live_topic_salon('live:nope') b, private.live_topic_salon('other:x') d", [`live:${ID.salonA1}`]);
    expect(r.rows[0]).toEqual({ a: ID.salonA1, b: null, d: null });
  });
});

describe("las sesiones anónimas (TV) no pueden hacer nada más", () => {
  it("no pueden crear negocios, aceptar invitaciones ni reservar como cliente", async () => {
    await switchTo(c, user(tv));
    expect(await attemptMsg(c, () => c.query(`select public.create_organization('Hack', 'Hack', '{spa}', 'leeward')`))).toBe("anonymous_not_allowed");
    await asSuperuser(c);
    await c.query(
      `insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at) values ($1, 'studio', 'trialing', now() + interval '5 days') on conflict do nothing`,
      [ID.orgA],
    );
    await c.query("insert into public.working_hours (professional_id, weekday, start_time, end_time) select $1, d, '09:00', '18:00' from generate_series(0,6) d", [ID.andre]);
    await switchTo(c, user(tv));
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCHours(15, 0, 0, 0);
    expect(
      await attemptMsg(c, () =>
        c.query("select public.book_appointment($1, $2::jsonb, $3, $4::jsonb)", [
          ID.salonA1, JSON.stringify([{ service_id: ID.cutA1, professional_id: ID.andre }]), start.toISOString(),
          JSON.stringify({ first_name: "TV", phone: "6495550000" }),
        ]),
      ),
    ).toBe("anonymous_not_allowed");
    expect(await attempt(c, () => c.query("insert into public.organizations (name, slug, owner_id) values ('X', 'x-tv', $1)", [tv]))).toBe("42501");
  });
});
