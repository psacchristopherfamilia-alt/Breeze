/**
 * Avisos al equipo: quién los recibe, que no se repitan, que nadie vea los de otro, y los teléfonos suscritos.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { addDaysKey, atLocal, localDateKey, weekdayOf } from "../../src/lib/time";
import { ID, anon, asSuperuser, attempt, attemptMsg, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

function nextWednesday(): string {
  let k = addDaysKey(localDateKey(new Date()), 3);
  while (weekdayOf(k) !== 3) k = addDaysKey(k, 1);
  return k;
}
const DAY = nextWednesday();
const at = (hhmm: string) => atLocal(DAY, hhmm).toISOString();
const items = (...pros: string[]) => JSON.stringify(pros.map((p) => ({ service_id: ID.cutA1, professional_id: p })));
const guest = { first_name: "Ashley", last_name: "Taylor", phone: "649 555 0199", locale: "en" };

let c: pg.PoolClient;
let orgAdmin: string; // administrador de TODA la organización A (adminA2 solo lo es de la sucursal A2)
/** Los avisos se generan al terminar la transacción; en las pruebas la terminamos "a mano". */
const flush = () => c.query("set constraints all immediate");
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at)
     values ($1, 'studio', 'trialing', now() + interval '10 days') on conflict (organization_id) do update set status = excluded.status, trial_ends_at = excluded.trial_ends_at`,
    [ID.orgA],
  );
  await c.query("update public.salons set is_published = true where id = $1", [ID.salonA1]);
  orgAdmin = await createAuthUser(c, { email: "admin-org@example.com", meta: { full_name: "Admin Org" } });
  await c.query("insert into public.memberships (user_id, organization_id, role) values ($1, $2, 'admin')", [orgAdmin, ID.orgA]);
  await c.query("delete from public.working_hours where professional_id in ($1, $2)", [ID.carlos, ID.andre]);
  await c.query(
    `insert into public.working_hours (professional_id, weekday, start_time, end_time) select p, d, '09:00', '18:00' from unnest($1::uuid[]) p, generate_series(1, 6) d`,
    [[ID.carlos, ID.andre]],
  );
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

/** Reserva como invitado (sin sesión) y devuelve el grupo. */
async function guestBooks(hhmm: string, pro: string = ID.carlos): Promise<{ group: string; token: string }> {
  await switchTo(c, anon);
  const r = (await c.query("select public.book_appointment($1, $2::jsonb, $3::timestamptz, $4::jsonb) as r", [ID.salonA1, items(pro), at(hhmm), JSON.stringify(guest)])).rows[0].r;
  await flush();
  return { group: r.booking_group_id, token: r.guest_token };
}
const alertsOf = async (uid: string) => {
  await switchTo(c, user(uid));
  return (await c.query("select kind, customer_display, pro_name, service_en, booking_group_id, read_at from public.staff_alerts order by kind")).rows;
};

describe("quién recibe el aviso", () => {
  it("una reserva nueva avisa al dueño, al administrador y al profesional de la cita; no a otros", async () => {
    await guestBooks("10:00", ID.carlos);
    const owner = await alertsOf(ID.ownerA);
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ kind: "booked", customer_display: "Ashley T.", pro_name: "Carlos M.", read_at: null });
    expect(owner[0].service_en).toBeTruthy();
    expect(await alertsOf(orgAdmin)).toHaveLength(1);
    expect(await alertsOf(ID.carlosUser)).toHaveLength(1);
    // El administrador de OTRA sucursal, otro negocio, un cliente y un visitante no reciben nada.
    expect(await alertsOf(ID.adminA2)).toHaveLength(0);
    expect(await alertsOf(ID.ownerB)).toHaveLength(0);
    expect(await alertsOf(ID.juanUser)).toHaveLength(0);
    expect(await alertsOf(ID.displayA1)).toHaveLength(0);
  });

  it("el profesional solo se entera de SUS citas", async () => {
    await guestBooks("10:00", ID.andre); // Andre no tiene cuenta; Carlos no debe enterarse
    expect(await alertsOf(ID.carlosUser)).toHaveLength(0);
    expect(await alertsOf(ID.ownerA)).toHaveLength(1);
  });

  it("quien hace el cambio no recibe su propio aviso", async () => {
    await switchTo(c, user(ID.ownerA));
    await c.query(
      "select public.staff_create_appointment($1, $2::jsonb, $3::timestamptz, $4::jsonb, 'phone', false)",
      [ID.salonA1, items(ID.carlos), at("11:00"), JSON.stringify({ first_name: "Walk", last_name: "In", phone: "649 555 0100" })],
    );
    await flush();
    expect(await alertsOf(ID.ownerA)).toHaveLength(0); // lo hizo él
    expect(await alertsOf(orgAdmin)).toHaveLength(1); // los demás sí
    expect(await alertsOf(ID.carlosUser)).toHaveLength(1);
  });

  it("varios servicios en una reserva son un solo aviso", async () => {
    await switchTo(c, anon);
    await c.query("select public.book_appointment($1, $2::jsonb, $3::timestamptz, $4::jsonb)", [
      ID.salonA1,
      JSON.stringify([{ service_id: ID.cutA1, professional_id: ID.carlos }, { service_id: ID.cutA1, professional_id: ID.carlos }]),
      at("12:00"),
      JSON.stringify(guest),
    ]);
    await flush();
    const a = await alertsOf(ID.ownerA);
    expect(a).toHaveLength(1);
    expect(a[0].service_en).toContain(" + ");
  });
});

describe("cambios y cancelaciones", () => {
  it("cancelar y reprogramar generan su aviso", async () => {
    const { group, token } = await guestBooks("10:00");
    await switchTo(c, anon);
    await c.query("select public.reschedule_by_guest_token($1, $2::timestamptz)", [token, at("14:00")]);
    await flush();
    await switchTo(c, anon);
    await c.query("select public.cancel_by_guest_token($1, 'x')", [token]);
    await flush();
    const kinds = (await alertsOf(ID.ownerA)).map((a) => a.kind);
    expect(kinds).toEqual(["booked", "cancelled", "rescheduled"]); // ordenados por nombre
    expect((await alertsOf(ID.ownerA)).every((a) => a.booking_group_id === group)).toBe(true);
  });

  it("marcar una cita como completada no avisa a nadie", async () => {
    await guestBooks("10:00");
    await asSuperuser(c);
    await c.query("update public.appointments set status = 'completed' where salon_id = $1", [ID.salonA1]);
    await flush();
    expect(await alertsOf(ID.ownerA)).toHaveLength(1); // solo el "booked" del principio
  });
});

describe("privacidad y permisos", () => {
  it("cada persona solo lee y marca como leídos sus propios avisos", async () => {
    await guestBooks("10:00");
    await switchTo(c, user(orgAdmin));
    expect((await c.query("update public.staff_alerts set read_at = now() where user_id = $1", [ID.ownerA])).rowCount).toBe(0);
    expect((await c.query("update public.staff_alerts set read_at = now() where read_at is null")).rowCount).toBe(1);
    expect((await alertsOf(orgAdmin))[0].read_at).not.toBeNull();
    expect((await alertsOf(ID.ownerA))[0].read_at).toBeNull();
  });

  it("nadie puede crear, borrar ni cambiar el contenido de un aviso", async () => {
    await guestBooks("10:00");
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => c.query("insert into public.staff_alerts (user_id, salon_id, kind, starts_at) values ($1, $2, 'booked', now())", [ID.ownerA, ID.salonA1]))).toBe("42501");
    expect(await attempt(c, () => c.query("delete from public.staff_alerts"))).toBe("42501");
    expect(await attempt(c, () => c.query("update public.staff_alerts set customer_display = 'otro'"))).toBe("42501");
    await switchTo(c, anon);
    expect(await attempt(c, () => c.query("select 1 from public.staff_alerts"))).toBe("42501");
  });

  it("el aviso no lleva teléfono ni correo del cliente", async () => {
    await guestBooks("10:00");
    await asSuperuser(c);
    const txt = JSON.stringify((await c.query("select * from public.staff_alerts")).rows);
    expect(txt).not.toContain("5550199");
    expect(txt).not.toContain("Taylor");
  });

  it("se emite al canal privado de cada persona", async () => {
    await asSuperuser(c);
    await c.query("delete from realtime.test_sent");
    await guestBooks("10:00");
    await asSuperuser(c);
    const topics = (await c.query("select topic, private, event from realtime.test_sent where topic like 'alerts:%'")).rows;
    expect(topics.every((t) => t.private && t.event === "alert")).toBe(true);
    expect(topics.map((t) => t.topic).sort()).toEqual([`alerts:${ID.ownerA}`, `alerts:${orgAdmin}`, `alerts:${ID.carlosUser}`].sort());
  });
});

describe("teléfonos suscritos (push)", () => {
  const sub = (uid: string, endpoint: string) => c.query("select public.save_push_subscription($1, 'p256', 'authkey', 'iPhone')", [endpoint]).then(() => uid);

  it("cada persona guarda y quita el suyo; las llaves no se pueden leer", async () => {
    await switchTo(c, user(ID.ownerA));
    await sub(ID.ownerA, "https://push.example/abc");
    const mine = await c.query("select id, endpoint from public.push_subscriptions");
    expect(mine.rows.map((r) => r.endpoint)).toEqual(["https://push.example/abc"]);
    expect(await attempt(c, () => c.query("select p256dh from public.push_subscriptions"))).toBe("42501");
    expect(await attempt(c, () => c.query("select auth from public.push_subscriptions"))).toBe("42501");
    await switchTo(c, user(ID.adminA2));
    expect((await c.query("select 1 from public.push_subscriptions")).rowCount).toBe(0);
    await c.query("select public.remove_push_subscription('https://push.example/abc')"); // no es suyo: no borra nada
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("select 1 from public.push_subscriptions")).rowCount).toBe(1);
    await c.query("select public.remove_push_subscription('https://push.example/abc')");
    expect((await c.query("select 1 from public.push_subscriptions")).rowCount).toBe(0);
  });

  it("un teléfono compartido pasa a quien lo activó por última vez", async () => {
    await switchTo(c, user(ID.ownerA));
    await sub(ID.ownerA, "https://push.example/shared");
    await switchTo(c, user(ID.adminA2));
    await sub(ID.adminA2, "https://push.example/shared");
    await asSuperuser(c);
    expect((await c.query("select user_id from public.push_subscriptions where endpoint = 'https://push.example/shared'")).rows[0].user_id).toBe(ID.adminA2);
  });

  it("solo con cuenta real y con una dirección https", async () => {
    await switchTo(c, anon);
    expect(await attempt(c, () => sub(ID.ownerA, "https://push.example/x"))).toBe("42501");
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => sub(ID.ownerA, "http://inseguro.example/x"))).toBe("23514");
    expect(await attemptMsg(c, () => c.query("select public.save_push_subscription('https://push.example/y', '', 'a')"))).toBe("invalid_subscription");
    await asSuperuser(c);
    const anonUser = await createAuthUser(c, { email: "tv@example.com", meta: {} });
    await c.query("update auth.users set is_anonymous = true where id = $1", [anonUser]);
    await switchTo(c, user(anonUser));
    expect(await attemptMsg(c, () => c.query("select public.save_push_subscription('https://push.example/z', 'p', 'a')"))).toBe("forbidden");
  });
});
