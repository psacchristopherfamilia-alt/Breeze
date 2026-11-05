"use client";
import { CalendarOff, Check, Clock, Copy, Link2, Loader2, Lock, Mail, Pencil, Plus, Scissors, Trash2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addTimeOff, deleteTimeOff, inviteProfessional, saveProfessional, setHours, setProServices } from "@/app/dashboard/actions";
import { Modal } from "@/components/agenda/AgendaView";
import { useAppLocale } from "@/components/Providers";
import { ProBadge } from "@/components/ui/ProBadge";
import type { WeeklyHours } from "@/lib/availability";
import { PRO_COLORS, withAlpha } from "@/lib/colors";
import { formatPrice } from "@/lib/mock/data";
import { addDaysKey, atLocal, formatDayShort } from "@/lib/time";

const TITLES = ["barber", "stylist", "nail_tech", "makeup_artist", "esthetician", "massage_therapist", "other"] as const;
const WEEK = [1, 2, 3, 4, 5, 6, 0];

interface Pro {
  id: string;
  firstName: string;
  lastName: string;
  colorHex: string;
  title: string;
  isActive: boolean;
  acceptsOnline: boolean;
  acceptsCash: boolean;
  acceptsCard: boolean;
  acceptsTransfer: boolean;
  paymentNote: string;
  serviceIds: string[];
  hours: WeeklyHours;
}
interface Service {
  id: string;
  nameEn: string;
  nameEs: string;
  durationMin: number;
  priceCents: number;
}
interface TimeOff {
  id: string;
  professionalId: string;
  start: string;
  end: string;
  reason: string | null;
}

type Dialog =
  | { kind: "pro"; pro: Pro | null }
  | { kind: "hours"; pro: Pro }
  | { kind: "services"; pro: Pro }
  | { kind: "invite"; pro: Pro }
  | { kind: "off"; pro: Pro }
  | null;

