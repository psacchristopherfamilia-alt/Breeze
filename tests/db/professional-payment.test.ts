/**
 * Cómo cobra cada profesional (efectivo / tarjeta / transferencia): lo ve el cliente al reservar,
 * solo su dueño lo edita, y las TV de Breeze Live nunca lo muestran.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attempt, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, current_period_end)
     values ($1, 'studio', 'active', now() + interval '20 days'), ($2, 'solo', 'active', now() + interval '20 days')
     on conflict (organization_id) do update set status = excluded.status, current_period_end = excluded.current_period_end`,
    [ID.orgA, ID.orgB],
  );
  await c.query("update public.salons set is_published = true where id = $1", [ID.salonA1]);
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

describe("forma de pago del profesional", () => {
  it("por defecto cobra en efectivo", async () => {
    await asSuperuser(c);
    const r = (await c.query("select accepts_cash, accepts_card, accepts_transfer, payment_note from public.professionals where id = $1", [ID.carlos])).rows[0];
    expect(r).toEqual({ accepts_cash: true, accepts_card: false, accepts_transfer: false, payment_note: null });
  });

  it("el dueño la configura y el visitante la ve, sin ver el apellido", async () => {
    await switchTo(c, user(ID.ownerA));
    await c.query(
      "update public.professionals set accepts_card = true, accepts_transfer = true, payment_note = 'Banco X · cuenta 123 · envía el comprobante' where id = $1",
      [ID.carlos],
    );
    await switchTo(c, anon);
    const r = (await c.query("select public_name, accepts_cash, accepts_card, accepts_transfer, payment_note from public.professionals where id = $1", [ID.carlos])).rows[0];
    expect(r).toMatchObject({ public_name: "Carlos M.", accepts_cash: true, accepts_card: true, accepts_transfer: true });
    expect(r.payment_note).toContain("cuenta 123");
    expect(await attempt(c, () => c.query("select last_name from public.professionals"))).toBe("42501");
  });

  it("debe aceptar al menos un método, y la transferencia exige sus datos", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => c.query("update public.professionals set accepts_cash = false where id = $1", [ID.carlos]))).toBe("23514");
    expect(await attempt(c, () => c.query("update public.professionals set accepts_transfer = true, payment_note = '  ' where id = $1", [ID.carlos]))).toBe("23514");
    expect(await attempt(c, () => c.query("update public.professionals set payment_note = $2 where id = $1", [ID.carlos, "x".repeat(401)]))).toBe("23514");
  });

  it("el dueño de otro negocio no puede cambiarla", async () => {
    await switchTo(c, user(ID.ownerB));
    const r = await c.query("update public.professionals set accepts_card = true where id = $1", [ID.carlos]);
    expect(r.rowCount).toBe(0);
    await asSuperuser(c);
    expect((await c.query("select accepts_card from public.professionals where id = $1", [ID.carlos])).rows[0].accepts_card).toBe(false);
  });

  it("la pantalla de Breeze Live nunca muestra los datos de pago", async () => {
    await asSuperuser(c);
    await c.query("update public.professionals set accepts_transfer = true, payment_note = 'SECRETO-123' where id = $1", [ID.carlos]);
    await switchTo(c, user(ID.ownerA));
    const board = (await c.query("select public.get_live_board($1) as b", [ID.salonA1])).rows[0].b;
    expect(JSON.stringify(board)).not.toContain("SECRETO-123");
    expect(JSON.stringify(board)).not.toContain("payment_note");
  });
});
