/**
 * ★ Regla no negociable: PROHIBIDO el doble booking, garantizado por la base de datos
 *   (exclusion constraint `appointments_no_double_booking`), no por el frontend.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, attempt, book, makePool, pgError } from "./support/db";

const pool = makePool(12);
afterAll(() => pool.end());

// Martes 10 de noviembre de 2026 en hora de Turks and Caicos (UTC-5 en noviembre).
const AT = (hhmm: string) => `2026-11-10T${hhmm}:00-05:00`;

describe("exclusion constraint: un profesional, una cita a la vez", () => {
  let c: pg.PoolClient;
  beforeEach(async () => {
    c = await pool.connect();
    await c.query("begin");
  });
  afterEach(async () => {
    await c.query("rollback");
    c.release();
  });

  const base = { salon: ID.salonA1, professional: ID.carlos };

  it("rechaza una cita que se solapa con otra del mismo profesional (23P01)", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00") }); // 15:00–15:30 (+10 buffer)
    const code = await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: AT("15:15") }));
    expect(code).toBe("23P01");
  });

  it("rechaza una cita que cae dentro del buffer de limpieza de la anterior", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00"), minutes: 30, buffer: 10 }); // bloquea hasta 15:40
    const code = await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: AT("15:35") }));
    expect(code).toBe("23P01");
  });

  it("permite citas consecutivas justo en el borde (rango semiabierto [inicio, fin))", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00"), minutes: 30, buffer: 10 }); // hasta 15:40
    const code = await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: AT("15:40") }));
    expect(code).toBeNull();
  });

  it("rechaza una cita que envuelve completamente a otra", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00"), minutes: 20, buffer: 0 });
    const code = await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: AT("14:30"), minutes: 90 }));
    expect(code).toBe("23P01");
  });

  it("una cita CANCELADA libera el hueco", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00"), status: "cancelled" });
    const code = await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: AT("15:00") }));
    expect(code).toBeNull();
  });

  it("completadas y no-show siguen ocupando el hueco (no se puede reescribir el pasado)", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("10:00"), status: "no_show" });
    expect(await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: AT("10:00") }))).toBe("23P01");
  });

  it("cancelar una cita y volver a activarla falla si el hueco ya se ocupó", async () => {
    const first = await book(c, { ...base, customer: ID.juanA, start: AT("16:00") });
    await c.query("update public.appointments set status = 'cancelled', cancelled_at = now() where id = $1", [first]);
    await book(c, { ...base, customer: ID.ashleyA, start: AT("16:00") });
    const code = await attempt(c, () =>
      c.query("update public.appointments set status = 'booked', cancelled_at = null where id = $1", [first]),
    );
    expect(code).toBe("23P01");
  });

  it("reprogramar encima de otra cita falla", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("11:00") });
    const other = await book(c, { ...base, customer: ID.ashleyA, start: AT("12:00") });
    const code = await attempt(c, () =>
      c.query(
        `update public.appointments
            set starts_at = $2::timestamptz, ends_at = $2::timestamptz + interval '30 min',
                blocked_until = $2::timestamptz + interval '40 min'
          where id = $1`,
        [other, AT("11:15")],
      ),
    );
    expect(code).toBe("23P01");
  });

  it("dos profesionales distintos SÍ pueden atender a la misma hora", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00") });
    const code = await attempt(c, () => book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: AT("15:00") }));
    expect(code).toBeNull();
  });

  it("el mismo cliente no puede estar en dos servicios a la vez (multi-servicio va en secuencia)", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00") });
    const code = await attempt(c, () => book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: AT("15:10") }));
    expect(code).toBe("23P01");
  });

  it("multi-servicio en secuencia para el mismo cliente sí se permite", async () => {
    await book(c, { ...base, customer: ID.juanA, start: AT("15:00"), minutes: 30, buffer: 10 }); // termina 15:30
    // El cliente queda libre a las 15:30 (su solape se mide sin buffer); otro profesional lo atiende.
    const code = await attempt(c, () => book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: AT("15:30") }));
    expect(code).toBeNull();
  });

  it("también protege a través del cambio de hora (DST): 1 nov 2026, 01:00–02:00 se repite", async () => {
    // 01:30 EDT (UTC-4) y 01:30 EST (UTC-5) son instantes DISTINTOS separados 1 hora.
    await book(c, { ...base, customer: ID.juanA, start: "2026-11-01T01:30:00-04:00", minutes: 30, buffer: 0 });
    expect(await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: "2026-11-01T01:30:00-05:00", minutes: 30, buffer: 0 }))).toBeNull();
    expect(await attempt(c, () => book(c, { ...base, customer: ID.ashleyA, start: "2026-11-01T01:45:00-04:00", minutes: 30, buffer: 0 }))).toBe("23P01");
  });
});

describe("concurrencia real: varias personas reservan el mismo hueco a la vez", () => {
  const SLOT = "2026-12-01T10:00:00-05:00";

  afterAll(async () => {
    await pool.query(
      `delete from public.booking_groups bg using public.appointments a
        where a.booking_group_id = bg.id and a.starts_at >= '2026-12-01' and a.starts_at < '2026-12-02'`,
    );
  });

  it("de 10 intentos simultáneos sobre el mismo hueco, exactamente 1 gana", async () => {
    const attempts = Array.from({ length: 10 }, (_, i) =>
      pgError(
        (async () => {
          const c = await pool.connect();
          try {
            await c.query("begin");
            // Clientes distintos para que solo actúe la regla del profesional.
            await book(c, { salon: ID.salonA1, professional: ID.andre, customer: i % 2 ? ID.juanA : ID.ashleyA, start: SLOT });
            await c.query("commit");
          } catch (e) {
            await c.query("rollback");
            throw e;
          } finally {
            c.release();
          }
        })(),
      ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => r !== null).every((r) => r === "23P01")).toBe(true);

    const { rows } = await pool.query(
      "select count(*)::int as n from public.appointments where professional_id = $1 and starts_at = $2 and status <> 'cancelled'",
      [ID.andre, SLOT],
    );
    expect(rows[0].n).toBe(1);
  });

  it("la segunda transacción espera a la primera y falla cuando esta confirma", async () => {
    const slot = "2026-12-01T14:00:00-05:00";
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query("begin");
      await c2.query("begin");
      await book(c1, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: slot });
      const second = pgError(book(c2, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: slot }));
      await new Promise((r) => setTimeout(r, 150)); // c2 queda bloqueada esperando a c1
      await c1.query("commit");
      expect(await second).toBe("23P01");
    } finally {
      await c2.query("rollback").catch(() => {});
      c1.release();
      c2.release();
    }
  });
});
