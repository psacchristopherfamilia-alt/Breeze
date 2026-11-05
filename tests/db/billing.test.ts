/**
 * Módulo 7: facturación manual y administración de la plataforma.
 * Ciclo: prueba → factura → pago registrado → plan activo; 7 días → aviso (past_due); 14 días → suspendido.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { ID, anon, asSuperuser, attemptMsg, createAuthUser, makePool, switchTo, user } from "./support/db";

const pool = makePool();
afterAll(() => pool.end());

let c: pg.PoolClient;
let admin: string;
beforeEach(async () => {
  c = await pool.connect();
  await c.query("begin");
  admin = await createAuthUser(c, { email: "admin@breeze.test", meta: { full_name: "Admin Breeze" } });
  await c.query("update public.profiles set is_platform_admin = true where id = $1", [admin]);
  // Orden fijo (A → B) para no bloquearse con otros ficheros de tests que también tocan estas filas.
  await setSub(ID.orgA, "trialing", { trial: "10 days", period: "10 days" });
  await setSub(ID.orgB, "active", { period: "20 days" });
});
afterEach(async () => {
  await c.query("rollback");
  c.release();
});

/** Deja la suscripción en un estado: `period`/`trial` son intervalos desde ahora (negativo = ya vencido). */
async function setSub(org: string, status: string, o: { trial?: string; period?: string; plan?: string; cycle?: string; extra?: number } = {}) {
  await c.query(
    `insert into public.subscriptions (organization_id, plan_code, status, billing_cycle, extra_branches, trial_ends_at, current_period_end)
     values ($1, $2, $3, $4, $5, ${o.trial ? `now() + interval '${o.trial}'` : "null"}, ${o.period ? `now() + interval '${o.period}'` : "null"})
     on conflict (organization_id) do update set plan_code = excluded.plan_code, status = excluded.status, billing_cycle = excluded.billing_cycle,
       extra_branches = excluded.extra_branches, trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end`,
    [org, o.plan ?? "studio", status, o.cycle ?? "monthly", o.extra ?? 0],
  );
}
const sub = async (org: string) => (await asSuperuser(c), await c.query("select * from public.subscriptions where organization_id = $1", [org])).rows[0];
const asAdmin = () => switchTo(c, user(admin));
const invoice = async (args: unknown[] = [ID.orgA]) => {
  await asAdmin();
  const r = (await c.query("select public.platform_create_invoice($1, $2, $3, $4, $5, $6) as r", [args[0], args[1] ?? null, args[2] ?? null, args[3] ?? null, args[4] ?? null, args[5] ?? null])).rows[0].r;
  return r as { id: string; number: string; amount_cents: number; period_start: string; period_end: string };
};

describe("permisos", () => {
  it("solo el administrador de plataforma usa platform_*", async () => {
    const calls = [
      "select public.platform_overview()",
      `select public.platform_create_invoice('${ID.orgA}')`,
      `select public.platform_extend('${ID.orgA}', 7)`,
      `select public.platform_set_status('${ID.orgA}', 'suspended')`,
      "select public.platform_save_settings('a','b','c','d','e')",
    ];
    for (const who of [user(ID.ownerA), user(ID.adminA2), user(ID.stranger)]) {
      await switchTo(c, who);
      for (const q of calls) expect(await attemptMsg(c, () => c.query(q))).toBe("forbidden");
    }
    await switchTo(c, anon);
    for (const q of calls) expect(await attemptMsg(c, () => c.query(q))).toMatch(/permission denied/);
    await asAdmin();
    expect(await attemptMsg(c, () => c.query("select public.platform_overview()"))).toBeNull();
  });

  it("nadie puede ponerse a sí mismo como administrador", async () => {
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("update public.profiles set is_platform_admin = true where id = $1", [ID.ownerA]))).toMatch(/permission denied/);
  });
});

