/**
 * Datos de los textos legales. ANTES DE LANZAR:
 *  1. Rellena `company`, `contactEmail` y `governingLaw` con los datos reales.
 *  2. Que un abogado de Turks and Caicos revise los textos (src/lib/legal/content.ts).
 *  3. Cambia `reviewed` a true (se quita el aviso de borrador). El test unitario exige que no queden [corchetes].
 * Si se cambia el contenido, sube `version` (queda guardada con la aceptación del negocio).
 */
export const LEGAL = {
  company: "[LEGAL ENTITY NAME]",
  contactEmail: "[CONTACT EMAIL]",
  governingLaw: "the Turks and Caicos Islands",
  version: "2026-11-draft-2",
  updated: "2026-11-04",
  reviewed: false,
} as const;

export type LegalDocId = "privacy" | "terms" | "business-terms";
export const LEGAL_PATH: Record<LegalDocId, string> = {
  privacy: "/privacy",
  terms: "/terms",
  "business-terms": "/business-terms",
};
