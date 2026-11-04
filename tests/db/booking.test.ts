/**
 * Módulo 3: reservar, reprogramar, cancelar y marcar citas SOLO vía RPC.
 * Las fechas se calculan respecto a "ahora" para respetar antelación mínima y máxima.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { addDaysKey, atLocal, localDateKey, weekdayOf } from "../../src/lib/time";
import { ID, anon, asSuperuser, attempt, attemptMsg, book, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

/** Próximo miércoles (hora de TCI) con al menos 2 días de margen. */
function nextWednesday(): string {
  let k = addDaysKey(localDateKey(new Date()), 2);
  while (weekdayOf(k) !== 3) k = addDaysKey(k, 1);
  return k;
}
const DAY = nextWednesday();
const at = (hhmm: string, day = DAY) => atLocal(day, hhmm).toISOString();

const CUT = ID.cutA1; // 30 min + 10 buffer, A1
let BEARD: string; // 20 min + 5 buffer, A1, solo Carlos

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  // Preparación (superusuario): suscripciones, horarios L–S 09:00–18:00 para Carlos y Andre, un servicio extra.
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at)
     values ($1, 'studio', 'trialing', now() + interval '10 days'), ($2, 'solo', 'active', null)
     on conflict (organization_id) do update set status = excluded.status, trial_ends_at = excluded.trial_ends_at`,
    [ID.orgA, ID.orgB],
  );
  await c.query("delete from public.working_hours where professional_id in ($1, $2)", [ID.carlos, ID.andre]);
  await c.query(
    `insert into public.working_hours (professional_id, weekday, start_time, end_time)
     select p, d, '09:00', '18:00' from unnest($1::uuid[]) p, generate_series(1, 6) d`,
    [[ID.carlos, ID.andre]],
  );
  BEARD = (
    await c.query(
      `insert into public.services (salon_id, category_code, name_en, name_es, duration_min, buffer_min, price_cents)
       values ($1, 'beard', 'Beard trim', 'Arreglo de barba', 20, 5, 1500) returning id`,
      [ID.salonA1],
    )
  ).rows[0].id;
  await c.query("insert into public.professional_services (professional_id, service_id, salon_id) values ($1, $2, $3)", [ID.carlos, BEARD, ID.salonA1]);
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const guest = { first_name: "Ashley", last_name: "Taylor", phone: "649 555 0001", locale: "en" };
const item = (service: string, pro: string) => ({ service_id: service, professional_id: pro });
const bookRpc = (items: object[], start: string, g: object | null = guest) =>
  c.query("select public.book_appointment($1, $2::jsonb, $3::timestamptz, $4::jsonb) as r", [ID.salonA1, JSON.stringify(items), start, g ? JSON.stringify(g) : null]);

describe("reservar", () => {
  it("un invitado reserva: recibe un enlace de un solo uso y la cita guarda solo 'Nombre I.'", async () => {
    await switchTo(c, anon);
    const r = (await bookRpc([item(CUT, ID.carlos)], at("10:00"))).rows[0].r;
    expect(r.guest_token).toMatch(/^[0-9a-f]{64}$/);
    const g = (await c.query("select public.get_guest_booking($1) as g", [r.guest_token])).rows[0].g;
    expect(g.customer_display).toBe("Ashley T.");
    expect(g.items).toHaveLength(1);
    expect(g.items[0].professional).toMatchObject({ public_name: "Carlos M.", initials: "CM" });
    expect(JSON.stringify(g)).not.toContain("649"); // nunca el teléfono
    expect(g.can_change).toBe(true);
    // Reutiliza la ficha de invitado existente (mismo teléfono en la organización)
    await asSuperuser(c);
    const n = await c.query("select count(*)::int n from public.customers where organization_id = $1 and phone = '+16495550001'", [ID.orgA]);
    expect(n.rows[0].n).toBe(1);
  });

  it("un cliente con cuenta reserva con su ficha (sin enlace de invitado)", async () => {
    await switchTo(c, user(ID.juanUser));
    const r = (await bookRpc([item(CUT, ID.andre)], at("11:00"), null)).rows[0].r;
    expect(r.guest_token).toBeNull();
    const mine = (await c.query("select public.my_bookings() as b")).rows[0].b;
    expect(mine.map((b: { booking_group_id: string }) => b.booking_group_id)).toContain(r.booking_group_id);
    await asSuperuser(c);
    expect((await c.query("select customer_id from public.booking_groups where id = $1", [r.booking_group_id])).rows[0].customer_id).toBe(ID.juanA);
  });

  it("un usuario nuevo obtiene ficha de cliente desde su perfil; sin teléfono se le pide", async () => {
    const lucia = await createAuthUser(c, { email: "lucia@example.com", meta: { full_name: "Lucía Fernández", phone: "649 555 9999" } });
    const nophone = await createAuthUser(c, { email: "nophone@example.com", meta: { full_name: "Sin Teléfono" } });
    await switchTo(c, user(lucia));
    await bookRpc([item(CUT, ID.andre)], at("12:00"), null);
    await asSuperuser(c);
    const cust = await c.query("select first_name, last_name, phone from public.customers where user_id = $1", [lucia]);
    expect(cust.rows[0]).toEqual({ first_name: "Lucía", last_name: "Fernández", phone: "+16495559999" });
    await switchTo(c, user(nophone));
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.andre)], at("13:00"), null))).toBe("phone_required");
  });

  it("varios servicios se encadenan: el segundo empieza al terminar el primero + su buffer", async () => {
    await switchTo(c, anon);
    const r = (await bookRpc([item(CUT, ID.carlos), item(BEARD, ID.carlos)], at("10:00"))).rows[0].r;
    await asSuperuser(c);
    const rows = (
      await c.query("select starts_at, ends_at, blocked_until from public.appointments where booking_group_id = $1 order by starts_at", [r.booking_group_id])
    ).rows;
    expect(rows[0].ends_at.toISOString()).toBe(at("10:30"));
    expect(rows[1].starts_at.toISOString()).toBe(at("10:40")); // 10:30 + 10 min de limpieza
    expect(rows[1].blocked_until.toISOString()).toBe(at("11:05"));
  });

  it("★ dos personas no pueden reservar el mismo hueco (23P01 desde la RPC)", async () => {
    await switchTo(c, anon);
    await bookRpc([item(CUT, ID.carlos)], at("15:00"));
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("15:20"), { ...guest, phone: "649 555 0002" }))).toBe("23P01");
  });

  it("rechaza fuera de horario, en días libres, en cierres y en domingo", async () => {
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("17:40")))).toBe("outside_working_hours"); // 17:40+40 > 18:00
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("08:30")))).toBe("outside_working_hours");
    let sunday = DAY;
    while (weekdayOf(sunday) !== 0) sunday = addDaysKey(sunday, 1);
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("10:00", sunday)))).toBe("outside_working_hours");

    await asSuperuser(c);
    await c.query("insert into public.time_off (professional_id, starts_at, ends_at) values ($1, $2, $3)", [ID.carlos, at("12:00"), at("14:00")]);
    await c.query("insert into public.salon_closures (salon_id, starts_at, ends_at) values ($1, $2, $3)", [ID.salonA1, at("16:00"), at("18:00")]);
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("13:30")))).toBe("outside_working_hours");
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.andre)], at("16:30")))).toBe("outside_working_hours");
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.andre)], at("13:30")))).toBeNull(); // Andre no tiene libre
  });

  it("respeta la antelación mínima y máxima del salón", async () => {
    await switchTo(c, anon);
    const in30min = new Date(Date.now() + 30 * 60_000).toISOString();
    const in90days = new Date(Date.now() + 90 * 86_400_000).toISOString();
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], in30min))).toBe("too_soon");
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], in90days))).toBe("too_far");
  });

  it("rechaza servicios que el profesional no ofrece o de otra sucursal", async () => {
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => bookRpc([item(BEARD, ID.andre)], at("10:00")))).toBe("service_not_offered");
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.maria)], at("10:00")))).toBe("invalid_items");
    expect(await attemptMsg(c, () => bookRpc([], at("10:00")))).toBe("invalid_items");
  });

  it("no se puede reservar en un salón sin publicar, suspendido o con el pago vencido hace más de 14 días", async () => {
    for (const setup of [
      "update public.salons set is_published = false where id = $1",
      "update public.subscriptions set status = 'suspended' where organization_id = (select organization_id from public.salons where id = $1)",
      "update public.subscriptions set trial_ends_at = now() - interval '15 days' where organization_id = (select organization_id from public.salons where id = $1)",
    ]) {
      await c.query("savepoint s");
      await asSuperuser(c);
      await c.query(setup, [ID.salonA1]);
      await switchTo(c, anon);
      expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("10:00")))).toBe("salon_not_bookable");
      await c.query("rollback to savepoint s");
    }
  });

  it("con la prueba o el pago vencido hace pocos días aún se puede reservar (periodo de gracia)", async () => {
    await asSuperuser(c);
    await c.query(
      "update public.subscriptions set trial_ends_at = now() - interval '5 days', status = 'past_due' where organization_id = (select organization_id from public.salons where id = $1)",
      [ID.salonA1],
    );
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("10:00")))).toBeNull();
  });

  it("un invitado (sin verificar) puede tener como máximo 2 reservas futuras", async () => {
    await switchTo(c, anon);
    await bookRpc([item(CUT, ID.carlos)], at("10:00"));
    await bookRpc([item(CUT, ID.carlos)], at("11:00"));
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("12:00")))).toBe("guest_limit");
  });

  it("si el salón lo activa, un cliente con 2 ausencias no puede reservar en línea", async () => {
    await asSuperuser(c);
    await c.query("update public.salons set no_show_block_enabled = true where id = $1", [ID.salonA1]);
    await c.query("update public.customers set no_show_count = 2 where id = $1", [ID.juanA]);
    await switchTo(c, user(ID.juanUser));
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("10:00"), null))).toBe("customer_blocked");
  });
});

describe("cancelar", () => {
  it("el invitado cancela con su enlace dentro de la ventana; un enlace falso no sirve", async () => {
    await switchTo(c, anon);
    const r = (await bookRpc([item(CUT, ID.carlos), item(BEARD, ID.carlos)], at("10:00"))).rows[0].r;
    expect((await c.query("select public.cancel_by_guest_token($1, 'Cambio de planes') as n", [r.guest_token])).rows[0].n).toBe(2);
    expect(await attemptMsg(c, () => c.query("select public.cancel_by_guest_token($1)", [r.guest_token]))).toBe("nothing_to_cancel");
    expect(await attemptMsg(c, () => c.query("select public.cancel_by_guest_token('falso')"))).toBe("not_found");
    // El hueco queda libre de nuevo
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.carlos)], at("10:00"), { ...guest, phone: "649 555 0003" }))).toBeNull();
  });

  it("fuera de la ventana el cliente no puede cancelar, pero el salón sí", async () => {
    await asSuperuser(c);
    await c.query("update public.salons set min_lead_time_min = 0 where id = $1", [ID.salonA1]);
    // Cita dentro de las próximas 24 h, creada directamente
    const soon = new Date(Date.now() + 3 * 3_600_000);
    const apptId = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: soon.toISOString() });
    const group = (await c.query("select booking_group_id g from public.appointments where id = $1", [apptId])).rows[0].g;

    await switchTo(c, user(ID.juanUser));
    expect(await attemptMsg(c, () => c.query("select public.cancel_booking($1)", [group]))).toBe("outside_change_window");
    await switchTo(c, user(ID.stranger));
    expect(await attemptMsg(c, () => c.query("select public.cancel_booking($1)", [group]))).toBe("not_found");
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("select public.cancel_booking($1, 'Cliente llamó') as n", [group])).rows[0].n).toBe(1);
  });
});

describe("reprogramar", () => {
  it("mueve una reserva de 2 servicios 20 min más tarde aunque se solape consigo misma", async () => {
    await switchTo(c, anon);
    const r = (await bookRpc([item(CUT, ID.carlos), item(BEARD, ID.carlos)], at("10:00"))).rows[0].r;
    await c.query("select public.reschedule_by_guest_token($1, $2)", [r.guest_token, at("10:20")]);
    const g = (await c.query("select public.get_guest_booking($1) as g", [r.guest_token])).rows[0].g;
    expect(g.items.map((i: { starts_at: string }) => new Date(i.starts_at).toISOString())).toEqual([at("10:20"), at("11:00")]);
    await asSuperuser(c);
    const ev = await c.query("select count(*)::int n from public.appointment_events where type = 'rescheduled' and appointment_id = any($1::uuid[])", [r.appointment_ids]);
    expect(ev.rows[0].n).toBe(2);
  });

  it("★ no se puede reprogramar encima de otra persona (23P01) y la reserva queda intacta", async () => {
    await switchTo(c, anon);
    const mine = (await bookRpc([item(CUT, ID.carlos)], at("10:00"))).rows[0].r;
    await bookRpc([item(CUT, ID.carlos)], at("14:00"), { ...guest, phone: "649 555 0004" });
    expect(await attemptMsg(c, () => c.query("select public.reschedule_by_guest_token($1, $2)", [mine.guest_token, at("14:15")]))).toBe("23P01");
    const g = (await c.query("select public.get_guest_booking($1) as g", [mine.guest_token])).rows[0].g;
    expect(new Date(g.items[0].starts_at).toISOString()).toBe(at("10:00"));
  });

  it("reprogramar respeta el horario del profesional", async () => {
    await switchTo(c, anon);
    const r = (await bookRpc([item(CUT, ID.carlos)], at("10:00"))).rows[0].r;
    expect(await attemptMsg(c, () => c.query("select public.reschedule_by_guest_token($1, $2)", [r.guest_token, at("19:00")]))).toBe("outside_working_hours");
  });
});

describe("citas creadas por el salón", () => {
  const staff = (items: object[], start: string, customer: object, allow = false) =>
    c.query("select public.staff_create_appointment($1, $2::jsonb, $3::timestamptz, $4::jsonb, 'phone', $5) as r", [
      ID.salonA1, JSON.stringify(items), start, JSON.stringify(customer), allow,
    ]);

  it("el dueño agenda una cita por teléfono para un cliente nuevo y bloquea el hueco", async () => {
    await switchTo(c, user(ID.ownerA));
    const r = (await staff([item(CUT, ID.andre)], at("10:00"), { first_name: "Kevin", last_name: "Smith", phone: "555-0100" })).rows[0].r;
    expect(r.booking_group_id).toBeTruthy();
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => bookRpc([item(CUT, ID.andre)], at("10:15")))).toBe("23P01");
  });

  it("puede agendar fuera de horario solo si lo indica expresamente", async () => {
    await switchTo(c, user(ID.ownerA));
    const cust = { customer_id: ID.ashleyA };
    expect(await attemptMsg(c, () => staff([item(CUT, ID.andre)], at("19:00"), cust))).toBe("outside_working_hours");
    expect(await attemptMsg(c, () => staff([item(CUT, ID.andre)], at("19:00"), cust, true))).toBeNull();
  });

  it("un profesional solo puede agendarse a sí mismo; anónimos y otros salones no pueden", async () => {
    await switchTo(c, user(ID.carlosUser));
    expect(await attemptMsg(c, () => staff([item(CUT, ID.carlos)], at("10:00"), { customer_id: ID.juanA }))).toBeNull();
    expect(await attemptMsg(c, () => staff([item(CUT, ID.andre)], at("11:00"), { customer_id: ID.juanA }))).toBe("forbidden");
    await switchTo(c, user(ID.ownerB));
    expect(await attemptMsg(c, () => staff([item(CUT, ID.andre)], at("12:00"), { customer_id: ID.juanA }))).toBe("forbidden");
    await switchTo(c, anon);
    expect(await attempt(c, () => staff([item(CUT, ID.andre)], at("12:00"), { customer_id: ID.juanA }))).toBe("42501");
  });
});

describe("completada / no-show", () => {
  it("un no-show suma ausencias y bloquea al cliente si el salón lo activó", async () => {
    await asSuperuser(c);
    await c.query("update public.salons set no_show_block_enabled = true, no_show_threshold = 1 where id = $1", [ID.salonA1]);
    const past = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: new Date(Date.now() - 3_600_000).toISOString() });
    const future = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: at("10:00") });

    await switchTo(c, user(ID.juanUser));
    expect(await attemptMsg(c, () => c.query("select public.mark_appointment($1, 'no_show')", [past]))).toBe("not_found");
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.mark_appointment($1, 'no_show')", [future]))).toBe("not_started");
    await c.query("select public.mark_appointment($1, 'no_show')", [past]);
    await asSuperuser(c);
    expect((await c.query("select no_show_count, is_blocked from public.customers where id = $1", [ID.ashleyA])).rows[0]).toEqual({
      no_show_count: 1,
      is_blocked: true,
    });
  });
});

describe("disponibilidad pública", () => {
  it("devuelve horarios y rangos ocupados sin datos de clientes", async () => {
    await asSuperuser(c);
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: at("10:00") });
    await switchTo(c, anon);
    const s = (await c.query("select public.get_public_schedule($1, $2, $3) as s", [ID.salonA1, at("00:00"), at("23:59")])).rows[0].s;
    expect(s.timezone).toBe("America/Grand_Turk");
    expect(s.professionals.map((p: { id: string }) => p.id).sort()).toEqual([ID.carlos, ID.andre].sort());
    expect(s.busy).toEqual([{ professional_id: ID.carlos, start: expect.any(String), end: expect.any(String) }]);
    expect(new Date(s.busy[0].end).toISOString()).toBe(at("10:40")); // incluye el buffer
    expect(JSON.stringify(s)).not.toMatch(/Juan|Pérez|649/);
  });

  it("un salón sin publicar no expone su agenda", async () => {
    await asSuperuser(c);
    await c.query("update public.salons set is_published = false where id = $1", [ID.salonA1]);
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => c.query("select public.get_public_schedule($1, now(), now() + interval '1 day')", [ID.salonA1]))).toBe("not_found");
  });
});