describe("vista general", () => {
  it("lista los negocios con su plan, estado, factura abierta y último pago", async () => {
    await asAdmin();
    const o = (await c.query("select public.platform_overview() as o")).rows[0].o;
    const a = o.organizations.find((x: { id: string }) => x.id === ID.orgA);
    expect(a).toMatchObject({ plan_code: "studio", status: "trialing", can_book: true, open_invoice: null, last_payment: null });
    expect(a.owner_email).toBeTruthy();
    expect(o.plans.map((p: { code: string }) => p.code)).toEqual(["solo", "studio", "salon"]);
    expect(o.settings).toMatchObject({ payee_name: "", bank_name: "" });
  });

  it("los negocios con problemas salen primero (pago pendiente, luego suspendidos)", async () => {
    await setSub(ID.orgA, "suspended", { period: "-20 days" });
    await setSub(ID.orgB, "past_due", { period: "-9 days" });
    await asAdmin();
    const ids = (await c.query("select public.platform_overview() as o")).rows[0].o.organizations.map((x: { id: string }) => x.id);
    expect(ids.indexOf(ID.orgB)).toBeLessThan(ids.indexOf(ID.orgA));
  });
});

describe("facturas", () => {
  it("importe: mensual = plan + sucursales extra; anual = 10 meses (2 gratis)", async () => {
    const m = await invoice([ID.orgA, null, 1]);
    expect(m.amount_cents).toBe(5900 + 3900); // Studio + 1 sucursal extra
    expect(m.number).toMatch(/^BRZ-\d{4}-\d{5}$/);
    await asAdmin();
    await c.query("select public.platform_void_invoice($1)", [m.id]);
    const a = await invoice([ID.orgA, "annual", 1]);
    expect(a.amount_cents).toBe(59000 + 3900 * 10);
    expect(new Date(a.period_end).getUTCFullYear() - new Date(a.period_start).getUTCFullYear()).toBeLessThanOrEqual(1);
  });

  it("se puede cambiar de plan al facturar y poner un importe a medida (descuento de piloto)", async () => {
    expect((await invoice([ID.orgA, null, null, "solo"])).amount_cents).toBe(2900);
    await asSuperuser(c);
    const id = (await c.query("select id from public.invoices where organization_id = $1", [ID.orgA])).rows[0].id;
    await asAdmin();
    await c.query("select public.platform_void_invoice($1)", [id]);
    expect((await invoice([ID.orgA, null, null, null, 1500, "Piloto -75%"])).amount_cents).toBe(1500);
    expect(await attemptMsg(c, () => c.query("select public.platform_create_invoice($1, null, null, 'inexistente')", [ID.orgB]))).toBe("invalid_plan");
    expect(await attemptMsg(c, () => c.query("select public.platform_create_invoice($1, null, null, null, 0)", [ID.orgB]))).toBe("invalid_amount");
  });

  it("solo una factura abierta por negocio; anulada, se puede generar otra", async () => {
    const first = await invoice();
    expect(await attemptMsg(c, () => c.query("select public.platform_create_invoice($1)", [ID.orgA]))).toBe("invoice_already_open");
    await c.query("select public.platform_void_invoice($1, 'error de importe')", [first.id]);
    const second = await invoice();
    expect(second.number).not.toBe(first.number);
    expect(await attemptMsg(c, () => c.query("select public.platform_void_invoice($1)", [first.id]))).toBe("invoice_not_open");
  });

  it("el periodo empieza donde acaba la prueba; si lleva >14 días vencido, empieza hoy", async () => {
    const inTrial = await invoice();
    await asSuperuser(c);
    const expected = (await c.query("select (trial_ends_at at time zone 'America/Grand_Turk')::date::text d from public.subscriptions where organization_id = $1", [ID.orgA])).rows[0].d;
    expect(String(inTrial.period_start).slice(0, 10)).toBe(expected);
    await asAdmin();
    await c.query("select public.platform_void_invoice($1)", [inTrial.id]);

    await asSuperuser(c);
    await setSub(ID.orgA, "suspended", { period: "-40 days" });
    const late = await invoice();
    await asSuperuser(c);
    const today = (await c.query("select (now() at time zone 'America/Grand_Turk')::date::text d")).rows[0].d;
    expect(String(late.period_start).slice(0, 10)).toBe(today);
  });

  it("no se factura a un negocio sin suscripción", async () => {
    await asSuperuser(c);
    await c.query("delete from public.subscriptions where organization_id = $1", [ID.orgB]);
    await asAdmin();
    expect(await attemptMsg(c, () => c.query("select public.platform_create_invoice($1)", [ID.orgB]))).toBe("not_found");
  });
});

