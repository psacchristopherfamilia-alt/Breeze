/** Reglas de integridad del esquema: tenencia, colores, categorías, privacidad y auditoría. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, attempt, book, makePool } from "./support/db";

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

describe("tenencia", () => {
  it("una cita no puede usar un profesional de otra sucursal", async () => {
    // Marcus es de B1; intentamos meterlo en una cita de A1.
    expect(await attempt(c, () => book(c, { salon: ID.salonA1, professional: ID.marcus, customer: ID.juanA, start: "2027-02-02T10:00:00-05:00" }))).toBe("23503");
  });

  it("una reserva no puede mezclar un cliente de otra organización", async () => {
    // juanB pertenece a la organización B; la sucursal A1 es de A.
    expect(await attempt(c, () => book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanB, start: "2027-02-02T10:00:00-05:00" }))).toBe("23503");
  });

  it("un profesional no puede ofrecer un servicio de otra sucursal", async () => {
    const code = await attempt(c, () =>
      c.query("insert into public.professional_services (professional_id, service_id, salon_id) values ($1, $2, $3)", [
        ID.maria, ID.cutA1, ID.salonA2,
      ]),
    );
    expect(code).toBe("23503");
  });
});

describe("profesionales y catálogo", () => {
  it("el color es único por sucursal entre profesionales activos", async () => {
    const insert = (salon: string, color: string) =>
      c.query("insert into public.professionals (salon_id, first_name, last_name, color_hex) values ($1, 'Test', 'Pro', $2)", [salon, color]);
    expect(await attempt(c, () => insert(ID.salonA1, "#2563EB"))).toBe("23505"); // azul ya es de Carlos
    expect(await attempt(c, () => insert(ID.salonA2, "#2563EB"))).toBeNull(); // en otra sucursal sí se puede
  });

  it("al desactivar un profesional su color queda libre", async () => {
    await c.query("update public.professionals set is_active = false where id = $1", [ID.carlos]);
    expect(
      await attempt(c, () => c.query("insert into public.professionals (salon_id, first_name, color_hex) values ($1, 'Nuevo', '#2563EB')", [ID.salonA1])),
    ).toBeNull();
  });

  it("el color debe ser un hex válido en mayúsculas", async () => {
    expect(await attempt(c, () => c.query("insert into public.professionals (salon_id, first_name, color_hex) values ($1, 'X', 'blue')", [ID.salonA1]))).toBe("23514");
  });

  it("nombre público e iniciales se calculan en la BD", async () => {
    const r = await c.query("select public_name, initials from public.professionals where id = $1", [ID.carlos]);
    expect(r.rows[0]).toEqual({ public_name: "Carlos M.", initials: "CM" });
  });

  it("una barbería no puede crear servicios de spa (categoría fuera de su tipo)", async () => {
    const code = await attempt(c, () =>
      c.query(
        `insert into public.services (salon_id, category_code, name_en, name_es, duration_min, price_cents)
         values ($1, 'massage', 'Massage', 'Masaje', 60, 9000)`,
        [ID.salonA1],
      ),
    );
    expect(code).toBe("23514");
  });

  it("hay 15 categorías en 3 tipos de negocio y 3 planes", async () => {
    const cats = await c.query("select business_type, count(*)::int n from public.service_categories group by 1 order by 1");
    expect(cats.rows).toEqual([
      { business_type: "barbershop", n: 4 },
      { business_type: "salon", n: 6 },
      { business_type: "spa", n: 5 },
    ]);
    const plans = await c.query("select code, monthly_price_cents from public.plans order by sort_order");
    expect(plans.rows).toEqual([
      { code: "solo", monthly_price_cents: 2900 },
      { code: "studio", monthly_price_cents: 5900 },
      { code: "salon", monthly_price_cents: 9900 },
    ]);
  });
});

describe("citas: privacidad y auditoría", () => {
  it("customer_display guarda solo 'Nombre I.' para pantallas públicas", async () => {
    const id = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-02-02T10:00:00-05:00" });
    const r = await c.query("select customer_display from public.appointments where id = $1", [id]);
    expect(r.rows[0].customer_display).toBe("Juan P.");
  });

  it("cada cambio de una cita queda en el historial", async () => {
    const id = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-02-02T10:00:00-05:00" });
    await c.query(
      `update public.appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour',
              blocked_until = blocked_until + interval '1 hour' where id = $1`,
      [id],
    );
    await c.query("update public.appointments set status = 'cancelled', cancelled_at = now() where id = $1", [id]);
    const r = await c.query("select type from public.appointment_events where appointment_id = $1 order by id", [id]);
    expect(r.rows.map((x) => x.type)).toEqual(["created", "rescheduled", "cancelled"]);
  });

  it("una cita cancelada debe tener fecha de cancelación (y viceversa)", async () => {
    const id = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-02-02T10:00:00-05:00" });
    expect(await attempt(c, () => c.query("update public.appointments set status = 'cancelled' where id = $1", [id]))).toBe("23514");
  });

  it("fin anterior al inicio no se permite", async () => {
    expect(await attempt(c, () => book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-02-02T10:00:00-05:00", minutes: 0 }))).toBe("23514");
  });

  it("el teléfono del cliente debe estar en formato internacional E.164", async () => {
    expect(
      await attempt(c, () =>
        c.query("insert into public.customers (organization_id, first_name, phone) values ($1, 'Ana', '649-555-1234')", [ID.orgA]),
      ),
    ).toBe("23514");
  });
});
