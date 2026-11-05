"use client";
import { Banknote, LogOut, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { createInvoice, extendOrg, registerPayment, saveSettings, stopOrg, voidInvoice, type AdminResult } from "@/app/admin/actions";
import { useAppLocale } from "@/components/Providers";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { billingDate, monthlyRecurringCents, type PlatformOrg, type PlatformOverview, type SubscriptionStatus } from "@/lib/billing";
import { formatPrice } from "@/lib/mock/data";
import { localDateKey } from "@/lib/time";

type Action = "invoice" | "payment" | "extend" | "stop" | "void";
type Filter = "all" | "attention" | "trialing" | "active";

const STATUS_STYLE: Record<string, string> = {
  trialing: "bg-breeze-50 text-lagoon",
  active: "bg-green-50 text-green-700",
  past_due: "bg-amber-50 text-amber-800",
  suspended: "bg-red-50 text-red-700",
  cancelled: "bg-ink/5 text-ink/70",
};

const field = "mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-breeze-200 outline-none focus:ring-2 focus:ring-breeze-400";
const primary = "rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white hover:bg-breeze-800 disabled:opacity-60";
const ghost = "rounded-xl px-3 py-2 text-sm font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50";

/** Necesita atención: pago vencido o en aviso, suspendido, o prueba a punto de acabar. */
function needsAttention(o: PlatformOrg, now: number): boolean {
  if (o.status === "past_due" || o.status === "suspended") return true;
  const end = o.current_period_end ?? o.trial_ends_at;
  if (!end || !o.status || o.status === "cancelled") return false;
  const ms = new Date(end).getTime() - now;
  return ms < 0 || (o.status === "trialing" && ms < 3 * 86_400_000);
}

export function AdminConsole({ data }: { data: PlatformOverview }) {
  const t = useTranslations("admin");
  const tp = useTranslations("panel.plan");
  const { locale } = useAppLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<{ id: string; kind: Action } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const now = useMemo(() => Date.now(), []);

  const run = (fn: () => Promise<AdminResult>, okText: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ ok: true, text: okText });
        setOpen(null);
        router.refresh();
      } else {
        setMsg({ ok: false, text: t(`errors.${r.error}`) });
      }
    });

  const orgs = data.organizations;
  const count = (s: SubscriptionStatus) => orgs.filter((o) => o.status === s).length;
  const mrr = monthlyRecurringCents(orgs, data.plans);
  const shown = orgs.filter((o) =>
    filter === "all" ? true : filter === "attention" ? needsAttention(o, now) : o.status === filter,
  );

  return (
    <div className="min-h-dvh bg-foam/50">
      <header className="border-b border-breeze-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <span className="inline-flex items-center gap-3">
            <Logo href="/admin" />
            <span className="rounded-full border border-lagoon/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lagoon">{t("tag")}</span>
          </span>
          <span className="flex items-center gap-3">
            <LocaleSwitcher />
            <form action={signOut}>
              <input type="hidden" name="to" value="/negocios" />
              <button className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/70 hover:text-ink" aria-label={t("signOut")}>
                <LogOut className="size-4" />
              </button>
            </form>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            [t("kpi.businesses"), String(orgs.length)],
            [t("kpi.trialing"), String(count("trialing"))],
            [t("kpi.active"), String(count("active"))],
            [t("kpi.attention"), String(count("past_due") + count("suspended"))],
            [t("kpi.mrr"), formatPrice(mrr)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
              <dt className="text-xs font-semibold text-ink/70">{k}</dt>
              <dd className="mt-1 text-2xl font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t("filters.label")}>
          {(["all", "attention", "trialing", "active"] as Filter[]).map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${filter === f ? "bg-lagoon text-white ring-lagoon" : "bg-white text-ink/70 ring-breeze-100 hover:bg-breeze-50"}`}
            >
              {t(`filters.${f}`)}
            </button>
          ))}
        </div>

        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </p>
        )}

        <ul className="mt-4 space-y-3">
          {shown.length === 0 && <li className="rounded-2xl bg-white p-8 text-center text-ink/70 ring-1 ring-breeze-100">{t("empty")}</li>}
          {shown.map((o) => {
            const end = o.current_period_end ?? o.trial_ends_at;
            const isOpen = open?.id === o.id ? open.kind : null;
            const plan = data.plans.find((p) => p.code === o.plan_code);
            return (
              <li key={o.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-breeze-100">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{o.name}</p>
                    <p className="truncate text-sm text-ink/70">{o.owner_name ? `${o.owner_name} · ` : ""}{o.owner_email}</p>
                    <p className="mt-1 text-xs text-ink/70">
                      {t("salons", { published: o.published_salons, total: o.salons })} · {t("since", { date: billingDate(o.created_at, locale) })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {o.status && <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[o.status]}`}>{tp(`status.${o.status}`)}</span>}
                    <span className="text-xs text-ink/70">{plan?.name ?? o.plan_code}{o.billing_cycle === "annual" ? ` · ${t("annual")}` : ""}</span>
                    {!o.can_book && <span className="text-xs font-bold text-red-700">{t("paused")}</span>}
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-ink/70">{o.status === "trialing" ? t("trialEnds") : t("periodEnds")}</dt><dd className="font-semibold">{end ? billingDate(end, locale) : "—"}</dd></div>
                  <div><dt className="text-xs text-ink/70">{t("openInvoice")}</dt><dd className="font-semibold">{o.open_invoice ? `${o.open_invoice.number} · ${formatPrice(o.open_invoice.amount_cents)}` : "—"}</dd></div>
                  <div><dt className="text-xs text-ink/70">{t("lastPayment")}</dt><dd className="font-semibold">{o.last_payment ? `${formatPrice(o.last_payment.amount_cents)} · ${billingDate(o.last_payment.received_at, locale)}` : "—"}</dd></div>
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  {o.open_invoice ? (
                    <>
                      <button className={primary} onClick={() => setOpen(isOpen === "payment" ? null : { id: o.id, kind: "payment" })}>{t("actions.payment")}</button>
                      <button className={ghost} onClick={() => setOpen(isOpen === "void" ? null : { id: o.id, kind: "void" })}>{t("actions.void")}</button>
                    </>
                  ) : (
                    <button className={primary} onClick={() => setOpen(isOpen === "invoice" ? null : { id: o.id, kind: "invoice" })}>{t("actions.invoice")}</button>
                  )}
                  <button className={ghost} onClick={() => setOpen(isOpen === "extend" ? null : { id: o.id, kind: "extend" })}>{t("actions.extend")}</button>
                  {o.status !== "suspended" && o.status !== "cancelled" && (
                    <button className={ghost} onClick={() => setOpen(isOpen === "stop" ? null : { id: o.id, kind: "stop" })}>{t("actions.stop")}</button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-3 rounded-2xl bg-foam p-4 ring-1 ring-breeze-100">
                    {isOpen === "invoice" && (
                      <InvoiceForm org={o} plans={data.plans} pending={pending} onSubmit={(v) => run(() => createInvoice(o.id, v), t("done.invoice"))} />
                    )}
                    {isOpen === "payment" && o.open_invoice && (
                      <PaymentForm invoice={o.open_invoice} pending={pending} onSubmit={(v) => run(() => registerPayment(o.open_invoice!.id, v), t("done.payment"))} />
                    )}
                    {isOpen === "void" && o.open_invoice && (
                      <ReasonForm label={t("forms.voidReason")} submit={t("actions.void")} pending={pending} onSubmit={(r) => run(() => voidInvoice(o.open_invoice!.id, r), t("done.void"))} />
                    )}
                    {isOpen === "extend" && <ExtendForm pending={pending} onSubmit={(d, r) => run(() => extendOrg(o.id, d, r), t("done.extend"))} />}
                    {isOpen === "stop" && (
                      <ReasonForm label={t("forms.stopReason")} submit={t("actions.stop")} pending={pending} onSubmit={(r) => run(() => stopOrg(o.id, "suspended", r), t("done.stop"))} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <SettingsForm
          settings={data.settings}
          pending={pending}
          onSubmit={(v) => run(() => saveSettings(v), t("done.settings"))}
        />
      </main>
    </div>
  );
}

function InvoiceForm({
  org,
  plans,
  pending,
  onSubmit,
}: {
  org: PlatformOrg;
  plans: PlatformOverview["plans"];
  pending: boolean;
  onSubmit: (v: { cycle: "monthly" | "annual"; extraBranches: number; planCode: string; amount: string; note: string }) => void;
}) {
  const t = useTranslations("admin.forms");
  const [cycle, setCycle] = useState<"monthly" | "annual">(org.billing_cycle ?? "monthly");
  const [extra, setExtra] = useState(org.extra_branches ?? 0);
  const [planCode, setPlanCode] = useState(org.plan_code ?? plans[0]?.code ?? "studio");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const p = plans.find((x) => x.code === planCode);
  const auto = p ? (cycle === "annual" ? p.annual_price_cents + extra * p.extra_branch_price_cents * 10 : p.monthly_price_cents + extra * p.extra_branch_price_cents) : 0;
  const id = `inv-${org.id}`;
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSubmit({ cycle, extraBranches: extra, planCode, amount, note }); }}>
      <label htmlFor={`${id}-plan`} className="text-xs font-bold text-ink/70">{t("plan")}
        <select id={`${id}-plan`} className={field} value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
          {plans.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-cycle`} className="text-xs font-bold text-ink/70">{t("cycle")}
        <select id={`${id}-cycle`} className={field} value={cycle} onChange={(e) => setCycle(e.target.value as "monthly" | "annual")}>
          <option value="monthly">{t("monthly")}</option>
          <option value="annual">{t("annual")}</option>
        </select>
      </label>
      <label htmlFor={`${id}-extra`} className="text-xs font-bold text-ink/70">{t("extraBranches")}
        <input id={`${id}-extra`} type="number" min={0} max={50} className={field} value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
      </label>
      <label htmlFor={`${id}-amount`} className="text-xs font-bold text-ink/70">{t("customAmount", { auto: formatPrice(auto) })}
        <input id={`${id}-amount`} inputMode="decimal" placeholder="—" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label htmlFor={`${id}-note`} className="text-xs font-bold text-ink/70 sm:col-span-2">{t("note")}
        <input id={`${id}-note`} maxLength={300} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="sm:col-span-2"><button className={primary} disabled={pending}>{t("createInvoice")}</button></div>
    </form>
  );
}

function PaymentForm({
  invoice,
  pending,
  onSubmit,
}: {
  invoice: NonNullable<PlatformOrg["open_invoice"]>;
  pending: boolean;
  onSubmit: (v: { method: "bank_transfer" | "cash" | "other"; reference: string; receivedOn: string; amount: string }) => void;
}) {
  const t = useTranslations("admin.forms");
  const tm = useTranslations("billing.method");
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "other">("bank_transfer");
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState(localDateKey(new Date()));
  const [amount, setAmount] = useState("");
  const id = `pay-${invoice.id}`;
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSubmit({ method, reference, receivedOn, amount }); }}>
      <p className="text-sm sm:col-span-2"><Banknote className="mr-1 inline size-4 text-lagoon" />{t("paymentFor", { number: invoice.number, amount: formatPrice(invoice.amount_cents) })}</p>
      <label htmlFor={`${id}-method`} className="text-xs font-bold text-ink/70">{t("method")}
        <select id={`${id}-method`} className={field} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          {(["bank_transfer", "cash", "other"] as const).map((m) => <option key={m} value={m}>{tm(m)}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-ref`} className="text-xs font-bold text-ink/70">{t("reference")}
        <input id={`${id}-ref`} maxLength={120} className={field} value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      <label htmlFor={`${id}-date`} className="text-xs font-bold text-ink/70">{t("receivedOn")}
        <input id={`${id}-date`} type="date" max={localDateKey(new Date())} className={field} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
      </label>
      <label htmlFor={`${id}-amount`} className="text-xs font-bold text-ink/70">{t("paidAmount", { amount: formatPrice(invoice.amount_cents) })}
        <input id={`${id}-amount`} inputMode="decimal" placeholder="—" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="sm:col-span-2"><button className={primary} disabled={pending}>{t("registerPayment")}</button></div>
    </form>
  );
}

