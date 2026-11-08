/**
 * Informes del dueño (`staff_report`): cifras, ocupación, clientes y horas pico, y quién ve qué.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attemptMsg, book, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

const TZ = "America/Grand_Turk";
let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

/** Instante UTC de «hace n días a las HH:MM» en hora de Turks and Caicos. */
async function ago(n: number, hhmm: string): Promise<string> {
  const r = await c.query<{ t: string }>(
    "select ((((now() at time zone $1)::date - $2::int)::timestamp + $3::time) at time zone $1)::text t",
    [TZ, n, hhmm],
  );
  return new Date(r.rows[0].t).toISOString();
}
/** Rango «últimos N días» (hoy incluido), de medianoche local a medianoche local. */
async function range(days: number): Promise<[string, string]> {
  const r = await c.query<{ f: string; t: string }>(
    "select ((((now() at time zone $1)::date - ($2::int - 1))::timestamp) at time zone $1)::text f, ((((now() at time zone $1)::date + 1)::timestamp) at time zone $1)::text t",
    [TZ, days],
  );
  return [new Date(r.rows[0].f).toISOString(), new Date(r.rows[0].t).toISOString()];
}
const report = async (salon: string, from: string, to: string) =>
  (await c.query("select public.staff_report($1, $2, $3) r", [salon, from, to])).rows[0].r;

describe("cifras del periodo", () => {
  it("cuenta las atendidas (completadas, o reservadas ya terminadas) y no las canceladas, no-show ni futuras", async () => {
    const [from, to] = await range(7);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(2, "11:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: await ago(3, "10:00"), status: "booked" }); // sin marcar, ya terminó
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: await ago(3, "12:00"), status: "cancelled" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(3, "13:00"), status: "no_show" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(-2, "10:00") }); // futura
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(20, "10:00"), status: "completed" }); // fuera del periodo
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    expect(r.current).toMatchObject({ revenue_cents: 7500, appointments: 3, avg_ticket_cents: 2500 });
  });

  it("el periodo anterior (misma duración, justo antes) se calcula aparte", async () => {
    const [from, to] = await range(7);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(9, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(10, "12:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(16, "12:00"), status: "completed" }); // antes del anterior
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    expect(r.current.appointments).toBe(1);
    expect(r.previous.appointments).toBe(2);
    expect(r.previous.revenue_cents).toBe(5000);
  });

  it("un periodo sin citas da ceros (sin dividir entre cero) y listas vacías", async () => {
    const [from, to] = await range(7);
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    expect(r.current).toMatchObject({ revenue_cents: 0, appointments: 0, avg_ticket_cents: 0, booked_min: 0 });
    expect(r.by_service).toEqual([]);
    expect(r.heatmap).toEqual([]);
    expect(r.clients).toEqual({ new: 0, returning: 0 });
  });

  it("un salón de la misma organización no se mezcla con el otro", async () => {
    const [from, to] = await range(7);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA2, professional: ID.maria, customer: ID.juanA, start: await ago(2, "12:00"), status: "completed" });
    await switchTo(c, user(ID.ownerA));
    expect((await report(ID.salonA1, from, to)).current.appointments).toBe(1);
    expect((await report(ID.salonA2, from, to)).current.appointments).toBe(1);
  });

  it("por profesional y por servicio, ordenados por ingresos", async () => {
    const [from, to] = await range(7);
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: await ago(2, "12:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(3, "12:00"), status: "completed" });
    await c.query("update public.appointments set service_name_en = 'Beard', service_name_es = 'Barba', price_cents = 1500 where id = $1", [a]);
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    expect(r.by_pro.map((p: { id: string }) => p.id)).toEqual([ID.andre, ID.carlos]);
    expect(r.by_pro[0]).toMatchObject({ revenue_cents: 5000, appointments: 2 });
    expect(r.by_service.map((s: { name_en: string; revenue_cents: number }) => [s.name_en, s.revenue_cents])).toEqual([["Cut", 5000], ["Beard", 1500]]);
  });
});

