"use client";
import { Clock, Image as ImageIcon, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addServiceTemplates, saveService } from "@/app/dashboard/actions";
import { Modal } from "@/components/agenda/AgendaView";
import { useAppLocale } from "@/components/Providers";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { formatDuration } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { formatPrice, type BusinessType } from "@/lib/mock/data";
import { templatesFor } from "@/lib/panel/service-templates";
import { PhotoField } from "./PhotoField";
import { Toggle } from "./LiveProfessionals";

interface Service {
  id: string;
  categoryCode: string;
  nameEn: string;
  nameEs: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  isActive: boolean;
  photoPath: string | null;
}

export function LiveServices({
  salon,
  services,
  categories,
}: {
  salon: { id: string; name: string };
  services: Service[];
  categories: { code: string; type: BusinessType }[];
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/70">{salon.name}</p>
          <h1 className="text-2xl font-extrabold">{t("services.title")}</h1>
          <p className="mt-1 text-sm text-ink/70">{t("services.subtitle")}</p>
        </div>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800">
          <Plus className="size-4" /> {t("services.add")}
        </button>
      </div>

      {services.length === 0 && <p className="mt-6 rounded-3xl bg-white p-10 text-center text-ink/70 ring-1 ring-breeze-100">{t("services.empty")}</p>}

      <SuggestedServices salonId={salon.id} types={[...new Set(categories.map((c) => c.type))]} services={services} onDone={() => router.refresh()} />

      <div className="mt-6 space-y-6">
        {categories
          .filter((c) => services.some((s) => s.categoryCode === c.code))
          .map((c) => (
            <section key={c.code}>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink/70">
                <TypeIcon type={c.type} className="size-3.5" /> {t(`categories.${c.code}`)}
              </h2>
              <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-breeze-100">
                {services.filter((s) => s.categoryCode === c.code).map((s) => (
                  <div key={s.id} className={`flex items-center gap-3 border-b border-breeze-50 px-4 py-3 last:border-0 ${s.isActive ? "" : "opacity-50"}`}>
                    {s.photoPath && mediaUrl(s.photoPath) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(s.photoPath)!} alt="" loading="lazy" className="size-11 shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold">{locale === "es" ? s.nameEs : s.nameEn}</p>
                      <p className="inline-flex items-center gap-1 text-xs text-ink/70">
                        <Clock className="size-3" /> {formatDuration(s.durationMin)}
                        {s.bufferMin > 0 && ` + ${s.bufferMin} min ${t("services.bufferShort")}`}
                        {!s.isActive && ` · ${t("services.hidden")}`}
                      </p>
                    </div>
                    <span className="font-bold">{formatPrice(s.priceCents)}</span>
                    <button aria-label={t("pros.edit")} onClick={() => setEditing(s)} className="grid size-8 place-items-center rounded-full text-ink/70 hover:bg-breeze-50 hover:text-lagoon">
                      <Pencil className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
      </div>

      {editing && (
        <ServiceDialog
          salonId={salon.id}
          service={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ServiceDialog({ salonId, service, categories, onClose }: { salonId: string; service: Service | null; categories: { code: string; type: BusinessType }[]; onClose: () => void }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    categoryCode: service?.categoryCode ?? categories[0]?.code ?? "",
    nameEn: service?.nameEn ?? "",
    nameEs: service?.nameEs ?? "",
    durationMin: String(service?.durationMin ?? 30),
    bufferMin: String(service?.bufferMin ?? 10),
    price: service ? (service.priceCents / 100).toFixed(2) : "",
    isActive: service?.isActive ?? true,
  });
  const num = (v: string) => Number(v.replace(",", "."));

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveService({
        id: service?.id,
        salonId,
        categoryCode: f.categoryCode,
        nameEn: f.nameEn,
        nameEs: f.nameEs || f.nameEn,
        durationMin: Math.round(num(f.durationMin)),
        bufferMin: Math.round(num(f.bufferMin) || 0),
        priceCents: Math.round(num(f.price) * 100),
        isActive: f.isActive,
      });
      if (r.ok) onClose();
      else setError(r.error);
    });

  const field = (k: "nameEn" | "nameEs" | "durationMin" | "bufferMin" | "price", label: string, type = "text", hint?: string) => (
    <label className="block">
      <span className="text-xs font-bold text-ink/70">{label}</span>
      <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 outline-none ring-1 ring-breeze-100 focus:ring-2 focus:ring-breeze-400" />
      {hint && <span className="mt-1 block text-xs text-ink/70">{hint}</span>}
    </label>
  );

  return (
    <Modal title={service ? t("services.edit") : t("services.add")} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs font-bold text-ink/70">{t("services.category")}</span>
          <select value={f.categoryCode} onChange={(e) => setF({ ...f, categoryCode: e.target.value })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100">
            {categories.map((c) => <option key={c.code} value={c.code}>{t(`types.${c.type}`)} · {t(`categories.${c.code}`)}</option>)}
          </select>
        </label>
        {field("nameEn", t("services.nameEn"))}
        {field("nameEs", t("services.nameEs"), "text", t("services.nameEsHint"))}
        <div className="grid grid-cols-3 gap-3">
          {field("durationMin", t("services.duration"), "number")}
          {field("bufferMin", t("services.buffer"), "number")}
          {field("price", t("services.price"), "number")}
        </div>
        <p className="text-xs text-ink/70">{t("services.bufferHint")}</p>
        <Toggle label={t("services.visible")} checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
        {service ? (
          <div>
            <p className="mb-1 text-xs font-bold text-ink/70">{t("photos.proPhoto")}</p>
            <PhotoField salonId={salonId} kind="service" targetId={service.id} path={service.photoPath} label={t("photos.addPhoto")} fallback={<ImageIcon className="size-6 text-ink/50" aria-hidden="true" />} />
            <p className="mt-1 text-xs text-ink/70">{t("photos.serviceHint")}</p>
          </div>
        ) : (
          <p className="text-xs text-ink/70">{t("photos.saveFirst")}</p>
        )}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
      <button onClick={save} disabled={pending} className="mt-4 w-full rounded-xl bg-lagoon py-3 font-bold text-white disabled:opacity-50">{t("common.save")}</button>
    </Modal>
  );
}

/** Servicios típicos del tipo de negocio, para empezar en un clic. Se pueden desmarcar y cambiar el precio antes de añadir. */
function SuggestedServices({ salonId, types, services, onDone }: { salonId: string; types: BusinessType[]; services: Service[]; onDone: () => void }) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const options = templatesFor(types, services);
  const [open, setOpen] = useState(services.length === 0);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (options.length === 0) return null;

  const isOn = (k: string) => picked[k] ?? services.length === 0;
  const chosen = options.filter((o) => isOn(o.key));
  const priceOf = (o: (typeof options)[number]) => {
    const v = Number((prices[o.key] ?? (o.priceCents / 100).toFixed(2)).replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : o.priceCents;
  };

  const add = () =>
    start(async () => {
      setError(null);
      const r = await addServiceTemplates({
        salonId,
        items: chosen.map((o) => ({ categoryCode: o.category, nameEn: o.nameEn, nameEs: o.nameEs, durationMin: o.durationMin, bufferMin: o.bufferMin, priceCents: priceOf(o) })),
      });
      if (r.ok) {
        setPicked({});
        setOpen(false);
        onDone();
      } else setError(r.error);
    });

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-4 text-sm font-bold text-lagoon hover:underline">
        {t("services.suggestedOpen")}
      </button>
    );

  return (
    <section className="mt-4 rounded-3xl bg-white p-4 ring-1 ring-breeze-100 lg:p-6">
      <h2 className="text-lg font-extrabold">{t("services.suggestedTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("services.suggestedHint")}</p>
      <div className="mt-3 divide-y divide-breeze-50">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-3 py-2 text-sm">
            <input type="checkbox" checked={isOn(o.key)} onChange={(e) => setPicked({ ...picked, [o.key]: e.target.checked })} className="size-4 accent-lagoon" />
            <span className="flex-1">
              <span className="font-semibold">{locale === "es" ? o.nameEs : o.nameEn}</span>
              <span className="ml-2 text-xs text-ink/70">{t(`categories.${o.category}`)} · {formatDuration(o.durationMin)}</span>
            </span>
            <span className="text-ink/70">$</span>
            <input
              inputMode="decimal"
              aria-label={t("services.price")}
              value={prices[o.key] ?? (o.priceCents / 100).toFixed(2)}
              onChange={(e) => setPrices({ ...prices, [o.key]: e.target.value })}
              className="w-20 rounded-lg bg-foam px-2 py-1.5 text-right ring-1 ring-breeze-100"
            />
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{t(`panel.errors.${error}`)}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={add} disabled={pending || chosen.length === 0} className="rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800 disabled:opacity-50">
          {t("services.suggestedAdd", { count: chosen.length })}
        </button>
        {services.length > 0 && (
          <button onClick={() => setOpen(false)} className="text-sm font-semibold text-ink/70 hover:underline">
            {t("services.suggestedClose")}
          </button>
        )}
      </div>
    </section>
  );
}