function ExtendForm({ pending, onSubmit }: { pending: boolean; onSubmit: (days: number, reason: string) => void }) {
  const t = useTranslations("admin.forms");
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSubmit(days, reason); }}>
      <p className="text-sm sm:col-span-2">{t("extendHint")}</p>
      <label className="text-xs font-bold text-ink/70">{t("days")}
        <input type="number" min={1} max={365} className={field} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </label>
      <label className="text-xs font-bold text-ink/70">{t("reason")}
        <input maxLength={300} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="sm:col-span-2"><button className={primary} disabled={pending}>{t("extend")}</button></div>
    </form>
  );
}

function ReasonForm({ label, submit, pending, onSubmit }: { label: string; submit: string; pending: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}>
      <label className="min-w-0 flex-1 text-xs font-bold text-ink/70">{label}
        <input maxLength={300} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className={primary} disabled={pending}>{submit}</button>
    </form>
  );
}

function SettingsForm({
  settings,
  pending,
  onSubmit,
}: {
  settings: PlatformOverview["settings"];
  pending: boolean;
  onSubmit: (v: { payeeName: string; bankName: string; accountNumber: string; instructionsEn: string; instructionsEs: string }) => void;
}) {
  const t = useTranslations("admin.settings");
  const [v, setV] = useState({
    payeeName: settings.payee_name, bankName: settings.bank_name, accountNumber: settings.account_number,
    instructionsEn: settings.instructions_en, instructionsEs: settings.instructions_es,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <details className="mt-8 rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
      <summary className="flex cursor-pointer items-center gap-2 font-extrabold"><Settings2 className="size-5 text-lagoon" /> {t("title")}</summary>
      <p className="mt-2 text-sm text-ink/70">{t("hint")}</p>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
        <label htmlFor="set-payee" className="text-xs font-bold text-ink/70">{t("payee")}<input id="set-payee" maxLength={200} className={field} value={v.payeeName} onChange={set("payeeName")} /></label>
        <label htmlFor="set-bank" className="text-xs font-bold text-ink/70">{t("bank")}<input id="set-bank" maxLength={200} className={field} value={v.bankName} onChange={set("bankName")} /></label>
        <label htmlFor="set-account" className="text-xs font-bold text-ink/70 sm:col-span-2">{t("account")}<input id="set-account" maxLength={200} className={field} value={v.accountNumber} onChange={set("accountNumber")} /></label>
        <label htmlFor="set-es" className="text-xs font-bold text-ink/70">{t("instructionsEs")}<textarea id="set-es" rows={3} maxLength={1000} className={field} value={v.instructionsEs} onChange={set("instructionsEs")} /></label>
        <label htmlFor="set-en" className="text-xs font-bold text-ink/70">{t("instructionsEn")}<textarea id="set-en" rows={3} maxLength={1000} className={field} value={v.instructionsEn} onChange={set("instructionsEn")} /></label>
        <div className="sm:col-span-2"><button className={primary} disabled={pending}>{t("save")}</button></div>
      </form>
    </details>
  );
}
