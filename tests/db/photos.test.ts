/**
 * Fotos: galería, logo/portada, foto de profesional y de servicio, y los archivos de Storage.
 * Un negocio jamás toca ni ve (si no es público) lo de otro.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attempt, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  await c.query("insert into storage.buckets (id, name, public) values ('salon-media', 'salon-media', true) on conflict do nothing");
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

const photo = (salon: string, n: number | string = 1) => `${salon}/gallery/${n}.webp`;
const addPhoto = (salon: string, path: string) => c.query("insert into public.salon_photos (salon_id, path) values ($1, $2)", [salon, path]);
async function publicPlans() {
  await asSuperuser(c);
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, current_period_end)
     values ($1, 'studio', 'active', now() + interval '20 days'), ($2, 'solo', 'active', now() + interval '20 days')
     on conflict (organization_id) do update set status = excluded.status, current_period_end = excluded.current_period_end`,
    [ID.orgA, ID.orgB],
  );
}

describe("galería (salon_photos)", () => {
  it("el dueño y el administrador de ese salón añaden fotos; los demás no", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => addPhoto(ID.salonA1, photo(ID.salonA1)))).toBeNull();
    await switchTo(c, user(ID.adminA2));
    expect(await attempt(c, () => addPhoto(ID.salonA2, photo(ID.salonA2)))).toBeNull();
    // adminA2 solo administra A2; en A1 no puede.
    expect(await attempt(c, () => addPhoto(ID.salonA1, photo(ID.salonA1, 2)))).toBe("42501");
    // El profesional, la pantalla y un extraño tampoco.
    for (const u of [ID.carlosUser, ID.displayA1, ID.stranger]) {
      await switchTo(c, user(u));
      expect(await attempt(c, () => addPhoto(ID.salonA1, photo(ID.salonA1, 3)))).toBe("42501");
    }
    // Ni el dueño de otro negocio.
    await switchTo(c, user(ID.ownerB));
    expect(await attempt(c, () => addPhoto(ID.salonA1, photo(ID.salonA1, 4)))).toBe("42501");
  });

  it("la ruta debe estar dentro de la carpeta del propio salón", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => addPhoto(ID.salonA1, photo(ID.salonB1)))).toBe("23514");
  });

  it("máximo 9 fotos por salón", async () => {
    await switchTo(c, user(ID.ownerA));
    for (let i = 1; i <= 9; i++) await addPhoto(ID.salonA1, photo(ID.salonA1, i));
    expect(await attempt(c, () => addPhoto(ID.salonA1, photo(ID.salonA1, 10)))).toBe("P0001");
    // Otro salón tiene su propio cupo.
    expect(await attempt(c, () => addPhoto(ID.salonA2, photo(ID.salonA2)))).toBeNull();
  });

  it("el público ve las fotos de salones publicados; un salón sin publicar no las enseña", async () => {
    await publicPlans();
    await addPhoto(ID.salonA1, photo(ID.salonA1));
    await addPhoto(ID.salonB1, photo(ID.salonB1));
    await switchTo(c, anon);
    expect((await c.query("select salon_id from public.salon_photos order by salon_id")).rows.map((r) => r.salon_id)).toEqual([ID.salonA1, ID.salonB1]);
    await asSuperuser(c);
    await c.query("update public.salons set is_published = false where id = $1", [ID.salonB1]);
    await switchTo(c, anon);
    expect((await c.query("select salon_id from public.salon_photos")).rows.map((r) => r.salon_id)).toEqual([ID.salonA1]);
  });

  it("un negocio sin publicar solo la ve su propio personal", async () => {
    await asSuperuser(c);
    await c.query("update public.salons set is_published = false where id in ($1, $2)", [ID.salonA1, ID.salonB1]);
    await addPhoto(ID.salonA1, photo(ID.salonA1));
    await addPhoto(ID.salonB1, photo(ID.salonB1));
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("select salon_id from public.salon_photos")).rows.map((r) => r.salon_id)).toEqual([ID.salonA1]);
    await switchTo(c, user(ID.carlosUser)); // profesional de A1
    expect((await c.query("select salon_id from public.salon_photos")).rowCount).toBe(1);
    await switchTo(c, user(ID.stranger));
    expect((await c.query("select salon_id from public.salon_photos")).rowCount).toBe(0);
  });

  it("solo dueño/admin borran y cambian el orden, y solo en su salón", async () => {
    await asSuperuser(c);
    await addPhoto(ID.salonA1, photo(ID.salonA1));
    await addPhoto(ID.salonB1, photo(ID.salonB1));
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("update public.salon_photos set sort_order = 5 where salon_id = $1", [ID.salonA1])).rowCount).toBe(1);
    expect((await c.query("update public.salon_photos set sort_order = 5 where salon_id = $1", [ID.salonB1])).rowCount).toBe(0);
    expect((await c.query("delete from public.salon_photos where salon_id = $1", [ID.salonB1])).rowCount).toBe(0);
    expect((await c.query("delete from public.salon_photos where salon_id = $1", [ID.salonA1])).rowCount).toBe(1);
    await switchTo(c, user(ID.carlosUser));
    expect((await c.query("delete from public.salon_photos")).rowCount).toBe(0);
  });
});

describe("logo, portada, foto de profesional y de servicio", () => {
  it("el dueño los fija dentro de su carpeta y el público los lee", async () => {
    await publicPlans();
    await switchTo(c, user(ID.ownerA));
    await c.query("update public.salons set logo_path = $2, cover_path = $3 where id = $1", [ID.salonA1, `${ID.salonA1}/logo/a.webp`, `${ID.salonA1}/gallery/1.webp`]);
    await c.query("update public.professionals set avatar_url = $2 where id = $1", [ID.carlos, `${ID.salonA1}/pro/carlos.webp`]);
    await c.query("update public.services set photo_path = $2 where id = $1", [ID.cutA1, `${ID.salonA1}/service/cut.webp`]);
    await switchTo(c, anon);
    const s = (await c.query("select logo_path, cover_path from public.salons where id = $1", [ID.salonA1])).rows[0];
    expect(s.logo_path).toBe(`${ID.salonA1}/logo/a.webp`);
    expect((await c.query("select avatar_url from public.professionals where id = $1", [ID.carlos])).rows[0].avatar_url).toBe(`${ID.salonA1}/pro/carlos.webp`);
    expect((await c.query("select photo_path from public.services where id = $1", [ID.cutA1])).rows[0].photo_path).toBe(`${ID.salonA1}/service/cut.webp`);
  });

  it("no se puede apuntar al archivo de otro salón", async () => {
    await switchTo(c, user(ID.ownerA));
    const other = `${ID.salonB1}/logo/x.webp`;
    expect(await attempt(c, () => c.query("update public.salons set logo_path = $2 where id = $1", [ID.salonA1, other]))).toBe("23514");
    expect(await attempt(c, () => c.query("update public.professionals set avatar_url = $2 where id = $1", [ID.carlos, other]))).toBe("23514");
    expect(await attempt(c, () => c.query("update public.services set photo_path = $2 where id = $1", [ID.cutA1, other]))).toBe("23514");
  });

  it("otro negocio y el profesional no pueden cambiar el logo", async () => {
    await switchTo(c, user(ID.ownerB));
    expect((await c.query("update public.salons set logo_path = $2 where id = $1", [ID.salonA1, `${ID.salonA1}/logo/x.webp`])).rowCount).toBe(0);
    await switchTo(c, user(ID.carlosUser));
    expect((await c.query("update public.salons set logo_path = $2 where id = $1", [ID.salonA1, `${ID.salonA1}/logo/x.webp`])).rowCount).toBe(0);
  });

  it("is_published sigue sin poder cambiarse con UPDATE directo", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => c.query("update public.salons set is_published = false where id = $1", [ID.salonA1]))).toBe("42501");
  });
});

describe("archivos en Storage (bucket salon-media)", () => {
  const putObject = (name: string) =>
    c.query("insert into storage.objects (bucket_id, name, owner) values ('salon-media', $1, auth.uid())", [name]);

  it("dueño/admin suben solo en la carpeta de su salón", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => putObject(`${ID.salonA1}/gallery/1.webp`))).toBeNull();
    expect(await attempt(c, () => putObject(`${ID.salonA2}/gallery/1.webp`))).toBeNull();
    expect(await attempt(c, () => putObject(`${ID.salonB1}/gallery/1.webp`))).toBe("42501");
    await switchTo(c, user(ID.adminA2));
    expect(await attempt(c, () => putObject(`${ID.salonA2}/gallery/2.webp`))).toBeNull();
    expect(await attempt(c, () => putObject(`${ID.salonA1}/gallery/2.webp`))).toBe("42501");
  });

  it("profesional, pantalla, extraño y visitante no suben", async () => {
    for (const w of [user(ID.carlosUser), user(ID.displayA1), user(ID.stranger), anon]) {
      await switchTo(c, w);
      expect(await attempt(c, () => putObject(`${ID.salonA1}/gallery/9.webp`))).toBe("42501");
    }
  });

  it("rutas raras (sin id de salón) se rechazan", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attempt(c, () => putObject("logo.webp"))).toBe("42501");
    expect(await attempt(c, () => putObject("no-es-un-uuid/gallery/1.webp"))).toBe("42501");
  });

  it("no se pueden ver, reemplazar ni borrar los archivos de otro negocio", async () => {
    await asSuperuser(c);
    await c.query("insert into storage.objects (bucket_id, name) values ('salon-media', $1)", [`${ID.salonA1}/gallery/1.webp`]);
    await switchTo(c, user(ID.ownerB));
    expect((await c.query("select 1 from storage.objects")).rowCount).toBe(0);
    expect((await c.query("update storage.objects set name = name || 'x'")).rowCount).toBe(0);
    expect((await c.query("delete from storage.objects")).rowCount).toBe(0);
    await switchTo(c, user(ID.ownerA));
    expect((await c.query("select 1 from storage.objects")).rowCount).toBe(1);
    expect((await c.query("delete from storage.objects")).rowCount).toBe(1);
  });
});
