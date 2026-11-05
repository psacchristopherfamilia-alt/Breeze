/**
 * Reseñas verificadas: quién puede opinar y cuándo, qué ve el público, quién responde/reporta y quién oculta.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attemptMsg, book, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

const TOKEN = "ab".repeat(32); // 64 hex
const TOKEN2 = "cd".repeat(32);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

let c: pg.PoolClient;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

/** Cita de Ashley (invitada) con Carlos en A1, con su enlace privado. */
async function guestBooking(opts: { hoursAgo?: number; status?: "booked" | "completed" | "cancelled" | "no_show"; token?: string } = {}) {
  await asSuperuser(c);
  const appt = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.ashleyA, start: ago(opts.hoursAgo ?? 30), status: opts.status ?? "completed" });
  const g = (await c.query("select booking_group_id g from public.appointments where id = $1", [appt])).rows[0].g as string;
  await c.query("update public.booking_groups set guest_token_hash = sha256(convert_to($2, 'UTF8')) where id = $1", [g, opts.token ?? TOKEN]);
  return g;
}
const submit = (ref: string, rating: number, comment: string | null = null) => c.query("select public.submit_review($1, $2, $3) r", [ref, rating, comment]);
const request = async (ref: string) => (await c.query("select public.get_review_request($1) r", [ref])).rows[0].r;
const publicReviews = async (salon = ID.salonA1) => (await c.query("select public.get_salon_reviews($1) r", [salon])).rows[0].r;
async function publish() {
  await asSuperuser(c);
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, current_period_end)
     values ($1, 'studio', 'active', now() + interval '20 days'), ($2, 'solo', 'active', now() + interval '20 days')
     on conflict (organization_id) do update set status = excluded.status, current_period_end = excluded.current_period_end`,
    [ID.orgA, ID.orgB],
  );
}

describe("quién puede reseñar y cuándo", () => {
  it("el invitado con su enlace reseña una cita completada, y solo una vez (volver a enviar edita)", async () => {
    await guestBooking();
    await switchTo(c, anon);
    expect((await request(TOKEN)).state).toBe("ok");
    const first = (await submit(TOKEN, 5, "  Muy bien  ")).rows[0].r.id;
    const again = (await submit(TOKEN, 4, "Bien")).rows[0].r.id;
    expect(again).toBe(first);
    await asSuperuser(c);
    const rows = (await c.query("select rating, comment, author_name, service_en, professional_id from public.reviews")).rows;
    expect(rows).toEqual([{ rating: 4, comment: "Bien", author_name: "Ashley T.", service_en: "Cut", professional_id: ID.carlos }]);
    await switchTo(c, anon);
    expect((await request(TOKEN)).review.rating).toBe(4);
  });

  it("un enlace inventado o de otra reserva no sirve", async () => {
    await guestBooking();
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => submit(TOKEN2, 5))).toMatch(/not_found/);
    expect(await attemptMsg(c, () => submit("no-es-un-token", 5))).toMatch(/not_found/);
    expect(await attemptMsg(c, () => request(TOKEN2))).toMatch(/not_found/);
  });

  it("no se puede reseñar una cita futura, cancelada, sin presentarse o muy antigua", async () => {
    await guestBooking({ hoursAgo: -24, status: "booked" });
    await switchTo(c, anon);
    expect((await request(TOKEN)).state).toBe("too_early");
    expect(await attemptMsg(c, () => submit(TOKEN, 5))).toMatch(/too_early/);

    await guestBooking({ status: "cancelled", token: TOKEN2 });
    await switchTo(c, anon);
    expect((await request(TOKEN2)).state).toBe("not_reviewable");
    expect(await attemptMsg(c, () => submit(TOKEN2, 5))).toMatch(/not_reviewable/);

    await guestBooking({ status: "no_show", token: "ef".repeat(32) });
    await switchTo(c, anon);
    expect((await request("ef".repeat(32))).state).toBe("not_reviewable");

    await guestBooking({ hoursAgo: 24 * 20, token: "12".repeat(32) });
    await switchTo(c, anon);
    expect((await request("12".repeat(32))).state).toBe("expired");
    expect(await attemptMsg(c, () => submit("12".repeat(32), 5))).toMatch(/expired/);
  });

  it("una cita reservada que terminó hace más de 1 hora cuenta (el salón no siempre la marca); hace 10 minutos, todavía no", async () => {
    await guestBooking({ hoursAgo: 3, status: "booked" });
    await switchTo(c, anon);
    expect((await request(TOKEN)).state).toBe("ok");
    await guestBooking({ hoursAgo: 0.5, status: "booked", token: TOKEN2 }); // empezó hace 30 min, terminó hace ~0
    await switchTo(c, anon);
    expect((await request(TOKEN2)).state).toBe("too_early");
  });

  it("valida estrellas y comentario; con 1 o 2 estrellas el comentario es obligatorio", async () => {
    await guestBooking();
    await switchTo(c, anon);
    for (const bad of [0, 6]) expect(await attemptMsg(c, () => submit(TOKEN, bad))).toMatch(/invalid_rating/);
    expect(await attemptMsg(c, () => submit(TOKEN, 2))).toMatch(/comment_required/);
    expect(await attemptMsg(c, () => submit(TOKEN, 1, "   "))).toMatch(/comment_required/);
    expect(await attemptMsg(c, () => submit(TOKEN, 5, "x".repeat(501)))).toMatch(/comment_too_long/);
    expect(await attemptMsg(c, () => submit(TOKEN, 2, "Tardaron mucho"))).toBeNull();
  });

  it("con cuenta: solo el dueño de la reserva (por su id); un extraño o un visitante no", async () => {
    await asSuperuser(c);
    const appt = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: ago(30), status: "completed" });
    const g = (await c.query("select booking_group_id g from public.appointments where id = $1", [appt])).rows[0].g as string;
    await switchTo(c, user(ID.stranger));
    expect(await attemptMsg(c, () => submit(g, 5))).toMatch(/not_found/);
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => submit(g, 5))).toMatch(/not_found/);
    await switchTo(c, user(ID.juanUser));
    expect((await submit(g, 5, "Excelente")).rowCount).toBe(1);
    const states = (await c.query("select public.my_review_states() s")).rows[0].s;
    expect(states).toEqual([{ booking_group_id: g, state: "reviewed", rating: 5 }]);
    await switchTo(c, user(ID.stranger));
    expect((await c.query("select public.my_review_states() s")).rows[0].s).toEqual([]);
  });
});

describe("lo que ve el público", () => {
  it("solo nombre e inicial, estrellas, comentario, servicio y respuesta; sin teléfono ni correo", async () => {
    await publish();
    await guestBooking();
    await switchTo(c, anon);
    await submit(TOKEN, 5, "Excelente atención");
    const r = await publicReviews();
    expect(r.count).toBe(1);
    expect(Number(r.avg)).toBe(5);
    expect(r.distribution["5"]).toBe(1);
    expect(r.pros).toEqual([{ id: ID.carlos, avg: 5.0, count: 1 }]);
    expect(Object.keys(r.reviews[0]).sort()).toEqual(["author", "comment", "created_at", "id", "pro_name", "rating", "replied_at", "reply", "service_en", "service_es"]);
    expect(r.reviews[0].author).toBe("Ashley T.");
    expect(JSON.stringify(r)).not.toMatch(/6495550001|@/);
  });

  it("un salón sin publicar no enseña reseñas", async () => {
    await publish();
    await guestBooking();
    await switchTo(c, anon);
    await submit(TOKEN, 5);
    await asSuperuser(c);
    await c.query("update public.salons set is_published = false where id = $1", [ID.salonA1]);
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => publicReviews())).toMatch(/not_found/);
  });

  it("el promedio y el conteo del salón se mantienen solos y son públicos", async () => {
    await publish();
    await guestBooking();
    await asSuperuser(c);
    const a2 = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: ago(40), status: "completed" });
    const g2 = (await c.query("select booking_group_id g from public.appointments where id = $1", [a2])).rows[0].g as string;
    await c.query("update public.booking_groups set guest_token_hash = sha256(convert_to($2, 'UTF8')) where id = $1", [g2, TOKEN2]);
    await switchTo(c, anon);
    await submit(TOKEN, 5, "Genial");
    await submit(TOKEN2, 4, "Bien");
    const s = (await c.query("select rating_avg, rating_count from public.salons where id = $1", [ID.salonA1])).rows[0];
    expect({ avg: Number(s.rating_avg), n: s.rating_count }).toEqual({ avg: 4.5, n: 2 });
    // el otro salón de la organización no se mezcla
    expect((await c.query("select rating_count from public.salons where id = $1", [ID.salonA2])).rows[0].rating_count).toBe(0);
  });

  it("nadie lee ni escribe la tabla directamente", async () => {
    await guestBooking();
    await switchTo(c, anon);
    await submit(TOKEN, 5);
    for (const w of [anon, user(ID.ownerA), user(ID.juanUser)]) {
      await switchTo(c, w);
      expect(await attemptMsg(c, () => c.query("select * from public.reviews"))).toMatch(/permission denied/);
      expect(await attemptMsg(c, () => c.query("update public.reviews set rating = 1"))).toMatch(/permission denied/);
      expect(await attemptMsg(c, () => c.query("delete from public.reviews"))).toMatch(/permission denied/);
    }
  });

  it("si la persona borró su cuenta, la reseña queda sin nombre", async () => {
    await publish();
    await asSuperuser(c);
    const appt = await book(c, { salon: ID.salonA1, professional: ID.carlos, customer: ID.juanA, start: ago(30), status: "completed" });
    const g = (await c.query("select booking_group_id g from public.appointments where id = $1", [appt])).rows[0].g as string;
    await switchTo(c, user(ID.juanUser));
    await submit(g, 5, "Excelente");
    expect((await publicReviews()).reviews[0].author).toBe("Juan P.");
    await asSuperuser(c);
    await c.query("update public.customers set first_name = 'Deleted account', last_name = '' where id = $1", [ID.juanA]);
    await switchTo(c, anon);
    expect((await publicReviews()).reviews[0].author).toBe("");
  });
});

describe("el salón: ver, responder, reportar", () => {
  async function oneReview(rating = 3, comment: string | null = "Regular") {
    await guestBooking();
    await switchTo(c, anon);
    return (await submit(TOKEN, rating, comment)).rows[0].r.id as string;
  }
  const staff = async (who: Parameters<typeof switchTo>[1], salon = ID.salonA1) => (await c.query("select public.staff_reviews($1) r", [salon])).rows[0].r as { id: string; status: string }[];

  it("dueño/admin del salón y el profesional de esa cita la ven; otro negocio o extraño no", async () => {
    const id = await oneReview();
    await switchTo(c, user(ID.ownerA));
    expect((await staff(user(ID.ownerA))).map((r) => r.id)).toEqual([id]);
    await switchTo(c, user(ID.carlosUser));
    expect((await staff(user(ID.carlosUser))).map((r) => r.id)).toEqual([id]);
    for (const u of [ID.ownerB, ID.stranger, ID.adminA2, ID.displayA1]) {
      await switchTo(c, user(u));
      expect(await attemptMsg(c, () => staff(user(u)))).toMatch(/permission denied|forbidden|42501/);
    }
  });

  it("el profesional solo ve las reseñas de sus propias citas", async () => {
    await oneReview();
    await asSuperuser(c);
    const a = await book(c, { salon: ID.salonA1, professional: ID.andre, customer: ID.juanA, start: ago(50), status: "completed" });
    const g = (await c.query("select booking_group_id g from public.appointments where id = $1", [a])).rows[0].g as string;
    await switchTo(c, user(ID.juanUser));
    await submit(g, 5, "Perfecto");
    await switchTo(c, user(ID.ownerA));
    expect(await staff(user(ID.ownerA))).toHaveLength(2);
    await switchTo(c, user(ID.carlosUser));
    expect(await staff(user(ID.carlosUser))).toHaveLength(1);
  });

  it("solo dueño/admin del salón responden; se puede editar y borrar la respuesta", async () => {
    const id = await oneReview();
    const reply = (who: Parameters<typeof switchTo>[1], text: string | null) =>
      c.query("select public.reply_review($1, $2)", [id, text]);
    for (const w of [user(ID.carlosUser), user(ID.ownerB), user(ID.adminA2), user(ID.stranger), anon]) {
      await switchTo(c, w);
      expect(await attemptMsg(c, () => reply(w, "Hola"))).toMatch(/not_found|permission denied/);
    }
    await switchTo(c, user(ID.ownerA));
    await reply(user(ID.ownerA), "  Gracias por venir  ");
    await publish();
    await switchTo(c, anon);
    expect((await publicReviews()).reviews[0].reply).toBe("Gracias por venir");
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => reply(user(ID.ownerA), "x".repeat(501)))).toMatch(/reply_too_long/);
    await reply(user(ID.ownerA), "");
    await switchTo(c, anon);
    expect((await publicReviews()).reviews[0].reply).toBeNull();
  });

  it("reportar exige motivo, no oculta nada y deja constancia", async () => {
    const id = await oneReview(1, "Insultos aquí");
    await publish();
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.report_review($1, '')", [id]))).toMatch(/reason_required/);
    await switchTo(c, user(ID.carlosUser));
    expect(await attemptMsg(c, () => c.query("select public.report_review($1, 'Insultos')", [id]))).toMatch(/not_found/);
    await switchTo(c, user(ID.ownerB));
    expect(await attemptMsg(c, () => c.query("select public.report_review($1, 'Insultos')", [id]))).toMatch(/not_found/);
    await switchTo(c, user(ID.ownerA));
    await c.query("select public.report_review($1, 'Lenguaje ofensivo')", [id]);
    expect(await attemptMsg(c, () => c.query("select public.report_review($1, 'Otra vez')", [id]))).toMatch(/invalid_status/);
    await switchTo(c, anon);
    expect((await publicReviews()).count).toBe(1); // sigue visible
    await asSuperuser(c);
    expect((await c.query("select count(*)::int n from public.audit_log where action = 'review.reported' and entity_id = $1", [id])).rows[0].n).toBe(1);
  });
});

describe("moderación: solo el administrador de la plataforma oculta", () => {
  async function reported() {
    await guestBooking();
    await switchTo(c, anon);
    const id = (await submit(TOKEN, 1, "Texto ofensivo")).rows[0].r.id as string;
    await publish();
    await switchTo(c, user(ID.ownerA));
    await c.query("select public.report_review($1, 'Lenguaje ofensivo')", [id]);
    return id;
  }
  async function makeAdmin() {
    await asSuperuser(c);
    const admin = await createAuthUser(c, { email: "admin@breeze.test" });
    await c.query("update public.profiles set is_platform_admin = true where id = $1", [admin]);
    return admin;
  }

  it("el dueño del salón no puede ocultarla ni ver la cola", async () => {
    const id = await reported();
    for (const w of [user(ID.ownerA), user(ID.ownerB), anon]) {
      await switchTo(c, w);
      expect(await attemptMsg(c, () => c.query("select public.platform_moderate_review($1, 'hide')", [id]))).toMatch(/forbidden|permission denied/);
      expect(await attemptMsg(c, () => c.query("select public.platform_reported_reviews()"))).toMatch(/forbidden|permission denied/);
    }
  });

  it("el administrador la oculta: sale de la página y del promedio, pero no se borra", async () => {
    const id = await reported();
    const admin = await makeAdmin();
    await switchTo(c, user(admin));
    const queue = (await c.query("select public.platform_reported_reviews() q")).rows[0].q;
    expect(queue).toHaveLength(1);
    expect(queue[0].reported_reason).toBe("Lenguaje ofensivo");
    expect(queue[0].salon_name).toBe("Coral Barber");
    await c.query("select public.platform_moderate_review($1, 'hide')", [id]);
    await switchTo(c, anon);
    const r = await publicReviews();
    expect(r.count).toBe(0);
    expect(r.reviews).toEqual([]);
    expect((await c.query("select rating_count, rating_avg from public.salons where id = $1", [ID.salonA1])).rows[0]).toEqual({ rating_count: 0, rating_avg: null });
    await asSuperuser(c);
    expect((await c.query("select status from public.reviews where id = $1", [id])).rows[0].status).toBe("hidden");
    expect((await c.query("select count(*)::int n from public.audit_log where action = 'review.hide'")).rows[0].n).toBe(1);
    // ya oculta: el cliente no puede reeditarla para volver a mostrarla
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => submit(TOKEN, 5, "Perdón"))).toMatch(/review_hidden/);
  });

  it("'keep' la deja visible; solo se modera lo reportado", async () => {
    const id = await reported();
    const admin = await makeAdmin();
    await switchTo(c, user(admin));
    await c.query("select public.platform_moderate_review($1, 'keep')", [id]);
    expect(await attemptMsg(c, () => c.query("select public.platform_moderate_review($1, 'hide')", [id]))).toMatch(/invalid_status/);
    await switchTo(c, anon);
    expect((await publicReviews()).count).toBe(1);
  });
});

describe("aviso al equipo", () => {
  it("una reseña nueva avisa al dueño y al profesional de esa cita (no a la pantalla); editarla no repite el aviso", async () => {
    await guestBooking();
    await switchTo(c, anon);
    await submit(TOKEN, 2, "Tardaron");
    await submit(TOKEN, 3, "Tardaron un poco");
    await asSuperuser(c);
    const rows = (await c.query("select user_id, kind, rating, customer_display from public.staff_alerts where kind = 'review' order by user_id")).rows;
    expect(rows.map((r) => r.user_id).sort()).toEqual([ID.ownerA, ID.carlosUser].sort());
    expect(rows[0]).toMatchObject({ kind: "review", rating: 2, customer_display: "Ashley T." });
  });
});