describe("pagos", () => {
  it("registrar el pago: factura pagada, plan activo hasta el fin del periodo y todo auditado", async () => {
    await setSub(ID.orgA, "past_due", { period: "-9 days" });
    const inv = await invoice([ID.orgA, "annual", 2, "studio"]);
    await asAdmin();
    const r = (await c.query("select public.platform_register_payment($1, 'bank_transfer', 'TRF-123') as r", [inv.id])).rows[0].r;

    await asSuperuser(c);
    const s = await sub(ID.orgA);
    expect(s).toMatchObject({ status: "active", billing_cycle: "annual", extra_branches: 2, plan_code: "studio" });
    const endLocal = (await c.query("select ((current_period_end at time zone 'America/Grand_Turk')::date - 1)::text d from public.subscriptions where organization_id = $1", [ID.orgA])).rows[0].d;
    expect(endLocal).toBe(String(inv.period_end).slice(0, 10)); // acaba el último día del periodo pagado
    expect(new Date(r.current_period_end).getTime()).toBeGreaterThan(Date.now());

    const i = (await c.query("select status, paid_at from public.invoices where id = $1", [inv.id])).rows[0];
    expect(i.status).toBe("paid");
    expect(i.paid_at).not.toBeNull();
    const p = (await c.query("select amount_cents, method, reference, recorded_by from public.payments where invoice_id = $1", [inv.id])).rows[0];
    expect(p).toEqual({ amount_cents: inv.amount_cents, method: "bank_transfer", reference: "TRF-123", recorded_by: admin });
    const actions = (await c.query("select action from public.audit_log where organization_id = $1", [ID.orgA])).rows.map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["invoice.created", "payment.registered"]));
  });

  it("un pago ya registrado no se repite, ni se acepta menos importe ni una fecha futura", async () => {
    const inv = await invoice();
    await asAdmin();
    expect(await attemptMsg(c, () => c.query("select public.platform_register_payment($1, 'cash', null, null, $2)", [inv.id, inv.amount_cents - 1]))).toBe("amount_too_low");
    expect(await attemptMsg(c, () => c.query("select public.platform_register_payment($1, 'cash', null, now() + interval '10 days')", [inv.id]))).toBe("invalid_date");
    expect(await attemptMsg(c, () => c.query("select public.platform_register_payment($1, 'cash', 'recibo 1')", [inv.id]))).toBeNull();
    expect(await attemptMsg(c, () => c.query("select public.platform_register_payment($1, 'cash')", [inv.id]))).toBe("invoice_not_open");
    expect(await attemptMsg(c, () => c.query("select public.platform_register_payment(gen_random_uuid(), 'cash')"))).toBe("not_found");
  });

  it("un pago de más (efectivo redondeado) se acepta; una factura pagada ya no se anula", async () => {
    const inv = await invoice();
    await asAdmin();
    await c.query("select public.platform_register_payment($1, 'cash', null, null, $2)", [inv.id, inv.amount_cents + 100]);
    expect(await attemptMsg(c, () => c.query("select public.platform_void_invoice($1)", [inv.id]))).toBe("invoice_not_open");
  });

  it("tras pagar se puede facturar el siguiente periodo, que empieza donde acabó el anterior", async () => {
    const first = await invoice();
    await asAdmin();
    await c.query("select public.platform_register_payment($1, 'bank_transfer')", [first.id]);
    const next = await invoice();
    const nextStart = new Date(String(next.period_start).slice(0, 10));
    const firstEnd = new Date(String(first.period_end).slice(0, 10));
    expect(nextStart.getTime() - firstEnd.getTime()).toBe(86_400_000);
  });
});

