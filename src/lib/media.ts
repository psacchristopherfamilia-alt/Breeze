/**
 * Fotos de salones, profesionales y servicios (bucket público `salon-media` de Supabase Storage).
 * En la base de datos solo se guarda la RUTA (`<salon_id>/<tipo>/<archivo>.webp`); la URL se arma aquí.
 */
export const MEDIA_BUCKET = "salon-media";
export const MAX_GALLERY = 9;
/** Lado largo máximo tras reducir: sobra para una pantalla de teléfono con buena nitidez. */
export const MAX_SIDE = 1600;
export const MAX_SIDE_SMALL = 600;
/** Lo que aceptamos elegir (el navegador lo convierte siempre a WebP antes de subirlo). */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Tope del archivo original elegido: evita bloquear un teléfono con una foto enorme. */
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

export type MediaKind = "logo" | "gallery" | "pro" | "service";

/** URL pública de una ruta guardada; null si no hay foto o Supabase no está configurado. */
export function mediaUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Ruta nueva y única dentro de la carpeta del salón. */
export function newMediaPath(salonId: string, kind: MediaKind, id: string = crypto.randomUUID()): string {
  return `${salonId}/${kind}/${id}.webp`;
}

/** Una ruta solo es válida si cuelga de la carpeta del salón y no intenta salirse de ella. */
export function isPathInSalon(path: string, salonId: string): boolean {
  return path.startsWith(`${salonId}/`) && !path.includes("..") && /^[0-9a-f-]{36}\/[a-z]+\/[0-9a-zA-Z_-]+\.(webp|jpe?g|png)$/i.test(path);
}

/** Tamaño final al reducir una imagen para que su lado largo no pase de `max` (nunca se amplía). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
