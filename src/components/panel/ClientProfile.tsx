"use client";
import { ArrowLeft, Lock, Pencil, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { addCustomerNote, deleteCustomerNote, saveCustomer } from "@/app/dashboard/actions";
import { useAppLocale } from "@/components/Providers";
import { telHref } from "@/lib/booking/calendar";
import { formatPrice } from "@/lib/mock/data";
import { initialsOf, prettyPhone } from "@/lib/panel/clients";
import { formatDayShort, formatTime } from "@/lib/time";
import { Toggle } from "./LiveProfessionals";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  locale: "en" | "es";
  whatsappOptIn: boolean;
  marketingOptIn: boolean;
}
interface Note { id: string; authorId: string | null; authorName: string; body: string; createdAt: string }
interface Visit { id: string; groupId: string; startsAt: string; status: string; serviceEn: string; serviceEs: string; priceCents: number; proName: string }

const STATUS_STYLE: Record<string, string> = {
  booked: "bg-breeze-50 text-lagoon",
  completed: "bg-green-50 text-green-800",
  cancelled: "bg-ink/5 text-ink/70",
  no_show: "bg-amber-50 text-amber-900",
};

export function ClientProfile({ customer, notes, visits, canEdit, meId }: { customer: Customer; notes: Note[]; visits: Visit[]; canEdit: boolean; meId: string }) {
  const t = useTranslations("clients");
  const tt = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ ...customer });
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "generic");
      after?.();
      router.refresh();
    });

  // Una visita puede tener varios servicios (misma reserva): se agrupan.
  const groups = useMemo(() => {
    const m = new Map<string, { startsAt: string; status: string; services: string[]; proName: string; total: number }>();
    for (const v of [...visits].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const g = m.get(v.groupId) ?? { startsAt: v.startsAt, status: v.status, services: [], proName: v.proName, total: 0 };
      g.services.push(locale === "es" ? v.serviceEs : v.serviceEn);
      g.total += v.priceCents;
      m.set(v.groupId, g);
    }
    return [...m.entries()].map(([id, g]) => ({ id, ...g })).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  }, [visits, locale]);
  const doneCount = groups.filter((g) => g.status !== "cancelled" && new Date(g.startsAt) <= new Date()).length;

  const when = (iso: string) => `${formatDayShort(new Date(iso), locale)} · ${formatTime(new Date(iso))}`;
  const dateOnly = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "America/Grand_Turk" }).format(new Date(iso));
  const tel = telHref(customer.phone);
  const field = "mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100";
  const yes = (v: boolean) => t(v ? "yes" : "no");

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm font-bold text-lagoon hover:underline"><ArrowLeft className="size-4" /> {t("title")}</Link>

      <header className="mt-4 flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-lagoon text-lg font-extrabold text-white" aria-hidden>{initialsOf(customer.firstName, customer.lastName)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{`${customer.firstName} ${customer.lastName}`.trim()}</h1>
          <p className="text-sm text-ink/70">{t("visits", { count: doneCount })}</p>
        </div>
      </header>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{tt(`panel.errors.${error}`)}</p>}

      {/* Contacto y permisos */}
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="contact-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="contact-title" className="font-bold">{t("contact")}</h2>
          {canEdit && !editing && (
            <button onClick={() => { setF({ ...customer }); setEditing(true); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-lagoon hover:underline"><Pencil className="size-4" /> {t("edit")}</button>
          )}
        </div>
        {!editing ? (
          <dl className="mt-3 divide-y divide-breeze-50 text-sm">
            <div className="flex justify-between gap-4 py-2"><dt className="text-ink/70">{t("phone")}</dt><dd className="font-semibold">{prettyPhone(customer.phone)}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-ink/70">{t("email")}</dt><dd className="break-all text-right font-semibold">{customer.email || "—"}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-ink/70">{t("language")}</dt><dd className="font-semibold">{t(`lang.${customer.locale}`)}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-ink/70">{t("whatsapp")}</dt><dd className="font-semibold">{yes(customer.whatsappOptIn)}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-ink/70">{t("marketing")}</dt><dd className="font-semibold">{yes(customer.marketingOptIn)}</dd></div>
          </dl>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-xs font-bold text-ink/70">{tt("booking.first")}</span><input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} className={field} /></label>
              <label className="block"><span className="text-xs font-bold text-ink/70">{tt("booking.last")}</span><input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} className={field} /></label>
            </div>
            <label className="block"><span className="text-xs font-bold text-ink/70">{t("phone")}</span><input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={field} /></label>
            <label className="block"><span className="text-xs font-bold text-ink/70">{t("email")}</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} /></label>
            <label className="block"><span className="text-xs font-bold text-ink/70">{t("language")}</span>
              <select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as "en" | "es" })} className={field}><option value="en">{t("lang.en")}</option><option value="es">{t("lang.es")}</option></select></label>
            <Toggle label={t("whatsapp")} checked={f.whatsappOptIn} onChange={(v) => setF({ ...f, whatsappOptIn: v })} />
            <Toggle label={t("marketing")} checked={f.marketingOptIn} onChange={(v) => setF({ ...f, marketingOptIn: v })} />
            <div className="flex gap-2">
              <button disabled={pending} onClick={() => run(() => saveCustomer({ ...f, id: customer.id }), () => setEditing(false))} className="rounded-xl bg-lagoon px-5 py-2.5 font-bold text-white shadow hover:bg-breeze-800 disabled:opacity-50">{t("save")}</button>
              <button disabled={pending} onClick={() => { setEditing(false); setError(null); }} className="rounded-xl bg-white px-5 py-2.5 font-bold ring-1 ring-breeze-200 hover:bg-breeze-50">{tt("common.cancel")}</button>
            </div>
          </div>
        )}
        {!canEdit && <p className="mt-3 text-xs text-ink/70">{t("editOnlyManagers")}</p>}
        {tel && !editing && (
          <a href={tel} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50"><Phone className="size-4" /> {t("call")}</a>
        )}
      </section>

      {/* Notas privadas */}
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="notes-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="notes-title" className="font-bold">{t("notes")}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-breeze-50 px-2.5 py-1 text-xs font-bold text-lagoon"><Lock className="size-3.5" /> {t("notesPrivate")}</span>
        </div>
        <ul className="mt-2 divide-y divide-breeze-50">
          {notes.length === 0 && <li className="py-3 text-sm text-ink/70">{t("noNotes")}</li>}
          {notes.map((n) => (
            <li key={n.id} className="py-3 text-sm">
              <p className="whitespace-pre-line break-words">{n.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink/70">
                <span>{n.authorName || t("unknownAuthor")} · {dateOnly(n.createdAt)}</span>
                {n.authorId === meId && (confirmId === n.id ? (
                  <span className="inline-flex items-center gap-2">
                    <button disabled={pending} onClick={() => run(() => deleteCustomerNote(n.id, customer.id), () => setConfirmId(null))} className="font-bold text-red-700 hover:underline">{t("confirmDelete")}</button>
                    <button onClick={() => setConfirmId(null)} className="font-semibold hover:underline">{tt("common.cancel")}</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmId(n.id)} aria-label={t("deleteNote")} className="inline-flex items-center gap-1 font-semibold text-ink/70 hover:text-red-700"><Trash2 className="size-3.5" /> {t("deleteNote")}</button>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <label className="mt-2 block"><span className="sr-only">{t("newNote")}</span>
          <textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className="w-full rounded-xl bg-foam px-3 py-2.5 text-sm ring-1 ring-breeze-100" /></label>
        <button disabled={pending || !note.trim()} onClick={() => run(() => addCustomerNote(customer.id, note), () => setNote(""))} className="mt-2 rounded-xl bg-lagoon px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-breeze-800 disabled:opacity-50">{t("saveNote")}</button>
      </section>

      {/* Historial */}
      <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="history-title">
        <h2 id="history-title" className="font-bold">{t("history")}</h2>
        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">{t("noHistory")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-breeze-50">
            {groups.map((g) => {
              const upcoming = g.status === "booked" && new Date(g.startsAt) > new Date();
              return (
                <li key={g.id} className="flex items-start gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{g.services.join(" + ")}</p>
                    <p className="text-ink/70">{when(g.startsAt)}{g.proName && ` · ${g.proName}`}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[g.status] ?? STATUS_STYLE.booked}`}>{upcoming ? t("upcoming") : tt(`status.${g.status}`)}</span>
                    <p className="mt-1 text-xs text-ink/70">{formatPrice(g.total)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