export function LiveProfessionals({
  salon,
  pros,
  services,
  linked,
  pendingInvites,
  timeOff,
}: {
  salon: { id: string; name: string; organizationId: string };
  pros: Pro[];
  services: Service[];
  linked: string[];
  pendingInvites: { professionalId: string; contact: string }[];
  timeOff: TimeOff[];
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, start] = useTransition();
  const svcName = (s: Service) => (locale === "es" ? s.nameEs : s.nameEn);
  const close = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/50">{salon.name}</p>
          <h1 className="text-2xl font-extrabold">{t("pros.title")}</h1>
          <p className="mt-1 text-sm text-ink/60">{t("pros.subtitle")}</p>
        </div>
        <button onClick={() => setDialog({ kind: "pro", pro: null })} className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800">
          <Plus className="size-4" /> {t("pros.add")}
        </button>
      </div>

      {pros.length === 0 && <p className="mt-6 rounded-3xl bg-white p-10 text-center text-ink/60 ring-1 ring-breeze-100">{t("pros.empty")}</p>}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pros.map((p) => {
          const isLinked = linked.includes(p.id);
          const invite = pendingInvites.find((i) => i.professionalId === p.id);
          const offs = timeOff.filter((o) => o.professionalId === p.id);
          return (
            <article key={p.id} className={`overflow-hidden rounded-3xl bg-white ring-1 ring-breeze-100 animate-fade-up ${p.isActive ? "" : "opacity-60"}`}>
              <div className="h-2" style={{ backgroundColor: p.colorHex }} />
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <ProBadge pro={p} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{p.firstName} {p.lastName}</p>
                    <p className="text-sm text-ink/50">
                      {t(`titles.${p.title}`)}
                      {!p.isActive && ` · ${t("pros.inactive")}`}
                      {p.isActive && !p.acceptsOnline && ` · ${t("pros.noOnline")}`}
                    </p>
                  </div>
                  <IconBtn label={t("pros.edit")} onClick={() => setDialog({ kind: "pro", pro: p })}><Pencil className="size-4" /></IconBtn>
                </div>

                <Section icon={<Scissors className="size-3.5" />} title={`${t("pros.services")} (${p.serviceIds.length})`} onEdit={() => setDialog({ kind: "services", pro: p })} editLabel={t("pros.edit")}>
                  <p className="text-sm text-ink/70">
                    {services.filter((s) => p.serviceIds.includes(s.id)).map(svcName).join(" · ") || <span className="text-amber-700">{t("pros.noServices")}</span>}
                  </p>
                </Section>

                <Section icon={<Clock className="size-3.5" />} title={t("pros.hours")} onEdit={() => setDialog({ kind: "hours", pro: p })} editLabel={t("pros.edit")}>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                    {WEEK.map((d) => {
                      const h = p.hours[d];
                      return (
                        <div key={d} className={`rounded-lg py-1.5 ${h ? "font-bold" : "text-ink/30"}`} style={h ? { backgroundColor: withAlpha(p.colorHex, 0.1), color: p.colorHex } : { backgroundColor: "#f2fbfb" }}>
                          {t(`weekdays.${d}`)}
                          <span className="block font-normal">{h ? `${h[0][0].replace(":00", "")}–${h[h.length - 1][1].replace(":00", "")}` : t("pros.off")}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section icon={<CalendarOff className="size-3.5" />} title={t("pros.timeOff")} onEdit={() => setDialog({ kind: "off", pro: p })} editLabel={t("pros.addTimeOff")} editIcon={<Plus className="size-3.5" />}>
                  {offs.length === 0 ? (
                    <p className="text-sm text-ink/40">—</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {offs.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2">
                          <span>
                            {formatDayShort(new Date(o.start), locale)} → {formatDayShort(new Date(new Date(o.end).getTime() - 1), locale)}
                            {o.reason && <span className="text-ink/50"> · {o.reason}</span>}
                          </span>
                          <button aria-label={t("common.delete")} disabled={pending} onClick={() => start(async () => { await deleteTimeOff(o.id); router.refresh(); })} className="text-ink/40 hover:text-red-600">
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <div className="mt-4 border-t border-breeze-100 pt-3 text-sm">
                  {isLinked ? (
                    <p className="inline-flex items-center gap-1.5 font-semibold text-lagoon"><UserCheck className="size-4" /> {t("pros.linked")}</p>
                  ) : invite ? (
                    <p className="inline-flex items-center gap-1.5 text-ink/60"><Mail className="size-4" /> {t("pros.invited", { contact: invite.contact })}</p>
                  ) : (
                    <button onClick={() => setDialog({ kind: "invite", pro: p })} className="inline-flex items-center gap-1.5 font-semibold text-lagoon hover:underline">
                      <Link2 className="size-4" /> {t("pros.invite")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {dialog?.kind === "pro" && <ProDialog salonId={salon.id} pro={dialog.pro} taken={pros.filter((p) => p.isActive && p.id !== dialog.pro?.id)} onClose={close} />}
      {dialog?.kind === "hours" && <HoursDialog pro={dialog.pro} onClose={close} />}
      {dialog?.kind === "services" && <ServicesDialog pro={dialog.pro} services={services} onClose={close} />}
      {dialog?.kind === "invite" && <InviteDialog pro={dialog.pro} salon={salon} onClose={close} />}
      {dialog?.kind === "off" && <TimeOffDialog pro={dialog.pro} onClose={close} />}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-full text-ink/50 hover:bg-breeze-50 hover:text-lagoon">
      {children}
    </button>
  );
}

function Section({ icon, title, onEdit, editLabel, editIcon, children }: { icon: React.ReactNode; title: string; onEdit: () => void; editLabel: string; editIcon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/40">{icon} {title}</p>
        <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-semibold text-lagoon hover:underline">{editIcon ?? <Pencil className="size-3" />} {editLabel}</button>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function useSave() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onOk();
      else setError(r.error ?? "generic");
    });
  return { pending, error, run };
}

function Footer({ pending, error, onSave, label }: { pending: boolean; error: string | null; onSave: () => void; label?: string }) {
  const t = useTranslations();
  return (
    <>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
      <button onClick={onSave} disabled={pending} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lagoon py-3 font-bold text-white disabled:opacity-50">
        {pending && <Loader2 className="size-4 animate-spin" />} {label ?? t("common.save")}
      </button>
    </>
  );
}

function ProDialog({ salonId, pro, taken, onClose }: { salonId: string; pro: Pro | null; taken: Pro[]; onClose: () => void }) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const { pending, error, run } = useSave();
  const [f, setF] = useState({
    firstName: pro?.firstName ?? "",
    lastName: pro?.lastName ?? "",
    title: (pro?.title ?? "barber") as (typeof TITLES)[number],
    colorHex: pro?.colorHex ?? PRO_COLORS.find((c) => !taken.some((p) => p.colorHex === c.hex))?.hex ?? PRO_COLORS[0].hex,
    isActive: pro?.isActive ?? true,
    acceptsOnline: pro?.acceptsOnline ?? true,
    acceptsCash: pro?.acceptsCash ?? true,
    acceptsCard: pro?.acceptsCard ?? false,
    acceptsTransfer: pro?.acceptsTransfer ?? false,
    paymentNote: pro?.paymentNote ?? "",
  });

  return (
    <Modal title={pro ? t("pros.editTitle") : t("pros.add")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Input label={t("booking.first")} value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} />
          <Input label={t("booking.last")} value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} />
        </div>
        <label className="block">
          <span className="text-xs font-bold text-ink/60">{t("pros.role")}</span>
          <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value as (typeof TITLES)[number] })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100">
            {TITLES.map((ti) => <option key={ti} value={ti}>{t(`titles.${ti}`)}</option>)}
          </select>
        </label>
        <div>
          <p className="text-xs font-bold text-ink/60">{t("pros.color")}</p>
          <p className="text-xs text-ink/40">{t("pros.colorHint")}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PRO_COLORS.map((c) => {
              const owner = taken.find((p) => p.colorHex === c.hex);
              const on = f.colorHex === c.hex;
              return (
                <button key={c.key} disabled={!!owner} onClick={() => setF({ ...f, colorHex: c.hex })} aria-pressed={on}
                  title={owner ? t("pros.takenBy", { name: `${owner.firstName} ${owner.lastName}` }) : c[locale]}
                  className="flex items-center gap-2 rounded-xl p-2 text-left text-xs font-semibold ring-1 ring-breeze-100 disabled:cursor-not-allowed"
                  style={on ? { boxShadow: `0 0 0 2px ${c.hex}`, backgroundColor: withAlpha(c.hex, 0.08) } : undefined}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white ${owner ? "opacity-35" : ""}`} style={{ backgroundColor: c.hex }}>
                    {owner ? `${owner.firstName[0]}${owner.lastName[0] ?? ""}` : on ? <Check className="size-4" /> : ""}
                  </span>
                  <span className={owner ? "text-ink/35" : ""}>
                    {c[locale]}
                    {owner && <span className="flex items-center gap-0.5 text-[10px] font-normal"><Lock className="size-2.5" /> {owner.firstName}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-foam p-3">
          <ProBadge pro={{ firstName: f.firstName || "?", lastName: f.lastName || "?", colorHex: f.colorHex }} size="lg" />
          <div>
            <p className="font-bold">{f.firstName || t("pros.namePlaceholder")} {f.lastName.charAt(0)}{f.lastName && "."}</p>
            <p className="text-xs text-ink/50">{t("pros.publicPreview")}</p>
          </div>
        </div>
        <div className="space-y-2 rounded-2xl bg-foam p-3">
          <p className="text-xs font-bold text-ink/60">{t("pros.paymentTitle")}</p>
          <p className="text-xs text-ink/50">{t("pros.paymentHint")}</p>
          <Toggle label={t("booking.pay.cash")} checked={f.acceptsCash} onChange={(v) => setF({ ...f, acceptsCash: v })} />
          <Toggle label={t("booking.pay.card")} checked={f.acceptsCard} onChange={(v) => setF({ ...f, acceptsCard: v })} />
          <Toggle label={t("booking.pay.transfer")} checked={f.acceptsTransfer} onChange={(v) => setF({ ...f, acceptsTransfer: v })} />
          {f.acceptsTransfer && (
            <label className="block">
              <span className="text-xs font-bold text-ink/60">{t("pros.transferDetails")}</span>
              <textarea
                value={f.paymentNote}
                maxLength={400}
                rows={3}
                onChange={(e) => setF({ ...f, paymentNote: e.target.value })}
                placeholder={t("pros.transferPlaceholder")}
                className="mt-1 w-full rounded-xl bg-white px-3 py-2.5 ring-1 ring-breeze-100"
              />
              <span className="mt-1 block text-xs text-ink/40">{t("pros.transferPublic")}</span>
            </label>
          )}
        </div>
        <Toggle label={t("pros.acceptsOnline")} checked={f.acceptsOnline} onChange={(v) => setF({ ...f, acceptsOnline: v })} />
        {pro && <Toggle label={t("pros.active")} checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />}
      </div>
      <Footer pending={pending} error={error} onSave={() => run(() => saveProfessional({ id: pro?.id, salonId, ...f }), onClose)} />
    </Modal>
  );
}

function HoursDialog({ pro, onClose }: { pro: Pro; onClose: () => void }) {
  const t = useTranslations();
  const { pending, error, run } = useSave();
  const [rows, setRows] = useState<Record<number, [string, string][]>>(() => Object.fromEntries(WEEK.map((d) => [d, [...(pro.hours[d] ?? [])]])));
  const set = (d: number, i: number, k: 0 | 1, v: string) => setRows({ ...rows, [d]: rows[d].map((r, j) => (j === i ? ((k === 0 ? [v, r[1]] : [r[0], v]) as [string, string]) : r)) });

  return (
    <Modal title={t("pros.hoursTitle", { name: pro.firstName })} onClose={onClose}>
      <p className="mb-3 text-xs text-ink/50">{t("pros.hoursHint")}</p>
      <div className="space-y-2 text-sm">
        {WEEK.map((d) => (
          <div key={d} className="flex items-start gap-3 rounded-xl bg-foam p-2">
            <span className="w-10 pt-2 text-xs font-bold">{t(`weekdays.${d}`)}</span>
            <div className="flex-1 space-y-1.5">
              {rows[d].length === 0 && <p className="pt-2 text-xs text-ink/40">{t("pros.off")}</p>}
              {rows[d].map(([s, e], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="time" value={s} onChange={(ev) => set(d, i, 0, ev.target.value)} aria-label={`${t(`weekdays.${d}`)} start`} className="rounded-lg bg-white px-2 py-1 ring-1 ring-breeze-100" />
                  <span>–</span>
                  <input type="time" value={e} onChange={(ev) => set(d, i, 1, ev.target.value)} aria-label={`${t(`weekdays.${d}`)} end`} className="rounded-lg bg-white px-2 py-1 ring-1 ring-breeze-100" />
                  <button aria-label={t("common.delete")} onClick={() => setRows({ ...rows, [d]: rows[d].filter((_, j) => j !== i) })} className="p-1 text-ink/40 hover:text-red-600"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setRows({ ...rows, [d]: [...rows[d], rows[d].length ? ["14:00", "18:00"] : ["09:00", "17:00"]] })} className="pt-1.5 text-xs font-semibold text-lagoon"><Plus className="inline size-3.5" /></button>
          </div>
        ))}
      </div>
      <Footer pending={pending} error={error}
        onSave={() => run(() => setHours(pro.id, WEEK.flatMap((d) => rows[d].map(([start, end]) => ({ weekday: d, start, end })))), onClose)} />
    </Modal>
  );
}

function ServicesDialog({ pro, services, onClose }: { pro: Pro; services: Service[]; onClose: () => void }) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const { pending, error, run } = useSave();
  const [ids, setIds] = useState<string[]>(pro.serviceIds);
  return (
    <Modal title={t("pros.servicesTitle", { name: pro.firstName })} onClose={onClose}>
      {services.length === 0 && <p className="text-sm text-ink/60">{t("pros.noSalonServices")}</p>}
      <div className="space-y-2">
        {services.map((s) => {
          const on = ids.includes(s.id);
          return (
            <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 text-sm ring-1 ${on ? "bg-breeze-50 ring-breeze-400" : "ring-breeze-100"}`}>
              <input type="checkbox" checked={on} onChange={() => setIds(on ? ids.filter((x) => x !== s.id) : [...ids, s.id])} className="size-4 accent-[#0e7c86]" />
              <span className="flex-1 font-semibold">{locale === "es" ? s.nameEs : s.nameEn}</span>
              <span className="text-ink/50">{s.durationMin} min · {formatPrice(s.priceCents)}</span>
            </label>
          );
        })}
      </div>
      <Footer pending={pending} error={error} onSave={() => run(() => setProServices(pro.id, ids), onClose)} />
    </Modal>
  );
}

function InviteDialog({ pro, salon, onClose }: { pro: Pro; salon: { id: string; organizationId: string }; onClose: () => void }) {
  const t = useTranslations();
  const { pending, error, run } = useSave();
  const [contact, setContact] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={t("pros.inviteTitle", { name: pro.firstName })} onClose={onClose}>
      {link ? (
        <div className="space-y-3 text-sm">
          <p>{t("pros.inviteReady")}</p>
          <div className="flex items-center gap-2 rounded-xl bg-foam p-2">
            <code className="flex-1 truncate text-xs">{link}</code>
            <button onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); }} className="inline-flex items-center gap-1 rounded-lg bg-lagoon px-3 py-1.5 text-xs font-bold text-white">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t("pros.copied") : t("pros.copy")}
            </button>
          </div>
          <p className="text-xs text-ink/50">{t("pros.inviteNote7d")}</p>
          <button onClick={onClose} className="w-full rounded-xl py-2.5 font-bold text-lagoon ring-1 ring-breeze-100">{t("common.close")}</button>
        </div>
      ) : (
        <>
          <Input label={t("pros.inviteContact")} value={contact} onChange={setContact} placeholder="carlos@email.com / +1 649 …" />
          <p className="mt-2 text-xs text-ink/50">{t("pros.inviteHint")}</p>
          <Footer pending={pending} error={error} label={t("pros.createLink")}
            onSave={() => run(async () => {
              const r = await inviteProfessional(salon.organizationId, salon.id, pro.id, contact);
              if (r.ok) setLink(r.link ?? null);
              return r;
            }, () => {})} />
        </>
      )}
    </Modal>
  );
}