describe("el dueño ve lo suyo (my_billing)", () => {
  it("plan, factura abierta con los datos para transferir, historial y pagos", async () => {
    await asAdmin();
    await c.query("select public.platform_save_settings('Breeze Ltd', 'Bank of TCI', '123-456', 'Use the invoice number as reference.', 'Usa el número de factura como referencia.')");
    const inv = await invoice();
    await switchTo(c, user(ID.ownerA));
    const b = (await c.query("select public.my_billing($1) as b", [ID.orgA])).rows[0].b;
    expect(b.subscription).toMatchObject({ plan_code: "studio", plan_name: "Studio", status: "trialing", can_book: true, monthly_price_cents: 5900 });
    expect(b.open_invoice).toMatchObject({ number: inv.number, amount_cents: 5900 });
    expect(b.instructions).toMatchObject({ payee_name: "Breeze Ltd", account_number: "123-456", instructions_es: "Usa el número de factura como referencia." });
    expect(b.invoices).toHaveLength(1);
    expect(b.payments).toEqual([]);
  });

  it("solo el dueño de ESE negocio (ni administradores, ni otros dueños, ni visitantes)", async () => {
    for (const who of [user(ID.adminA2), user(ID.ownerB), user(ID.stranger)]) {
      await switchTo(c, who);
      expect(await attemptMsg(c, () => c.query("select public.my_billing($1)", [ID.orgA]))).toBe("forbidden");
    }
    await switchTo(c, anon);
    expect(await attemptMsg(c, () => c.query("select public.my_billing($1)", [ID.orgA]))).toMatch(/permission denied/);
  });
});

describe("cortesías y parada manual", () => {
  it("platform_extend alarga la prueba y reactiva un negocio suspendido", async () => {
    await setSub(ID.orgA, "trialing", { trial: "2 days", period: "2 days" });
    await asAdmin();
    await c.query("select public.platform_extend($1, 7, 'esperando su transferencia')", [ID.orgA]);
    const t = await sub(ID.orgA);
    expect(t.status).toBe("trialing");
    expect(Math.round((new Date(t.trial_ends_at).getTime() - Date.now()) / 86_400_000)).toBe(9);
    expect(new Date(t.trial_ends_at).getTime()).toBe(new Date(t.current_period_end).getTime());

    await asSuperuser(c);
    await setSub(ID.orgB, "suspended", { period: "-30 days" });
    await asAdmin();
    await c.query("select public.platform_extend($1, 5)", [ID.orgB]);
    expect((await sub(ID.orgB)).status).toBe("active");
    await asAdmin();
    expect(await attemptMsg(c, () => c.query("select public.platform_extend($1, 0)", [ID.orgB]))).toBe("invalid_days");
    expect(await attemptMsg(c, () => c.query("select public.platform_extend($1, 400)", [ID.orgB]))).toBe("invalid_days");
  });

  it("solo se puede suspender o cancelar a mano; los datos no se tocan", async () => {
    await asAdmin();
    await c.query("select public.platform_set_status($1, 'suspended', 'impago')", [ID.orgB]);
    expect((await sub(ID.orgB)).status).toBe("suspended");
    await asAdmin();
    expect(await attemptMsg(c, () => c.query("select public.platform_set_status($1, 'active')", [ID.orgB]))).toBe("invalid_status");
    expect(await attemptMsg(c, () => c.query("select public.platform_set_status(gen_random_uuid(), 'suspended')"))).toBe("not_found");
    await asSuperuser(c);
    expect((await c.query("select count(*)::int n from public.salons where organization_id = $1", [ID.orgB])).rows[0].n).toBeGreaterThan(0);
  });

  it("un negocio suspendido desaparece del catálogo público, pero su personal lo sigue viendo", async () => {
    const visible = async () => ({
      salons: (await c.query("select 1 from public.salons where id = $1", [ID.salonB1])).rowCount,
      services: (await c.query("select 1 from public.services where salon_id = $1", [ID.salonB1])).rowCount,
    });
    await asSuperuser(c);
    await c.query("update public.salons set is_published = true where id = $1", [ID.salonB1]);
    await switchTo(c, anon);
    expect((await visible()).salons).toBe(1);

    await asSuperuser(c);
    await setSub(ID.orgB, "suspended", { period: "-30 days" });
    await switchTo(c, anon);
    expect(await visible()).toEqual({ salons: 0, services: 0 });
    await switchTo(c, user(ID.ownerB));
    expect((await visible()).salons).toBe(1);
  });

  it("los datos de pago se guardan y tienen un máximo de longitud", async () => {
    await asAdmin();
    await c.query("select public.platform_save_settings('A', 'B', 'C', 'D', 'E')");
    expect((await c.query("select public.platform_overview() as o")).rows[0].o.settings).toMatchObject({ payee_name: "A", bank_name: "B", account_number: "C", instructions_en: "D", instructions_es: "E" });
    expect(await attemptMsg(c, () => c.query("select public.platform_save_settings($1, '', '', '', '')", ["x".repeat(201)]))).toBe("too_long");
  });
});

