/** Módulo 4: gestión del salón desde el panel (horarios, servicios por profesional, publicar, ajustes). */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attempt, attemptMsg, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const hours = (rows: [number, string, string][]) => JSON.stringify(rows.map(([weekday, start, end]) => ({ weekday, start, end })));

describe("horario semanal", () => {
  it("el dueño sustituye el horario completo (incluido horario partido)", async () => {
    await switchTo(c, user(ID.ownerA));
    const n = (await c.query("select public.set_working_hours($1, $2::jsonb) as n", [ID.andre, hours([[1, "09:00", "13:00"], [1, "14:00", "18:00"], [6, "10:00", "15:00"]])])).rows[0].n;
    expect(n).toBe(3);
    const r = await c.query("select weekday, start_time::text s, end_time::text e from public.working_hours where professional_id = $1 order by weekday, start_time", [ID.andre]);
    expect(r.rows).toEqual([
      { weekday: 1, s: "09:00:00", e: "13:00:00" },
      { weekday: 1, s: "14:00:00", e: "18:00:00" },
      { weekday: 6, s: "10:00:00", e: "15:00:00" },
    ]);
  });

  it("rechaza tramos solapados o al revés", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.set_working_hours($1, $2::jsonb)", [ID.andre, hours([[2, "09:00", "13:00"], [2, "12:00", "15:00"]])]))).toBe("overlapping_hours");
    expect(await attemptMsg(c, () => c.query("select public.set_working_hours($1, $2::jsonb)", [ID.andre, hours([[2, "15:00", "09:00"]])]))).toBe("invalid_hours");
    expect(await attemptMsg(c, () => c.query("select public.set_working_hours($1, $2::jsonb)", [ID.andre, hours([[7, "09:00", "10:00"]])]))).toBe("invalid_hours");
  });

  it("solo dueño/admin de ESA sucursal; ni el profesional ni otro salón", async () => {
    for (const who of [ID.carlosUser, ID.adminA2, ID.ownerB, ID.juanUser]) {
      await switchTo(c, user(who));
      expect(await attemptMsg(c, () => c.query("select public.set_working_hours($1, $2::jsonb)", [ID.carlos, hours([[1, "09:00", "10:00"]])]))).toBe("forbidden");
    }
    await switchTo(c, anon);
    expect(await attempt(c, () => c.query("select public.set_working_hours($1, '[]'::jsonb)", [ID.carlos]))).toBe("42501");
  });
});

describe("servicios de cada profesional", () => {
  it("sustituye la lista y no permite servicios de otra sucursal", async () => {
    await asSuperuser(c);
    const beard = (
      await c.query(
        `insert into public.services (salon_id, category_code, name_en, name_es, duration_min, price_cents)
         values ($1, 'beard', 'Beard', 'Barba', 20, 1500) returning id`,
        [ID.salonA1],
      )
    ).rows[0].id;
    await switchTo(c, user(ID.ownerA));
    await c.query("select public.set_professional_services($1, $2::uuid[])", [ID.andre, [beard]]);
    const r = await c.query("select service_id from public.professional_services where professional_id = $1", [ID.andre]);
    expect(r.rows.map((x) => x.service_id)).toEqual([beard]); // el corte se quitó, la barba se añadió
    const manicureA2 = (await c.query("select id from public.services where salon_id = $1", [ID.salonA2])).rows[0].id;
    expect(await attemptMsg(c, () => c.query("select public.set_professional_services($1, $2::uuid[])", [ID.andre, [manicureA2]]))).toBe("invalid_service");
  });
});

describe("publicar la sucursal", () => {
  it("no se puede publicar sin un profesional con horario y servicio; luego sí", async () => {
    await asSuperuser(c);
    await c.query("update public.salons set is_published = false where id = $1", [ID.salonA2]);
    await c.query("delete from public.working_hours where professional_id = $1", [ID.maria]);
    await switchTo(c, user(ID.adminA2));
    expect(await attemptMsg(c, () => c.query("select public.set_salon_published($1, true)", [ID.salonA2]))).toBe("salon_incomplete");
    await asSuperuser(c);
    await c.query("insert into public.working_hours (professional_id, weekday, start_time, end_time) values ($1, 2, '09:00', '17:00')", [ID.maria]);
    await switchTo(c, user(ID.adminA2));
    expect((await c.query("select public.set_salon_published($1, true) as p", [ID.salonA2])).rows[0].p).toBe(true);
    expect((await c.query("select public.set_salon_published($1, false) as p", [ID.salonA2])).rows[0].p).toBe(false);
  });

  it("is_published no se puede cambiar con un UPDATE directo (solo con la función que valida)", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => c.query("update public.salons set is_published = true where id = $1", [ID.salonA1]))).toBe("42501");
    // Los ajustes normales sí
    const r = await c.query("update public.salons set cancellation_window_hours = 12, no_show_block_enabled = true where id = $1", [ID.salonA1]);
    expect(r.rowCount).toBe(1);
  });

  it("el profesional y otros salones no pueden publicar", async () => {
    await switchTo(c, user(ID.carlosUser));
    expect(await attemptMsg(c, () => c.query("select public.set_salon_published($1, false)", [ID.salonA1]))).toBe("forbidden");
    await switchTo(c, user(ID.ownerB));
    expect(await attemptMsg(c, () => c.query("select public.set_salon_published($1, false)", [ID.salonA1]))).toBe("forbidden");
  });
});

describe("gestión directa con RLS desde el panel", () => {
  it("el dueño crea y edita servicios, profesionales, días libres y cierres de su sucursal", async () => {
    await switchTo(c, user(ID.ownerA));
    const svc = (
      await c.query(
        `insert into public.services (salon_id, category_code, name_en, name_es, duration_min, buffer_min, price_cents)
         values ($1, 'cuts', 'Kids cut', 'Corte de niño', 25, 5, 1500) returning id`,
        [ID.salonA1],
      )
    ).rows[0].id;
    expect((await c.query("update public.services set price_cents = 1800 where id = $1", [svc])).rowCount).toBe(1);
    const pro = (
      await c.query("insert into public.professionals (salon_id, first_name, last_name, color_hex, title) values ($1, 'Luis', 'Gómez', '#15803D', 'barber') returning id", [ID.salonA1])
    ).rows[0].id;
    expect(await attempt(c, () => c.query("insert into public.professionals (salon_id, first_name, color_hex) values ($1, 'Otro', '#15803D')", [ID.salonA1]))).toBe("23505"); // color en uso
    await c.query("insert into public.time_off (professional_id, starts_at, ends_at, reason) values ($1, now() + interval '1 day', now() + interval '2 days', 'Vacaciones')", [pro]);
    await c.query("insert into public.salon_closures (salon_id, starts_at, ends_at, reason_en, reason_es) values ($1, now() + interval '5 days', now() + interval '6 days', 'Holiday', 'Festivo')", [ID.salonA1]);
  });

  it("el profesional no puede crear servicios ni días libres (lo hace el admin)", async () => {
    await switchTo(c, user(ID.carlosUser));
    expect(
      await attempt(c, () => c.query(`insert into public.services (salon_id, category_code, name_en, name_es, duration_min, price_cents) values ($1, 'cuts', 'X', 'X', 30, 100)`, [ID.salonA1])),
    ).toBe("42501");
    expect(await attempt(c, () => c.query("insert into public.time_off (professional_id, starts_at, ends_at) values ($1, now(), now() + interval '1 hour')", [ID.carlos]))).toBe("42501");
  });
});
