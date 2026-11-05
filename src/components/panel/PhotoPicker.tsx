"use client";
import { ImagePlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { ACCEPTED_TYPES, type MediaKind } from "@/lib/media";
import { uploadMedia } from "@/lib/media-client";

/**
 * Botón que elige una foto, la reduce en el navegador, la sube a Storage y avisa con la ruta.
 * `onUploaded` guarda la ruta (acción del servidor) y devuelve la clave de error si falla.
 */
export function PhotoPicker({
  salonId,
  kind,
  label,
  maxSide,
  square,
  variant = "button",
  onUploaded,
  onError,
}: {
  salonId: string;
  kind: MediaKind;
  label: string;
  maxSide: number;
  square?: boolean;
  variant?: "button" | "drop";
  onUploaded: (path: string) => Promise<string | null>;
  onError: (key: string) => void;
}) {
  const t = useTranslations();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    const up = await uploadMedia(salonId, kind, file, { maxSide, square });
    if (!up.ok) onError(up.error);
    else {
      const err = await onUploaded(up.path);
      if (err) onError(err);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <>
      <input id={id} ref={input} type="file" accept={ACCEPTED_TYPES.join(",")} className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files)} />
      <label
        htmlFor={id}
        onDragOver={variant === "drop" ? (e) => e.preventDefault() : undefined}
        onDrop={variant === "drop" ? (e) => { e.preventDefault(); void pick(e.dataTransfer.files); } : undefined}
        className={
          variant === "drop"
            ? "flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-lagoon/50 bg-breeze-50 px-4 py-5 text-center text-sm font-bold text-lagoon has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lagoon"
            : "inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-lagoon ring-1 ring-lagoon has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lagoon hover:bg-breeze-50"
        }
        aria-busy={busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {busy ? t("photos.uploading") : label}
      </label>
    </>
  );
}
