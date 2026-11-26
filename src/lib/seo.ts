import type { Metadata } from "next";

/** Páginas que se pueden abrir pero no deben salir en Google (entrar, crear cuenta, mis citas…). */
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };

/** URL canónica de una página pública: sin parámetros (?q=, ?pro=…) y siempre en el dominio de siteUrl(). */
export function canonical(path: string): Metadata["alternates"] {
  return { canonical: path };
}
