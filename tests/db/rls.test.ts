/**
 * Aislamiento entre salones con Row Level Security: un salón jamás ve datos de otro,
 * un profesional solo ve su agenda, y lo público nunca expone teléfono, correo ni apellido.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, anon, as, asSuperuser, attempt, book, makePool, switchTo, user } from "./support/db";

const pool = makePool();
/** El catálogo público solo muestra negocios que pueden recibir reservas: les damos plan activo (se deshace con la transacción). */
async function withActivePlans(c: pg.PoolClient) {
  await asSuperuser(c);
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, current_period_end)
     values ($1, 'studio', 'active', now() + interval '20 days'), ($2, 'solo', 'active', now() + interval '20 days')
     on conflict (organization_id) do update set status = excluded.status, current_period_end = excluded.current_period_end`,
    [ID.orgA, ID.orgB],
  );
  await switchTo(c, anon);
}

const DAY = "2027-01-12"; // martes
const apps: Record<string, string> = {};

beforeAll(async () => {
  const c = await pool.connect();
  try {
    apps.carlosJuan = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: `${DAY}T10:00:00-05:00` });
    apps.andreAshley = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: `${DAY}T10:00:00-05:00` });
    apps.mariaJuan = await book(c, { salon: ID.salonA2, professional: ID.maria, customer: ID.juanA, start: `${DAY}T12:00:00-05:00` });
    apps.marcusJuan = await book(c, { salon: ID.salonB1, professional: ID.marcus, customer: ID.juanB, start: `${DAY}T15:00:00-05:00` });
  } finally {
    c.release();
  }
});
afterAll(async () => {
  await pool.query(`delete from public.booking_groups bg using public.appointments a
                     where a.booking_group_id = bg.id and a.starts_at::date = $1`, [DAY]);
  await pool.end();
});

const visibleAppointments = (c: { query: Function }) =>
  (c.query("select id from public.appointments where starts_at::date = $1", [DAY]) as Promise<{ rows: { id: string }[] }>)
    .then((r) => r.rows.map((x) => x.id).sort());

describe("aislamiento entre organizaciones", () => {
  it("el dueño de A ve las citas de sus 2 sucursales y NINGUNA de B", async () => {
    const ids = await as(pool, user(ID.ownerA), visibleAppointments);
    expect(ids).toEqual([apps.carlosJuan, apps.andreAshley, apps.mariaJuan].sort());
  });

  it("el dueño de B solo ve las de B", async () => {
    expect(await as(pool, user(ID.ownerB), visibleAppointments)).toEqual([apps.marcusJuan]);
  });

  it("el dueño de A no ve clientes, profesionales privados ni horarios de B", async () => {
    await as(pool, user(ID.ownerA), async (c) => {
      const customers = await c.query("select organization_id from public.customers");
      expect(customers.rows.every((r) => r.organization_id === ID.orgA)).toBe(true);
      expect(customers.rowCount).toBe(2);
      const hours = await c.query("select professional_id from public.working_hours");
      expect(hours.rows.map((r) => r.professional_id)).toEqual([ID.carlos]);
      const orgs = await c.query("select id from public.organizations");
      expect(orgs.rows.map((r) => r.id)).toEqual([ID.orgA]);
      const members = await c.query("select organization_id from public.memberships");
      expect(members.rows.every((r) => r.organization_id === ID.orgA)).toBe(true);
    });
  });

  it("el dueño de A no puede crear servicios ni profesionales en un salón de B", async () => {
    await as(pool, user(ID.ownerA), async (c) => {
      const code = await attempt(c, () =>
        c.query(
          `insert into public.services (salon_id, category_code, name_en, name_es, duration_min, price_cents)
           values ($1, 'cuts', 'Hack', 'Hack', 30, 100)`,
          [ID.salonB1],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("el dueño de A no puede modificar el salón de B (0 filas afectadas)", async () => {
    await as(pool, user(ID.ownerA), async (c) => {
      const r = await c.query("update public.salons set name = 'Hacked' where id = $1", [ID.salonB1]);
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("roles dentro de una organización", () => {
  it("el admin de la sucursal A2 solo ve las citas de A2", async () => {
    expect(await as(pool, user(ID.adminA2), visibleAppointments)).toEqual([apps.mariaJuan]);
  });

  it("el admin de A2 no puede crear otro admin ni tocar A1", async () => {
    await as(pool, user(ID.adminA2), async (c) => {
      expect(
        await attempt(c, () =>
          c.query(
            "insert into public.memberships (user_id, organization_id, salon_id, role) values ($1, $2, $3, 'admin')",
            [ID.stranger, ID.orgA, ID.salonA2],
          ),
        ),
      ).toBe("42501");
      const r = await c.query("update public.salons set name = 'X' where id = $1", [ID.salonA1]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("el profesional (Carlos) ve SOLO su agenda, no la de Andre", async () => {
    expect(await as(pool, user(ID.carlosUser), visibleAppointments)).toEqual([apps.carlosJuan]);
  });

  it("el profesional ve a los clientes que atiende y a nadie más", async () => {
    await as(pool, user(ID.carlosUser), async (c) => {
      const r = await c.query("select id from public.customers");
      expect(r.rows.map((x) => x.id)).toEqual([ID.juanA]);
    });
  });

  it("la pantalla Breeze Live (display) no puede leer citas ni clientes directamente", async () => {
    await as(pool, user(ID.displayA1), async (c) => {
      expect(await visibleAppointments(c)).toEqual([]);
      expect((await c.query("select id from public.customers")).rowCount).toBe(0);
      // Sí ve a los profesionales de su sucursal (para las columnas).
      const pros = await c.query("select id from public.professionals where salon_id = $1", [ID.salonA1]);
      expect(pros.rowCount).toBe(2);
    });
  });

  it("solo el dueño ve la suscripción y la facturación", async () => {
    await pool.query(
      `insert into public.subscriptions (organization_id, plan_code) values ($1, 'studio') on conflict do nothing`,
      [ID.orgA],
    );
    expect((await as(pool, user(ID.ownerA), (c) => c.query("select 1 from public.subscriptions"))).rowCount).toBe(1);
    expect((await as(pool, user(ID.adminA2), (c) => c.query("select 1 from public.subscriptions"))).rowCount).toBe(0);
  });
});

describe("facturación: solo por RPC", () => {
  it("los datos de pago de Breeze (platform_settings) no se leen ni se escriben directamente", async () => {
    for (const who of [anon, user(ID.ownerA), user(ID.stranger)]) {
      await as(pool, who, async (c) => {
        expect(await attempt(c, () => c.query("select * from public.platform_settings"))).toBe("42501");
        expect(await attempt(c, () => c.query("update public.platform_settings set payee_name = 'x'"))).toBe("42501");
        expect(await attempt(c, () => c.query("insert into public.platform_settings (id) values (false)"))).toBe("42501");
      });
    }
  });

  it("el dueño no puede crear ni cambiar facturas ni pagos; el administrador de otro negocio no los ve", async () => {
    await pool.query(
      `insert into public.subscriptions (organization_id, plan_code) values ($1, 'studio') on conflict do nothing`,
      [ID.orgA],
    );
    await as(pool, user(ID.ownerA), async (c) => {
      expect(await attempt(c, () => c.query("insert into public.invoices (organization_id, number, period_start, period_end, amount_cents, due_at) values ($1, 'X-1', now(), now(), 100, now())", [ID.orgA]))).toBe("42501");
      expect(await attempt(c, () => c.query("update public.invoices set status = 'paid'"))).toBe("42501");
      expect(await attempt(c, () => c.query("insert into public.payments (invoice_id, organization_id, method, amount_cents, received_at) values (gen_random_uuid(), $1, 'cash', 100, now())", [ID.orgA]))).toBe("42501");
      expect(await attempt(c, () => c.query("update public.subscriptions set status = 'active'"))).toBe("42501");
    });
    await as(pool, user(ID.ownerB), async (c) => {
      expect((await c.query("select 1 from public.invoices where organization_id = $1", [ID.orgA])).rowCount).toBe(0);
    });
  });
});

describe("clientes", () => {
  it("Juan ve sus citas en las dos organizaciones, y nada de Ashley", async () => {
    expect(await as(pool, user(ID.juanUser), visibleAppointments)).toEqual(
      [apps.carlosJuan, apps.mariaJuan, apps.marcusJuan].sort(),
    );
  });

  it("un usuario sin relación no ve nada privado", async () => {
    await as(pool, user(ID.stranger), async (c) => {
      expect(await visibleAppointments(c)).toEqual([]);
      expect((await c.query("select 1 from public.customers")).rowCount).toBe(0);
      expect((await c.query("select 1 from public.memberships")).rowCount).toBe(0);
      expect((await c.query("select 1 from public.working_hours")).rowCount).toBe(0);
    });
  });

  it("nadie puede insertar ni editar citas directamente (solo vía RPC)", async () => {
    for (const who of [user(ID.juanUser), user(ID.ownerA), anon]) {
      await as(pool, who, async (c) => {
        const ins = await attempt(c, () =>
          c.query(
            `insert into public.appointments (booking_group_id, salon_id, professional_id, customer_id,
               service_name_en, service_name_es, price_cents, starts_at, ends_at, blocked_until)
             select booking_group_id, salon_id, professional_id, customer_id, 'x', 'x', 0,
                    starts_at + interval '1 day', ends_at + interval '1 day', blocked_until + interval '1 day'
               from public.appointments limit 1`,
          ),
        );
        expect(ins).toBe("42501");
        expect(await attempt(c, () => c.query("update public.appointments set price_cents = 0"))).toBe("42501");
      });
    }
  });

  it("un usuario no puede convertirse en admin de plataforma", async () => {
    await as(pool, user(ID.juanUser), async (c) => {
      expect(await attempt(c, () => c.query("update public.profiles set is_platform_admin = true where id = $1", [ID.juanUser]))).toBe("42501");
      const ok = await c.query("update public.profiles set full_name = 'Juan P.' where id = $1", [ID.juanUser]);
      expect(ok.rowCount).toBe(1);
    });
  });
});

describe("visitante anónimo (catálogo público)", () => {
  it("ve salones publicados, servicios y profesionales con solo columnas públicas", async () => {
    await as(pool, anon, async (c) => {
      await withActivePlans(c);
      expect((await c.query("select id from public.salons")).rowCount).toBe(3);
      expect((await c.query("select id from public.services")).rowCount).toBe(3);
      const pros = await c.query("select public_name, initials, color_hex from public.professionals order by public_name");
      expect(pros.rows.map((r) => r.public_name)).toContain("Carlos M.");
    });
  });

  it("NO puede leer el apellido completo de un profesional", async () => {
    await as(pool, anon, async (c) => {
      expect(await attempt(c, () => c.query("select last_name from public.professionals"))).toBe("42501");
    });
  });

  it("NO puede leer citas, clientes, horarios ni membresías", async () => {
    for (const table of ["appointments", "customers", "working_hours", "memberships", "booking_groups"]) {
      await as(pool, anon, async (c) => {
        expect(await attempt(c, () => c.query(`select * from public.${table}`))).toBe("42501");
      });
    }
  });

  it("un salón NO publicado es invisible para el público", async () => {
    await pool.query("update public.salons set is_published = false where id = $1", [ID.salonB1]);
    try {
      await as(pool, anon, async (c) => {
        expect((await c.query("select id from public.salons where id = $1", [ID.salonB1])).rowCount).toBe(0);
        expect((await c.query("select id from public.professionals where salon_id = $1", [ID.salonB1])).rowCount).toBe(0);
      });
    } finally {
      await pool.query("update public.salons set is_published = true where id = $1", [ID.salonB1]);
    }
  });
});

describe("visitantes sin cuenta: catálogo público mínimo", () => {
  it("anon ve salones publicados pero no sus ajustes internos", async () => {
    await as(pool, anon, async (c) => {
      await withActivePlans(c);
      const ok = await c.query("select id, name, slug, zone, phone from public.salons where is_published");
      expect(ok.rowCount).toBeGreaterThan(0);
      for (const col of ["organization_id", "no_show_threshold", "no_show_block_enabled", "reminder_offsets_min"]) {
        expect(await attempt(c, () => c.query(`select ${col} from public.salons`))).toBe("42501");
      }
      expect(await attempt(c, () => c.query("select * from public.salons"))).toBe("42501");
    });
  });
});

describe("dos negocios: ninguno toca al otro, ni llamando a las funciones", () => {
  it("el dueño de A no puede leer facturación, cambiar estado ni crear citas en B", async () => {
    await as(pool, user(ID.ownerA), async (c) => {
      expect(await attempt(c, () => c.query("select public.my_billing($1)", [ID.orgB]))).toBe("42501");
      expect(await attempt(c, () => c.query("select public.platform_overview()"))).toBe("42501");
      expect(await attempt(c, () => c.query("select public.platform_set_status($1, 'suspended')", [ID.orgB]))).toBe("42501");
      expect(await attempt(c, () => c.query("select public.get_live_board($1)", [ID.salonB1]))).toBe("42501");
      expect(await attempt(c, () => c.query("select public.set_salon_published($1, false)", [ID.salonB1]))).not.toBeNull();
      expect(await attempt(c, () => c.query("select public.set_working_hours($1, '[]'::jsonb)", [ID.marcus]))).not.toBeNull();
      expect(await attempt(c, () => c.query("select public.create_invitation($1, 'admin', $2, null, 'x@y.com', null)", [ID.orgB, ID.salonB1]))).not.toBeNull();
    });
  });

  it("el dueño de B no ve citas, clientes ni miembros de A", async () => {
    await as(pool, user(ID.ownerB), async (c) => {
      expect((await c.query("select 1 from public.appointments where salon_id in ($1,$2)", [ID.salonA1, ID.salonA2])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.customers where organization_id = $1", [ID.orgA])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.memberships where organization_id = $1", [ID.orgA])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.notification_jobs where salon_id in ($1,$2)", [ID.salonA1, ID.salonA2])).rowCount).toBe(0);
    });
  });
});

describe("marca de administrador de la plataforma", () => {
  it("cada persona solo lee la suya y no puede ponérsela", async () => {
    await as(pool, user(ID.ownerA), async (c) => {
      await asSuperuser(c);
      await c.query("update public.profiles set is_platform_admin = true where id = $1", [ID.ownerA]);
      await switchTo(c, user(ID.ownerA));
      const mine = await c.query("select is_platform_admin from public.profiles where id = $1", [ID.ownerA]);
      expect(mine.rows[0].is_platform_admin).toBe(true);
      // No ve el perfil de otra persona.
      expect((await c.query("select 1 from public.profiles where id = $1", [ID.ownerB])).rowCount).toBe(0);
    });
    await as(pool, user(ID.ownerB), async (c) => {
      const mine = await c.query("select is_platform_admin from public.profiles where id = $1", [ID.ownerB]);
      expect(mine.rows[0].is_platform_admin).toBe(false);
      expect(await attempt(c, () => c.query("update public.profiles set is_platform_admin = true where id = $1", [ID.ownerB]))).toBe("42501");
    });
  });
});
