/** Dirección pública de la web (para sitemap, vista previa al compartir y datos estructurados). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE_DESCRIPTION = "Book barbershops, salons and spas in Turks and Caicos.";
