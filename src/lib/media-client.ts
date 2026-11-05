"use client";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_TYPES, MAX_ORIGINAL_BYTES, MEDIA_BUCKET, fitWithin, newMediaPath, type MediaKind } from "./media";

/** Claves de panel.errors.* */
export type UploadError = "photo_type" | "photo_too_big" | "photo_unreadable" | "photo_upload_failed";

/**
 * Reduce la foto en el navegador y la convierte a WebP. Al redibujarla en un canvas se pierden los datos EXIF
 * (incluida la ubicación GPS) y el peso baja de varios MB a unos cientos de KB.
 */
export async function prepareImage(file: File, maxSide: number, square = false): Promise<Blob> {
  // "from-image" respeta la rotación de la foto del teléfono; navegadores antiguos no lo admiten y la leen sin él.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    // Cuadrada (logo, rostro): recorta al centro. Si no, conserva las proporciones.
    const crop = square ? { sx: (bitmap.width - side) / 2, sy: (bitmap.height - side) / 2, sw: side, sh: side } : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
    const size = fitWithin(crop.sw, crop.sh, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas");
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.82));
    if (!blob) throw new Error("no_blob");
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Valida, reduce y sube la foto. Devuelve la ruta guardada en Storage. */
export async function uploadMedia(
  salonId: string,
  kind: MediaKind,
  file: File,
  opts: { maxSide: number; square?: boolean },
): Promise<{ ok: true; path: string } | { ok: false; error: UploadError }> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: "photo_type" };
  if (file.size > MAX_ORIGINAL_BYTES) return { ok: false, error: "photo_too_big" };
  let blob: Blob;
  try {
    blob = await prepareImage(file, opts.maxSide, opts.square);
  } catch {
    return { ok: false, error: "photo_unreadable" };
  }
  const path = newMediaPath(salonId, kind);
  const { error } = await createClient().storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  return error ? { ok: false, error: "photo_upload_failed" } : { ok: true, path };
}