describe("ocupación y horas pico", () => {
  /** Último martes de hace 2 a 8 días (Carlos trabaja los martes de 09:00 a 18:00 en las fixtures). */
  async function lastTuesday() {
    const r = await c.query<{ n: number }>(
      "select (((now() at time zone $1)::date) - d::date)::int n from generate_series(((now() at time zone $1)::date - 8), ((now() at time zone $1)::date - 2), interval '1 day') d where extract(dow from d) = 2 limit 1",
      [TZ],
    );
    return r.rows[0].n;
  }
  async function dayRange(n: number): Promise<[string, string]> {
    const r = await c.query<{ f: string; t: string }>(
      "select ((((now() at time zone $1)::date - $2::int)::timestamp) at time zone $1)::text f, ((((now() at time zone $1)::date - $2::int + 1)::timestamp) at time zone $1)::text t",
      [TZ, n],
    );
    return [new Date(r.rows[0].f).toISOString(), new Date(r.rows[0].t).toISOString()];
  }

  it("ocupación = minutos con cita ÷ minutos de horario, sin días libres ni cierres", async () => {
    const n = await lastTuesday();
    const [from, to] = await dayRange(n);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(n, "10:00"), minutes: 30, status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(n, "11:00"), minutes: 60, status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(n, "15:00"), minutes: 30, status: "cancelled" }); // no cuenta
    await switchTo(c, user(ID.ownerA));
    let r = await report(ID.salonA1, from, to);
    expect(r.current).toMatchObject({ booked_min: 90, open_min: 540, occupancy_pct: 17 });

    await asSuperuser(c);
    await c.query("insert into public.time_off (professional_id, starts_at, ends_at, created_by) values ($1, $2, $3, $4)", [ID.carlos, await ago(n, "12:00"), await ago(n, "14:00"), ID.ownerA]);
    await c.query("insert into public.salon_closures (salon_id, starts_at, ends_at) values ($1, $2, $3)", [ID.salonA1, await ago(n, "13:00"), await ago(n, "15:00")]);
    await switchTo(c, user(ID.ownerA));
    r = await report(ID.salonA1, from, to);
    // fuera 12:00 a 15:00 (el día libre y el cierre se solapan una hora y no se cuentan dos veces)
    expect(r.current.open_min).toBe(540 - 180);
    expect(r.current.occupancy_pct).toBe(25);
  });

  it("un profesional sin horario ese día no suma minutos", async () => {
    const n = await lastTuesday();
    const [from, to] = await dayRange(n);
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    expect(r.by_pro.find((p: { id: string }) => p.id === ID.andre)).toMatchObject({ occupancy_pct: 0 });
  });

  it("horas pico: día y hora en la hora de Turks and Caicos", async () => {
    const [from, to] = await range(14);
    // 10:30 local de hace 4 días y 23:30 local de hace 4 días (la hora UTC ya es del día siguiente)
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(4, "10:30"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(4, "23:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: await ago(5, "10:15"), status: "cancelled" }); // no cuenta
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    const dow = (await c.query("select extract(dow from ((now() at time zone $1)::date - 4))::int d", [TZ])).rows[0].d;
    const sorted = [...r.heatmap].sort((a: { hour: number }, b: { hour: number }) => a.hour - b.hour);
    expect(sorted).toEqual([
      { dow, hour: 10, count: 1 },
      { dow, hour: 23, count: 1 },
    ]);
  });
});

describe("clientes nuevos y que vuelven", () => {
  it("nuevo = su primera visita atendida cae en el periodo; vuelve = ya había venido antes", async () => {
    const [from, to] = await range(7);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(40, "10:00"), status: "completed" }); // antes
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(2, "12:00"), status: "completed" });
    await switchTo(c, user(ID.ownerA));
    expect((await report(ID.salonA1, from, to)).clients).toEqual({ new: 1, returning: 1 });
  });

  it("un cliente con dos visitas en el periodo cuenta una sola vez", async () => {
    const [from, to] = await range(7);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(1, "10:00"), status: "completed" });
    await switchTo(c, user(ID.ownerA));
    expect((await report(ID.salonA1, from, to)).clients).toEqual({ new: 1, returning: 0 });
  });

  it("llevan tiempo sin volver: más de 6 semanas, sin cita futura, sin cuentas borradas", async () => {
    const [from, to] = await range(7);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(60, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(50, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: await ago(-3, "10:00") }); // Ashley ya tiene cita
    await switchTo(c, user(ID.ownerA));
    let lapsed = (await report(ID.salonA1, from, to)).lapsed;
    expect(lapsed.map((l: { name: string }) => l.name)).toEqual(["Juan P."]);
    expect(Object.keys(lapsed[0]).sort()).toEqual(["customer_id", "last_visit", "name"]); // nunca teléfono ni correo
    await asSuperuser(c);
    await c.query("update public.customers set first_name = 'Deleted account', last_name = '' where id = $1", [ID.juanA]);
    await switchTo(c, user(ID.ownerA));
    lapsed = (await report(ID.salonA1, from, to)).lapsed;
    expect(lapsed).toEqual([]);
  });
});

describe("quién ve qué", () => {
  async function seed() {
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(2, "10:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: await ago(2, "12:00"), status: "completed" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: await ago(60, "10:00"), status: "completed" });
  }

  it("el profesional ve solo sus cifras y no la lista de clientes", async () => {
    const [from, to] = await range(7);
    await seed();
    await switchTo(c, user(ID.carlosUser));
    const r = await report(ID.salonA1, from, to);
    expect(r.current.appointments).toBe(1);
    expect(r.by_pro.map((p: { id: string }) => p.id)).toEqual([ID.carlos]);
    expect(r.lapsed).toBeNull();
  });

  it("el dueño ve toda la sucursal y la lista de clientes", async () => {
    const [from, to] = await range(7);
    await seed();
    await switchTo(c, user(ID.ownerA));
    const r = await report(ID.salonA1, from, to);
    expect(r.current.appointments).toBe(2);
    expect(Array.isArray(r.lapsed)).toBe(true);
  });

  it("otro negocio, un administrador de otra sucursal, la pantalla, un extraño y un visitante no pueden", async () => {
    const [from, to] = await range(7);
    await seed();
    for (const u of [ID.ownerB, ID.adminA2, ID.displayA1, ID.stranger]) {
      await switchTo(c, user(u));
      expect(await attemptMsg(c, () => report(ID.salonA1, from, to))).toMatch(/forbidden|permission|42501/);
    }
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => report(ID.salonA1, from, to))).toMatch(/permission denied/);
  });

  it("rangos inválidos", async () => {
    const [from, to] = await range(7);
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => report(ID.salonA1, to, from))).toMatch(/invalid_range/);
    expect(await attemptMsg(c, () => report(ID.salonA1, from, from))).toMatch(/invalid_range/);
    expect(await attemptMsg(c, () => report(ID.salonA1, "2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z"))).toMatch(/invalid_range/);
  });
});
