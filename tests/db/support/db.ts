import pg from "pg";
import { inject } from "vitest";

/** IDs fijos de fixtures.sql */
export const ID = {
  ownerA: "00000000-0000-4000-8000-000000000101",
  adminA2: "00000000-0000-4000-8000-000000000102",
  carlosUser: "00000000-0000-4000-8000-000000000103",
  displayA1: "00000000-0000-4000-8000-000000000104",
  ownerB: "00000000-0000-4000-8000-000000000105",
  juanUser: "00000000-0000-4000-8000-000000000106",
  stranger: "00000000-0000-4000-8000-000000000107",
  orgA: "00000000-0000-4000-8000-000000000201",
  orgB: "00000000-0000-4000-8000-000000000202",
  salonA1: "00000000-0000-4000-8000-000000000301",
  salonA2: "00000000-0000-4000-8000-000000000302",
  salonB1: "00000000-0000-4000-8000-000000000303",
  carlos: "00000000-0000-4000-8000-000000000401",
  andre: "00000000-0000-4000-8000-000000000402",
  maria: "00000000-0000-4000-8000-000000000403",
  marcus: "00000000-0000-4000-8000-000000000404",
  cutA1: "00000000-0000-4000-8000-000000000501",
  juanA: "00000000-0000-4000-8000-000000000601",
  juanB: "00000000-0000-4000-8000-000000000602",
  ashleyA: "00000000-0000-4000-8000-000000000603",
} as const;

export function makePool(max = 4) {
  return new pg.Pool({ connectionString: inject("dbUrl"), max });
}

export type Who = { role: "anon" } | { role: "authenticated"; userId: string };

/**
 * Ejecuta `fn` como lo haría la API de Supabase: rol anon/authenticated + JWT con el "sub" del usuario.
 * Todo dentro de una transacción que se deshace al final (no deja rastro).
 */
export async function as<T>(pool: pg.Pool, who: Who, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const claims = who.role === "anon" ? { role: "anon" } : { role: "authenticated", sub: who.userId };
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query(`set local role ${who.role}`);
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

export const user = (userId: string): Who => ({ role: "authenticated", userId });
export const anon: Who = { role: "anon" };

export interface BookArgs {
  salon: string;
  professional: string;
  customer: string;
  start: string; // ISO con zona
  minutes?: number;
  buffer?: number;
  status?: "booked" | "completed" | "cancelled" | "no_show";
}

/** Inserta una cita directamente (como superusuario, igual que hará la RPC del módulo 3). */
export async function book(c: pg.ClientBase, a: BookArgs): Promise<string> {
  const g = await c.query<{ id: string }>(
    `insert into public.booking_groups (organization_id, salon_id, customer_id)
     select s.organization_id, s.id, $2 from public.salons s where s.id = $1 returning id`,
    [a.salon, a.customer],
  );
  const r = await c.query<{ id: string }>(
    `insert into public.appointments
       (booking_group_id, salon_id, professional_id, customer_id, service_name_en, service_name_es, price_cents,
        starts_at, ends_at, blocked_until, status, cancelled_at)
     values ($1, $2, $3, $4, 'Cut', 'Corte', 2500,
        $5::timestamptz,
        $5::timestamptz + make_interval(mins => $6::int),
        $5::timestamptz + make_interval(mins => $6::int + $7::int),
        $8::public.appointment_status,
        case when $8 = 'cancelled' then now() end)
     returning id`,
    [g.rows[0].id, a.salon, a.professional, a.customer, a.start, a.minutes ?? 30, a.buffer ?? 10, a.status ?? "booked"],
  );
  return r.rows[0].id;
}

/** Captura el código de error de Postgres (p. ej. 23P01 = exclusion_violation). */
export async function pgError(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

/**
 * Igual que pgError pero DENTRO de una transacción: usa un savepoint para que,
 * si la sentencia falla, la transacción siga viva para las siguientes comprobaciones.
 */
export async function attempt(c: pg.ClientBase, fn: () => Promise<unknown>): Promise<string | null> {
  await c.query("savepoint attempt");
  try {
    await fn();
    await c.query("release savepoint attempt");
    return null;
  } catch (e) {
    await c.query("rollback to savepoint attempt");
    return (e as { code?: string }).code ?? "unknown";
  }
}
