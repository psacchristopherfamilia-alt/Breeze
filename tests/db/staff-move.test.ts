/**
 * Mover una cita desde la agenda (arrastrar / «Mover…»): hora, día, profesional y duración.
 * La base de datos decide: choques, horario, servicio ofrecido, permisos y avisos al cliente.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attemptMsg, book, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

/** Un martes dentro de 8 a 14 días. 15:00 UTC = 10:00 (invierno) o 11:00 (verano) en Turks y Caicos, siempre dentro del horario 09:00–18:00. */
const TUE = (() => {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();
/** Hora de pared: `at(0)` = 15:00 UTC, `at(1, 30)` = 16:30 UTC… */
const at = (h: number, m = 0) => `${TUE}T${String(15 + h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  // Andre también trabaja los martes (ya ofrece el corte clásico).
  await c.query("insert into public.working_hours (professional_id, weekday, start_time, end_time) values ($1, 2, '09:00', '18:00')", [ID.andre]);
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const move = (id: string, pro: string | null, start: string, dur: number | null = null, notify = true) =>
  c.query("select public.staff_move_appointment($1, $2, $3, $4, $5) r", [id, pro, start, dur, notify]);
const row = async (id: string) =>
  (await c.query("select professional_id, starts_at, ends_at, blocked_until, status from public.appointments where id = $1", [id])).rows[0];
const jobs = async (group: string, kind = "reschedule") =>
  (await c.query("select count(*)::int n from public.notification_jobs where booking_group_id = $1 and kind = $2 and status = 'pending'", [group, kind])).rows[0].n as number;
const groupOf = async (id: string) => (await c.query("select booking_group_id g from public.appointments where id = $1", [id])).rows[0].g as string;

describe("mover la hora, el día y el profesional", () => {
  it("dueño y administrador mueven la hora; la cita conserva su duración y su tiempo entre servicios", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await switchTo(c, user(ID.ownerA));
    await move(a, null, at(2));
    await asSuperuser(c);
    const r = await row(a);
    expect(new Date(r.starts_at).toISOString()).toBe(new Date(at(2)).toISOString());
    expect(new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()).toBe(30 * 60_000);
    expect(new Date(r.blocked_until).getTime() - new Date(r.ends_at).getTime()).toBe(10 * 60_000);
    expect((await c.query("select count(*)::int n from public.appointment_events where appointment_id = $1 and type = 'rescheduled'", [a])).rows[0].n).toBe(1);
  });

  it("cambiar de profesional: el dueño puede si ese profesional ofrece el servicio y trabaja a esa hora", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await c.query("update public.appointments set service_id = $2 where id = $1", [a, ID.cutA1]);
    await switchTo(c, user(ID.ownerA));
    await move(a, ID.andre, at(0));
    await asSuperuser(c);
    expect((await row(a)).professional_id).toBe(ID.andre);
  });

  it("no se mueve a un profesional que no ofrece el servicio, de otro salón o inexistente", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await c.query("update public.appointments set service_id = $2 where id = $1", [a, ID.cutA1]);
    await c.query("delete from public.professional_services where professional_id = $1", [ID.andre]);
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => move(a, ID.andre, at(0)))).toMatch(/service_not_offered/);
    expect(await attemptMsg(c, () => move(a, ID.maria, at(0)))).toMatch(/not_found/); // profesional de otro salón
    expect(await attemptMsg(c, () => move(a, "00000000-0000-4000-8000-0000000009ff", at(0)))).toMatch(/not_found/);
  });

  it("no se mueve fuera del horario, a un día libre, ni a un cierre", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => move(a, null, `${TUE}T03:00:00Z`))).toMatch(/outside_working_hours/);
    // un miércoles Carlos no trabaja
    const wed = new Date(new Date(at(0)).getTime() + 86_400_000).toISOString();
    expect(await attemptMsg(c, () => move(a, null, wed))).toMatch(/outside_working_hours/);
    await asSuperuser(c);
    await c.query("insert into public.time_off (professional_id, starts_at, ends_at, created_by) values ($1, $2, $3, $4)", [ID.carlos, at(3), at(5), ID.ownerA]);
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => move(a, null, at(4)))).toMatch(/outside_working_hours/);
  });

  it("nunca choca con otra cita: ni del profesional ni del propio cliente", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: at(2) });
    // Juan tiene otra cita con Andre a otra hora
    await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: at(4) });
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => move(a, null, at(2, 15)))).toBe("23P01"); // choca con la cita de Ashley
    expect(await attemptMsg(c, () => move(a, null, at(1, 45)))).toBe("23P01"); // el tiempo entre servicios también cuenta
    expect(await attemptMsg(c, () => move(a, null, at(4)))).toBe("23P01"); // Juan no puede estar en dos sitios
    expect(await attemptMsg(c, () => move(a, null, at(1)))).toBeNull(); // justo en el hueco libre
  });

  it("no se mueve una cita ya empezada, hecha, cancelada, ni hacia el pasado", async () => {
    const started = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: new Date(Date.now() - 20 * 60_000).toISOString() });
    const done = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: at(0), status: "completed" });
    const cancelled = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: at(1), status: "cancelled" });
    const future = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(3) });
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => move(started, null, at(5)))).toMatch(/already_started/);
    expect(await attemptMsg(c, () => move(done, null, at(5)))).toMatch(/invalid_status/);
    expect(await attemptMsg(c, () => move(cancelled, null, at(5)))).toMatch(/invalid_status/);
    expect(await attemptMsg(c, () => move(future, null, new Date(Date.now() - 3_600_000).toISOString()))).toMatch(/too_soon/);
  });
});

describe("cambiar la duración", () => {
  it("alargar y acortar; el tiempo entre servicios se conserva y el precio no cambia", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await switchTo(c, user(ID.ownerA));
    await move(a, null, at(0), 60);
    await asSuperuser(c);
    let r = await row(a);
    expect(new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()).toBe(60 * 60_000);
    expect(new Date(r.blocked_until).getTime() - new Date(r.ends_at).getTime()).toBe(10 * 60_000);
    expect((await c.query("select price_cents from public.appointments where id = $1", [a])).rows[0].price_cents).toBe(2500);
    await switchTo(c, user(ID.ownerA));
    await move(a, null, at(0), 15);
    await asSuperuser(c);
    r = await row(a);
    expect(new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()).toBe(15 * 60_000);
  });

  it("no se puede alargar si choca con la cita siguiente, ni con duraciones absurdas", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: at(1) });
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => move(a, null, at(0), 60))).toBe("23P01");
    expect(await attemptMsg(c, () => move(a, null, at(0), 4))).toMatch(/invalid_duration/);
    expect(await attemptMsg(c, () => move(a, null, at(0), 481))).toMatch(/invalid_duration/);
  });
});

describe("reserva con varios servicios", () => {
  async function twoItems() {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    const g = await groupOf(a);
    const b = (
      await c.query(
        `insert into public.appointments (booking_group_id, salon_id, professional_id, customer_id, service_name_en, service_name_es, price_cents, starts_at, ends_at, blocked_until, status)
         values ($1, $2, $3, $4, 'Beard', 'Barba', 1500, $5::timestamptz, $5::timestamptz + interval '20 minutes', $5::timestamptz + interval '30 minutes', 'booked') returning id`,
        [g, ID.salonA1, ID.carlos, ID.juanA, at(0, 40)],
      )
    ).rows[0].id as string;
    return { a, b, g };
  }

  it("mover la hora arrastra toda la reserva y conserva el orden y los tiempos", async () => {
    const { a, b } = await twoItems();
    await switchTo(c, user(ID.ownerA));
    const r = (await move(b, null, at(2, 40))).rows[0].r; // arrastro la SEGUNDA cita +2 h
    expect(r.group_moved).toBe(true);
    await asSuperuser(c);
    expect(new Date((await row(a)).starts_at).toISOString()).toBe(new Date(at(2)).toISOString());
    expect(new Date((await row(b)).starts_at).toISOString()).toBe(new Date(at(2, 40)).toISOString());
  });

  it("cambiar de profesional o la duración modifica solo esa cita", async () => {
    const { a, b } = await twoItems();
    await switchTo(c, user(ID.ownerA));
    const r = (await move(b, ID.andre, at(0, 40))).rows[0].r;
    expect(r.group_moved).toBe(false);
    await asSuperuser(c);
    expect((await row(b)).professional_id).toBe(ID.andre);
    expect((await row(a)).professional_id).toBe(ID.carlos);
  });
});

describe("quién puede mover", () => {
  it("el profesional mueve la hora de SUS citas, pero no cambia de profesional ni toca las de otro", async () => {
    const mine = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    const others = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: at(0) });
    await switchTo(c, user(ID.carlosUser));
    expect(await attemptMsg(c, () => move(mine, null, at(2)))).toBeNull();
    expect(await attemptMsg(c, () => move(mine, ID.andre, at(4)))).toMatch(/forbidden|permission/i);
    expect(await attemptMsg(c, () => move(others, null, at(2)))).toMatch(/not_found/);
  });

  it("otro negocio, la pantalla Breeze Live, un extraño y un visitante no pueden", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    for (const w of [user(ID.ownerB), user(ID.displayA1), user(ID.stranger), user(ID.adminA2)]) {
      await switchTo(c, w);
      expect(await attemptMsg(c, () => move(a, null, at(2)))).toMatch(/not_found/);
    }
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => move(a, null, at(2)))).toMatch(/permission denied/);
  });
});

describe("avisar al cliente", () => {
  it("con «avisar» se crea el mensaje de cambio una sola vez, aunque se mueva dos veces", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    const g = await groupOf(a);
    await switchTo(c, user(ID.ownerA));
    await move(a, null, at(2), null, true);
    await move(a, null, at(3), null, true);
    await asSuperuser(c);
    expect(await jobs(g)).toBe(1);
  });

  it("sin «avisar» no se crea el mensaje de cambio, pero los recordatorios se recalculan con la hora nueva", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    const g = await groupOf(a);
    await switchTo(c, user(ID.ownerA));
    await move(a, null, at(2), null, false);
    await asSuperuser(c);
    expect(await jobs(g)).toBe(0);
    const reminders = (await c.query("select scheduled_for from public.notification_jobs where booking_group_id = $1 and kind = 'reminder' and status = 'pending'", [g])).rows;
    for (const r of reminders) expect(new Date(r.scheduled_for).getTime()).toBeLessThan(new Date(at(2)).getTime());
  });

  it("cambiar solo de profesional (misma hora) también avisa", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    const g = await groupOf(a);
    await switchTo(c, user(ID.ownerA));
    await move(a, ID.andre, at(0), null, true);
    await asSuperuser(c);
    expect(await jobs(g)).toBe(1);
  });

  it("la marca de «no avisar» no se queda puesta para la siguiente operación", async () => {
    const a = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at(0) });
    const g = await groupOf(a);
    await switchTo(c, user(ID.ownerA));
    await move(a, null, at(2), null, false);
    await move(a, null, at(3), null, true);
    await asSuperuser(c);
    expect(await jobs(g)).toBe(1);
  });
});
