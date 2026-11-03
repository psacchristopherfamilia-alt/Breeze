/** Módulo 2: registro, alta de salón, sucursales, invitaciones y contexto de roles. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attempt, book, createAuthUser, makePool, switchTo, user } from "./support/db";

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

const errMsg = async (fn: () => Promise<unknown>) => {
  await c.query("savepoint m");
  try {
    await fn();
    await c.query("release savepoint m");
    return null;
  } catch (e) {
    await c.query("rollback to savepoint m");
    return (e as Error).message;
  }
};

describe("registro → perfil automático", () => {
  it("crea el perfil con nombre, teléfono E.164 e idioma del registro", async () => {
    const id = await createAuthUser(c, {
      email: "lucia@example.com",
      meta: { full_name: "Lucía Fernández", phone: "+1 (649) 555-1234", locale: "es" },
    });
    const r = await c.query("select full_name, email, phone, locale from public.profiles where id = $1", [id]);
    expect(r.rows[0]).toEqual({ full_name: "Lucía Fernández", email: "lucia@example.com", phone: "+16495551234", locale: "es" });
  });

  it("un teléfono inválido o un idioma desconocido no rompen el registro", async () => {
    const id = await createAuthUser(c, { email: "x@example.com", meta: { phone: "abc", locale: "fr" } });
    const r = await c.query("select phone, locale from public.profiles where id = $1", [id]);
    expect(r.rows[0]).toEqual({ phone: null, locale: "en" });
  });

  it("usa el teléfono de Auth (registro por SMS) si no viene en los metadatos", async () => {
    const id = await createAuthUser(c, { phone: "16495550000" });
    expect((await c.query("select phone from public.profiles where id = $1", [id])).rows[0].phone).toBe("+16495550000");
  });

  it("normaliza los formatos de teléfono habituales en Turks and Caicos a E.164", async () => {
    const cases: [string, string | null][] = [
      ["+1 (649) 555-1234", "+16495551234"],
      ["1-649-555-1234", "+16495551234"],
      ["649 555 1234", "+16495551234"],
      ["555-1234", "+16495551234"],
      ["+44 20 7946 0958", "+442079460958"],
      ["12", null],
      ["", null],
    ];
    for (const [input, expected] of cases) {
      const r = await c.query("select private.normalize_phone($1) as p", [input]);
      expect(r.rows[0].p, input).toBe(expected);
    }
  });

  it("si cambia el correo en Auth, cambia en el perfil", async () => {
    const id = await createAuthUser(c, { email: "old@example.com" });
    await c.query("update auth.users set email = 'new@example.com' where id = $1", [id]);
    expect((await c.query("select email from public.profiles where id = $1", [id])).rows[0].email).toBe("new@example.com");
  });
});

describe("alta de salón", () => {
  it("crea organización, dueño, 1.ª sucursal (sin publicar) y 14 días de prueba Studio", async () => {
    const owner = await createAuthUser(c, { email: "nuevo@example.com" });
    await switchTo(c, user(owner));
    const res = (
      await c.query(`select public.create_organization('Island Fade', 'Island Fade Downtown', '{barbershop}', 'downtown_provo', '649 555 0101', 'Leeward Hwy') as r`)
    ).rows[0].r;
    expect(res.organization_slug).toBe("island-fade");
    expect(res.salon_slug).toBe("island-fade-downtown");

    // Lo ve como dueño a través de RLS.
    const ctx = await c.query("select role, salon_name from public.my_context()");
    expect(ctx.rows).toEqual([{ role: "owner", salon_name: "Island Fade Downtown" }]);
    const salon = await c.query("select is_published, phone from public.salons where id = $1", [res.salon_id]);
    expect(salon.rows[0]).toEqual({ is_published: false, phone: "+16495550101" });
    const sub = await c.query(
      "select plan_code, status, round(extract(epoch from trial_ends_at - now()) / 86400) as days from public.subscriptions",
    );
    expect(sub.rows[0]).toEqual({ plan_code: "studio", status: "trialing", days: "14" });
  });

  it("genera slugs únicos y sin acentos", async () => {
    const owner = await createAuthUser(c, { email: "otro@example.com" });
    await switchTo(c, user(owner));
    const res = (await c.query(`select public.create_organization('Coral Group', 'Coral Barber', '{barbershop}', 'grace_bay') as r`)).rows[0].r;
    expect(res.organization_slug).toBe("coral-group-2"); // "coral-group" ya existe
    expect(res.salon_slug).toBe("coral-barber-2");
    const res2 = (await c.query(`select public.create_organization('Peluquería Ñandú', 'Estética Ñandú', '{salon,spa}', 'leeward') as r`)).rows[0].r;
    expect(res2.organization_slug).toBe("peluqueria-nandu");
  });

  it("un visitante sin sesión no puede crear salones", async () => {
    await switchTo(c, anon);
    expect(await attempt(c, () => c.query(`select public.create_organization('X', 'Y', '{spa}', 'leeward')`))).toBe("42501");
  });

  it("solo el dueño puede añadir sucursales a su organización", async () => {
    await switchTo(c, user(ID.adminA2));
    expect(await attempt(c, () => c.query(`select public.create_branch($1, 'Coral Spa', '{spa}', 'long_bay')`, [ID.orgA]))).toBe("42501");
    await switchTo(c, user(ID.ownerB));
    expect(await attempt(c, () => c.query(`select public.create_branch($1, 'Coral Spa', '{spa}', 'long_bay')`, [ID.orgA]))).toBe("42501");

    await asSuperuser(c);
    await c.query("insert into public.subscriptions (organization_id, plan_code) values ($1, 'studio') on conflict do nothing", [ID.orgA]);
    await switchTo(c, user(ID.ownerA));
    await c.query(`select public.create_branch($1, 'Coral Spa', '{spa}', 'long_bay')`, [ID.orgA]);
    const ctx = await c.query("select salon_name from public.my_context()");
    expect(ctx.rows.map((r) => r.salon_name)).toEqual(["Coral Barber", "Coral Nails", "Coral Spa"]);
    expect((await c.query("select extra_branches from public.subscriptions")).rows[0].extra_branches).toBe(2);
  });
});

describe("invitaciones", () => {
  const invitePro = (email: string, salon: string = ID.salonA1, pro: string = ID.andre) =>
    c.query<{ t: string }>(
      `select public.create_invitation($1, 'professional', $2, $3, $4) as t`,
      [ID.orgA, salon, pro, email],
    );

  it("el dueño invita a un profesional; al aceptar ve SOLO su agenda", async () => {
    await asSuperuser(c);
    const appt = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.ashleyA, start: "2027-03-02T10:00:00-05:00" });
    await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: "2027-03-02T10:00:00-05:00" });
    const andreUser = await createAuthUser(c, { email: "andre@example.com" });

    await switchTo(c, user(ID.ownerA));
    const token = (await invitePro("Andre@Example.com")).rows[0].t;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // En la BD solo se guarda el hash, nunca el token.
    await asSuperuser(c);
    const stored = await c.query("select encode(token_hash, 'hex') as h from public.invitations where email = 'andre@example.com'");
    expect(stored.rows[0].h).not.toBe(token);

    await switchTo(c, user(andreUser));
    const res = (await c.query("select public.accept_invitation($1) as r", [token])).rows[0].r;
    expect(res.role).toBe("professional");
    const ctx = await c.query("select role, professional_id from public.my_context()");
    expect(ctx.rows).toEqual([{ role: "professional", professional_id: ID.andre }]);
    const visible = await c.query("select id from public.appointments where starts_at::date = '2027-03-02'");
    expect(visible.rows.map((r) => r.id)).toEqual([appt]);
  });

  it("no se puede aceptar con otra cuenta, dos veces, ni caducada", async () => {
    await asSuperuser(c);
    const andreUser = await createAuthUser(c, { email: "andre@example.com" });
    await switchTo(c, user(ID.ownerA));
    const token = (await invitePro("andre@example.com")).rows[0].t;

    await switchTo(c, user(ID.stranger));
    expect(await errMsg(() => c.query("select public.accept_invitation($1)", [token]))).toBe("invitation_wrong_account");
    expect(await errMsg(() => c.query("select public.accept_invitation('nope')"))).toBe("invitation_not_found");

    await switchTo(c, user(andreUser));
    await c.query("select public.accept_invitation($1)", [token]);
    expect(await errMsg(() => c.query("select public.accept_invitation($1)", [token]))).toBe("invitation_already_used");

    await asSuperuser(c);
    await c.query("delete from public.memberships where user_id = $1", [andreUser]);
    await switchTo(c, user(ID.ownerA));
    const token2 = (await invitePro("andre@example.com")).rows[0].t;
    await asSuperuser(c);
    await c.query("update public.invitations set expires_at = now() - interval '1 minute' where accepted_at is null");
    await switchTo(c, user(andreUser));
    expect(await errMsg(() => c.query("select public.accept_invitation($1)", [token2]))).toBe("invitation_expired");
  });

  it("también se puede invitar y aceptar por teléfono", async () => {
    await asSuperuser(c);
    const u = await createAuthUser(c, { meta: { phone: "+1 649 555 7777" } });
    await switchTo(c, user(ID.ownerA));
    const token = (
      await c.query(`select public.create_invitation($1, 'professional', $2, $3, null, '649-555-7777') as t`, [ID.orgA, ID.salonA1, ID.andre])
    ).rows[0].t;
    await switchTo(c, user(u));
    expect((await c.query("select public.accept_invitation($1) as r", [token])).rows[0].r.role).toBe("professional");
  });

  it("un profesional que ya tiene cuenta no puede volver a invitarse", async () => {
    await switchTo(c, user(ID.ownerA));
    // Carlos ya está vinculado en fixtures.
    expect(await attempt(c, () => invitePro("carlos2@example.com", ID.salonA1, ID.carlos))).toBe("23505");
  });

  it("el admin de A2 puede invitar profesionales de A2, pero no de A1 ni admins", async () => {
    await switchTo(c, user(ID.adminA2));
    expect(await attempt(c, () => invitePro("x@example.com", ID.salonA1, ID.andre))).toBe("42501");
    expect(
      await attempt(c, () => c.query(`select public.create_invitation($1, 'admin', $2, null, 'y@example.com')`, [ID.orgA, ID.salonA2])),
    ).toBe("42501");
    expect(await attempt(c, () => invitePro("maria@example.com", ID.salonA2, ID.maria))).toBeNull();
  });

  it("el dueño de otra organización no puede invitar en la mía", async () => {
    await switchTo(c, user(ID.ownerB));
    expect(await attempt(c, () => invitePro("x@example.com"))).toBe("42501");
  });
});

describe("contexto de roles", () => {
  it("el dueño de A ve sus 2 sucursales; Carlos solo la suya como profesional; la TV como display", async () => {
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("select salon_name, role from public.my_context()")).rows).toEqual([
      { salon_name: "Coral Barber", role: "owner" },
      { salon_name: "Coral Nails", role: "owner" },
    ]);
    await switchTo(c, user(ID.carlosUser));
    expect((await c.query("select salon_name, role from public.my_context()")).rows).toEqual([
      { salon_name: "Coral Barber", role: "professional" },
    ]);
    await switchTo(c, user(ID.displayA1));
    expect((await c.query("select role from public.my_context()")).rows).toEqual([{ role: "display" }]);
    await switchTo(c, user(ID.stranger));
    expect((await c.query("select * from public.my_context()")).rowCount).toBe(0);
  });

  it("anon no puede consultar el contexto", async () => {
    await switchTo(c, anon);
    expect(await attempt(c, () => c.query("select * from public.my_context()"))).toBe("42501");
  });
});
