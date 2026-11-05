"use client";
import { Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addSalonPhoto, removeSalonPhoto, setSalonCover } from "@/app/dashboard/actions";
import { MAX_GALLERY, MAX_SIDE, mediaUrl } from "@/lib/media";
import { PhotoField } from "./PhotoField";
import { PhotoPicker } from "./PhotoPicker";

export interface GalleryPhoto {
  id: string;
  path: string;
}

/** Ajustes → Fotos: logo, portada y galería del salón. */
export function SalonPhotos({
  salonId,
  name,
  logoPath,
  coverPath,
  photos,
}: {
  salonId: string;
  name: string;
  logoPath: string | null;
  coverPath: string | null;
  photos: GalleryPhoto[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = photos.length >= MAX_GALLERY;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "generic");
      else {
        setError(null);
        router.refresh();
      }
    });

  return (
    <section className="mt-5 space-y-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100" aria-labelledby="photos-title">
      <div>
        <h2 id="photos-title" className="text-lg font-bold">{t("photos.title")}</h2>
        <p className="text-sm text-ink/70">{t("photos.hint")}</p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">{t("photos.logo")}</h3>
        <PhotoField
          salonId={salonId}
          kind="logo"
          path={logoPath}
          label={t("photos.addLogo")}
          fallback={<span className="text-lg font-extrabold text-lagoon" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>}
        />
        <p className="mt-1 text-xs text-ink/70">{t("photos.logoHint")}</p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">{t("photos.gallery")}</h3>
          <span className="text-xs font-semibold text-ink/70">{t("photos.count", { count: photos.length, max: MAX_GALLERY })}</span>
        </div>
        {!full && (
          <PhotoPicker
            salonId={salonId}
            kind="gallery"
            label={t("photos.dropHint")}
            maxSide={MAX_SIDE}
            variant="drop"
            onUploaded={async (path) => {
              const r = await addSalonPhoto(salonId, path);
              if (r.ok) { setError(null); router.refresh(); return null; }
              return r.error;
            }}
            onError={setError}
          />
        )}
        {full && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{t("photos.full")}</p>}
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
        {photos.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">{t("photos.empty")}</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p, i) => {
              const isCover = p.path === coverPath;
              return (
                <li key={p.id} className="overflow-hidden rounded-2xl ring-1 ring-breeze-100">
                  <div className="relative aspect-[4/3] bg-breeze-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(p.path) ?? ""} alt={t("photos.photoN", { n: i + 1 })} loading="lazy" className="size-full object-cover" />
                    {isCover && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-lagoon px-2 py-0.5 text-xs font-bold text-white">
                        <Check className="size-3" /> {t("photos.cover")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-2">
                    <button
                      type="button"
                      disabled={pending || isCover}
                      onClick={() => act(() => setSalonCover(salonId, p.id))}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-lagoon hover:bg-breeze-50 disabled:opacity-50"
                    >
                      {t("photos.makeCover")}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => removeSalonPhoto(salonId, p.id))}
                      className="grid size-8 place-items-center rounded-lg text-red-700 hover:bg-red-50"
                      aria-label={t("photos.removeN", { n: i + 1 })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