describe("estado del plan: gracia y suspensión", () => {
  const can = async (org: string) => (await c.query("select private.org_can_book($1) as ok", [org])).rows[0].ok as boolean;

  it("org_can_book: en prueba, activo o con pago pendiente sí; suspendido, cancelado o sin plan no", async () => {
    await asSuperuser(c);
    const cases: [string, Parameters<typeof setSub>[2], boolean][] = [
      ["trialing", { trial: "5 days", period: "5 days" }, true],
      ["active", { period: "20 days" }, true],
      ["past_due", { period: "-9 days" }, true],
      ["trialing", { trial: "-3 days" }, true], // prueba vencida hace 3 días: gracia
      ["active", { period: "-15 days" }, false], // aunque el barrido no corrió, a los 14 días se corta
      ["suspended", { period: "20 days" }, false],
      ["cancelled", { period: "20 days" }, false],
    ];
    for (const [status, o, expected] of cases) {
      await setSub(ID.orgA, status, o);
      expect(await can(ID.orgA), `${status} ${JSON.stringify(o)}`).toBe(expected);
    }
    await c.query("delete from public.subscriptions where organization_id = $1", [ID.orgA]);
    expect(await can(ID.orgA)).toBe(false);
  });

  it("el barrido diario: a los 7 días 'past_due' y a los 14 'suspended'; no toca lo vigente ni lo cancelado", async () => {
    await asSuperuser(c);
    await setSub(ID.orgA, "active", { period: "-8 days" });
    await setSub(ID.orgB, "trialing", { trial: "-15 days" });
    const r1 = (await c.query("select private.billing_sweep() as r")).rows[0].r;
    expect(r1).toEqual({ suspended: 1, past_due: 1 });
    expect((await sub(ID.orgA)).status).toBe("past_due");
    expect((await sub(ID.orgB)).status).toBe("suspended");

    await setSub(ID.orgA, "active", { period: "3 days" });
    await setSub(ID.orgB, "cancelled", { period: "-90 days" });
    expect(await c.query("select private.billing_sweep() as r").then((x) => x.rows[0].r)).toEqual({ suspended: 0, past_due: 0 });
    expect((await sub(ID.orgA)).status).toBe("active");
    expect((await sub(ID.orgB)).status).toBe("cancelled");

    await setSub(ID.orgA, "past_due", { period: "-10 days" });
    await c.query("select private.billing_sweep()");
    expect((await sub(ID.orgA)).status).toBe("past_due"); // aún dentro de los 14 días
    const audit = (await c.query("select action from public.audit_log where organization_id = $1 and action like 'subscription.%'", [ID.orgB])).rows;
    expect(audit.map((x) => x.action)).toContain("subscription.suspended");
  });

  it("el ciclo completo: prueba vencida → pago → vuelve a estar activo", async () => {
    await asSuperuser(c);
    await setSub(ID.orgA, "suspended", { trial: "-20 days", period: "-20 days" });
    expect(await can(ID.orgA)).toBe(false);
    const inv = await invoice();
    await asAdmin();
    await c.query("select public.platform_register_payment($1, 'cash', 'recibo 7')", [inv.id]);
    await asSuperuser(c);
    expect(await can(ID.orgA)).toBe(true);
    expect((await sub(ID.orgA)).status).toBe("active");
  });

  it("Breeze Live se apaga con el plan suspendido, y vuelve con el pago", async () => {
    await asSuperuser(c);
    await setSub(ID.orgA, "suspended", { period: "-20 days" });
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.get_live_board($1)", [ID.salonA1]))).toBe("subscription_inactive");
    await asSuperuser(c);
    await setSub(ID.orgA, "active", { period: "20 days" });
    await switchTo(c, user(ID.ownerA));
    expect(await attemptMsg(c, () => c.query("select public.get_live_board($1)", [ID.salonA1]))).toBeNull();
  });
});
