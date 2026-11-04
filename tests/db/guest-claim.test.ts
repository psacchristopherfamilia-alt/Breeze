/**
 * Pasar las citas de invitado (token guardado en el navegador) a una cuenta de cliente.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { addDaysKey, atLocal, localDateKey, weekdayOf } from "../../src/lib/time";
import { ID, anon, asSuperuser, attemptMsg, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

function nextWednesday(): string {
  let k = addDaysKey(localDateKey(new Date()), 2);
  while (weekdayOf(k) !== 3) k = addDaysKey(k, 1);
  return k;
}
const DAY = nextWednesday();
const at = (hhmm: string) => atLocal(DAY, hhmm).toISOString();
const CUT = ID.cutA1;

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at)
     values ($1, 'studio', 'trialing', now() + interval '10 days')
     on conflict (organization_id) do update set status = excluded.status, trial_ends_at = excluded.trial_ends_at`,
    [ID.orgA],
  );
  await c.query("delete from public.working_hours where professional_id in ($1, $2)", [ID.carlos, ID.andre]);
  await c.query(
    `insert into public.working_hours (professional_id, weekday, start_time, end_time)
     select p, d, '09:00', '18:00' from unnest($1::uuid[]) p, generate_series(1, 6) d`,
    [[ID.carlos, ID.andre]],
  );
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const guest = (phone: string) => ({ first_name: "Ashley", last_name: "Taylor", phone, locale: "en" });
const items = (pro: string) => JSON.stringify([{ service_id: CUT, professional_id: pro }]);

/** Reserva como invitado (anon) y devuelve su token. */
async function guestBooks(phone: string, pro: string, hhmm: string): Promise<{ token: string; group: string }> {
  await switchTo(c, anon);
  const r = (
    await c.query("select public.book_appointment($1, $2::jsonb, $3::timestamptz, $4::jsonb) as r", [
      ID.salonA1, items(pro), at(hhmm), JSON.stringify(guest(phone)),
    ])
  ).rows[0].r;
  return { token: r.guest_token, group: r.booking_group_id };
}
const claim = async (tokens: string[]) => (await c.query("select public.claim_guest_bookings($1::text[]) as r", [tokens])).rows[0].r as string[];

