"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setProPhoto, setSalonLogo, setServicePhoto } from "@/app/dashboard/actions";
import { MAX_SIDE_SMALL, mediaUrl } from "@/lib/media";
import { PhotoPicker } from "./PhotoPicker";

/** Una sola foto (logo, profesional o servicio): se ve, se cambia y se quita; se guarda al momento. */
export function PhotoField({
  salonId,
  kind,
  targetId,
  path,
  label,
  fallback,
}: {
  salonId: string;
  kind: "logo" | "pro" | "service";
  /** Id del profesional o del servicio (no hace falta para el logo). */
  targetId?: string;
  path: string | null;
  label: string;
  /** Qué se ve cuando no hay foto (iniciales, icono…). */
  fallback: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [current, setCurrent] = useState(path);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = async (p: string | null): Promise<string | null> => {
    const r =
      kind === "logo" ? await setSalonLogo(salonId, p) : kind === "pro" ? await setProPhoto(salonId, targetId!, p) : await setServicePhoto(salonId, targetId!, p);
    if (!r.ok) return r.error;
    setCurrent(p);
    setError(null);
    router.refresh();
    return null;
  };
  const url = mediaUrl(current);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-breeze-50 ring-1 ring-breeze-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="size-full object-cover" /> : fallback}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PhotoPicker
            salonId={salonId}
            kind={kind}
            label={current ? t("photos.change") : label}
            maxSide={MAX_SIDE_SMALL}
            square
            onUploaded={save}
            onError={setError}
          />
          {current && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { const e = await save(null); if (e) setError(e); })}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="size-4" /> {t("photos.remove")}
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
    </div>
  );
}
