/**
 * El asistente de arranque: un salón recién creado queda publicado con la misma secuencia que usa
 * `completeSetup` (servicios → profesional con su forma de cobro → servicios asignados → horario → publicar).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { buildHours } from "../../src/lib/panel/setup";
import { SERVICE_TEMPLATES } from "../../src/lib/panel/service-templates";
import { anon, asSuperuser, attemptMsg, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
let owner: string;
let salon: { salon_id: string; salon_slug: string };
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  owner = await createAuthUser(c, { email: "nuevo@example.com", meta: { full_name: "Nuevo Dueño" } });
  await switchTo(c, user(owner));
  salon = (await c.query(`select public.create_organization('Nuevo Negocio', 'Nuevo Cuts', '{barbershop}', 'grace_bay') as r`)).rows[0].r;
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

async function runWizard(opts: { publish: boolean }) {
  const items = SERVICE_TEMPLATES.filter((x) => x.type === "barbershop").slice(0, 4);
  const ids: string[] = [];
  for (const [i, s] of items.entries()) {
    const r = await c.query(
      `insert into public.services (salon_id, category_code, name_en, name_es, duration_min, buffer_min, price_cents, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [salon.salon_id, s.category, s.nameEn, s.nameEs, s.durationMin, s.bufferMin, s.priceCents, i],
    );
    ids.push(r.rows[0].id);
  }
  const pro = (
    await c.query(
      `insert into public.professionals (salon_id, first_name, last_name, title, color_hex, accepts_cash, accepts_card, accepts_transfer, payment_note)
       values ($1, 'Nuevo', 'Dueño', 'barber', '#2563EB', true, false, true, 'Banco X · cuenta 123') returning id`,
      [salon.salon_id],
    )
  ).rows[0].id;
  await c.query("select public.set_professional_services($1, $2::uuid[])", [pro, ids]);
  await c.query("select public.set_working_hours($1, $2::jsonb)", [pro, JSON.stringify(buildHours([1, 2, 3, 4, 5, 6], "09:00", "18:00"))]);
  if (opts.publish) await c.query("select public.set_salon_published($1, true)", [salon.salon_id]);
  return { pro, ids };
}

describe("asistente de arranque", () => {
  it("un salón vacío no se puede publicar", async () => {
    expect(await attemptMsg(c, () => c.query("select public.set_salon_published($1, true)", [salon.salon_id]))).toBe("salon_incomplete");
  });

  it("con la secuencia del asistente el salón queda publicado y el cliente lo ve con su forma de pago", async () => {
    const { pro } = await runWizard({ publish: true });
    await switchTo(c, anon);
    const s = await c.query("select name from public.salons where slug = $1", [salon.salon_slug]);
    expect(s.rows[0].name).toBe("Nuevo Cuts");
    const p = (await c.query("select public_name, accepts_cash, accepts_transfer, payment_note from public.professionals where id = $1", [pro])).rows[0];
    expect(p).toMatchObject({ public_name: "Nuevo D.", accepts_cash: true, accepts_transfer: true });
    const n = (await c.query("select count(*)::int n from public.services where salon_id = $1", [salon.salon_id])).rows[0].n;
    expect(n).toBe(4);
  });

  it("'Guardar sin publicar' deja todo listo pero oculto para el público", async () => {
    await runWizard({ publish: false });
    await switchTo(c, anon);
    expect((await c.query("select 1 from public.salons where slug = $1", [salon.salon_slug])).rowCount).toBe(0);
    await asSuperuser(c);
    expect((await c.query("select is_published from public.salons where id = $1", [salon.salon_id])).rows[0].is_published).toBe(false);
  });
});