describe("claim_guest_bookings", () => {
  it("el invitado crea cuenta: su cita pasa a 'Mis citas' y la ficha de invitado pasa a ser suya", async () => {
    const { token, group } = await guestBooks("649 555 0101", ID.carlos, "10:00");
    await asSuperuser(c);
    const me = await createAuthUser(c, { email: "ashley@example.com", meta: { full_name: "Ashley Taylor", phone: "649 555 0101" } });
    await switchTo(c, user(me));
    expect((await c.query("select public.my_bookings() as b")).rows[0].b).toHaveLength(0);

    expect(await claim([token])).toEqual(["claimed"]);
    const mine = (await c.query("select public.my_bookings() as b")).rows[0].b;
    expect(mine.map((b: { booking_group_id: string }) => b.booking_group_id)).toEqual([group]);

    await asSuperuser(c);
    expect((await c.query("select count(*)::int n from public.customers where user_id = $1 and organization_id = $2", [me, ID.orgA])).rows[0].n).toBe(1);

    // Repetirlo no hace nada raro, y el enlace privado sigue funcionando.
    await switchTo(c, user(me));
    expect(await claim([token])).toEqual(["already"]);
    await switchTo(c, anon);
    expect((await c.query("select public.get_guest_booking($1) as g", [token])).rows[0].g.booking_group_id).toBe(group);
  });

  it("si ya tenía ficha en ese negocio, las citas se mueven a ella y la ficha de invitado se borra", async () => {
    const { token, group } = await guestBooks("649 555 0102", ID.carlos, "10:00");
    await asSuperuser(c);
    await switchTo(c, user(ID.juanUser)); // Juan ya tiene ficha (juanA) en la organización A
    expect(await claim([token])).toEqual(["claimed"]);
    const mine = (await c.query("select public.my_bookings() as b")).rows[0].b;
    expect(mine.map((b: { booking_group_id: string }) => b.booking_group_id)).toContain(group);

    await asSuperuser(c);
    expect((await c.query("select customer_id from public.booking_groups where id = $1", [group])).rows[0].customer_id).toBe(ID.juanA);
    expect((await c.query("select count(*)::int n from public.appointments where booking_group_id = $1 and customer_id = $2", [group, ID.juanA])).rows[0].n).toBe(1);
    expect((await c.query("select count(*)::int n from public.customers where phone = '+16495550102' and organization_id = $1", [ID.orgA])).rows[0].n).toBe(0);
  });

  it("si choca con otra cita suya a la misma hora no cambia nada ('failed') y las demás sí se unen", async () => {
    const clash = await guestBooks("649 555 0103", ID.carlos, "10:00");
    const fine = await guestBooks("649 555 0104", ID.andre, "15:00");
    await asSuperuser(c);
    await c.query(
      `insert into public.booking_groups (id, organization_id, salon_id, customer_id) values (gen_random_uuid(), $1, $2, $3) returning id`,
      [ID.orgA, ID.salonA1, ID.juanA],
    );
    const g = (await c.query("select id from public.booking_groups where customer_id = $1 order by created_at desc limit 1", [ID.juanA])).rows[0].id;
    await c.query(
      `insert into public.appointments (booking_group_id, salon_id, professional_id, customer_id, service_name_en, service_name_es, price_cents, starts_at, ends_at, blocked_until)
       values ($1, $2, $3, $4, 'Cut', 'Corte', 2500, $5::timestamptz, $5::timestamptz + interval '30 minutes', $5::timestamptz + interval '40 minutes')`,
      [g, ID.salonA1, ID.andre, ID.juanA, at("10:00")],
    );
    await switchTo(c, user(ID.juanUser));
    expect(await claim([clash.token, fine.token])).toEqual(["failed", "claimed"]);

    await asSuperuser(c);
    // La que chocaba sigue siendo del invitado.
    expect((await c.query("select customer_id <> $2 as invitado from public.booking_groups where id = $1", [clash.group, ID.juanA])).rows[0].invitado).toBe(true);
    expect((await c.query("select customer_id from public.booking_groups where id = $1", [fine.group])).rows[0].customer_id).toBe(ID.juanA);
  });

  it("tokens inválidos o ya de otra cuenta devuelven 'not_found' (sin dar pistas)", async () => {
    const { token } = await guestBooks("649 555 0105", ID.carlos, "10:00");
    await asSuperuser(c);
    const first = await createAuthUser(c, { email: "first@example.com", meta: { full_name: "First One", phone: "649 555 0105" } });
    const second = await createAuthUser(c, { email: "second@example.com", meta: { full_name: "Second One", phone: "649 555 0199" } });
    await switchTo(c, user(first));
    expect(await claim([token])).toEqual(["claimed"]);

    await switchTo(c, user(second));
    expect(await claim([token, "falso", "A".repeat(64), "0".repeat(64)])).toEqual(["not_found", "not_found", "not_found", "not_found"]);
    expect((await c.query("select public.my_bookings() as b")).rows[0].b).toHaveLength(0);
  });

  it("solo con cuenta de verdad: visitantes y pantallas (sesión anónima) no pueden", async () => {
    const { token } = await guestBooks("649 555 0106", ID.carlos, "10:00");
    expect(await attemptMsg(c, () => claim([token]))).toBe("permission denied for function claim_guest_bookings");
    await asSuperuser(c);
    const tv = await createAuthUser(c, { anonymous: true });
    await switchTo(c, user(tv));
    expect(await attemptMsg(c, () => claim([token]))).toBe("forbidden");
  });

  it("máximo 20 enlaces por llamada", async () => {
    await switchTo(c, user(ID.juanUser));
    expect(await attemptMsg(c, () => claim(Array.from({ length: 21 }, () => "0".repeat(64))))).toBe("invalid_tokens");
  });
});