function TimeOffDialog({ pro, onClose }: { pro: Pro; onClose: () => void }) {
  const t = useTranslations();
  const { pending, error, run } = useSave();
  const [f, setF] = useState({ from: "", to: "", reason: "" });
  return (
    <Modal title={t("pros.timeOffTitle", { name: pro.firstName })} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Input type="date" label={t("pros.from")} value={f.from} onChange={(v) => setF({ ...f, from: v, to: f.to || v })} />
        <Input type="date" label={t("pros.to")} value={f.to} onChange={(v) => setF({ ...f, to: v })} />
      </div>
      <div className="mt-3"><Input label={t("pros.reason")} value={f.reason} onChange={(v) => setF({ ...f, reason: v })} placeholder={t("pros.reasonPlaceholder")} /></div>
      <p className="mt-2 text-xs text-ink/50">{t("pros.timeOffHint")}</p>
      <Footer pending={pending} error={error}
        onSave={() => run(() => (f.from && f.to
          ? addTimeOff(pro.id, atLocal(f.from, "00:00").toISOString(), atLocal(addDaysKey(f.to, 1), "00:00").toISOString(), f.reason)
          : Promise.resolve({ ok: false as const, error: "invalid_range" })), onClose)} />
    </Modal>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 outline-none ring-1 ring-breeze-100 focus:ring-2 focus:ring-breeze-400" />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-foam px-3 py-2.5 text-sm font-semibold">
      {label}
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-ink/15 transition peer-checked:bg-breeze-500 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}
