/**
 * Paleta de colores de profesionales. Saturados para destacar sobre la base clara de Breeze
 * y con contraste AA para texto blanco. Regla: el color NUNCA va solo (siempre con nombre o iniciales).
 */
export const PRO_COLORS = [
  { key: "blue", hex: "#2563EB", en: "Blue", es: "Azul" },
  { key: "red", hex: "#DC2626", en: "Red", es: "Rojo" },
  { key: "green", hex: "#15803D", en: "Green", es: "Verde" },
  { key: "orange", hex: "#C2410C", en: "Orange", es: "Naranja" },
  { key: "violet", hex: "#7C3AED", en: "Violet", es: "Violeta" },
  { key: "pink", hex: "#BE185D", en: "Pink", es: "Rosa" },
  { key: "amber", hex: "#B45309", en: "Amber", es: "Ámbar" },
  { key: "indigo", hex: "#4F46E5", en: "Indigo", es: "Índigo" },
  { key: "emerald", hex: "#047857", en: "Emerald", es: "Esmeralda" },
  { key: "cyan", hex: "#0E7490", en: "Teal", es: "Cian" },
  { key: "brown", hex: "#92400E", en: "Brown", es: "Marrón" },
  { key: "slate", hex: "#475569", en: "Slate", es: "Pizarra" },
] as const;

export type ProColorKey = (typeof PRO_COLORS)[number]["key"];

export function colorOf(key: ProColorKey) {
  return PRO_COLORS.find((c) => c.key === key) ?? PRO_COLORS[0];
}

/** "#2563EB" + 0.12 → "rgba(37,99,235,0.12)" */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
