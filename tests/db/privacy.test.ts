/**
 * Derechos de datos: el cliente con cuenta descarga lo que Breeze guarda de él y puede borrar su cuenta.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attemptMsg, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
let me: string;
let customer: string;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  me = await createAuthUser(c, { email: "ashley@example.com", meta: { full_name: "Ashley Taylor", phone: "649 555 0101" } });
  customer = (
    await c.query(
      `insert into public.customers (organization_id, user_id, first_name, last_name, phone, email, notes, marketing_opt_in)
       values ($1, $2, 'Ashley', 'Taylor', '+16495550101', 'ashley@example.com', 'nota interna', true) returning id`,
      [ID.orgA, me],
    )
  ).rows[0].id;
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

async function bookFor(customerId: string, startOffset: string, status = "booked") {
  const g = (await c.query("insert into public.booking_groups (organization_id, salon_id, customer_id) values ($1, $2, $3) returning id", [ID.orgA, ID.salonA1, customerId])).rows[0].id;
  return (
    await c.query(
      `insert into public.appointments (booking_group_id, salon_id, professional_id, customer_id, service_name_en, service_name_es, price_cents, starts_at, ends_at, blocked_until, status, cancelled_at)
       values ($1, $2, $3, $4, 'Cut', 'Corte', 2500, now() + $5::interval, now() + $5::interval + interval '30 minutes', now() + $5::interval + interval '40 minutes', $6::public.appointment_status,
               case when $6 = 'cancelled' then now() end) returning id`,
      [g, ID.salonA1, ID.carlos, customerId, startOffset, status],
    )
  ).rows[0].id as string;
}

describe("export_my_data", () => {
  it("devuelve su perfil, sus fichas y sus citas, sin notas internas del negocio", async () => {
    await bookFor(customer, "3 days");
    await switchTo(c, user(me));
    const d = (await c.query("select public.export_my_data() as d")).rows[0].d;
    expect(d.account).toMatchObject({ email: "ashley@example.com", full_name: "Ashley Taylor" });
    expect(d.customer_records).toHaveLength(1);
    expect(d.customer_records[0]).toMatchObject({ first_name: "Ashley", phone: "+16495550101", marketing_opt_in: true });
    expect(JSON.stringify(d)).not.toContain("nota interna");
    expect(d.bookings).toHaveLength(1);
  });

  it("solo con cuenta real: ni visitantes ni sesiones anónimas", async () => {
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => c.query("select public.export_my_data()"))).not.toBeNull();
    await asSuperuser(c);
    await c.query("update auth.users set is_anonymous = true where id = $1", [me]);
    await switchTo(c, user(me));
    expect(await attemptMsg(c, () => c.query("select public.export_my_data()"))).toBe("forbidden");
  });

  it("no incluye datos de otras personas", async () => {
    const other = await createAuthUser(c, { email: "otro@example.com", meta: { full_name: "Otro Cliente" } });
    await switchTo(c, user(other));
    const d = (await c.query("select public.export_my_data() as d")).rows[0].d;
    expect(d.customer_records).toEqual([]);
    expect(d.bookings).toEqual([]);
    expect(JSON.stringify(d)).not.toContain("Ashley");
  });
});

describe("delete_my_account", () => {
  it("borra la cuenta, cancela las citas futuras y deja las pasadas sin datos personales", async () => {
    const future = await bookFor(customer, "3 days");
    const past = await bookFor(customer, "-3 days", "completed");
    await switchTo(c, user(me));
    await c.query("select public.delete_my_account()");

    await asSuperuser(c);
    expect((await c.query("select 1 from auth.users where id = $1", [me])).rowCount).toBe(0);
    expect((await c.query("select 1 from public.profiles where id = $1", [me])).rowCount).toBe(0);
    const f = (await c.query("select status, customer_display from public.appointments where id = $1", [future])).rows[0];
    expect(f).toMatchObject({ status: "cancelled", customer_display: "Deleted account" });
    const p = (await c.query("select status, customer_display from public.appointments where id = $1", [past])).rows[0];
    expect(p).toMatchObject({ status: "completed", customer_display: "Deleted account" });
    const cu = (await c.query("select first_name, last_name, email, notes, user_id, marketing_opt_in from public.customers where id = $1", [customer])).rows[0];
    expect(cu).toEqual({ first_name: "Deleted account", last_name: "", email: null, notes: null, user_id: null, marketing_opt_in: false });
    expect((await c.query("select 1 from public.audit_log where action = 'account.deleted' and entity_id = $1", [me])).rowCount).toBe(1);
  });

  it("no toca a otros clientes del mismo negocio", async () => {
    const otherCustomer = (await c.query("select id from public.customers where id = $1", [ID.juanA])).rows[0].id;
    await switchTo(c, user(me));
    await c.query("select public.delete_my_account()");
    await asSuperuser(c);
    expect((await c.query("select first_name from public.customers where id = $1", [otherCustomer])).rows[0].first_name).not.toBe("Deleted account");
  });

  it("un dueño de negocio no puede borrarse (primero hay que cerrar el negocio)", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.delete_my_account()"))).toBe("owner_cannot_delete");
    await asSuperuser(c);
    expect((await c.query("select 1 from auth.users where id = $1", [ID.ownerA])).rowCount).toBe(1);
  });

  it("visitantes y sesiones anónimas no pueden usarla", async () => {
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => c.query("select public.delete_my_account()"))).not.toBeNull();
    await asSuperuser(c);
    await c.query("update auth.users set is_anonymous = true where id = $1", [me]);
    await switchTo(c, user(me));
    expect(await attemptMsg(c, () => c.query("select public.delete_my_account()"))).toBe("forbidden");
  });
});
