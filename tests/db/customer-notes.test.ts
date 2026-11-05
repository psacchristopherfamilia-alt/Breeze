/**
 * Ficha del cliente: notas privadas (quién las ve, quién las escribe y quién las borra) y lista de clientes.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, asSuperuser, attempt, book, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  // Carlos atiende a Juan (una visita hecha y una próxima); Andre atiende a Ashley.
  await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: day(-3), status: "completed" });
  await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: day(2) });
  await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: day(1) });
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const addNote = (customer: string, org: string, body: string) =>
  c.query("insert into public.customer_notes (customer_id, organization_id, body) values ($1, $2, $3) returning id, author_id, author_name, body", [customer, org, body]);

describe("notas privadas", () => {
  it("el dueño y el administrador escriben notas; el autor y su nombre los pone la base de datos", async () => {
    await switchTo(c, user(ID.ownerA));
    const r = (await addNote(ID.juanA, ID.orgA, "  Alérgico al tinte  ")).rows[0];
    expect(r.body).toBe("Alérgico al tinte");
    expect(r.author_id).toBe(ID.ownerA);
    await asSuperuser(c);
    const expected = (await c.query("select coalesce(nullif(btrim(full_name), ''), email::text) n from public.profiles where id = $1", [ID.ownerA])).rows[0].n;
    expect(r.author_name).toBe(expected);

    await switchTo(c, user(ID.adminA2));
    expect((await addNote(ID.juanA, ID.orgA, "Prefiere la tarde")).rowCount).toBe(1);
  });

  it("no se puede falsificar el autor", async () => {
    await switchTo(c, user(ID.ownerA));
    const r = await c.query(
      "insert into public.customer_notes (customer_id, organization_id, author_id, author_name, body) values ($1, $2, $3, 'Otro', 'x') returning author_id, author_name",
      [ID.juanA, ID.orgA, ID.adminA2],
    );
    expect(r.rows[0].author_id).toBe(ID.ownerA);
    expect(r.rows[0].author_name).not.toBe("Otro");
  });

  it("el profesional solo ve y escribe notas de los clientes que atiende", async () => {
    await asSuperuser(c);
    await addNote(ID.juanA, ID.orgA, "nota de Juan");
    await addNote(ID.ashleyA, ID.orgA, "nota de Ashley");
    await switchTo(c, user(ID.carlosUser));
    const seen = (await c.query("select customer_id from public.customer_notes")).rows.map((r) => r.customer_id);
    expect(seen).toEqual([ID.juanA]);
    expect((await addNote(ID.juanA, ID.orgA, "la escribe Carlos")).rowCount).toBe(1);
    expect(await attempt(c, () => addNote(ID.ashleyA, ID.orgA, "no es su cliente"))).toBe("42501");
  });

  it("otro negocio no ve ni escribe notas, y no se pueden cruzar organizaciones", async () => {
    await asSuperuser(c);
    await addNote(ID.juanA, ID.orgA, "privada");
    await switchTo(c, user(ID.ownerB));
    expect((await c.query("select 1 from public.customer_notes")).rowCount).toBe(0);
    expect(await attempt(c, () => addNote(ID.juanA, ID.orgA, "intruso"))).toBe("42501");
    await switchTo(c, user(ID.ownerA));
    // Cliente de A con la organización B: la llave compuesta lo impide.
    expect(await attempt(c, () => addNote(ID.juanA, ID.orgB, "cruzada"))).not.toBeNull();
  });

  it("el propio cliente no ve las notas que hay sobre él", async () => {
    await asSuperuser(c);
    await addNote(ID.juanA, ID.orgA, "privada");
    await switchTo(c, user(ID.juanUser));
    expect((await c.query("select 1 from public.customer_notes")).rowCount).toBe(0);
  });

  it("solo su autor la borra", async () => {
    await switchTo(c, user(ID.adminA2));
    const id = (await addNote(ID.juanA, ID.orgA, "del admin")).rows[0].id;
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("delete from public.customer_notes where id = $1", [id])).rowCount).toBe(0); // ni el dueño
    await switchTo(c, user(ID.adminA2));
    expect((await c.query("delete from public.customer_notes where id = $1", [id])).rowCount).toBe(1);
  });

  it("no se editan", async () => {
    await switchTo(c, user(ID.ownerA));
    const id = (await addNote(ID.juanA, ID.orgA, "original")).rows[0].id;
    expect(await attempt(c, () => c.query("update public.customer_notes set body = 'cambiada' where id = $1", [id]))).toBe("42501");
  });

  it("las notas vacías o larguísimas se rechazan", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => addNote(ID.juanA, ID.orgA, "   "))).toBe("23514");
    expect(await attempt(c, () => addNote(ID.juanA, ID.orgA, "x".repeat(1001)))).toBe("23514");
  });
});

describe("lista de clientes (staff_customers)", () => {
  const list = async (org: string, q: string | null = null) =>
    (await c.query("select first_name, last_name, visits, last_visit, next_visit from public.staff_customers($1, $2)", [org, q])).rows;

  it("el dueño ve a todos los de su organización con visitas, última y próxima", async () => {
    await switchTo(c, user(ID.ownerA));
    const rows = await list(ID.orgA);
    expect(rows.map((r) => r.first_name).sort()).toEqual(["Ashley", "Juan"]);
    const juan = rows.find((r) => r.first_name === "Juan")!;
    expect(juan.visits).toBe(1);
    expect(juan.last_visit).not.toBeNull();
    expect(juan.next_visit).not.toBeNull();
    const ashley = rows.find((r) => r.first_name === "Ashley")!;
    expect(ashley.visits).toBe(0);
  });

  it("el profesional solo ve a los clientes que atiende", async () => {
    await switchTo(c, user(ID.carlosUser));
    expect((await list(ID.orgA)).map((r) => r.first_name)).toEqual(["Juan"]);
  });

  it("otro negocio no ve clientes ajenos", async () => {
    await switchTo(c, user(ID.ownerB));
    expect(await list(ID.orgA)).toEqual([]);
    expect((await list(ID.orgB)).map((r) => r.last_name)).toEqual(["Pérez"]);
  });

  it("busca por nombre o por teléfono, y los comodines no devuelven todo", async () => {
    await switchTo(c, user(ID.ownerA));
    expect((await list(ID.orgA, "ash")).map((r) => r.first_name)).toEqual(["Ashley"]);
    expect((await list(ID.orgA, "231")).map((r) => r.first_name)).toEqual(["Juan"]);
    expect((await list(ID.orgA, "(649) 555-0001")).map((r) => r.first_name)).toEqual(["Ashley"]);
    expect(await list(ID.orgA, "%")).toEqual([]);
    expect(await list(ID.orgA, "_")).toEqual([]);
  });

  it("solo con sesión", async () => {
    await switchTo(c, { role: "anon" });
    expect(await attempt(c, () => list(ID.orgA))).toBe("42501");
  });
});
